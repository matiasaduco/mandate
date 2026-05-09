import type { PopType } from './POP'

// Field names mirror ~/Documents/Tycoon/06 - Reference/Data Model.md § Decision-shape entities.

export const SLIDER_IDS_P1 = [
  'tax_income',
  'tax_corporate',
  'tax_consumption',
  'budget_health',
  'budget_education',
  'budget_infrastructure',
  'budget_security',
  'budget_welfare',
] as const
export type SliderId = (typeof SLIDER_IDS_P1)[number]

export const DECREE_IDS_P1 = ['public_address', 'emergency_relief', 'industrial_subsidy'] as const
export type DecreeId = (typeof DECREE_IDS_P1)[number]

export type SliderDecision = {
  type: 'slider'
  slider_id: SliderId
  value: number
}

export type DecreeDecision = {
  type: 'decree'
  decree_id: DecreeId
  target_pop?: PopType
}

export type Decision = SliderDecision | DecreeDecision

// Persistent slider state (canonical values live on Country.sliders / Country.budget_shares).
// This shape carries the meta a future UI may want — last_changed_tick is convenient for
// the "recently changed" indicator (T-023).
export type SliderState = {
  slider_id: SliderId
  value: number
  last_changed_tick: number
}

// Decree catalog entry: definition + effect spec. Loaded from
// src/engine/entities/Decree.ts in T-018.
export type DecreeDef = {
  decree_id: DecreeId
  cost_treasury: number
  target_pop?: PopType
  /** Engine-internal effect spec; refined in T-018. */
  effect: unknown
}
