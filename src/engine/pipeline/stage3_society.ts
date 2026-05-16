// Stage 3 — Country society.
//
// T-011 owns the per-POP income and employment_rate update. T-012 layers
// happiness + radicalization on top of the income flow this stage publishes.
//
// Determinism contract:
//   - This stage consumes the PRNG **zero** times. Income and happiness are
//     pure functions of the post-stage-2 sector outputs, the post-stage-0 tax
//     sliders, the post-stage-0 budget shares, and per-POP `priorities`.
//     Adding rng draws here would shift downstream determinism locks (the
//     T-012 lock test depends on this contract).
//
// Same-tick read contract (invariant #4):
//   - Reads `state.country.sectors[*].output` and `state.country.sliders.*`
//     after stage 2 has written them this tick.
//   - Reads `state.country.budget_shares.*` (last tick — sliders/budget come
//     from stage 0 which has already drained the queue).
//   - Reads `pop.size` (last tick — POP demographics are not mutated in P1).
//   - Reads `pop.employment_rate` and re-writes it unchanged (P1 identity;
//     Phase 4+ adds reallocation).
//   - The happiness pass reads `pop.income` and `pop.income_clamped` AFTER
//     the income pass has just written them on the same `updated` POP.
//   - Smoothing reads `pop.happiness` from the *previous tick* (stage 0/2
//     don't touch happiness; the value on the POP at start-of-stage is the
//     last-tick value).
//
// Income formula (P1) — see T-011 docs above the priority resolvers below
// for the full formula. The rest of this header documents T-012's happiness.
//
// Happiness formula (P1, T-012):
//   For each POP, after the income pass has set pop.income / income_clamped:
//
//     resolved = pop.priorities
//       .map(name => resolvePriority(name, pop, country))
//       .filter(x => x !== undefined)                     // drop unknowns
//
//     outcome_avg = resolved.length > 0
//       ? sum(resolved) / resolved.length                  // uniform 1/N weights
//       : 0.5                                              // neutral fallback
//
//     baseline        = POP_HAPPINESS_BASELINE_P1[pop.pop_type]
//     raw_unpenalized = baseline + (outcome_avg - 0.5) × POP_HAPPINESS_DYNAMIC_RANGE_P1
//
//     raw = pop.income_clamped
//       ? raw_unpenalized - INCOME_CLAMPED_HAPPINESS_PENALTY_P1
//       : raw_unpenalized
//
//     raw_clamped     = clamp(raw, HAPPINESS_RANGE.min, HAPPINESS_RANGE.max)
//     happiness_next  = pop.happiness + (raw_clamped - pop.happiness) / HAPPINESS_INERTIA_TAU
//     pop.happiness   = clamp(happiness_next, HAPPINESS_RANGE.min, HAPPINESS_RANGE.max)
//
//     // Radicalization passive decay (POP Types § rule 3).
//     if (pop.happiness > 50)
//       pop.radicalization = max(0, pop.radicalization - RADICALIZATION_PASSIVE_DECAY)
//     // else: radicalization is inert in P1 (P4+ adds crisis-driven rises).
//
// `POP_INCOME_COEFF_P1` is back-solved from the Aurelia fixture so that at the
// pre-noise starting state every POP's computed income matches its declared
// `income` exactly. This satisfies T-011 AC #1 by construction up to stage-2
// sector noise.
//
// T-018 — active decrees (happiness_bump_*):
//   After the T-011 income + T-012 happiness/smoothing pass has run, walk
//   `state.active_decrees` and apply each happiness-bump effect as a
//   POST-SMOOTHING direct write (`pop.happiness += delta`, then clamp). The
//   bump bypasses T-012's inertia for immediate feel; the effect persists for
//   N ticks while `ticks_remaining > 0`, then fades naturally because T-012
//   continues to pull happiness back towards the priority-driven raw.
//   `output_boost` effects are ignored here (consumed by stage 2).
//
//   Stage 3 is the LAST stage that reads `active_decrees`, so it also
//   DECREMENTS `ticks_remaining` for every active decree (whether or not its
//   effect applied this stage) and PRUNES entries whose counter has hit 0.
//   Decrementing in only one place avoids double-decrement.
//
//   When `active_decrees` is empty (the steady-state path) all of this is a
//   no-op so the T-011 / T-012 / T-013 / T-014 / T-016 determinism locks stay
//   byte-stable.

