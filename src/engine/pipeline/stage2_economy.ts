// Stage 2 — Country economy.
//
// Recomputes sector outputs → GDP → tax_income → budget_spend → balance →
// treasury. T-008 owns the sector-growth + GDP-rollup half of this stage.
// T-009 layers tax income + a convex tax-dampening curve on top of T-008's
// outputs. Budget and treasury flows land in T-010.
//
// Determinism contract:
//   - We iterate `country.sectors` in array order (the order Aurelia defines:
//     agriculture, industry, services). This ordering is the determinism
//     contract — `ctx.rng.nextRange(...)` is called once per sector in this
//     exact order. Reordering the sectors array, or inserting an `rng` call
//     earlier in the pipeline, will change every downstream value and the
//     determinism acceptance test in simple_economy.spec.ts will catch it.
//   - The noise band is symmetric around 0 (half-band on each side), so on
//     average outputs drift by ~0 per tick. Individual ticks drift by less
//     than the half-band.
//   - T-009 tax computation consumes the PRNG **zero** times: it is a pure
//     function of the post-growth sectors and the sliders. Adding rng calls
//     here would shift T-008's determinism lock.
//
// Per-sector growth model (P1):
//   output_next = output_prev * (base_growth + noise)
//   base_growth = 1.0
//   noise ∈ [-SECTOR_GROWTH_NOISE_HALF_BAND, +SECTOR_GROWTH_NOISE_HALF_BAND]
//
// Tax model (P1, T-009):
//   effective_rate_pct = w_income      * sliders.tax_income
//                      + w_corporate   * sliders.tax_corporate
//                      + w_consumption * sliders.tax_consumption
//   effective_rate     = effective_rate_pct / 100         // ∈ [0, 1]
//   tax_income_flow    = country.gdp * effective_rate     // credits / tick
//   sector.output    ×= taxDampening(effective_rate)      // forward-looking
//
// The dampening is applied **after** GDP rollup and tax_income computation,
// then GDP is re-rolled-up so the GDP-equals-sum-of-sectors invariant
// (T-008 AC #2) holds at the end of the stage. The dampening therefore
// reduces *next tick's* base — exactly the AC wording — without retroactively
// taxing the current tick's earnings on a dampened base.
//
// `sector.employment_share` is constant in P1.
// `sector.pollution_coefficient` is tracked but never consumed (Phase 4+).
// `INDUSTRY_POLLUTION_COEFFICIENT` from tunables mirrors the industry sector's
// pollution_coefficient in Aurelia (0.1) — see ../tunables.ts.

import type { EngineState } from '../types'
import type { Sector } from '../entities/Sector'
import type { EngineContext } from './context'
import { TAX_DAMPENING_BREAKPOINT } from '../tunables'

// TODO T-031: promote to tunables.ts after balancing pass.
const SECTOR_GROWTH_NOISE_HALF_BAND = 0.005
const SECTOR_BASE_GROWTH = 1.0

// T-031: promote to Tunables when balanced.
// Phase 1 incidence weights for the 3 tax sliders, used to fold them into a
// single GDP-incidence-weighted effective rate. The choice (income > corporate
// > consumption) is a placeholder calibrated to make Aurelia's effective rate
// land near the documented ~25% in the Sample Tick. Sum is 1.0 by design.
const TAX_INCIDENCE_WEIGHTS_P1 = {
  income: 0.6,
  corporate: 0.25,
  consumption: 0.15,
} as const

// T-031: tune this; promote to Tunables.
// Convex quadratic decay coefficient for the dampening curve above the
// breakpoint. Verified strictly positive and monotonic for rates ≤ 0.60:
//   excess = 0.20  → decay = 1 - 0.5 * 0.04 = 0.98
//   excess = 0.10  → decay = 1 - 0.5 * 0.01 = 0.995
// Defensive clamp to [0, 1] in `taxDampening` handles any future widening.
const TAX_DAMPENING_K_P1 = 0.5

