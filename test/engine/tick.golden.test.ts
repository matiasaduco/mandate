// T-030 — Sample Tick golden test.
//
// Encodes the two scenarios from `~/Documents/Tycoon/07 - Examples/Sample Tick.md`
// as golden tests that fail loudly when the simulation drifts. Each scenario
// is one `describe` block; each watched variable is its own `it()` so that
// when the engine drifts the failing test name immediately identifies which
// value moved (AC #3: "On intentional drift, the test fails with a clear
// message identifying which value drifted").
//
// Scenario 1 — Steady-state tick. From the Aurelia start, advance 1 tick
//   with no decisions. Sub-percent drift is expected on GDP and treasury,
//   ≈ 0 drift on approval, and zero events fire.
//
// Scenario 2 — Policy-change tick. Queue `tax_income = 30` and advance 1
//   tick. End-state values must land within ±5% of the [[Sample Tick]]
//   table. Exactly one `PolicyChanged` event must fire.
//
// Determinism: `createFixtureEngine()` pins `seed = 1` and the canonical
// Aurelia fixture. The pre-tick state used as the "before" reference is a
// fresh `createAureliaState()` (the engine's `state` is a structured clone,
// so this is untouched by the tick).

import { describe, expect, it } from 'vitest'
import { createFixtureEngine } from '@test-utils'
import { createAureliaState } from '@engine/fixtures/aurelia'
import type { Decision, EngineEvent } from '@engine/types'

// --- Scenario 1 ------------------------------------------------------------
//
// AC: "Both scenarios pass within their declared tolerances."
// AC: "Scenario 1 emits zero events."
//
// Tolerances from the ticket:
//   - gdp drift < 1%
//   - treasury drift < 1%
//   - approval drift < 0.5 (absolute)
//   - no events emitted

describe('T-030 — Sample Tick Scenario 1 (steady-state, no input, 1 tick)', () => {
  it('gdp drifts less than 1% from starting value', () => {
    const initial = createAureliaState()
    const engine = createFixtureEngine()
    const snap = engine.tick()

    const driftPct = Math.abs(snap.country.gdp - initial.country.gdp) / initial.country.gdp
    // Drift must stay under 1% — sub-percent steady-state per [[Sample Tick]] § 1.
    expect(
      driftPct,
      `gdp drift exceeded 1% (was ${(driftPct * 100).toFixed(4)}%; ` +
        `gdp ${initial.country.gdp} → ${snap.country.gdp})`,
    ).toBeLessThan(0.01)
  })

  it('treasury drifts less than 1% from starting value', () => {
    const initial = createAureliaState()
    const engine = createFixtureEngine()
    const snap = engine.tick()

    const driftPct =
      Math.abs(snap.country.treasury - initial.country.treasury) / initial.country.treasury
    // Drift must stay under 1% — implies balance ≈ 0 per [[Sample Tick]] § 1.
    // The Aurelia fixture pins target_budget to the engine's noise-mean tax
    // flow (99_000) so this lands at ≈ 0.23% on seed=1.
    expect(
      driftPct,
      `treasury drift exceeded 1% (was ${(driftPct * 100).toFixed(4)}%; ` +
        `treasury ${initial.country.treasury} → ${snap.country.treasury}; ` +
        `balance ${snap.flows.balance})`,
    ).toBeLessThan(0.01)
  })

  it('approval drifts less than 0.5 in absolute terms', () => {
    const initial = createAureliaState()
    const engine = createFixtureEngine()
    const snap = engine.tick()

    const drift = Math.abs(snap.country.approval - initial.country.approval)
    // Approval inertia (APPROVAL_INERTIA_TAU=4) keeps the change tiny on a
    // steady-state tick — [[Sample Tick]] § 1 expects ~56 → ~56.05 unsmoothed,
    // ~56 after smoothing. Drift threshold 0.5 catches any structural break
    // (e.g., a stage-4 regression that bypasses smoothing).
    expect(
      drift,
      `approval drift exceeded 0.5 (was ${drift.toFixed(4)}; ` +
        `approval ${initial.country.approval} → ${snap.country.approval})`,
    ).toBeLessThan(0.5)
  })

  it('emits zero events', () => {
    const engine = createFixtureEngine()
    const events: EngineEvent[] = []
    engine.subscribe((e) => events.push(e))

    engine.tick()

    // Steady-state tick: no thresholds crossed, no decisions applied, no
    // decrees issued → no events. If this fails, the failure message lists
    // the unexpected event types so the offending stage is obvious.
    expect(
      events.length,
      `expected zero events on steady-state tick, got ${events.length}: ` +
        `[${events.map((e) => e.type).join(', ')}]`,
    ).toBe(0)
  })
})

// --- Scenario 2 ------------------------------------------------------------
//
// AC: "Both scenarios pass within their declared tolerances."
// AC: "Scenario 2 emits exactly one `PolicyChanged`."
//
// Target table (within ±5% per value):
//   - tax_income slider = 30 (exact, set by the queued Decision)
//   - treasury ≈ 62_000
//   - balance ≈ +12_000
//   - approval ≈ 55.6
//   - middle_class.happiness ≈ 56.5
//
// Balance is computed from the snapshot:
//   balance := treasury_after − treasury_before
// (There is no `country.balance` field; `state.flows.balance` is also
// observed and asserted equal to the treasury delta as a cross-check.)

