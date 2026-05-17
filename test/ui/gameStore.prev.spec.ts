// T-025 — gameStore.prevSnapshot rotation tests.
//
// The PoliticsPanel "Why?" tooltip needs the snapshot from the tick BEFORE
// the current one so it can compute per-POP happiness deltas. The store
// extension (T-025) adds a `prevSnapshot: EngineState | null` field rotated
// on every `advance()`. This file covers the contract:
//   - initial value is `null`
//   - after the first `advance()`, `prevSnapshot` is the initial seed
//   - after the second `advance()`, `prevSnapshot` is the post-first-advance
//     snapshot (not the initial seed)

import { afterEach, describe, expect, it } from 'vitest'

import { createGameStore, type GameStore } from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

describe('T-025 — gameStore.prevSnapshot starts null', () => {
  it('prevSnapshot is null immediately after createGameStore', () => {
    store = createGameStore({ seed: 1 })
    expect(store.getState().prevSnapshot).toBeNull()
  })
})

describe('T-025 — prevSnapshot rotates on advance()', () => {
  it('after one advance(), prevSnapshot is the initial (tick=0) state', () => {
    store = createGameStore({ seed: 1 })
    const initial = store.getState().snapshot
    expect(initial.tick).toBe(0)

    store.getState().advance()

    const prev = store.getState().prevSnapshot
    expect(prev).not.toBeNull()
    // The rotated prev IS the pre-advance snapshot reference (not a fresh
    // engine clone): advance() takes the current `snapshot` from store state
    // and assigns it to prevSnapshot in the same setter.
    expect(prev).toBe(initial)
    expect(prev!.tick).toBe(0)
    // And the current snapshot has been replaced with the tick-1 result.
    expect(store.getState().snapshot.tick).toBe(1)
  })

  it('after two advances, prevSnapshot is the tick-1 snapshot (not the initial)', () => {
    store = createGameStore({ seed: 1 })
    store.getState().advance()
    const afterFirst = store.getState().snapshot
    expect(afterFirst.tick).toBe(1)

    store.getState().advance()

    const prev = store.getState().prevSnapshot
    expect(prev).not.toBeNull()
    expect(prev).toBe(afterFirst)
    expect(prev!.tick).toBe(1)
    expect(store.getState().snapshot.tick).toBe(2)
  })
})

describe('T-025 — existing T-019 fields untouched by the new rotation', () => {
  it('advance() still increments snapshot.tick and grows trends', () => {
    store = createGameStore({ seed: 1 })
    const before = store.getState()
    expect(before.trends.gdp).toHaveLength(1)
    store.getState().advance()
    const after = store.getState()
    expect(after.snapshot.tick).toBe(1)
    expect(after.trends.gdp).toHaveLength(2)
  })
})