/**
 * Convex monotonic decay applied to sector outputs when the effective tax
 * rate exceeds `TAX_DAMPENING_BREAKPOINT`. Returns a multiplier in (0, 1].
 *
 *   if effective_rate ≤ breakpoint: 1
 *   else: 1 - k * (effective_rate - breakpoint)^2, clamped to [0, 1]
 *
 * Pure function — no state, no rng. Exported for direct unit tests.
 */
export function taxDampening(effective_rate: number): number {
  const breakpoint = TAX_DAMPENING_BREAKPOINT / 100
  if (effective_rate <= breakpoint) return 1
  const excess = effective_rate - breakpoint
  const raw = 1 - TAX_DAMPENING_K_P1 * excess * excess
  if (raw < 0) return 0
  if (raw > 1) return 1
  return raw
}

export function stage2_economy(state: EngineState, ctx: EngineContext): EngineState {
  const { country } = state

  // --- T-008: sector growth + GDP rollup --------------------------------
  // Iterate in array order — this is the determinism contract. See file header.
  const grownSectors: Sector[] = country.sectors.map((sector) => {
    const noise = ctx.rng.nextRange(
      -SECTOR_GROWTH_NOISE_HALF_BAND,
      +SECTOR_GROWTH_NOISE_HALF_BAND,
    )
    const raw = sector.output * (SECTOR_BASE_GROWTH + noise)
    const clamped = raw < 0 ? 0 : raw
    if (raw < 0) {
      console.warn(
        `stage2_economy: sector ${sector.sector_type} output clamped to 0 (raw=${raw}).`,
      )
    }
    return {
      ...sector,
      output: clamped,
    }
  })

  const rawGdpPreTax = grownSectors.reduce((sum, s) => sum + s.output, 0)
  const gdpPreTax = rawGdpPreTax < 0 ? 0 : rawGdpPreTax
  if (rawGdpPreTax < 0) {
    console.warn(`stage2_economy: country.gdp clamped to 0 (raw=${rawGdpPreTax}).`)
  }

  // --- T-009: tax income + dampening curve ------------------------------
  // Note on naming: `country.sliders.tax_income` is a *percent slider*
  // (player-controlled, in [0, 60]); the per-tick *flow* in credits lives on
  // `state.flows.tax_income`. No field collision on Country itself.
  const sliders = country.sliders
  const effective_rate_pct =
    TAX_INCIDENCE_WEIGHTS_P1.income * sliders.tax_income +
    TAX_INCIDENCE_WEIGHTS_P1.corporate * sliders.tax_corporate +
    TAX_INCIDENCE_WEIGHTS_P1.consumption * sliders.tax_consumption
  const effective_rate = effective_rate_pct / 100
  const tax_income_flow = gdpPreTax * effective_rate

  // Apply dampening multiplier to each sector for *next* tick's growth.
  // At/below the breakpoint the multiplier is exactly 1.0 → no mutation,
  // and the T-008 determinism lock continues to hold byte-for-byte.
  const dampening = taxDampening(effective_rate)
  const dampenedSectors: Sector[] =
    dampening === 1
      ? grownSectors
      : grownSectors.map((sector) => ({ ...sector, output: sector.output * dampening }))

  // Re-roll GDP so the `country.gdp = Σ sector.output` invariant holds at
  // the end of the stage even after dampening.
  const rawGdp = dampenedSectors.reduce((sum, s) => sum + s.output, 0)
  const gdp = rawGdp < 0 ? 0 : rawGdp
  if (rawGdp < 0) {
    console.warn(`stage2_economy: country.gdp clamped to 0 (raw=${rawGdp}).`)
  }

  return {
    ...state,
    country: {
      ...country,
      sectors: dampenedSectors,
      gdp,
    },
    flows: {
      ...state.flows,
      tax_income: tax_income_flow,
    },
  }
}