describe('T-030 — Sample Tick Scenario 2 (queue tax_income=30, 1 tick)', () => {
  // The ±5% tolerance is defined by the ticket. Wrapped in a const so the
  // assertion failure messages can quote it without drifting from the value.
  const TOLERANCE = 0.05

  // Helper: builds the engine, queues the decision, captures events, runs
  // 1 tick, and returns everything needed for the per-AC assertions. Each
  // `it()` re-builds via this helper so failures are independent.
  function runScenario2() {
    const initial = createAureliaState()
    const engine = createFixtureEngine()
    const events: EngineEvent[] = []
    engine.subscribe((e) => events.push(e))

    const decision: Decision = { type: 'slider', slider_id: 'tax_income', value: 30 }
    engine.applyDecisions([decision])
    const snap = engine.tick()

    return { initial, snap, events }
  }

  it('tax_income slider lands at 30 (exact, from queued decision)', () => {
    const { snap } = runScenario2()
    expect(
      snap.country.sliders.tax_income,
      `tax_income slider drift (expected 30, got ${snap.country.sliders.tax_income})`,
    ).toBe(30)
  })

  it('treasury ≈ 62,000 within ±5%', () => {
    const { snap } = runScenario2()
    const target = 62_000
    const driftPct = Math.abs(snap.country.treasury - target) / target
    expect(
      driftPct,
      `treasury drift exceeded ±${TOLERANCE * 100}% of target ${target} ` +
        `(was ${(driftPct * 100).toFixed(4)}%; treasury ${snap.country.treasury})`,
    ).toBeLessThanOrEqual(TOLERANCE)
  })

  it('balance ≈ +12,000 within ±5%', () => {
    // No `country.balance` field — compute the per-tick balance as the
    // treasury delta. Cross-check against `flows.balance` so the test fails
    // loudly if the two diverge (which would indicate a bug in stage 2's
    // treasury_next = treasury + balance accounting).
    const { initial, snap } = runScenario2()
    const target = 12_000
    const balanceFromTreasury = snap.country.treasury - initial.country.treasury

    // Sanity: balance flow exactly equals the treasury delta on this tick
    // (stage 2's invariant). If this fires, the per-AC drift below is
    // ambiguous — fix this first.
    expect(
      snap.flows.balance,
      `flows.balance (${snap.flows.balance}) diverges from treasury delta ` +
        `(${balanceFromTreasury}); stage 2 accounting bug suspected`,
    ).toBeCloseTo(balanceFromTreasury, 6)

    const driftPct = Math.abs(balanceFromTreasury - target) / target
    expect(
      driftPct,
      `balance drift exceeded ±${TOLERANCE * 100}% of target ${target} ` +
        `(was ${(driftPct * 100).toFixed(4)}%; balance ${balanceFromTreasury})`,
    ).toBeLessThanOrEqual(TOLERANCE)
  })

  it('approval ≈ 55.6 within ±5%', () => {
    const { snap } = runScenario2()
    const target = 55.6
    const driftPct = Math.abs(snap.country.approval - target) / target
    expect(
      driftPct,
      `approval drift exceeded ±${TOLERANCE * 100}% of target ${target} ` +
        `(was ${(driftPct * 100).toFixed(4)}%; approval ${snap.country.approval})`,
    ).toBeLessThanOrEqual(TOLERANCE)
  })

  it('middle_class.happiness ≈ 56.5 within ±5%', () => {
    const { snap } = runScenario2()
    // POPs are keyed by `pop_type` (not `type`). Looking up by string keeps
    // the test resilient to POP-array reordering.
    const mc = snap.country.pops.find((p) => p.pop_type === 'middle_class')
    expect(mc, 'middle_class POP missing from snapshot').toBeDefined()
    const happiness = mc!.happiness
    const target = 56.5
    const driftPct = Math.abs(happiness - target) / target
    expect(
      driftPct,
      `middle_class.happiness drift exceeded ±${TOLERANCE * 100}% of ` +
        `target ${target} (was ${(driftPct * 100).toFixed(4)}%; happiness ${happiness})`,
    ).toBeLessThanOrEqual(TOLERANCE)
  })

  it('emits exactly one PolicyChanged event', () => {
    const { events } = runScenario2()

    const policyChanged = events.filter((e) => e.type === 'PolicyChanged')
    expect(
      policyChanged.length,
      `expected exactly one PolicyChanged event, got ${policyChanged.length}: ` +
        `[${events.map((e) => e.type).join(', ')}]`,
    ).toBe(1)
  })

  it('emits no events beyond the single PolicyChanged', () => {
    // Defensive companion to the test above: if a future change causes stage
    // 5 or stage 7 to fire any other event on the policy-change path, the
    // count will diverge and this test names exactly that.
    const { events } = runScenario2()
    expect(
      events.length,
      `expected exactly 1 event on the policy-change tick, got ${events.length}: ` +
        `[${events.map((e) => e.type).join(', ')}]`,
    ).toBe(1)
  })
})
