// Stage 7 — UI / feedback + loss check.
//
// T-016 wires the loss-condition counters and emits GameOver when either
// threshold is met. Reads LIVE state written earlier in the same tick:
//   - country.treasury and flows.balance (stage 2, T-010)
//   - country.approval (stage 4, T-013)
// Does NOT consume the PRNG (zero draws).
//
// Counter contract (per Loss Conditions vault page + T-016 brief):
//   bankruptcy_negative_balance_ticks: increments while
//     `treasury < 0 && balance < 0`; resets to 0 the moment either condition
//     no longer holds (no held-state).
//   approval_below_crisis_ticks: increments while
//     `approval < APPROVAL_CRISIS_THRESHOLD` (strict `<`, hovering at exactly
//     the threshold does NOT count); resets to 0 otherwise.
//
// Tie-break: if both conditions reach their respective trigger ticks on the
// same tick, bankruptcy fires first and the uprising check is skipped.
// Exactly one GameOver event is emitted per run.
//
// `game_over` is sticky: once set, this stage takes no further action. The
// `tick()` runner in src/engine/index.ts also short-circuits the entire
// pipeline when `state.game_over === true`, so reaching this stage with a
// pre-set `game_over` should not happen in practice — the guard here is
// defensive.

import {
  APPROVAL_CRISIS_THRESHOLD,
  APPROVAL_CRISIS_TICKS,
  BANKRUPTCY_NEGATIVE_BALANCE_TICKS,
} from '../tunables'
import type { EngineState, GameOverReason } from '../types'
import type { EngineContext } from './context'

export function stage7_feedback(state: EngineState, ctx: EngineContext): EngineState {
  // --- 1) Read live state (NOT events). ----------------------------------
  const treasury = state.country.treasury
  const balance = state.flows.balance
  const approval = state.country.approval

  // --- 2) Update counters. -----------------------------------------------
  // Both follow the same shape: increment when the condition holds, reset to
  // 0 otherwise. Reset (not held) is required by AC #4.
  const bankruptcyTicks =
    treasury < 0 && balance < 0
      ? state.loss_counters.bankruptcy_negative_balance_ticks + 1
      : 0

  const uprisingTicks =
    approval < APPROVAL_CRISIS_THRESHOLD
      ? state.loss_counters.approval_below_crisis_ticks + 1
      : 0

  // --- 3) Tie-break: bankruptcy first. -----------------------------------
  // Defensive: only fire GameOver once per run. The runner-level guard in
  // src/engine/index.ts should normally prevent reaching stage 7 with
  // `state.game_over === true`, but the explicit check here keeps the stage
  // safe to invoke directly (e.g. from tests).
  let gameOver = state.game_over
  let gameOverReason: GameOverReason | null = state.game_over_reason

  if (!gameOver && bankruptcyTicks >= BANKRUPTCY_NEGATIVE_BALANCE_TICKS) {
    gameOver = true
    gameOverReason = 'bankruptcy'
  } else if (!gameOver && uprisingTicks >= APPROVAL_CRISIS_TICKS) {
    gameOver = true
    gameOverReason = 'mass_uprising'
  }

  // --- 4) Build the new state with updated counters / game_over flags. ---
  const next: EngineState = {
    ...state,
    loss_counters: {
      bankruptcy_negative_balance_ticks: bankruptcyTicks,
      approval_below_crisis_ticks: uprisingTicks,
    },
    game_over: gameOver,
    game_over_reason: gameOverReason,
  }

  // --- 5) Emit GameOver on the transition only (was false, now true). ---
  // The snapshot embedded in the event reflects the post-stage-7 state so
  // consumers see the final counters / game_over flags. structuredClone keeps
  // engine state safe from outside mutation via the event payload.
  if (!state.game_over && next.game_over && next.game_over_reason !== null) {
    ctx.emit({
      type: 'GameOver',
      reason: next.game_over_reason,
      final_state_snapshot: structuredClone(next),
      tick: state.tick,
    })
  }

  return next
}
