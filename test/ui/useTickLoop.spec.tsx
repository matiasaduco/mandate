// T-020 — useTickLoop hook + speed control tests.
//
// Covers all four AC items + auto-pause on TreasuryThresholdCrossed (in scope
// per the brief, even though only the Approval auto-pause is in the literal AC
// checkbox list). Each `describe` heading names the AC it proves.
//
// Test conventions:
//   - vi.useFakeTimers() so we can advance simulated wall-clock without
//     waiting for real seconds.
//   - createGameStore({ seed: 1 }) — never the singleton (per gameStore.ts
//     docs, the singleton is for app code only).
//   - Each test calls store.destroy() in afterEach so the engine subscription
//     and pending timer are released.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import {
  REAL_SECONDS_PER_TICK_AT_1X,
  SPEEDS,
} from '@engine/tunables'
import {
  createGameStore,
  type GameStore,
} from '@ui/stores/gameStore'
import { setSpeedSafe, useTickLoop } from '@ui/hooks/useTickLoop'

let store: GameStore | null = null

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  store?.destroy()
  store = null
  vi.restoreAllMocks()
})

describe('T-020 AC#1 — at speed=1, ticks advance every REAL_SECONDS_PER_TICK_AT_1X', () => {
  it('advances snapshot.tick by exactly 1 after one full interval at speed=1', () => {
    store = createGameStore({ seed: 1, initialSpeed: 1 })
    const initialTick = store.getState().snapshot.tick
    expect(initialTick).toBe(0)

    renderHook(() => useTickLoop(store!))

    // Advance fake time by exactly one interval at 1x.
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000)
    })

    expect(store.getState().snapshot.tick).toBe(initialTick + 1)
  })

  it('does NOT fire a tick before the interval elapses (within 100ms tolerance below)', () => {
    store = createGameStore({ seed: 1, initialSpeed: 1 })
    renderHook(() => useTickLoop(store!))

    // Step just under the interval; no tick should fire.
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000 - 100)
    })
    expect(store.getState().snapshot.tick).toBe(0)

    // Cross the boundary; exactly one tick fires.
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(store.getState().snapshot.tick).toBe(1)
  })

  it('honors the speed multiplier — at speed=2 the interval is halved', () => {
    store = createGameStore({ seed: 1, initialSpeed: 2 })
    renderHook(() => useTickLoop(store!))

    const intervalAt2x = (REAL_SECONDS_PER_TICK_AT_1X / 2) * 1000
    act(() => {
      vi.advanceTimersByTime(intervalAt2x)
    })
    expect(store.getState().snapshot.tick).toBe(1)
  })
})

describe('T-020 AC#2 — pause stops advancement; resume continues without skipped ticks', () => {
  it('setSpeed(0) cancels the loop; advancing fake time by 10s yields no ticks', () => {
    store = createGameStore({ seed: 1, initialSpeed: 1 })
    renderHook(() => useTickLoop(store!))

    // Run one tick so the loop is observably active.
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000)
    })
    expect(store.getState().snapshot.tick).toBe(1)

    // Pause.
    act(() => {
      setSpeedSafe(store!, 0)
    })

    // 10s of fake time — well over multiple intervals — must yield zero ticks.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(store.getState().snapshot.tick).toBe(1)
  })

  it('resume after pause waits one full interval (does NOT catch up missed ticks)', () => {
    store = createGameStore({ seed: 1, initialSpeed: 1 })
    renderHook(() => useTickLoop(store!))

    // Tick once.
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000)
    })
    expect(store.getState().snapshot.tick).toBe(1)

    // Pause + idle for several would-be intervals.
    act(() => {
      setSpeedSafe(store!, 0)
    })
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000 * 5)
    })
    expect(store.getState().snapshot.tick).toBe(1)

    // Resume. Just before one interval has elapsed → still tick=1.
    act(() => {
      setSpeedSafe(store!, 1)
    })
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000 - 100)
    })
    expect(store.getState().snapshot.tick).toBe(1)

    // Cross the interval boundary → exactly one tick (no catch-up).
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(store.getState().snapshot.tick).toBe(2)
  })
})

describe('T-020 AC#3 — speed only accepts values from SPEEDS', () => {
  it('setSpeedSafe(3) is rejected: speed unchanged + console.warn fired', () => {
    store = createGameStore({ seed: 1, initialSpeed: 1 })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(store.getState().speed).toBe(1)
    setSpeedSafe(store, 3)
    expect(store.getState().speed).toBe(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    // The warning text should reference the rejected value so it's actionable.
    const message = String(warnSpy.mock.calls[0]?.[0] ?? '')
    expect(message).toContain('3')
  })

  it('every value in SPEEDS is accepted', () => {
    store = createGameStore({ seed: 1, initialSpeed: 0 })
    for (const s of SPEEDS) {
      setSpeedSafe(store, s)
      expect(store.getState().speed).toBe(s)
    }
  })

  it('non-integer and negative speeds are rejected', () => {
    store = createGameStore({ seed: 1, initialSpeed: 1 })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const bad of [-1, 0.5, 1.5, 8, NaN, Infinity]) {
      setSpeedSafe(store, bad)
    }
    expect(store.getState().speed).toBe(1)
  })
})

