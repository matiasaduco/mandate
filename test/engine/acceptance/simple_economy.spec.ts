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
