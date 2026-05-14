// Stage 3 — Country society.
//
// T-011 owns the per-POP income and employment_rate update. T-012 will layer
// happiness on top of the income flow this stage publishes.
//
// Determinism contract:
//   - This stage consumes the PRNG **zero** times. Income is a pure function
//     of the post-stage-2 sector outputs and the post-stage-0 tax sliders.
//     Adding rng draws here would shift downstream determinism locks (none
//     yet at stage 3+, but this contract must hold for T-012 / T-013).
//
// Same-tick read contract (invariant #4):
//   - Reads `state.country.sectors[*].output` and `state.country.sliders.*`
//     after stage 2 has written them this tick.
//   - Reads `pop.size` (last tick — POP demographics are not mutated in P1).
//   - Reads `pop.employment_rate` and re-writes it unchanged (P1 identity;
//     Phase 4+ adds reallocation).
//
// Income formula (P1):
//   For each POP:
//     mapping = POP_PRIMARY_SECTOR_P1[pop.pop_type]
//     effective_sector_output =
//       Array.isArray(mapping)
//         ? mean(sectors_by_type[m].output for m in mapping)
//         : sectors_by_type[mapping].output
//
//     income_pre_tax = effective_sector_output × POP_INCOME_COEFF_P1[type] / pop.size
//
//     applicable_tax_rate = (type === 'capitalists')
//       ? (sliders.tax_corporate + sliders.tax_consumption) / 100
//       : (sliders.tax_income    + sliders.tax_consumption) / 100
//
//     income_post_tax = income_pre_tax × (1 - applicable_tax_rate)
//     pop.income_clamped = income_post_tax < 0
//     pop.income         = max(0, income_post_tax)
//     pop.employment_rate = pop.employment_rate    // identity in P1
//
// `POP_INCOME_COEFF_P1` is back-solved from the Aurelia fixture so that at the
// pre-noise starting state every POP's computed income matches its declared
// `income` exactly. This satisfies AC #1 ("each POP's income within ±2% of
// its starting value after 1 tick at steady state") by construction up to
// stage-2 sector noise (half-band 0.5%).

import type { EngineState } from '../types'
import type { POP, PopType } from '../entities/POP'
import type { SectorType } from '../entities/Sector'
import type { EngineContext } from './context'

// TODO(T-031): promote to Tunables.
// `wage_share` is not yet defined in the vault (per resolved open question 1
// in the T-011 brief). These per-POP coefficients combine wage share and
// per-capita scale into a single back-solved factor. Solved from Aurelia so
// `effective_sector_output × coeff / size × tax_multiplier === starting income`
// exactly at the pre-noise start. Replace with a real `wage_share` model + a
// per-capita normalizer when balancing.
const POP_INCOME_COEFF_P1: Record<PopType, number> = {
  // 11_000 × 12_000_000 / (120_000 × 0.60) = 1_833_333.333…
  urban_workers: 1_833_333.3333333333,
  // 7_000 × 6_000_000 / (48_000 × 0.60) = 1_458_333.333…
  rural_workers: 1_458_333.3333333333,
  // 25_000 × 8_000_000 / (232_000 × 0.60) = 1_436_781.609195402…
  middle_class: 1_436_781.6091954024,
  // 200_000 × 600_000 / (176_000 × 0.55) = 1_239_669.421487603…
  capitalists: 1_239_669.421487603,
  // 30_000 × 3_400_000 / (232_000 × 0.60) = 732_758.620689655…
  intelligentsia: 732_758.6206896552,
}

// TODO(T-031): promote to Tunables.
// Maps each POP type to the sector(s) whose output drives its income. Per
// resolved open question 3 in the T-011 brief, `capitalists` is a 50/50
// composite of `industry` and `services` — we average the two outputs. All
// other POPs map to a single sector.
const POP_PRIMARY_SECTOR_P1: Record<PopType, SectorType | readonly SectorType[]> = {
  urban_workers: 'industry',
  rural_workers: 'agriculture',
  middle_class: 'services',
  capitalists: ['industry', 'services'],
  intelligentsia: 'services',
}

export function stage3_society(state: EngineState, _ctx: EngineContext): EngineState {
  const { country } = state

  // Build a fast lookup from sector_type to its post-stage-2 output. Stage 2
  // has already run this tick, so these are the "current tick" sector outputs
  // (same-tick read, allowed by invariant #4).
  const sectorOutputByType = new Map<SectorType, number>()
  for (const sector of country.sectors) {
    sectorOutputByType.set(sector.sector_type, sector.output)
  }

  const sliders = country.sliders

  const updatedPops: POP[] = country.pops.map((pop) => {
    const mapping = POP_PRIMARY_SECTOR_P1[pop.pop_type]
    const effectiveSectorOutput = computeEffectiveSectorOutput(mapping, sectorOutputByType)

    const coeff = POP_INCOME_COEFF_P1[pop.pop_type]
    // Defensive: `pop.size > 0` is a fixture invariant in P1 (no demographic
    // dynamics yet). Guard anyway so a malformed fixture doesn't divide by 0.
    const incomePreTax =
      pop.size > 0 ? (effectiveSectorOutput * coeff) / pop.size : 0

    const applicableTaxRate =
      pop.pop_type === 'capitalists'
        ? (sliders.tax_corporate + sliders.tax_consumption) / 100
        : (sliders.tax_income + sliders.tax_consumption) / 100

    const incomePostTax = incomePreTax * (1 - applicableTaxRate)
    const clamped = incomePostTax < 0
    const income = clamped ? 0 : incomePostTax

    return {
      ...pop,
      income,
      income_clamped: clamped,
      // P1: identity. Phase 4+ adds workforce reallocation across sectors.
      employment_rate: pop.employment_rate,
    }
  })

  return {
    ...state,
    country: {
      ...country,
      pops: updatedPops,
    },
  }
}

/**
 * Resolve the effective sector output that drives a POP's income, given its
 * sector mapping. Returns the single sector's output, or — for composite
 * mappings (e.g. capitalists = industry + services) — the arithmetic mean of
 * the listed sectors' outputs. Missing sector_types resolve to 0 (defensive;
 * shouldn't happen with the Aurelia fixture).
 */
function computeEffectiveSectorOutput(
  mapping: SectorType | readonly SectorType[],
  outputByType: Map<SectorType, number>,
): number {
  if (Array.isArray(mapping)) {
    if (mapping.length === 0) return 0
    let sum = 0
    for (const m of mapping) {
      sum += outputByType.get(m) ?? 0
    }
    return sum / mapping.length
  }
  return outputByType.get(mapping as SectorType) ?? 0
}
