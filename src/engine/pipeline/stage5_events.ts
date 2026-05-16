// Stage 5 — Events resolution.
//
// T-015 owns: detect treasury threshold crossings (currently only the
// crossing of 0 from a non-negative value) and emit `TreasuryThresholdCrossed`
// once per crossing. Approval threshold events are already emitted by stage 4
// (T-013); the event bus buffers all `ctx.emit(...)` calls during stages and
// dispatches them after stage 7, so stage 5 has NO additional "dispatch"
// work to do — its only real responsibility in P1 is the treasury crossing.
//
// Determinism contract:
//   - This stage consumes the PRNG **zero** times. Crossing detection is a
//     pure comparison between `state.treasury_prev` (set at end of last tick)
//     and the current `state.country.treasury` (written by stage 2 this tick).
//
// Same-tick read contract (invariant #4):
//   - Reads `state.country.treasury` after stage 2 (T-010's budget block)
//     has just written it this tick.
//   - Reads `state.treasury_prev` (the previous tick's post-stage-2 treasury,
//     written here at the END of stage 5 last tick).
//
// Re-fire semantics (CONTRAST with stage 4's approval debounce):
//   - No debounce window. The only gate is the strict crossing condition
//     `treasury_prev >= TREASURY_WARN_THRESHOLD_P1 && treasury_next <
//      TREASURY_WARN_THRESHOLD_P1`. Once treasury is below 0 the condition
//     fails on subsequent ticks (treasury_prev < 0 trivially). If treasury
//     recovers to >= 0 and then crosses below again, the event fires fresh.
//
// Boundary:
//   - Strict `<`. `treasury_next == 0` does NOT trigger, regardless of balance
//     sign — per [[Loss Conditions]] edge case "No threshold event fires when
//     treasury equals 0 with balance >= 0".

import type { EngineState } from '../types'
import type { EngineContext } from './context'

// TODO(P5): make tunable per Event Catalog "threshold (zero | tunable)".
// Phase 1 hardcodes the crossing point to 0 (bankruptcy boundary).
const TREASURY_WARN_THRESHOLD_P1 = 0

export function stage5_events(state: EngineState, ctx: EngineContext): EngineState {
  const treasuryNext = state.country.treasury
  const treasuryPrev = state.treasury_prev

  const crossedBelow =
    treasuryPrev >= TREASURY_WARN_THRESHOLD_P1 && treasuryNext < TREASURY_WARN_THRESHOLD_P1

  if (crossedBelow) {
    ctx.emit({
      type: 'TreasuryThresholdCrossed',
      direction: 'below',
      threshold: TREASURY_WARN_THRESHOLD_P1,
      // Pre-increment per T-007/T-013 convention: stages fire with state.tick
      // BEFORE index.ts post-increments to tick+1.
      tick: state.tick,
    })
  }

  // Update treasury_prev at the END of the stage so the next tick's
  // comparison reads the just-observed value.
  return {
    ...state,
    treasury_prev: treasuryNext,
  }
}
