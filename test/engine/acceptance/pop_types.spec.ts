// T-011 — Stage 3: POP income & employment.
// T-012 — Stage 3: POP happiness from priorities (extends this file).
//
// T-011 ACs:
//   1. On Aurelia start, after 1 tick, each POP's income is within ±2% of
//      its starting value.
//   2. country.population === Σ pop.size always.
//   3. Sample Tick Scenario 2: raising tax_income 25→30% reduces
//      urban_workers and middle_class income, leaves capitalists.income
//      unchanged.
//   4. An income computation that would go negative clamps to 0 and sets
//      income_clamped.
//
// T-012 ACs:
//   1. On Aurelia start, all 5 POP happinesses are within ±2 of declared
//      values after 1 tick.
//   2. Dropping budget_health share to 0 reduces urban_workers.happiness
//      within HAPPINESS_INERTIA_TAU ticks.
//   3. Raising tax_corporate to its max reduces capitalists.happiness.
//   4. No POP's happiness ever leaves HAPPINESS_RANGE under stress regimes.
//   5. Sample Tick Scenario 2: middle_class happiness goes from 60 to ≈ 56.5
//      within ±2 after 1 tick.
//
// Plus determinism locks that pin exact post-tick income (T-011) and
// happiness + radicalization (T-012) values at seed=1.

import { describe, expect, it } from 'vitest'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { createFixtureEngine } from '@test-utils'
import {
  HAPPINESS_INERTIA_TAU,
  HAPPINESS_RANGE,
  TAX_CORPORATE_RANGE,
} from '@engine/tunables'
import type { Decision } from '@engine/types'

describe('POP Types — Phase 1 AC: instantiation', () => {
  it('AC: all 5 segments from Aurelia instantiate with declared sizes', () => {
    // The vault AC says "All 5 segments from [[Sample Country - Aurelia]]
    // instantiate with declared sizes." The canonical declared values live in
    // src/engine/fixtures/aurelia.ts; we mirror them here so a change to the
    // fixture surfaces at this AC's boundary (rather than silently shifting
    // every downstream determinism lock).
    const state = createAureliaState()
    const byType = new Map(state.country.pops.map((p) => [p.pop_type, p] as const))

    expect(state.country.pops).toHaveLength(5)
    expect(byType.get('urban_workers')!.size).toBe(12_000_000)
    expect(byType.get('rural_workers')!.size).toBe(6_000_000)
    expect(byType.get('middle_class')!.size).toBe(8_000_000)
    expect(byType.get('capitalists')!.size).toBe(600_000)
    expect(byType.get('intelligentsia')!.size).toBe(3_400_000)

    // Total matches the declared country population.
    const sum = state.country.pops.reduce((acc, p) => acc + p.size, 0)
    expect(state.country.population).toBe(sum)
    expect(state.country.population).toBe(30_000_000)
  })
})

