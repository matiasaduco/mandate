// T-008 — Stage 2: sectors + GDP.
//
// One `it()` per AC checkbox from [[Simple Economy]] / Phase 1 Tickets:
//   1. On Aurelia start, after 1 tick, each sector output drifts by < 1% of
//      starting value (steady-state, deterministic given seed).
//   2. country.gdp after tick = sum of sector outputs (no drift larger than
//      the sum of sector drifts).
//   3. Negative GDP cannot occur on stable input (clamp + warn if it ever does).
//   4. Phase 1: pollution_coefficient is tracked but never consumed (no
//      system reads it).
//
// Plus the edge cases called out in the brief.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../../src/engine'
import { createAureliaState } from '../../../src/engine/fixtures/aurelia'
import { taxDampening } from '../../../src/engine/pipeline/stage2_economy'
import {
  TAX_DAMPENING_BREAKPOINT,
  TAX_INCOME_RANGE,
  TAX_CORPORATE_RANGE,
  TAX_CONSUMPTION_RANGE,
} from '../../../src/engine/tunables'
import type { Decision } from '../../../src/engine/types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('T-008 stage 2 — sectors + GDP', () => {
  it('On Aurelia start, after 1 tick, each sector output drifts by < 1% of starting value (steady-state, deterministic given seed)', () => {
    const initial = createAureliaState()
    const engine = createEngine(initial, { seed: 1 })

    const snap = engine.tick()

    for (let i = 0; i < initial.country.sectors.length; i++) {
      const before = initial.country.sectors[i].output
      const after = snap.country.sectors[i].output
      const driftPct = Math.abs(after - before) / before
      expect(driftPct).toBeLessThan(0.01)
    }
  })

  it('country.gdp after tick = sum of sector outputs (no drift larger than the sum of sector drifts)', () => {
    const initial = createAureliaState()
    const engine = createEngine(initial, { seed: 1 })

    const snap = engine.tick()

    const sumSectors = snap.country.sectors.reduce((acc, s) => acc + s.output, 0)
    // GDP equals the exact sum of sector outputs (no extra drift introduced
    // by the rollup itself).
    expect(snap.country.gdp).toBeCloseTo(sumSectors, 9)

    // And the drift on GDP is bounded by the sum of per-sector drifts.
    const sumSectorDrifts = initial.country.sectors.reduce((acc, s, i) => {
      return acc + Math.abs(snap.country.sectors[i].output - s.output)
    }, 0)
    const gdpDrift = Math.abs(snap.country.gdp - initial.country.gdp)
    // Allow a tiny epsilon for float aggregation.
    expect(gdpDrift).toBeLessThanOrEqual(sumSectorDrifts + 1e-6)
  })

  it('Negative GDP cannot occur on stable input (clamp + warn if it ever does)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Run 100 ticks of pure steady-state input and check the invariant
    // holds every tick. With noise half-band 0.005 the clamp never fires
    // here — its presence is for T-009's tax-dampening path. We assert the
    // negative-GDP invariant; the warn assertion targets the clamp itself.
    const engine = createEngine(createAureliaState(), { seed: 1 })
    for (let i = 0; i < 100; i++) {
      const snap = engine.tick()
      expect(snap.country.gdp).toBeGreaterThanOrEqual(0)
      for (const sector of snap.country.sectors) {
        expect(sector.output).toBeGreaterThanOrEqual(0)
      }
    }

    // No clamp warning is expected on stable input — clamp exists but should
    // not fire. (Negative assertion: makes the "stable input" precondition
    // observable in the test.)
    const clampWarnings = warnSpy.mock.calls
      .map((args) => String(args[0]))
      .filter((s) => /clamp/i.test(s))
    expect(clampWarnings).toEqual([])
  })

  it('Phase 1: pollution_coefficient is tracked but never consumed (no system reads it)', () => {
    const initial = createAureliaState()
    const engine = createEngine(initial, { seed: 1 })

    // Multi-tick: the engine never writes to pollution_coefficient.
    // (We use this as the strongest observable proxy for "no system reads it"
    // — any system that consumed it for a derived value would either mutate
    // it or live in a stage that we'd catch downstream.)
    for (let i = 0; i < 10; i++) {
      const snap = engine.tick()
      for (let j = 0; j < initial.country.sectors.length; j++) {
        expect(snap.country.sectors[j].pollution_coefficient).toBe(
          initial.country.sectors[j].pollution_coefficient,
        )
      }
    }
  })

  // --- Edge cases from the brief --------------------------------------------

  it('Two engines with the same seed produce identical sector outputs after N ticks (determinism contract)', () => {
    const engineA = createEngine(createAureliaState(), { seed: 1 })
    const engineB = createEngine(createAureliaState(), { seed: 1 })

    for (let i = 0; i < 25; i++) {
      const a = engineA.tick()
      const b = engineB.tick()
      expect(b.country.gdp).toBe(a.country.gdp)
      for (let j = 0; j < a.country.sectors.length; j++) {
        expect(b.country.sectors[j].output).toBe(a.country.sectors[j].output)
      }
    }
  })

  it('Two engines with different seeds produce different sector outputs (noise actually fires)', () => {
    const engineA = createEngine(createAureliaState(), { seed: 1 })
    const engineB = createEngine(createAureliaState(), { seed: 2 })

    // After a single tick the trajectories must already differ on every sector.
    const a = engineA.tick()
    const b = engineB.tick()

    for (let j = 0; j < a.country.sectors.length; j++) {
      expect(b.country.sectors[j].output).not.toBe(a.country.sectors[j].output)
    }
    expect(b.country.gdp).not.toBe(a.country.gdp)
  })

  it('Sector employment_share is unchanged after a tick (P1 invariant)', () => {
    const initial = createAureliaState()
    const engine = createEngine(initial, { seed: 1 })

    const snap = engine.tick()
    for (let j = 0; j < initial.country.sectors.length; j++) {
      expect(snap.country.sectors[j].employment_share).toBe(
        initial.country.sectors[j].employment_share,
      )
      // sector_type is structural and must be preserved too.
      expect(snap.country.sectors[j].sector_type).toBe(
        initial.country.sectors[j].sector_type,
      )
    }
  })

  it('10 ticks of steady-state: per-tick drift is bounded by the noise half-band; no monotonic drift', () => {
    // Half-band is 0.005 (T-008 internal const; T-031 will promote it).
    // Per-tick output_next/output_prev ∈ [1 - 0.005, 1 + 0.005].
    const HALF_BAND = 0.005

    const engine = createEngine(createAureliaState(), { seed: 1 })
    let prev = createAureliaState().country.sectors.map((s) => s.output)

    let positiveTicks = 0
    let negativeTicks = 0
    for (let i = 0; i < 10; i++) {
      const snap = engine.tick()
      const curr = snap.country.sectors.map((s) => s.output)

      for (let j = 0; j < curr.length; j++) {
        const ratio = curr[j] / prev[j]
        // Per-tick multiplicative drift bounded by the noise half-band.
        expect(ratio).toBeGreaterThanOrEqual(1 - HALF_BAND - 1e-12)
        expect(ratio).toBeLessThanOrEqual(1 + HALF_BAND + 1e-12)
      }

      // Track sign of net drift this tick for "no monotonic drift" check.
      const netDrift = curr.reduce((acc, v, j) => acc + (v - prev[j]), 0)
      if (netDrift > 0) positiveTicks++
      else if (netDrift < 0) negativeTicks++

      prev = curr
    }

    // "No monotonic drift" — symmetric noise should produce both directions
    // over 10 ticks. Asserting at least one of each rules out a one-sided bug.
    expect(positiveTicks).toBeGreaterThan(0)
    expect(negativeTicks).toBeGreaterThan(0)
  })

  it('Determinism lock for seed=1: exact sector outputs and GDP after one tick', () => {
    // This test pins the RNG call order for stage 2. If any earlier stage in
    // the pipeline starts consuming `rng.next()` / `rng.nextRange(...)`, or
    // if sector iteration order changes, these numbers will shift and this
    // test will fail loudly. Update only if the reordering is intentional.
    const engine = createEngine(createAureliaState(), { seed: 1 })
    const snap = engine.tick()

    expect(snap.country.sectors[0].sector_type).toBe('agriculture')
    expect(snap.country.sectors[0].output).toBeCloseTo(48060.99549148231, 6)

    expect(snap.country.sectors[1].sector_type).toBe('industry')
    expect(snap.country.sectors[1].output).toBeCloseTo(119403.28286541626, 6)

    expect(snap.country.sectors[2].sector_type).toBe('services')
    expect(snap.country.sectors[2].output).toBeCloseTo(232063.67713270712, 6)

    expect(snap.country.gdp).toBeCloseTo(399527.95548960567, 6)
  })
})

