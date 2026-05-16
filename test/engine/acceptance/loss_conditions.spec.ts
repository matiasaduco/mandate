// T-016 — Stage 7: loss conditions + GameOver.
//
// One it() per AC checkbox from [[Loss Conditions]] / Phase 1 Tickets:
//   1. On Aurelia start, both loss counters are 0 and no GameOver fires.
//   2. GameOver(reason=bankruptcy) fires after BANKRUPTCY_NEGATIVE_BALANCE_TICKS
//      consecutive ticks with treasury<0 && balance<0.
//   3. GameOver(reason=mass_uprising) fires after APPROVAL_CRISIS_TICKS
//      consecutive ticks with approval<APPROVAL_CRISIS_THRESHOLD.
//   4. Partial counter accrual resets to 0 when the condition no longer holds.
//   5. After GameOver, subsequent tick() calls are no-ops (state.tick does not
//      advance and the pipeline does not run).
//   6. Both conditions met same tick → exactly one GameOver event fires with
//      reason='bankruptcy' (tie-break).
//
// Plus a determinism lock: on Aurelia at seed=1, counters stay at 0 over a
// rolling window and no GameOver fires (steady state is far from either
// trigger).
//
// Determinism contract: stage 7 (T-016) consumes the PRNG ZERO times. If any
// number in the lock test moves it means either (a) an upstream rng draw
// shifted (which would also break T-008…T-015 locks) or (b) the counter logic
// or thresholds (BANKRUPTCY_NEGATIVE_BALANCE_TICKS, APPROVAL_CRISIS_THRESHOLD,
// APPROVAL_CRISIS_TICKS) changed.

import { describe, expect, it } from 'vitest'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { createFixtureEngine, makeDummyRng } from '@test-utils'
import { stage7_feedback } from '@engine/pipeline/stage7_feedback'
import {
  APPROVAL_CRISIS_THRESHOLD,
  APPROVAL_CRISIS_TICKS,
  BANKRUPTCY_NEGATIVE_BALANCE_TICKS,
} from '@engine/tunables'
import type { EngineEvent } from '@engine/types'
import type { EngineContext } from '@engine/pipeline/context'

