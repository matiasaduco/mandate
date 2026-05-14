// T-011 — Stage 3: POP income & employment.
//
// One `it()` per AC checkbox from [[POP Types]] / Phase 1 Tickets:
//   1. On Aurelia start, after 1 tick, each POP's income is within ±2% of
//      its starting value.
//   2. country.population === Σ pop.size always.
//   3. Sample Tick Scenario 2: raising tax_income 25→30% reduces
//      urban_workers and middle_class income, leaves capitalists.income
//      unchanged.
//   4. An income computation that would go negative clamps to 0 and sets
//      income_clamped.
//
// Plus a determinism lock that pins exact post-tick income values for all
// 5 POPs at seed=1 (mirrors the precedent set by T-008 / T-009 / T-010).

import { describe, expect, it } from 'vitest'
import { createEngine } from '../../../src/engine'
import { createAureliaState } from '../../../src/engine/fixtures/aurelia'
import type { Decision } from '../../../src/engine/types'

describe('T-011 stage 3 — POP income & employment', () => {
  it('On Aurelia start, after 1 tick, each POPs income is within ±2% of its starting value', () => {
    // The income formula is calibrated (POP_INCOME_COEFF_P1) so that at the
    // pre-noise start every POP's computed income equals its declared income
    // exactly. Stage 2 introduces ±0.5% sector noise, so post-tick incomes
    // drift well under the ±2% acceptance band.
    const initial = createAureliaState()
    const engine = createEngine(initial, { seed: 1 })

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

    const engine = createEngine(initial, { seed: 1 })
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

    const engine = createEngine(createAureliaState(), { seed: 1 })
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
    const engine = createEngine(state, { seed: 1 })
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
    const engine = createEngine(createAureliaState(), { seed: 1 })
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