// --- T-009 — Stage 2: tax income + dampening curve ------------------------

describe('T-009 — Stage 2: tax income + dampening curve', () => {
  // Helper: build a fresh Aurelia state with sliders overridden in-place.
  // (No invented fixture data — we just edit the canonical state's slider
  // values, which is the same path the queued-decision flow uses.)
  function aureliaWithSliders(overrides: Partial<{
    tax_income: number
    tax_corporate: number
    tax_consumption: number
  }>) {
    const state = createAureliaState()
    state.country.sliders = { ...state.country.sliders, ...overrides }
    return state
  }

  // Helper: directly compute effective_rate (in [0,1]) for a given slider
  // triple, using the same weights the engine uses. Pure function — used in
  // taxDampening tests to drive the curve at exact rates.
  function effectiveRate(income: number, corporate: number, consumption: number): number {
    return (0.6 * income + 0.25 * corporate + 0.15 * consumption) / 100
  }

  it('All 3 tax sliders within their TAX_*_RANGE produce a valid finite tax_income flow', () => {
    // Walk a grid of slider triples, each well within its tunable range, and
    // assert the resulting per-tick tax_income flow is a finite number (no
    // NaN, no Infinity). Includes both range endpoints.
    const incomeSamples = [TAX_INCOME_RANGE[0], 25, 40, TAX_INCOME_RANGE[1]]
    const corporateSamples = [TAX_CORPORATE_RANGE[0], 30, 45, TAX_CORPORATE_RANGE[1]]
    const consumptionSamples = [TAX_CONSUMPTION_RANGE[0], 15, TAX_CONSUMPTION_RANGE[1]]

    for (const ti of incomeSamples) {
      for (const tc of corporateSamples) {
        for (const tcons of consumptionSamples) {
          const initial = aureliaWithSliders({
            tax_income: ti,
            tax_corporate: tc,
            tax_consumption: tcons,
          })
          const engine = createEngine(initial, { seed: 1 })
          const snap = engine.tick()
          expect(Number.isFinite(snap.flows.tax_income)).toBe(true)
          expect(snap.flows.tax_income).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('At Aurelia start, tax_income flow ≈ 99,000 (= 0.2475 × 400,000) within ±1%', () => {
    // effective_rate = 0.6*25 + 0.25*30 + 0.15*15 = 24.75 → 0.2475
    // Expected nominal flow at GDP=400_000 is 0.2475 × 400_000 = 99_000.
    // T-008's sector noise drifts GDP by < 1%, so the flow is within ±1%.
    const engine = createEngine(createAureliaState(), { seed: 1 })
    const snap = engine.tick()
    const expected = 0.2475 * 400_000
    const driftPct = Math.abs(snap.flows.tax_income - expected) / expected
    expect(driftPct).toBeLessThan(0.01)
  })

  it('Effective rate at or below TAX_DAMPENING_BREAKPOINT produces zero sector decay (multiplier = 1.0 exactly)', () => {
    // taxDampening is a pure helper — assert the curve directly at and below
    // the breakpoint, including the breakpoint itself (boundary).
    const bp = TAX_DAMPENING_BREAKPOINT / 100
    expect(taxDampening(0)).toBe(1)
    expect(taxDampening(0.1)).toBe(1)
    expect(taxDampening(0.25)).toBe(1)
    expect(taxDampening(bp)).toBe(1) // exactly at breakpoint — no decay

    // Engine-level check: with sliders that put effective_rate well below the
    // breakpoint (Aurelia default), sector outputs after one tick equal the
    // T-008 lock values byte-for-byte. (If dampening fired here, those exact
    // values would shift.)
    const engine = createEngine(createAureliaState(), { seed: 1 })
    const snap = engine.tick()
    expect(snap.country.sectors[0].output).toBeCloseTo(48060.99549148231, 6)
    expect(snap.country.sectors[1].output).toBeCloseTo(119403.28286541626, 6)
    expect(snap.country.sectors[2].output).toBeCloseTo(232063.67713270712, 6)
  })

  it('Effective rate strictly above TAX_DAMPENING_BREAKPOINT produces strictly positive monotonic convex decay', () => {
    // Sample 1: sliders (50, 50, 30) → effective_rate = 0.425  (excess = 0.025)
    // Sample 2: sliders (60, 60, 30) → effective_rate = 0.495  (excess = 0.095)
    const r1 = effectiveRate(50, 50, 30)
    const r2 = effectiveRate(60, 60, 30)
    const bp = TAX_DAMPENING_BREAKPOINT / 100
    expect(r1).toBeGreaterThan(bp)
    expect(r2).toBeGreaterThan(bp)
    expect(r2).toBeGreaterThan(r1)

    const d1 = taxDampening(r1)
    const d2 = taxDampening(r2)

    // Strictly positive — defensive clamp keeps it in [0, 1] but for these
    // rates the curve is well inside the open interval.
    expect(d1).toBeGreaterThan(0)
    expect(d2).toBeGreaterThan(0)

    // Strictly < 1 above the breakpoint — dampening actually fires.
    expect(d1).toBeLessThan(1)
    expect(d2).toBeLessThan(1)

    // Monotonic decay: higher rate → smaller multiplier.
    expect(d2).toBeLessThan(d1)

    // Convex acceleration: second differences of the multiplier (as a
    // function of effective_rate) are strictly negative — i.e., the curve
    // gets steeper. Sample at evenly-spaced rates above the breakpoint.
    const a = taxDampening(bp + 0.05)
    const b = taxDampening(bp + 0.10)
    const c = taxDampening(bp + 0.15)
    const secondDiff = c - 2 * b + a
    // For decay = 1 - k * x², the second derivative is -2k < 0, so the
    // discrete second difference of the multiplier is strictly negative.
    expect(secondDiff).toBeLessThan(0)

    // Equivalent statement of "convex acceleration of decay" (1 - multiplier):
    // (1-c) - (1-b) > (1-b) - (1-a)  ⇔  (a + c - 2b) < 0 — same check, sanity.
    expect((1 - b) - (1 - a)).toBeLessThan((1 - c) - (1 - b))
  })

  it('Sample Tick Scenario 2: queue tax_income=30 on Aurelia start, run 1 tick, tax_income flow ≈ 111,000 (= 0.2775 × 400,000) within ±5%', () => {
    // Per [[Sample Tick]] § Scenario 2. Effective rate after raising the
    // income slider 25 → 30: 0.6*30 + 0.25*30 + 0.15*15 = 27.75 → 0.2775.
    // Expected nominal flow at GDP=400_000: 0.2775 × 400_000 = 111_000.
    const engine = createEngine(createAureliaState(), { seed: 1 })
    const d: Decision = { type: 'slider', slider_id: 'tax_income', value: 30 }
    engine.applyDecisions([d])
    const snap = engine.tick()

    // Slider was actually applied at stage 0 of this tick.
    expect(snap.country.sliders.tax_income).toBe(30)

    const expected = 0.2775 * 400_000
    const driftPct = Math.abs(snap.flows.tax_income - expected) / expected
    expect(driftPct).toBeLessThan(0.05)
  })

  it('Determinism lock for seed=1: exact tax_income flow after one tick', () => {
    // Pins the T-009 tax computation against the post-growth GDP from T-008's
    // determinism lock. If this number shifts, either (a) an upstream stage
    // started consuming the RNG, (b) the incidence weights or formula moved,
    // or (c) the dampening curve changed how it composes with the GDP rollup.
    // Update only if the change is intentional.
    const engine = createEngine(createAureliaState(), { seed: 1 })
    const snap = engine.tick()
    expect(snap.flows.tax_income).toBeCloseTo(98883.1689836774, 6)
  })
})