import type { EngineState } from '../types'
import type { Country } from '../entities/Country'
import type { POP, PopType } from '../entities/POP'
import type { SectorType } from '../entities/Sector'
import type { EngineContext } from './context'
import {
  HAPPINESS_INERTIA_TAU,
  HAPPINESS_RANGE,
  RADICALIZATION_PASSIVE_DECAY,
  TAX_CONSUMPTION_RANGE,
  TAX_CORPORATE_RANGE,
  TAX_INCOME_RANGE,
} from '../tunables'

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

// TODO(T-031): promote to Tunables.
// Per-POP happiness baselines. Same numeric values as the Aurelia fixture's
// declared `happiness` per POP — by design, so AC #1 ("on Aurelia start, all
// 5 POP happinesses are within ±2 of declared values after 1 tick") is
// satisfied to within the smoothing-towards-priority-driven-raw drift.
// T-031 may decouple baseline from fixture once the curve is balanced.
const POP_HAPPINESS_BASELINE_P1: Record<PopType, number> = {
  urban_workers: 55,
  rural_workers: 50,
  middle_class: 60,
  capitalists: 70,
  intelligentsia: 58,
}

// TODO(T-031): promote to Tunables.
// Width of the priority-driven swing around baseline. With outcome_avg ∈ [0,1],
// raw ∈ [baseline - 25, baseline + 25] before any income-clamp penalty.
const POP_HAPPINESS_DYNAMIC_RANGE_P1 = 50

// TODO(T-031): promote to Tunables.
// Subtracted from raw_happiness when pop.income_clamped is true. Severe per
// the POP Types edge case ("flag as severe in happiness driver") — applied
// BEFORE the [HAPPINESS_RANGE] clamp so the smoothing target reflects it.
const INCOME_CLAMPED_HAPPINESS_PENALTY_P1 = 20

// TODO(T-031): promote to Tunables (or to Sector entity if vault adds an
// `output_baseline` field). P1 substitute for the missing
// Sector.output_baseline; equals Aurelia's starting agriculture.output. Used
// only by the `agriculture_support` priority resolver.
const AGRICULTURE_OUTPUT_BASELINE_P1 = 48_000

// TODO(T-031): promote to Tunables (per-priority resolvers, with real models).
// Neutral midpoint for priorities not yet modeled in P1: food_prices, services,
// business_friendly, stability, civil_liberties, environment.
const STUB_PRIORITY_OUTCOME_P1 = 0.5

/**
 * Resolve a single named priority to an outcome in [0, 1], or `undefined` if
 * the name is unknown (per the POP Types edge case: unknown priorities are
 * dropped from the weighted average rather than collapsing to 0). Each branch
 * clamps defensively to [0, 1] — sliders shouldn't exceed their `.max`, but a
 * direct override path could land out of range and we don't want a single
 * malformed value to swing happiness past its dynamic range.
 *
 * Resolver table (P1):
 *   jobs                 → pop.employment_rate           (already in [0,1])
 *   healthcare           → country.budget_shares.health  (raw share, [0,1])
 *   education            → country.budget_shares.education
 *   security             → country.budget_shares.security
 *   agriculture_support  → min(1, agri.output / AGRICULTURE_OUTPUT_BASELINE_P1)
 *   low_income_tax       → 1 - sliders.tax_income      / TAX_INCOME_RANGE.max
 *   low_corporate_tax    → 1 - sliders.tax_corporate   / TAX_CORPORATE_RANGE.max
 *   low_consumption_tax  → 1 - sliders.tax_consumption / TAX_CONSUMPTION_RANGE.max
 *   food_prices, services, business_friendly,
 *   stability, civil_liberties, environment
 *                        → STUB_PRIORITY_OUTCOME_P1 (= 0.5, P1 stub)
 *   (anything else)      → undefined
 */
