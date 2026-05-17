// Decree catalog + effect spec + active-decree shape.
//
// Mirrors ~/Documents/Tycoon/03 - Gameplay/Decision Mechanics.md § Phase 1
// decision set and ~/Documents/Tycoon/02 - Simulation/Economy/Simple Economy.md
// (which locks `industrial_subsidy.cost_treasury = 5000`).
//
// T-018 routing summary (see also stage 2 / stage 3 file headers):
//   - public_address    → stage 3 (happiness_bump_all)
//   - emergency_relief  → stage 3 (happiness_bump_target)
//   - industrial_subsidy→ stage 2 (output_boost on industry)
//
// Stacking: no — re-issuing a decree of the same `decree_id` replaces the
// existing `ActiveDecree` entry (`ticks_remaining` resets to the catalog
// duration). See stage 0 ("replace-on-reissue") for the drop-then-append logic.
//
// Effect application semantics (P1):
//   - happiness_bump_*: direct post-smoothing write at stage 3. Bypasses the
//     T-012 inertia for immediate feel; the effect persists for N ticks while
//     `ticks_remaining > 0`, then naturally fades as smoothing continues to
//     pull happiness back towards the priority-driven raw.
//   - output_boost: multiplicative boost (`output *= 1 + pct`) applied at
//     stage 2 AFTER T-008's growth. When the decree expires, output stays at
//     its boosted level — there is no snap-back in P1. The vault says "decay
//     back to baseline" but that's deferred to T-031's balancing pass.
//
// Decrement: stage 3 is the LAST stage that reads `active_decrees` (stage 2
// only reads; stage 3 reads + decrements + prunes). Decrementing in only one
// place avoids double-decrement.

import type { DecreeId } from './Decision'
import type { PopType } from './POP'
import type { SectorType } from './Sector'
import {
  EMERGENCY_RELIEF_COST_P1,
  EMERGENCY_RELIEF_DURATION_P1,
  EMERGENCY_RELIEF_HAPPINESS_DELTA_P1,
  INDUSTRIAL_SUBSIDY_COST_P1,
  INDUSTRIAL_SUBSIDY_DURATION_P1,
  INDUSTRIAL_SUBSIDY_PCT_P1,
  PUBLIC_ADDRESS_DURATION_P1,
  PUBLIC_ADDRESS_HAPPINESS_DELTA_P1,
} from '../tunables'

export const DECREE_DURATIONS_P1 = {
  public_address: PUBLIC_ADDRESS_DURATION_P1,
  emergency_relief: EMERGENCY_RELIEF_DURATION_P1,
  industrial_subsidy: INDUSTRIAL_SUBSIDY_DURATION_P1,
} as const

/**
 * Discriminated union of decree effects. The shape carried on each
 * `ActiveDecree.effect` and on the `DecreeIssued` event payload. New effect
 * types add a new variant here AND a new branch in stage 2/3 application.
 */
export type DecreeEffect =
  | { type: 'happiness_bump_all'; delta: number }
  | { type: 'happiness_bump_target'; target_pop: PopType; delta: number }
  | { type: 'output_boost'; sector: SectorType; pct: number }

/**
 * Catalog entry: cost + duration + effect template. For
 * `happiness_bump_target` the catalog's `target_pop` is a placeholder; stage 0
 * overrides it with the player-supplied `DecreeDecision.target_pop` at issue
 * time before pushing the `ActiveDecree`.
 */
export type DecreeCatalogEntry = {
  cost_treasury: number
  /** Initial `ticks_remaining` set on the `ActiveDecree` at issue. */
  duration_ticks: number
  effect: DecreeEffect
}

/**
 * A live, in-flight decree. Lives on `EngineState.active_decrees` so it
 * survives save/load (T-028). Counted DOWN each tick at stage 3; the effect
 * applies while `ticks_remaining > 0`, and the entry is pruned when it hits 0.
 */
export type ActiveDecree = {
  decree_id: DecreeId
  ticks_remaining: number
  effect: DecreeEffect
}

/**
 * The Phase 1 decree catalog. Indexed by `DecreeId`. Stage 0 looks up the
 * entry, runs the cost gate, subtracts the cost from treasury, and pushes a
 * fresh `ActiveDecree` onto `state.active_decrees`.
 *
 * For `emergency_relief`, the `target_pop` field on the catalog effect is a
 * placeholder (`urban_workers`); the real value is supplied by the player at
 * issue time on the `DecreeDecision` and patched in by stage 0.
 */
export const DECREE_CATALOG_P1: Record<DecreeId, DecreeCatalogEntry> = {
  public_address: {
    cost_treasury: 0,
    duration_ticks: PUBLIC_ADDRESS_DURATION_P1,
    effect: { type: 'happiness_bump_all', delta: PUBLIC_ADDRESS_HAPPINESS_DELTA_P1 },
  },
  emergency_relief: {
    cost_treasury: EMERGENCY_RELIEF_COST_P1,
    duration_ticks: EMERGENCY_RELIEF_DURATION_P1,
    // `target_pop` placeholder — stage 0 overrides at issue with the value
    // supplied on the DecreeDecision.
    effect: {
      type: 'happiness_bump_target',
      target_pop: 'urban_workers',
      delta: EMERGENCY_RELIEF_HAPPINESS_DELTA_P1,
    },
  },
  industrial_subsidy: {
    cost_treasury: INDUSTRIAL_SUBSIDY_COST_P1,
    duration_ticks: INDUSTRIAL_SUBSIDY_DURATION_P1,
    effect: { type: 'output_boost', sector: 'industry', pct: INDUSTRIAL_SUBSIDY_PCT_P1 },
  },
}
