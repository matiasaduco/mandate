// Stage 2 — Country economy.
//
// Recomputes sector outputs → GDP → tax_income → budget_spend → balance →
// treasury. T-008 owns the sector-growth + GDP-rollup half of this stage.
// T-009 layers tax income + a convex tax-dampening curve on top of T-008's
// outputs. T-010 lands the budget-spend + treasury-balance block, closing
// stage 2's economic loop.
//
// Locked internal order (final P1 shape):
//   1. sector growth (T-008)
//   2. pre-dampening GDP rollup
//   3. tax_income flow (T-009)
//   4. dampening of next-tick sectors (T-009)
//   5. re-rolled GDP (post-dampening, preserves the GDP = Σ sector.output
//      invariant at end of stage)
//   6. read budget shares + target_budget (T-010)
//   7. normalize shares
//   8. budget_spend (Σ normalized_share × target_budget)
//   9. balance = tax_income − budget_spend
//   10. treasury_next = country.treasury + balance  (NOT clamped — bankruptcy
//       handling is T-016, treasury threshold events are T-015)
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
//   - T-010 budget + balance + treasury computation also consumes the PRNG
//     **zero** times: pure arithmetic over `country.budget_shares`,
//     `country.target_budget`, and `flows.tax_income`.
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
// Budget model (P1, T-010):
//   shares are read from `country.budget_shares` in the order of
//   BUDGET_CATEGORIES_P1. If |Σshare − 1| > SHARE_NORMALIZE_TOLERANCE, each
//   share is divided by the sum (with a console.warn). Σshare ≤ 0 is treated
//   as zero spend (with a console.warn). `country.target_budget` is read
//   AS-IS — stage 2 does not write it. Per-category amounts are transient
//   locals (T-023 derives them on demand for UI display).
//
// `sector.employment_share` is constant in P1.
// `sector.pollution_coefficient` is tracked but never consumed (Phase 4+).
// `INDUSTRY_POLLUTION_COEFFICIENT` from tunables mirrors the industry sector's
// pollution_coefficient in Aurelia (0.1) — see ../tunables.ts.

import type { EngineState } from '../types'
import type { Sector } from '../entities/Sector'
import type { BudgetShares } from '../entities/Country'
import type { EngineContext } from './context'
import { BUDGET_CATEGORIES_P1, TAX_DAMPENING_BREAKPOINT } from '../tunables'

// Implementation detail (not a Tunable): floats from slider arithmetic can
// land a few ulps off 1.0; this tolerance avoids spurious normalization
// warnings on legitimately well-formed share sets.
const SHARE_NORMALIZE_TOLERANCE = 0.001

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

  // --- T-010: budget spend + balance + treasury -------------------------
  // Pure arithmetic — no rng draws. The per-category amounts are local-only:
  // we persist only the *total* `budget_spend` to `flows`. Downstream UI
  // (T-023) derives per-category amounts from `budget_shares × budget_spend`.
  const budget_spend = computeBudgetSpend(country.budget_shares, country.target_budget)

  // Balance = incoming tax revenue this tick − outgoing budget spend this tick.
  const balance = tax_income_flow - budget_spend

  // Treasury is NOT clamped — it can go negative. Bankruptcy clock + GameOver
  // are T-016; TreasuryThresholdCrossed events are T-015. Stage 2 just adds
  // the balance to the running stock.
  const treasury_next = country.treasury + balance

  return {
    ...state,
    country: {
      ...country,
      sectors: dampenedSectors,
      gdp,
      treasury: treasury_next,
    },
    flows: {
      ...state.flows,
      tax_income: tax_income_flow,
      budget_spend,
      balance,
    },
  }
}

/**
 * Compute the total per-tick budget spend from a `BudgetShares` and a
 * `target_budget`. Reads shares in the order of `BUDGET_CATEGORIES_P1`.
 *
 *  - If Σshare ≤ 0 (degenerate), warns and returns 0.
 *  - If |Σshare − 1| > SHARE_NORMALIZE_TOLERANCE, warns and divides each
 *    share by the sum before applying.
 *  - Otherwise, returns Σ share_i × target_budget directly.
 *
 * Pure function — no state, no rng.
 */
function computeBudgetSpend(shares: BudgetShares, target_budget: number): number {
  // Read in the locked order. Iterating BUDGET_CATEGORIES_P1 keeps the
  // canonical order single-sourced from tunables.
  const orderedShares = BUDGET_CATEGORIES_P1.map((cat) => shares[cat])
  const sum = orderedShares.reduce((acc, s) => acc + s, 0)

  if (sum <= 0) {
    console.warn(
      `stage2_economy: budget_shares sum to ${sum} (≤ 0); setting budget_spend = 0.`,
    )
    return 0
  }

  const needsNormalization = Math.abs(sum - 1) > SHARE_NORMALIZE_TOLERANCE
  if (needsNormalization) {
    console.warn(
      `stage2_economy: budget_shares sum to ${sum} (expected 1.0); normalizing.`,
    )
  }

  // If we're within tolerance, divisor is effectively 1 — using `sum` would
  // introduce a tiny float drift. Branch keeps the well-formed path
  // byte-stable.
  const divisor = needsNormalization ? sum : 1
  let total = 0
  for (const share of orderedShares) {
    const normalized = share / divisor
    total += normalized * target_budget
  }
  return total
}