function resolvePriority(
  name: string,
  pop: POP,
  country: Country,
  sectorOutputByType: Map<SectorType, number>,
): number | undefined {
  switch (name) {
    case 'jobs':
      return clamp01(pop.employment_rate)
    case 'healthcare':
      return clamp01(country.budget_shares.health)
    case 'education':
      return clamp01(country.budget_shares.education)
    case 'security':
      return clamp01(country.budget_shares.security)
    case 'agriculture_support': {
      const agriOutput = sectorOutputByType.get('agriculture') ?? 0
      const ratio = agriOutput / AGRICULTURE_OUTPUT_BASELINE_P1
      return clamp01(ratio)
    }
    case 'low_income_tax':
      return clamp01(1 - country.sliders.tax_income / TAX_INCOME_RANGE[1])
    case 'low_corporate_tax':
      return clamp01(1 - country.sliders.tax_corporate / TAX_CORPORATE_RANGE[1])
    case 'low_consumption_tax':
      return clamp01(1 - country.sliders.tax_consumption / TAX_CONSUMPTION_RANGE[1])
    case 'food_prices':
    case 'services':
    case 'business_friendly':
    case 'stability':
    case 'civil_liberties':
    case 'environment':
      return STUB_PRIORITY_OUTCOME_P1
    default:
      return undefined
  }
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function clampHappiness(x: number): number {
  const [min, max] = HAPPINESS_RANGE
  if (x < min) return min
  if (x > max) return max
  return x
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

  // Single pass per POP: compute income (T-011) → then happiness (T-012) on
  // the just-updated POP so the income-clamp signal is consumed in the same
  // step without a second iteration over the array.
  const updatedPops: POP[] = country.pops.map((pop) => {
    // --- T-011: income + employment_rate identity -----------------------
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

    // --- T-012: happiness from priorities + radicalization decay --------
    // Resolve each priority to an outcome in [0, 1]. Unknown names are
    // dropped (per POP Types edge case). Uniform 1/N weighting across the
    // resolved subset; if every priority is unknown, fall back to 0.5
    // (neutral) so happiness drifts towards baseline rather than collapsing.
    const resolved: number[] = []
    for (const name of pop.priorities) {
      const outcome = resolvePriority(name, pop, country, sectorOutputByType)
      if (outcome !== undefined) resolved.push(outcome)
    }
    const outcomeAvg =
      resolved.length > 0
        ? resolved.reduce((sum, o) => sum + o, 0) / resolved.length
        : 0.5

    const baseline = POP_HAPPINESS_BASELINE_P1[pop.pop_type]
    const rawUnpenalized =
      baseline + (outcomeAvg - 0.5) * POP_HAPPINESS_DYNAMIC_RANGE_P1

    // The income-clamp penalty applies to any POP whose post-tax income
    // underflowed this tick — a punitive-tax signal that shouldn't be
    // silently masked by the income clamp to 0.
    const raw = clamped ? rawUnpenalized - INCOME_CLAMPED_HAPPINESS_PENALTY_P1 : rawUnpenalized

    // Clamp BEFORE smoothing so the smoothing target is bounded — otherwise
    // a single extreme tick could drag the smoothed value past the range.
    const rawClamped = clampHappiness(raw)
    const happinessNext = pop.happiness + (rawClamped - pop.happiness) / HAPPINESS_INERTIA_TAU
    // Final clamp for FP-epsilon insurance: smoothing of a clamped raw and a
    // clamped previous should also be in range, but be defensive.
    const happiness = clampHappiness(happinessNext)

    // Radicalization passive decay: only fires when the POP is content this
    // tick (post-smoothing happiness > 50). Crisis-driven rises are P4+.
    const radicalization =
      happiness > 50
        ? Math.max(0, pop.radicalization - RADICALIZATION_PASSIVE_DECAY)
        : pop.radicalization

    return {
      ...pop,
      income,
      income_clamped: clamped,
      // P1: identity. Phase 4+ adds workforce reallocation across sectors.
      employment_rate: pop.employment_rate,
      happiness,
      radicalization,
    }
  })

  // --- T-018: apply happiness-bump decrees, then decrement + prune ------
  // Pure pass-through (identical references) when active_decrees is empty,
  // so the T-011/T-012 determinism locks stay byte-stable on the steady-state
  // Aurelia path. Consumes zero PRNG draws.
  let postDecreesPops = updatedPops
  for (const decree of state.active_decrees) {
    if (decree.ticks_remaining <= 0) continue
    if (decree.effect.type === 'happiness_bump_all') {
      const { delta } = decree.effect
      postDecreesPops = postDecreesPops.map((p) => ({
        ...p,
        happiness: clampHappiness(p.happiness + delta),
      }))
    } else if (decree.effect.type === 'happiness_bump_target') {
      const { target_pop, delta } = decree.effect
      postDecreesPops = postDecreesPops.map((p) =>
        p.pop_type === target_pop
          ? { ...p, happiness: clampHappiness(p.happiness + delta) }
          : p,
      )
    }
    // output_boost: consumed by stage 2; ignored here.
  }

  // Stage 3 owns the decrement-and-prune: counters tick down once per game
  // tick, and entries that hit 0 (or below — defensively) are removed.
  const nextActiveDecrees = state.active_decrees
    .map((d) => ({ ...d, ticks_remaining: d.ticks_remaining - 1 }))
    .filter((d) => d.ticks_remaining > 0)

  return {
    ...state,
    country: {
      ...country,
      pops: postDecreesPops,
    },
    active_decrees: nextActiveDecrees,
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
