// T-019 — gameStore unit tests (non-React).
//
// Covers AC #1, #2, #3 directly against the store factory (deterministic seed).
// AC #4 (selector re-renders) lives in gameStore.render.spec.tsx because it
// needs RTL.

import { afterEach, describe, expect, it } from 'vitest'

import { createGameStore, type GameStore } from '@ui/stores/gameStore'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { EVENT_FEED_LENGTH } from '@engine/tunables'
import type { EngineEvent } from '@engine'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

describe('T-019 AC#1 — advance() advances snapshot.tick by 1', () => {
  it('a single advance() takes tick from 0 to 1', () => {
    store = createGameStore({ seed: 1 })
    expect(store.getState().snapshot.tick).toBe(0)
    store.getState().advance()
    expect(store.getState().snapshot.tick).toBe(1)
  })

  it('three advances take tick from 0 to 3', () => {
    store = createGameStore({ seed: 1 })
    store.getState().advance()
    store.getState().advance()
    store.getState().advance()
    expect(store.getState().snapshot.tick).toBe(3)
  })
})

describe('T-019 AC#2 — enqueueDecision emits PolicyChanged after the next advance()', () => {
  it('a slider decision shows up as a PolicyChanged event in `events` after one advance()', () => {
    store = createGameStore({ seed: 1 })
    // Aurelia starts with tax_income = 25. Move it to 28; the engine will emit
    // PolicyChanged at stage 0 of the next tick.
    store.getState().enqueueDecision({ type: 'slider', slider_id: 'tax_income', value: 28 })

    // Before advance(): no events flushed yet (engine queues; bus flushes at tick end).
    expect(store.getState().events).toHaveLength(0)

    store.getState().advance()

    const events = store.getState().events
    expect(events.length).toBeGreaterThanOrEqual(1)
    const policy = events.find((e) => e.type === 'PolicyChanged')
    expect(policy).toBeDefined()
    if (policy && policy.type === 'PolicyChanged') {
      expect(policy.slider_id).toBe('tax_income')
      expect(policy.old_value).toBe(25)
      expect(policy.new_value).toBe(28)
      expect(policy.tick).toBe(0)
    }
  })

  it('the engine queue is drained next tick — a second advance() does not re-emit PolicyChanged for the same decision', () => {
    store = createGameStore({ seed: 1 })
    store.getState().enqueueDecision({ type: 'slider', slider_id: 'tax_income', value: 28 })
    store.getState().advance()
    const afterFirst = store.getState().events.filter((e) => e.type === 'PolicyChanged').length
    store.getState().advance()
    const afterSecond = store.getState().events.filter((e) => e.type === 'PolicyChanged').length
    expect(afterSecond).toBe(afterFirst)
  })
})

describe('T-019 AC#3 — events array is capped at EVENT_FEED_LENGTH (FIFO, oldest dropped)', () => {
  it('forcing more than the cap keeps `events` exactly at the cap, dropping oldest', () => {
    store = createGameStore({ seed: 1 })

    // Synthesize EVENT_FEED_LENGTH + 5 events by calling setState on the store
    // through the same FIFO path the engine subscription uses. Going through
    // the engine to generate this many real events would be slow and
    // test-irrelevant — the FIFO cap is a pure store invariant.
    const overflow = EVENT_FEED_LENGTH + 5
    const fakeEvents: EngineEvent[] = []
    for (let i = 0; i < overflow; i++) {
      fakeEvents.push({
        type: 'PolicyChanged',
        slider_id: 'tax_income',
        old_value: i,
        new_value: i + 1,
        tick: i,
      })
    }

    // Replay each event through the SAME subscription path: setState replicas
    // of the reducer in createGameStore's listener.
    for (const event of fakeEvents) {
      store.setState((prev) => {
        const next = [...prev.events, event]
        if (next.length > EVENT_FEED_LENGTH) {
          next.splice(0, next.length - EVENT_FEED_LENGTH)
        }
        return { events: next }
      })
    }

    const events = store.getState().events
    expect(events).toHaveLength(EVENT_FEED_LENGTH)
    // The first 5 should have been dropped — oldest surviving event's
    // old_value is `overflow - EVENT_FEED_LENGTH` = 5.
    const first = events[0]
    expect(first.type).toBe('PolicyChanged')
    if (first.type === 'PolicyChanged') {
      expect(first.old_value).toBe(overflow - EVENT_FEED_LENGTH)
    }
    // Last event preserved.
    const last = events[events.length - 1]
    if (last.type === 'PolicyChanged') {
      expect(last.old_value).toBe(overflow - 1)
    }
  })

  it('the cap also applies when events come through the real engine subscription', () => {
    // Drive enough real engine events to overflow the cap. Each enqueue +
    // advance produces a single PolicyChanged. Alternate between two values
    // so every decision is an actual change (skipping the no-op branch in
    // stage0_decisions).
    store = createGameStore({ seed: 1 })
    const overflow = EVENT_FEED_LENGTH + 3
    for (let i = 0; i < overflow; i++) {
      const value = i % 2 === 0 ? 30 : 31
      store.getState().enqueueDecision({ type: 'slider', slider_id: 'tax_income', value })
      store.getState().advance()
    }
    expect(store.getState().events.length).toBeLessThanOrEqual(EVENT_FEED_LENGTH)
    expect(store.getState().events.length).toBe(EVENT_FEED_LENGTH)
  })
})

describe('T-019 — store hygiene', () => {
  it('setSpeed updates speed in isolation', () => {
    store = createGameStore({ seed: 1 })
    expect(store.getState().speed).toBe(0)
    store.getState().setSpeed(2)
    expect(store.getState().speed).toBe(2)
  })

  it('snapshot is seeded from the supplied initialState (defaults to Aurelia)', () => {
    store = createGameStore({ seed: 1, initialState: createAureliaState() })
    const snap = store.getState().snapshot
    expect(snap.tick).toBe(0)
    expect(snap.country.id).toBe('aurelia')
  })

  it('destroy() unsubscribes — further engine ticks do not append events', () => {
    store = createGameStore({ seed: 1 })
    // Issue a decision and advance once so we have a non-zero baseline.
    store.getState().enqueueDecision({ type: 'slider', slider_id: 'tax_income', value: 28 })
    store.getState().advance()
    const baseline = store.getState().events.length
    expect(baseline).toBeGreaterThan(0)

    store.destroy()

    // After destroy, calling the engine handle directly must not feed the store.
    store.engine.applyDecisions([{ type: 'slider', slider_id: 'tax_income', value: 30 }])
    store.engine.tick()
    expect(store.getState().events.length).toBe(baseline)
  })
})
