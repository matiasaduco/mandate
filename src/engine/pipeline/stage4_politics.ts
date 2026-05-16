// Stage 4 — Country politics.
//
// T-013 owns: size-weighted approval rollup over POPs, exponential smoothing
// using `state.approval_prev` as the previous-tick value, clamp to
// [APPROVAL_FLOOR, APPROVAL_CEILING], and ApprovalThresholdCrossed event
// emission with sub-TAU debounce. T-014 layers stability follow-on.
//
// Determinism contract:
//   - This stage consumes the PRNG **zero** times. Approval is a pure function
//     of POP `size` and `happiness` (written by stage 3 earlier this tick) and
//     of the previous tick's `approval_prev`. Adding rng draws here would
//     shift the T-008/T-009/T-010/T-011/T-012 determinism locks.
//
// Same-tick read contract (invariant #4):
//   - Reads `pop.size` and `pop.happiness` after stage 3 (T-012) has just
//     written `happiness` this tick.
//   - Reads `state.approval_prev` (last tick's smoothed approval) — never
//     reads `country.approval` for the smoothing source. Using `approval_prev`
//     keeps the previous-tick read explicit and survives intermediate stages
//     that might otherwise mutate `country.approval`.
//
// Formula (P1):
//   total_pop      = Σ pop.size
//   approval_raw   = total_pop > 0
//                      ? Σ (pop.size × pop.happiness) / total_pop
//                      : 0
//   approval_smooth = approval_prev + (approval_raw - approval_prev) / APPROVAL_INERTIA_TAU
//   approval_next   = clamp(approval_smooth, APPROVAL_FLOOR, APPROVAL_CEILING)
//
//   approval_by_pop[pop.pop_type] = pop.happiness  (per POP, P1: identical to
//                                                   pop.happiness; T-025 reads
//                                                   it for the UI breakdown)
//
//   For each threshold in APPROVAL_WARN_THRESHOLDS:
//     crossed_below = approval_prev >= threshold && approval_next < threshold
//     if (crossed_below) {
//       last_fired = state.approval_threshold_last_fired_tick[threshold] ?? -Infinity
//       // Strict `<` boundary: if last_fired = 5 and TAU = 4, ticks 6/7/8 are
//       // blocked (delta 1/2/3 < 4) and tick 9 re-allows (delta 4 = 4, not < 4).
//       if ((state.tick - last_fired) >= APPROVAL_INERTIA_TAU) {
//         emit ApprovalThresholdCrossed({ direction: 'below', threshold, tick: state.tick })
//         updated_map[threshold] = state.tick
//       }
//     }
//
//   // 'above' direction is forward-compat for P2+; P1 emits only 'below'.
//
// Update order matters: read `approval_prev` for both smoothing AND threshold
// check, then overwrite at the end with `approval_next` so the next tick sees
// the new value as its previous.

import type { EngineState } from '../types'
import type { PopType } from '../entities/POP'
import type { EngineContext } from './context'
import {
  APPROVAL_CEILING,
  APPROVAL_FLOOR,
  APPROVAL_INERTIA_TAU,
  APPROVAL_WARN_THRESHOLDS,
} from '../tunables'

function clampApproval(x: number): number {
  if (x < APPROVAL_FLOOR) return APPROVAL_FLOOR
  if (x > APPROVAL_CEILING) return APPROVAL_CEILING
  return x
}

export function stage4_politics(state: EngineState, ctx: EngineContext): EngineState {
  const { country } = state

  // 1) Size-weighted rollup + per-POP contributions in one pass.
  let totalPop = 0
  let weightedSum = 0
  const approvalByPop: Partial<Record<PopType, number>> = {}
  for (const pop of country.pops) {
    totalPop += pop.size
    weightedSum += pop.size * pop.happiness
    approvalByPop[pop.pop_type] = pop.happiness
  }
  // Defensive: a country with zero population has no signal to roll up.
  // Shouldn't happen with the Aurelia fixture; documented for hygiene.
  const approvalRaw = totalPop > 0 ? weightedSum / totalPop : 0

  // 2) Exponential smoothing using approval_prev (NEVER country.approval).
  const approvalPrev = state.approval_prev
  const approvalSmoothed = approvalPrev + (approvalRaw - approvalPrev) / APPROVAL_INERTIA_TAU

  // 3) Clamp to [APPROVAL_FLOOR, APPROVAL_CEILING].
  const approvalNext = clampApproval(approvalSmoothed)

  // 4) Threshold-crossing event emission with sub-TAU debounce.
  // Compare `approval_prev` (pre-smoothing) against `approval_next`
  // (post-smoothing-and-clamp): fires when previous was at-or-above and new
  // is strictly below the threshold. P1 emits only `direction: 'below'`.
  let updatedFiredMap: Record<number, number> | null = null
  for (const threshold of APPROVAL_WARN_THRESHOLDS) {
    const crossedBelow = approvalPrev >= threshold && approvalNext < threshold
    if (!crossedBelow) continue

    const lastFired =
      state.approval_threshold_last_fired_tick[threshold] ?? Number.NEGATIVE_INFINITY
    if (state.tick - lastFired < APPROVAL_INERTIA_TAU) {
      // Debounced: within the previous fire's TAU window, suppress.
      continue
    }

    ctx.emit({
      type: 'ApprovalThresholdCrossed',
      direction: 'below',
      threshold,
      tick: state.tick,
    })
    if (updatedFiredMap === null) {
      updatedFiredMap = { ...state.approval_threshold_last_fired_tick }
    }
    updatedFiredMap[threshold] = state.tick
  }

  // 5) Write through. Update `approval_prev` AFTER the threshold check has
  // consumed the previous value.
  return {
    ...state,
    country: {
      ...country,
      approval: approvalNext,
      approval_by_pop: approvalByPop,
    },
    approval_prev: approvalNext,
    approval_threshold_last_fired_tick:
      updatedFiredMap ?? state.approval_threshold_last_fired_tick,
  }
}
