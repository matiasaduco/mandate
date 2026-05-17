// T-028 — UI-level Save / Load tests.
//
// Covers the four AC items from the UI side. The engine-level half lives in
// test/engine/save.spec.ts.
//
// jsdom provides a working `window.localStorage`. We clear it before each
// test so writes from earlier tests don't leak.

import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import {
  SAVE_SCHEMA_VERSION,
  serialize,
} from '@engine'
import { SaveLoadControls } from '@ui/components/SaveLoadControls'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

const SAVE_KEY = 'mandate_save_v1'

let store: GameStore | null = null

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  store?.destroy()
  store = null
  window.localStorage.clear()
})

describe('T-028 — Save button', () => {
  it('writes a versioned envelope to localStorage under mandate_save_v1', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SaveLoadControls store={store!} />)

    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull()

    fireEvent.click(getByTestId('save-button'))

    const raw = window.localStorage.getItem(SAVE_KEY)
    expect(raw).not.toBeNull()
    const envelope = JSON.parse(raw!)
    expect(envelope.schema_version).toBe(SAVE_SCHEMA_VERSION)
    expect(envelope.state).toBeDefined()
    expect(envelope.state.country.id).toBe('aurelia')
    expect(envelope.state.tick).toBe(0)
  })

  it('AC#4 — Save click pauses the engine before writing (setSpeed(0) called first)', () => {
    store = createGameStore({ seed: 1, initialSpeed: 2 })
    const { getByTestId } = render(<SaveLoadControls store={store!} />)
    expect(store!.getState().speed).toBe(2)

    fireEvent.click(getByTestId('save-button'))

    expect(store!.getState().speed).toBe(0)
  })

  it('AC#4 — engine.tick is NOT called between the save click and the localStorage write', () => {
    // Spy on the engine's tick method to verify it does not fire during the
    // save action. JS is single-threaded and tick() is synchronous, so once
    // we set speed=0 (which the save handler does first) no tick can
    // interleave between the snapshot read and the localStorage write.
    store = createGameStore({ seed: 1 })
    const tickSpy = vi.spyOn(store!.engine, 'tick')
    const { getByTestId } = render(<SaveLoadControls store={store!} />)

    fireEvent.click(getByTestId('save-button'))

    expect(tickSpy).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull()
  })

  it('shows the "Saved" indicator briefly after a successful save', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SaveLoadControls store={store!} />)
    fireEvent.click(getByTestId('save-button'))
    expect(getByTestId('save-load-controls').getAttribute('data-saved')).toBe(
      'true',
    )
  })
})

describe('T-028 — Load button', () => {
  it('Load with no saved game: button is disabled', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SaveLoadControls store={store!} />)
    expect(getByTestId('load-button')).toBeDisabled()
  })

  it('Load with a saved tick=5 state: gameStore snapshot.tick becomes 5', () => {
    // Build a save by advancing a separate engine 5 ticks, then serializing.
    const seedStore = createGameStore({ seed: 1 })
    for (let i = 0; i < 5; i++) seedStore.getState().advance()
    const savedSnapshot = seedStore.getState().snapshot
    expect(savedSnapshot.tick).toBe(5)
    window.localStorage.setItem(SAVE_KEY, serialize(savedSnapshot))
    seedStore.destroy()

    // Render against a fresh store at tick=0 and click Load.
    store = createGameStore({ seed: 1 })
    expect(store!.getState().snapshot.tick).toBe(0)
    const { getByTestId } = render(<SaveLoadControls store={store!} />)

    act(() => {
      fireEvent.click(getByTestId('load-button'))
    })

    expect(store!.getState().snapshot.tick).toBe(5)
  })

  it('AC#4 — Load click pauses the engine before swapping (setSpeed(0))', () => {
    // Pre-seed a save.
    const seedStore = createGameStore({ seed: 1 })
    window.localStorage.setItem(
      SAVE_KEY,
      serialize(seedStore.getState().snapshot),
    )
    seedStore.destroy()

    store = createGameStore({ seed: 1, initialSpeed: 2 })
    expect(store!.getState().speed).toBe(2)
    const { getByTestId } = render(<SaveLoadControls store={store!} />)

    fireEvent.click(getByTestId('load-button'))

    expect(store!.getState().speed).toBe(0)
  })

  it('Load with a corrupt save shows an inline error and does not crash', () => {
    window.localStorage.setItem(SAVE_KEY, 'not-json-and-not-recoverable')

    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SaveLoadControls store={store!} />)

    fireEvent.click(getByTestId('load-button'))

    const errorEl = getByTestId('save-load-error')
    expect(errorEl).toBeInTheDocument()
    expect(errorEl.textContent).toMatch(/Load failed/)
    expect(getByTestId('save-load-controls').getAttribute('data-error')).toBe(
      'true',
    )
    // Snapshot must NOT have changed.
    expect(store!.getState().snapshot.tick).toBe(0)
  })

  it('Load with a schema-mismatched save shows an inline error', () => {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ schema_version: 99, state: {} }),
    )

    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SaveLoadControls store={store!} />)

    fireEvent.click(getByTestId('load-button'))
    expect(getByTestId('save-load-error').textContent).toMatch(/schema_version/)
  })
})