describe('T-016 stage 7 — loss conditions + GameOver', () => {
  it('On Aurelia start, both loss counters are 0 and no GameOver fires', () => {
    const events: EngineEvent[] = []
    const engine = createFixtureEngine()
    engine.subscribe((e) => events.push(e))
    const snap = engine.tick()
    expect(snap.loss_counters.bankruptcy_negative_balance_ticks).toBe(0)
    expect(snap.loss_counters.approval_below_crisis_ticks).toBe(0)
    expect(snap.game_over).toBe(false)
    expect(snap.game_over_reason).toBeNull()
    expect(events.filter((e) => e.type === 'GameOver')).toHaveLength(0)
  })

  it('GameOver(reason=bankruptcy) fires after BANKRUPTCY_NEGATIVE_BALANCE_TICKS consecutive ticks of treasury<0 && balance<0', () => {
    // Force the condition by mutating treasury<0 and flows.balance<0 BEFORE
    // each stage 7 call. We invoke stage7_feedback directly because calling
    // engine.tick() would re-run all stages and stage 2 would overwrite
    // flows.balance from the tax_income/budget_spend rollup.
    const events: EngineEvent[] = []
    const ctx: EngineContext = { emit: (e) => events.push(e), rng: makeDummyRng() }
    let state = createAureliaState()
    state.country.treasury = -1_000
    state.flows.balance = -100

    // Run stage 7 BANKRUPTCY_NEGATIVE_BALANCE_TICKS times. Each invocation
    // simulates the post-stage-2 state of a fresh tick; the manual `tick: t`
    // override mirrors the index.ts post-increment convention (event.tick is
    // the pre-increment value).
    for (let t = 0; t < BANKRUPTCY_NEGATIVE_BALANCE_TICKS; t++) {
      state = stage7_feedback({ ...state, tick: t }, ctx)
    }

    expect(state.game_over).toBe(true)
    expect(state.game_over_reason).toBe('bankruptcy')
    const gameOvers = events.filter((e) => e.type === 'GameOver')
    expect(gameOvers).toHaveLength(1)
    expect(gameOvers[0]).toMatchObject({ reason: 'bankruptcy' })
    // final_state_snapshot is the post-stage-7 state with game_over=true.
    const evt = gameOvers[0] as Extract<EngineEvent, { type: 'GameOver' }>
    expect(evt.final_state_snapshot.game_over).toBe(true)
    expect(evt.final_state_snapshot.game_over_reason).toBe('bankruptcy')
    expect(
      evt.final_state_snapshot.loss_counters.bankruptcy_negative_balance_ticks,
    ).toBe(BANKRUPTCY_NEGATIVE_BALANCE_TICKS)
  })

  it('GameOver(reason=mass_uprising) fires after APPROVAL_CRISIS_TICKS consecutive ticks of approval<APPROVAL_CRISIS_THRESHOLD', () => {
    // Force approval strictly < APPROVAL_CRISIS_THRESHOLD (=15). Treasury and
    // flows.balance stay at Aurelia defaults (positive, balance≈0) so the
    // bankruptcy counter never increments.
    const events: EngineEvent[] = []
    const ctx: EngineContext = { emit: (e) => events.push(e), rng: makeDummyRng() }
    let state = createAureliaState()
    state.country.approval = APPROVAL_CRISIS_THRESHOLD - 5 // strictly < threshold

    for (let t = 0; t < APPROVAL_CRISIS_TICKS; t++) {
      state = stage7_feedback({ ...state, tick: t }, ctx)
    }

    expect(state.game_over).toBe(true)
    expect(state.game_over_reason).toBe('mass_uprising')
    const gameOvers = events.filter((e) => e.type === 'GameOver')
    expect(gameOvers).toHaveLength(1)
    expect(gameOvers[0]).toMatchObject({ reason: 'mass_uprising' })
  })

  it('Partial counter accrual resets to 0 when the condition no longer holds', () => {
    const ctx: EngineContext = { emit: () => {}, rng: makeDummyRng() }
    let state = createAureliaState()

    // Tick 1: approval < APPROVAL_CRISIS_THRESHOLD → uprising counter goes to 1.
    state.country.approval = APPROVAL_CRISIS_THRESHOLD - 5
    state = stage7_feedback({ ...state, tick: 0 }, ctx)
    expect(state.loss_counters.approval_below_crisis_ticks).toBe(1)

    // Tick 2: approval recovers above threshold → counter resets to 0 (NOT
    // held at 1).
    state.country.approval = APPROVAL_CRISIS_THRESHOLD + 5
    state = stage7_feedback({ ...state, tick: 1 }, ctx)
    expect(state.loss_counters.approval_below_crisis_ticks).toBe(0)

    // GameOver did not fire — confirm sticky flag is still false.
    expect(state.game_over).toBe(false)
    expect(state.game_over_reason).toBeNull()
  })

  it('After GameOver, tick() returns the same state and does not advance the counter (no-op pipeline)', () => {
    // Construct an engine whose initial state is already game-over. The
    // index.ts guard short-circuits tick() before running runTick or
    // advancing the tick counter.
    const state = createAureliaState()
    state.game_over = true
    state.game_over_reason = 'bankruptcy'
    const engine = createFixtureEngine({ state })

    const snap1 = engine.tick()
    const snap2 = engine.tick()

    // Tick counter did NOT advance — both snapshots show the initial value.
    expect(snap1.tick).toBe(0)
    expect(snap2.tick).toBe(0)
    // Sticky flags preserved across both no-op calls.
    expect(snap1.game_over).toBe(true)
    expect(snap2.game_over).toBe(true)
    expect(snap1.game_over_reason).toBe('bankruptcy')
    expect(snap2.game_over_reason).toBe('bankruptcy')
    // State is structurally equal across calls (same pre-tick snapshot).
    expect(snap1.loss_counters).toEqual(snap2.loss_counters)
    expect(snap1.country.treasury).toEqual(snap2.country.treasury)
  })

  it('Both conditions met same tick → exactly one GameOver with reason=bankruptcy (tie-break)', () => {
    // Force BOTH triggers active simultaneously: treasury<0 + balance<0 AND
    // approval<APPROVAL_CRISIS_THRESHOLD. Bankruptcy fires first (tie-break).
    // After it fires, the defensive `if (!state.game_over)` guard in stage 7
    // prevents the uprising check from re-firing — even though uprising
    // would have also triggered if it had been allowed to evaluate later.
    const events: EngineEvent[] = []
    const ctx: EngineContext = { emit: (e) => events.push(e), rng: makeDummyRng() }
    let state = createAureliaState()
    state.country.treasury = -1_000
    state.flows.balance = -100
    state.country.approval = APPROVAL_CRISIS_THRESHOLD - 5

    // Run BANKRUPTCY_NEGATIVE_BALANCE_TICKS ticks: bankruptcy fires.
    for (let t = 0; t < BANKRUPTCY_NEGATIVE_BALANCE_TICKS; t++) {
      state = stage7_feedback({ ...state, tick: t }, ctx)
    }
    expect(state.game_over).toBe(true)
    expect(state.game_over_reason).toBe('bankruptcy')

    // Continue running stage 7 with both conditions still active. Past the
    // APPROVAL_CRISIS_TICKS mark the uprising counter would naturally reach
    // its trigger, but the defensive sticky check should skip emission.
    for (let t = BANKRUPTCY_NEGATIVE_BALANCE_TICKS; t < APPROVAL_CRISIS_TICKS + 1; t++) {
      state = stage7_feedback({ ...state, tick: t }, ctx)
    }

    const gameOvers = events.filter((e) => e.type === 'GameOver')
    expect(gameOvers).toHaveLength(1)
    expect(gameOvers[0]).toMatchObject({ reason: 'bankruptcy' })
    // game_over_reason remains bankruptcy after the additional ticks.
    expect(state.game_over_reason).toBe('bankruptcy')
  })

  // --- Determinism lock ---------------------------------------------------

  it('Determinism lock for seed=1: on Aurelia, counters stay at 0 for 10 ticks and no GameOver fires', () => {
    // Aurelia steady state: treasury ~48-50k, approval ~56, balance ~0. Neither
    // loss condition is anywhere close to firing. This lock catches regressions
    // where stage 7 spuriously increments a counter or emits GameOver.
    const events: EngineEvent[] = []
    const engine = createFixtureEngine()
    engine.subscribe((e) => events.push(e))
    let snap = engine.tick()
    for (let t = 1; t < 10; t++) snap = engine.tick()
    expect(snap.loss_counters.bankruptcy_negative_balance_ticks).toBe(0)
    expect(snap.loss_counters.approval_below_crisis_ticks).toBe(0)
    expect(snap.game_over).toBe(false)
    expect(snap.game_over_reason).toBeNull()
    expect(events.filter((e) => e.type === 'GameOver')).toHaveLength(0)
  })
})
