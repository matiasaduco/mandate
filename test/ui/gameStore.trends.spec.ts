// T-022 — gameStore.trends rolling buffer tests.
//
// The OverviewPanel reads `trends` to render its sparklines. The buffer is a
// pure consequence of `advance()` (no separate action), so the contract under
// test is:
//   - on construction: each buffer has length 1 (the starting snapshot's value)
//   - on advance(): each buffer grows by 1
//   - at cap (TREND_HISTORY_TICKS): oldest entry is dropped (FIFO)
//   - the latest entry always equals the current snapshot's value

import { afterEach, describe, expect, it } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import { TREND_HISTORY_TICKS } from '@engine/tunables'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

describe('T-022 — trends buffer is seeded with starting snapshot values', () => {
  it('every buffer has length 1 immediately after createGameStore (pre-tick)', () => {
    store = createGameStore({ seed: 1 })
    const { trends, snapshot } = store.getState()

    expect(trends.population).toEqual([snapshot.country.population])
    expect(trends.gdp).toEqual([snapshot.country.gdp])
    expect(trends.treasury).toEqual([snapshot.country.treasury])
    expect(trends.approval).toEqual([snapshot.country.approval])
    expect(trends.stability).toEqual([snapshot.country.stability])
  })
})

describe('T-022 — trends buffer grows by 1 per advance()', () => {
  it('after one advance, every buffer has length 2', () => {
    store = createGameStore({ seed: 1 })
    store.getState().advance()
    const { trends } = store.getState()
    expect(trends.population).toHaveLength(2)
    expect(trends.gdp).toHaveLength(2)
    expect(trends.treasury).toHaveLength(2)
    expect(trends.approval).toHaveLength(2)
    expect(trends.stability).toHaveLength(2)
  })

  it('the last entry in each buffer mirrors the current snapshot', () => {
    store = createGameStore({ seed: 1 })
    store.getState().advance()
    store.getState().advance()
    const { trends, snapshot } = store.getState()
    expect(trends.population.at(-1)).toBe(snapshot.country.population)
    expect(trends.gdp.at(-1)).toBe(snapshot.country.gdp)
    expect(trends.treasury.at(-1)).toBe(snapshot.country.treasury)
    expect(trends.approval.at(-1)).toBe(snapshot.country.approval)
    expect(trends.stability.at(-1)).toBe(snapshot.country.stability)
  })
})

describe('T-022 AC#2 — trends buffer caps at TREND_HISTORY_TICKS (oldest dropped)', () => {
  it('after TREND_HISTORY_TICKS + 5 advances, each buffer has length exactly TREND_HISTORY_TICKS', () => {
    store = createGameStore({ seed: 1 })
    for (let i = 0; i < TREND_HISTORY_TICKS + 5; i++) {
      store.getState().advance()
    }
    const { trends } = store.getState()
    expect(trends.treasury).toHaveLength(TREND_HISTORY_TICKS)
    expect(trends.population).toHaveLength(TREND_HISTORY_TICKS)
    expect(trends.gdp).toHaveLength(TREND_HISTORY_TICKS)
    expect(trends.approval).toHaveLength(TREND_HISTORY_TICKS)
    expect(trends.stability).toHaveLength(TREND_HISTORY_TICKS)
  })

  it('once capped, oldest entries are dropped FIFO', () => {
    // Seed an initial state we can mutate so each tick produces a distinct
    // treasury value. We bypass the engine by writing directly to the store —
    // the cap logic is what we want under test, not stage 2 economics.
    const initialState = createAureliaState()
    initialState.country.treasury = 0
    store = createGameStore({ seed: 1, initialState })

    // Drive enough advances to overflow by 3. The engine's actual treasury
    // value isn't what we care about here — only that the latest sample is
    // appended and the oldest dropped. We sample directly from the snapshot
    // after each advance.
    const overflow = TREND_HISTORY_TICKS + 3
    const samples: number[] = []
    for (let i = 0; i < overflow; i++) {
      store.getState().advance()
      samples.push(store.getState().snapshot.country.treasury)
    }

    const buffer = store.getState().trends.treasury
    expect(buffer).toHaveLength(TREND_HISTORY_TICKS)
    // The buffer should mirror the LAST TREND_HISTORY_TICKS samples. The
    // initial seed (treasury=0) and the first 2 post-advance samples are
    // dropped; what remains is `samples` from index 2 to the end (because the
    // seed counts as 1 entry, then advance() adds 1 each — total 1 + overflow
    // entries, trimmed to TREND_HISTORY_TICKS).
    const totalAppended = 1 + overflow
    const dropped = totalAppended - TREND_HISTORY_TICKS
    // The seed (1 entry) + the first `dropped - 1` advance samples are gone.
    // Surviving prefix in the buffer starts at samples[dropped - 1].
    expect(buffer[0]).toBe(samples[dropped - 1])
    expect(buffer.at(-1)).toBe(samples[samples.length - 1])
  })
})

describe('T-022 — trends references change on advance() (Zustand triggers re-renders)', () => {
  it('the trends object identity differs after advance()', () => {
    store = createGameStore({ seed: 1 })
    const before = store.getState().trends
    store.getState().advance()
    const after = store.getState().trends
    expect(after).not.toBe(before)
    expect(after.treasury).not.toBe(before.treasury)
  })
})