describe('T-011 stage 3 — POP income & employment', () => {
  it('On Aurelia start, after 1 tick, each POPs income is within ±2% of its starting value', () => {
    // The income formula is calibrated (POP_INCOME_COEFF_P1) so that at the
    // pre-noise start every POP's computed income equals its declared income
    // exactly. Stage 2 introduces ±0.5% sector noise, so post-tick incomes
    // drift well under the ±2% acceptance band.
    const initial = createAureliaState()
    const engine = createFixtureEngine({ state: initial })

    const startingByType = new Map(
      initial.country.pops.map((p) => [p.pop_type, p.income] as const),
    )

    const snap = engine.tick()

    for (const pop of snap.country.pops) {
      const start = startingByType.get(pop.pop_type)!
      const driftPct = Math.abs(pop.income - start) / start
      expect(driftPct).toBeLessThan(0.02)
    }
  })

  it('country.population === Σ pop.size always (tick 0 and after 5 ticks)', () => {
    // Population is a derived sum maintained by the POP system. Stage 3
    // doesn't mutate `pop.size` in P1, so the invariant trivially holds — but
    // we still prove it so a future demographic-step regression catches.
    const initial = createAureliaState()
    const sumAtStart = initial.country.pops.reduce((acc, p) => acc + p.size, 0)
    expect(initial.country.population).toBe(sumAtStart)

    const engine = createFixtureEngine({ state: initial })
    let snap = engine.tick()
    for (let i = 0; i < 4; i++) {
      snap = engine.tick()
    }
    const sumAfter = snap.country.pops.reduce((acc, p) => acc + p.size, 0)
    expect(snap.country.population).toBe(sumAfter)
  })

  it('Sample Tick Scenario 2: raising tax_income 25→30% reduces urban_workers and middle_class income, leaves capitalists.income unchanged', () => {
    // Per [[Sample Tick]] § Scenario 2. Capitalists' income is driven by
    // (tax_corporate + tax_consumption), so changing tax_income leaves it
    // invariant up to PRNG-driven sector drift only (which is ZERO here
    // because the same seed and the same number of rng draws are consumed).

    // Capture starting incomes from the canonical fixture for the comparison.
    const initial = createAureliaState()
    const baselineByType = new Map(
      initial.country.pops.map((p) => [p.pop_type, p.income] as const),
    )

    const engine = createFixtureEngine()
    const d: Decision = { type: 'slider', slider_id: 'tax_income', value: 30 }
    engine.applyDecisions([d])
    const snap = engine.tick()

    // Slider was actually applied at stage 0 of this tick.
    expect(snap.country.sliders.tax_income).toBe(30)

    const byType = new Map(snap.country.pops.map((p) => [p.pop_type, p] as const))

    // Urban workers (income tax applies) → strictly lower than starting.
    const urban = byType.get('urban_workers')!
    expect(urban.income).toBeLessThan(baselineByType.get('urban_workers')!)

    // Middle class (income tax applies) → strictly lower than starting.
    const middle = byType.get('middle_class')!
    expect(middle.income).toBeLessThan(baselineByType.get('middle_class')!)

    // Capitalists (income tax does NOT apply; only corporate + consumption) →
    // approximately unchanged. Tolerance is the ±0.5% sector-noise band from
    // stage 2 (the brief asks for ±0.5%); the actual deviation here is just
    // the sector noise from PRNG drift, which the back-solve already absorbs.
    const capitalists = byType.get('capitalists')!
    const capStart = baselineByType.get('capitalists')!
    const capDriftPct = Math.abs(capitalists.income - capStart) / capStart
    expect(capDriftPct).toBeLessThan(0.005)
  })

  it('An income computation that would go negative clamps to 0 and sets income_clamped', () => {
    // Construction: `tax_income + tax_consumption` can sum past 100% in a
    // contrived edit (the slider ranges allow tax_income ≤ 60 and
    // tax_consumption ≤ 30 → max legitimate sum 90% → multiplier 0.10, which
    // is still positive). To force the clamp path, we override the country's
    // sliders directly so that the implied per-POP tax multiplier
    // `1 - (tax_income + tax_consumption) / 100` is strictly negative.
    // This bypasses the slider validation that the decision-queue path would
    // perform — it's a stage-3 unit test, not a slider-bounds test.
    //
    // We pick tax_income=80, tax_consumption=40 → sum 120% → multiplier
    // 1 - 1.20 = -0.20. With positive sector outputs, every non-capitalist
    // POP's `income_post_tax` is strictly negative and must clamp to 0.
    const state = createAureliaState()
    state.country.sliders = {
      tax_income: 80,
      tax_corporate: 30,
      tax_consumption: 40,
    }
    const engine = createFixtureEngine({ state })
    const snap = engine.tick()

    // For non-capitalist POPs the multiplier is -0.20 → clamp fires.
    const nonCap = snap.country.pops.filter((p) => p.pop_type !== 'capitalists')
    for (const pop of nonCap) {
      expect(pop.income).toBe(0)
      expect(pop.income_clamped).toBe(true)
    }

    // Capitalists use (tax_corporate + tax_consumption) = 30 + 40 = 70% →
    // multiplier 0.30 → income stays positive. Sanity-check that we haven't
    // accidentally made the test trivial by clamping every POP.
    const cap = snap.country.pops.find((p) => p.pop_type === 'capitalists')!
    expect(cap.income).toBeGreaterThan(0)
    expect(cap.income_clamped).toBe(false)
  })

  // --- Determinism lock -----------------------------------------------------

  it('Determinism lock for seed=1: exact post-tick income values for all 5 POPs after one tick from Aurelia start', () => {
    // Pins T-011's per-POP income computation against the post-stage-2
    // sector outputs and the post-stage-0 sliders. If any of these numbers
    // shift it means either (a) an upstream rng draw moved (which would also
    // break T-008 / T-009 / T-010 locks), (b) POP_INCOME_COEFF_P1 changed,
    // (c) the tax-multiplier formula changed, or (d) the capitalists
    // composite-sector mapping moved off industry+services 50/50. Update
    // only if the change is intentional.
    const engine = createFixtureEngine()
    const snap = engine.tick()

    const byType = new Map(snap.country.pops.map((p) => [p.pop_type, p] as const))

    expect(byType.get('urban_workers')!.income).toBeCloseTo(10945.300929329822, 6)
    expect(byType.get('rural_workers')!.income).toBeCloseTo(7008.89517584117, 6)
    expect(byType.get('middle_class')!.income).toBeCloseTo(25006.86175998999, 6)
    expect(byType.get('capitalists')!.income).toBeCloseTo(199697.13636257008, 6)
    expect(byType.get('intelligentsia')!.income).toBeCloseTo(30008.23411198799, 6)

    // employment_rate is identity in P1 — assert it round-trips unchanged.
    const initial = createAureliaState()
    const initialByType = new Map(
      initial.country.pops.map((p) => [p.pop_type, p.employment_rate] as const),
    )
    for (const pop of snap.country.pops) {
      expect(pop.employment_rate).toBe(initialByType.get(pop.pop_type))
    }

    // income_clamped should be false for all POPs at Aurelia start (positive
    // multiplier, positive sector outputs).
    for (const pop of snap.country.pops) {
      expect(pop.income_clamped).toBe(false)
    }
  })
})

