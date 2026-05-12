// Stage 2 — Country economy.
//
// Recomputes sector outputs → GDP → tax_income → budget_spend → balance →
// treasury. T-008 owns the sector-growth + GDP-rollup half of this stage.
// Tax income, budget, and treasury flows land in T-009 / T-010.
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
//
// Per-sector growth model (P1):
//   output_next = output_prev * (base_growth + noise)
//   base_growth = 1.0
//   noise ∈ [-SECTOR_GROWTH_NOISE_HALF_BAND, +SECTOR_GROWTH_NOISE_HALF_BAND]
//
// `sector.employment_share` is constant in P1.
// `sector.pollution_coefficient` is tracked but never consumed (Phase 4+).
// `INDUSTRY_POLLUTION_COEFFICIENT` from tunables mirrors the industry sector's
// pollution_coefficient in Aurelia (0.1) — see ../tunables.ts.

import type { EngineState } from '../types'
import type { Sector } from '../entities/Sector'
import type { EngineContext } from './context'

// TODO T-031: promote to tunables.ts after balancing pass.
const SECTOR_GROWTH_NOISE_HALF_BAND = 0.005
const SECTOR_BASE_GROWTH = 1.0

export function stage2_economy(state: EngineState, ctx: EngineContext): EngineState {
  const { country } = state

  // Iterate in array order — this is the determinism contract. See file header.
  const nextSectors: Sector[] = country.sectors.map((sector) => {
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

  const rawGdp = nextSectors.reduce((sum, s) => sum + s.output, 0)
  const gdp = rawGdp < 0 ? 0 : rawGdp
  if (rawGdp < 0) {
    console.warn(`stage2_economy: country.gdp clamped to 0 (raw=${rawGdp}).`)
  }

  return {
    ...state,
    country: {
      ...country,
      sectors: nextSectors,
      gdp,
    },
  }
}