describe('T-020 AC#4 — ApprovalThresholdCrossed triggers auto-pause', () => {
  it('after the tick that emits ApprovalThresholdCrossed, speed is 0', () => {
    // Construct a state on the cusp of threshold 30 — same pattern as
    // test/engine/acceptance/approval_legitimacy.spec.ts so we know it fires
    // on the very first tick. Aurelia-derived state with approval_prev=30.1
    // and every pop.happiness=5 yields smoothed approval < 30 on tick 1.
    const initialState = createAureliaState()
    initialState.approval_prev = 30.1
    initialState.country.approval = 30.1
    for (const pop of initialState.country.pops) pop.happiness = 5

    store = createGameStore({ seed: 1, initialState, initialSpeed: 1 })
    renderHook(() => useTickLoop(store!))

    // Sanity baseline.
    expect(store.getState().speed).toBe(1)

    // Run one tick interval. During advance() the engine emits
    // ApprovalThresholdCrossed synchronously; the auto-pause listener flips
    // speed to 0 before the setTimeout callback exits.
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000)
    })

    expect(store.getState().snapshot.tick).toBe(1)
    expect(store.getState().speed).toBe(0)

    // Further fake time → no additional ticks (auto-pause held).
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000 * 3)
    })
    expect(store.getState().snapshot.tick).toBe(1)
  })
})

describe('T-020 (in scope, not in literal AC) — TreasuryThresholdCrossed also auto-pauses', () => {
  it('after the tick that emits TreasuryThresholdCrossed, speed is 0', () => {
    // Per vault: stage 5 emits TreasuryThresholdCrossed when treasury crosses
    // 0 from above. Cheapest construction: start treasury just above 0 with a
    // structural balance that drains below 0 in one tick. Aurelia's stage 2
    // flow is balanced (income ≈ spend), so to force a one-tick crossing we
    // set treasury = 1 and treasury_prev = 1 with a tax_income slider of 0,
    // which collapses tax revenue to ~0 while budget_spend stays at
    // target_budget (100k). Net flow ≈ -100k → treasury < 0 → crossing fires.
    const initialState = createAureliaState()
    initialState.country.treasury = 1
    initialState.treasury_prev = 1
    initialState.country.sliders.tax_income = 0
    initialState.country.sliders.tax_corporate = 0
    initialState.country.sliders.tax_consumption = 0

    store = createGameStore({ seed: 1, initialState, initialSpeed: 1 })
    renderHook(() => useTickLoop(store!))

    expect(store.getState().speed).toBe(1)

    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000)
    })

    // The tick ran and the auto-pause listener observed the event.
    expect(store.getState().snapshot.tick).toBe(1)
    // Verify the event actually fired (otherwise the assert below is vacuous).
    const treasuryEvents = store
      .getState()
      .events.filter((e) => e.type === 'TreasuryThresholdCrossed')
    expect(treasuryEvents.length).toBeGreaterThanOrEqual(1)
    expect(store.getState().speed).toBe(0)
  })
})

describe('T-020 — hook hygiene', () => {
  it('unmount clears the pending timer (no further ticks fire after unmount)', () => {
    store = createGameStore({ seed: 1, initialSpeed: 1 })
    const { unmount } = renderHook(() => useTickLoop(store!))

    // One tick to prove the loop is live.
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000)
    })
    expect(store.getState().snapshot.tick).toBe(1)

    unmount()

    // Big fake-time jump after unmount must not advance the tick.
    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000 * 10)
    })
    expect(store.getState().snapshot.tick).toBe(1)
  })

  it('mounting twice runs two timers (idempotent — each instance manages its own)', () => {
    // Documented behavior: each useTickLoop instance owns its timer. Mounting
    // twice therefore doubles the tick rate. App code mounts exactly once;
    // this test pins the semantics so accidental remounts during dev are not
    // silently swallowed.
    store = createGameStore({ seed: 1, initialSpeed: 1 })
    renderHook(() => useTickLoop(store!))
    renderHook(() => useTickLoop(store!))

    act(() => {
      vi.advanceTimersByTime(REAL_SECONDS_PER_TICK_AT_1X * 1000)
    })

    expect(store.getState().snapshot.tick).toBe(2)
  })
})