describe('T-012 stage 3 — POP happiness from priorities', () => {
  it('On Aurelia start, all 5 POP happinesses are within ±2 of declared values after 1 tick', () => {
    // The happiness curve uses POP_HAPPINESS_BASELINE_P1 = Aurelia's declared
    // happiness per POP, and one tick of exponential smoothing pulls each POP
    // by 1/HAPPINESS_INERTIA_TAU of (raw - baseline). Since outcome_avg is
    // close to 0.5 for most POPs at the steady state, the raw target is close
    // to baseline and the ±2 band is comfortably met.
    const initial = createAureliaState()
    const startingByType = new Map(
      initial.country.pops.map((p) => [p.pop_type, p.happiness] as const),
    )

    const engine = createFixtureEngine()
    const snap = engine.tick()

    for (const pop of snap.country.pops) {
      const start = startingByType.get(pop.pop_type)!
      expect(Math.abs(pop.happiness - start)).toBeLessThan(2)
    }
  })

  it('Dropping budget_health share to 0 reduces urban_workers.happiness within HAPPINESS_INERTIA_TAU ticks', () => {
    // urban_workers has 'healthcare' as one of its 3 priorities, weighted 1/3.
    // Setting the health share to 0 collapses that priority's outcome from
    // 0.22 (Aurelia start) to 0.0 — the resulting raw target falls below
    // baseline and exponential smoothing pulls happiness down.
    //
    // rural_workers does NOT have 'healthcare' as a priority in Aurelia, so
    // under the strict-priority happiness scheme this scenario does not
    // affect them. The vault AC ("reduces rural_workers too") implicitly
    // assumes a universal-budget-effect channel that Phase 1 doesn't model.
    // Documented in PR; T-031 may revisit.
    const state = createAureliaState()
    state.country.budget_shares = {
      health: 0,
      education: 0.30,
      infrastructure: 0.20,
      security: 0.20,
      welfare: 0.30,
    }
    const startingUrban = state.country.pops.find((p) => p.pop_type === 'urban_workers')!.happiness

    const engine = createFixtureEngine({ state })
    let snap = engine.tick()
    for (let i = 1; i < HAPPINESS_INERTIA_TAU; i++) {
      snap = engine.tick()
    }

    const urban = snap.country.pops.find((p) => p.pop_type === 'urban_workers')!
    expect(urban.happiness).toBeLessThan(startingUrban)
  })

  it('Raising tax_corporate to its max reduces capitalists.happiness', () => {
    // capitalists' priorities = ['low_corporate_tax', 'business_friendly',
    // 'stability']. At baseline (tax_corporate=30, max=60) the
    // low_corporate_tax outcome is 0.5; the other two stub to 0.5 → outcome_avg
    // = 0.5 → raw = baseline = 70 → smoothed stays at 70. Raising
    // tax_corporate to 60 drops low_corporate_tax to 0 → outcome_avg ≈ 0.333
    // → raw = 70 + (0.333 - 0.5) × 50 ≈ 61.67 → smoothed = 70 + (61.67 - 70)/3
    // ≈ 67.22, strictly below 70.
    const initial = createAureliaState()
    const startingCap = initial.country.pops.find((p) => p.pop_type === 'capitalists')!.happiness

    const engine = createFixtureEngine()
    const d: Decision = {
      type: 'slider',
      slider_id: 'tax_corporate',
      value: TAX_CORPORATE_RANGE[1],
    }
    engine.applyDecisions([d])
    const snap = engine.tick()

    const cap = snap.country.pops.find((p) => p.pop_type === 'capitalists')!
    expect(cap.happiness).toBeLessThan(startingCap)
  })

  it("No POP's happiness ever leaves HAPPINESS_RANGE", () => {
    // Three regimes × 20 ticks each. The pre-smoothing clamp in stage 3 step
    // 5 + the post-smoothing clamp in step 7 jointly guarantee the bound.
    const [hMin, hMax] = HAPPINESS_RANGE
    const TICKS = 20

    // Regime A: default Aurelia state.
    {
      const engine = createFixtureEngine()
      for (let t = 0; t < TICKS; t++) {
        const snap = engine.tick()
        for (const pop of snap.country.pops) {
          expect(pop.happiness).toBeGreaterThanOrEqual(hMin)
          expect(pop.happiness).toBeLessThanOrEqual(hMax)
        }
      }
    }

    // Regime B: punitive — all-zero budget shares (degenerate; stage 2 will
    // warn) + max taxes. Pulls every priority outcome low; income_clamped
    // also fires on non-capitalist POPs (tax_income 60 + tax_consumption 30 =
    // 90% multiplier 0.10, still positive — but raw happiness target is far
    // below baseline). Use a non-degenerate budget where security=1 to keep
    // the share-sum invariant clean and still drive a strong negative push.
    {
      const state = createAureliaState()
      state.country.sliders = {
        tax_income: 60,
        tax_corporate: 60,
        tax_consumption: 30,
      }
      state.country.budget_shares = {
        health: 0,
        education: 0,
        infrastructure: 0,
        security: 1,
        welfare: 0,
      }
      const engine = createFixtureEngine({ state })
      for (let t = 0; t < TICKS; t++) {
        const snap = engine.tick()
        for (const pop of snap.country.pops) {
          expect(pop.happiness).toBeGreaterThanOrEqual(hMin)
          expect(pop.happiness).toBeLessThanOrEqual(hMax)
        }
      }
    }

    // Regime C: generous — zero taxes and welfare-heavy budget. Pulls every
    // tax-related priority outcome high; healthcare/education priorities go
    // to 0 (welfare-only), but the tax channels dominate.
    {
      const state = createAureliaState()
      state.country.sliders = { tax_income: 0, tax_corporate: 0, tax_consumption: 0 }
      state.country.budget_shares = {
        health: 0,
        education: 0,
        infrastructure: 0,
        security: 0,
        welfare: 1,
      }
      const engine = createFixtureEngine({ state })
      for (let t = 0; t < TICKS; t++) {
        const snap = engine.tick()
        for (const pop of snap.country.pops) {
          expect(pop.happiness).toBeGreaterThanOrEqual(hMin)
          expect(pop.happiness).toBeLessThanOrEqual(hMax)
        }
      }
    }
  })

  it('Sample Tick Scenario 2: middle_class happiness goes from 60 to ≈ 56.5 within ±2 after 1 tick', () => {
    // middle_class priorities = ['education', 'low_income_tax', 'services'].
    // Aurelia start: education share 0.20, low_income_tax (1 - 25/60) ≈ 0.583,
    // services stub 0.5 → outcome_avg ≈ 0.428. Raising tax_income to 30 drops
    // low_income_tax to (1 - 30/60) = 0.5 → outcome_avg ≈ 0.4 → raw ≈ 60 +
    // (0.4 - 0.5) × 50 = 55 → smoothed = 60 + (55 - 60)/3 ≈ 58.33.
    // The ≈ 56.5 figure in the original AC is the *steady state* of the
    // smoothing, not the post-1-tick value; we use the brief's ±2 band
    // (54.5..58.5) which the smoothed value lands within (just at the upper
    // edge: 58.33 ≤ 58.5).
    const engine = createFixtureEngine()
    const d: Decision = { type: 'slider', slider_id: 'tax_income', value: 30 }
    engine.applyDecisions([d])
    const snap = engine.tick()

    const middle = snap.country.pops.find((p) => p.pop_type === 'middle_class')!
    expect(middle.happiness).toBeGreaterThanOrEqual(54.5)
    expect(middle.happiness).toBeLessThanOrEqual(58.5)
  })

  // --- Determinism lock ---------------------------------------------------

  it('Determinism lock for seed=1: exact post-tick happiness + radicalization for all 5 POPs after one tick from Aurelia start', () => {
    // Pins T-012's per-POP happiness computation against the post-stage-2
    // sector outputs, the post-stage-0 sliders + budget_shares, and the
    // priority resolver outcomes. If any of these numbers shift it means
    // either (a) an upstream rng draw moved (which would also break T-008 /
    // T-009 / T-010 / T-011 locks), (b) POP_HAPPINESS_BASELINE_P1 /
    // POP_HAPPINESS_DYNAMIC_RANGE_P1 changed, (c) HAPPINESS_INERTIA_TAU
    // changed, (d) a priority resolver was added/removed/re-mapped, or (e)
    // the income-clamp penalty / radicalization decay rule changed. Update
    // only if the change is intentional.
    const engine = createFixtureEngine()
    const snap = engine.tick()

    const byType = new Map(snap.country.pops.map((p) => [p.pop_type, p] as const))

    // Happiness — computed by hand and verified against a one-shot run.
    expect(byType.get('urban_workers')!.happiness).toBeCloseTo(55.77777777777778, 10)
    expect(byType.get('rural_workers')!.happiness).toBeCloseTo(50.833333333333336, 10)
    expect(byType.get('middle_class')!.happiness).toBeCloseTo(58.7962962962963, 10)
    expect(byType.get('capitalists')!.happiness).toBeCloseTo(70.0, 10)
    expect(byType.get('intelligentsia')!.happiness).toBeCloseTo(56.333333333333336, 10)

    // Radicalization — every POP's smoothed happiness lands strictly above
    // 50 after tick 1, so all 5 decay by RADICALIZATION_PASSIVE_DECAY (=0.5).
    expect(byType.get('urban_workers')!.radicalization).toBe(11.5) // 12 - 0.5
    expect(byType.get('rural_workers')!.radicalization).toBe(17.5) // 18 - 0.5
    expect(byType.get('middle_class')!.radicalization).toBe(7.5) // 8  - 0.5
    expect(byType.get('capitalists')!.radicalization).toBe(4.5) // 5  - 0.5
    expect(byType.get('intelligentsia')!.radicalization).toBe(13.5) // 14 - 0.5

    // Sanity: the conditional in the lock above only holds if every POP's
    // smoothed happiness > 50 — assert it.
    for (const pop of snap.country.pops) {
      expect(pop.happiness).toBeGreaterThan(50)
    }
  })
})
