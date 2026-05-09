import { SPEEDS } from '../tunables'

// Field names mirror ~/Documents/Tycoon/06 - Reference/Data Model.md § Game-control entities.

export type GameSpeed = (typeof SPEEDS)[number]

export const GAME_OVER_REASONS_P1 = ['bankruptcy', 'mass_uprising'] as const
// Forward-compat: Phase 2+ adds 'lose_election', 'no_confidence'; P3+ 'invasion'; P4+ 'coup',
// 'revolution', 'civil_war', 'pandemic_collapse'; P5+ 'sovereign_default'. Wire when those
// phases activate.
export type GameOverReason = (typeof GAME_OVER_REASONS_P1)[number]

export type LossCounters = {
  /** Increments each consecutive tick where treasury < 0 && balance < 0. */
  bankruptcy_negative_balance_ticks: number
  /** Increments each consecutive tick where approval < APPROVAL_CRISIS_THRESHOLD. */
  approval_below_crisis_ticks: number
}

export const ZERO_LOSS_COUNTERS: LossCounters = {
  bankruptcy_negative_balance_ticks: 0,
  approval_below_crisis_ticks: 0,
}
