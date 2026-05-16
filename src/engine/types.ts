// Engine-level types.
//
// Entity shapes live under ./entities; this file wires them into the public
// EngineState / EngineEvent surface and the Engine handle.

import type { Country } from './entities/Country'
import type { Decision, SliderId, DecreeId } from './entities/Decision'
import type { PopType } from './entities/POP'
import type { GameSpeed, GameOverReason, LossCounters } from './entities/GameControl'

export type {
  Country,
  TerrainProfile,
  HeadOfState,
  ClimateZone,
  GovernmentType,
  SlidersState,
  BudgetShares,
} from './entities/Country'
export type { POP, PopType } from './entities/POP'
export type { Sector, SectorType } from './entities/Sector'
export type {
  Decision,
  SliderDecision,
  DecreeDecision,
  SliderId,
  DecreeId,
  SliderState,
  DecreeDef,
} from './entities/Decision'
export type { GameSpeed, GameOverReason, LossCounters } from './entities/GameControl'

export type EngineState = {
  tick: number
  game_speed: GameSpeed
  game_over: boolean
  game_over_reason: GameOverReason | null
  country: Country
  decision_queue: Decision[]
  loss_counters: LossCounters
  /** Snapshot of the seeded PRNG state. Persists across save/load (T-028). */
  rng_state: number
  /** Per-tick flows recomputed every tick (Simple Economy stage 2). */
  flows: TickFlows
  /** Previous tick's approval, used for threshold-crossing detection (stage 4). */
  approval_prev: number
  /**
   * Previous tick's treasury value (the post-stage-2 treasury from the end of
   * the prior tick). Stage 5 (T-015) reads this together with the freshly
   * stage-2-written `country.treasury` to detect threshold crossings (e.g.
   * crossing below 0 from a non-negative value) and emit
   * `TreasuryThresholdCrossed`. At the end of stage 5 this is rewritten to the
   * just-observed `country.treasury` so the next tick's comparison is correct.
   * Lives on EngineState so save/load (T-028) preserves the comparator across
   * reloads. Initialized to Aurelia's starting treasury in
   * `createAureliaState()`.
   */
  treasury_prev: number
  /**
   * Debounce state for stage-4 ApprovalThresholdCrossed emission. Maps each
   * threshold value (numeric key) to the tick at which it most recently fired.
   * If a threshold is missing from the map, it has never fired. Stage 4 skips
   * re-emission while `(state.tick - last_fired) < APPROVAL_INERTIA_TAU`,
   * preventing event spam under sub-TAU oscillation around a threshold.
   * Lives on EngineState so save/load (T-028) preserves it across reloads.
   */
  approval_threshold_last_fired_tick: Record<number, number>
}

export type TickFlows = {
  tax_income: number
  budget_spend: number
  balance: number
}

export type EngineEvent =
  | {
      type: 'PolicyChanged'
      slider_id: SliderId
      old_value: number
      new_value: number
      tick: number
    }
  | {
      type: 'DecreeIssued'
      decree_id: DecreeId
      target_pop?: PopType
      cost: number
      effect: unknown
      tick: number
    }
  | {
      type: 'TreasuryThresholdCrossed'
      direction: 'above' | 'below'
      threshold: number
      tick: number
    }
  | {
      type: 'ApprovalThresholdCrossed'
      direction: 'above' | 'below'
      threshold: number
      tick: number
    }
  | {
      type: 'GameOver'
      reason: GameOverReason
      final_state_snapshot: EngineState
      tick: number
    }

export type EngineEventListener = (event: EngineEvent) => void

export type EngineOptions = {
  seed: number
}

export type Engine = {
  applyDecisions: (decisions: Decision[]) => void
  tick: () => EngineState
  subscribe: (listener: EngineEventListener) => () => void
}
