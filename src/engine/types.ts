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