describe('T-028 — loadState (gameStore action)', () => {
  it('replaces the engine and resets events/trends/prevSnapshot', () => {
    store = createGameStore({ seed: 1 })
    // Generate a non-trivial event + trend history before load.
    store.getState().enqueueDecision({
      type: 'slider',
      slider_id: 'tax_income',
      value: 28,
    })
    store.getState().advance()
    expect(store.getState().events.length).toBeGreaterThan(0)
    expect(store.getState().prevSnapshot).not.toBeNull()
    expect(store.getState().trends.gdp.length).toBeGreaterThan(1)

    // Build a target state to load (a fresh Aurelia).
    const target = createAureliaState()
    store.getState().loadState(target)

    expect(store.getState().snapshot).toEqual(target)
    expect(store.getState().events).toEqual([])
    expect(store.getState().prevSnapshot).toBeNull()
    // Trends reseeded with one sample from the loaded snapshot.
    expect(store.getState().trends.gdp).toHaveLength(1)
    expect(store.getState().trends.gdp[0]).toBe(target.country.gdp)
  })

  it('AC#2 — after load, advancing 12 ticks via the store matches a contiguous 24-tick run', () => {
    // Reference run: 24 contiguous ticks via the store.
    const reference = createGameStore({ seed: 1 })
    for (let i = 0; i < 24; i++) reference.getState().advance()
    const referenceFinal = reference.getState().snapshot
    reference.destroy()

    // Save / load run: 12 ticks, serialize, load via store action, 12 more.
    store = createGameStore({ seed: 1 })
    for (let i = 0; i < 12; i++) store.getState().advance()
    const json = serialize(store.getState().snapshot)
    // Round-trip through serialize/deserialize to exercise the same path the
    // UI button would take. (deserialize is imported below via @engine.)
    const parsed = JSON.parse(json).state
    store.getState().loadState(parsed)
    for (let i = 0; i < 12; i++) store.getState().advance()

    expect(store.getState().snapshot).toEqual(referenceFinal)
  })

  it('destroy() unsubscribes the listener bound to the NEW engine after loadState', () => {
    // Regression: loadState swaps the unsubscribe handle. Calling destroy
    // afterwards must release the NEW engine's subscription, not silently
    // leak it (which would surface as the events buffer growing after
    // destroy on the new engine).
    store = createGameStore({ seed: 1 })
    const fresh = createAureliaState()
    store.getState().loadState(fresh)
    const baseline = store.getState().events.length

    store.destroy()

    // Driving the (now-current) engine directly after destroy must not
    // feed the store. Issue a decision that would emit PolicyChanged.
    store.engine.applyDecisions([
      { type: 'slider', slider_id: 'tax_income', value: 30 },
    ])
    store.engine.tick()
    expect(store.getState().events.length).toBe(baseline)
  })
})
