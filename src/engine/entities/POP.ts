import { POP_SEGMENTS_P1 } from '../tunables'

// Field names mirror ~/Documents/Tycoon/06 - Reference/Data Model.md § POP.

export type PopType = (typeof POP_SEGMENTS_P1)[number]

export type POP = {
  pop_type: PopType
  /** persons */
  size: number
  /** 0–120 */
  avg_age: number
  /** 0–100 */
  education_level: number
  /** Per-tick derived flow (income owner: Simple Economy). */
  income: number
  /** 0–1 */
  employment_rate: number
  /** 0–100, derived from priorities outcomes (HAPPINESS_RANGE). */
  happiness: number
  /** 0–100. Inert in Phase 1; active P4+. */
  radicalization: number
  /** 0–100. Phase 2+. Stored from Phase 1 for forward-compat. */
  institutional_trust: number
  /** Phase 1 stub: single progressive↔conservative axis in [-1, 1].
   *  Phase 2+ promotes this to a vector. */
  ideology: number
  /** Flavor in Phase 1; mechanical Phase 4+. */
  religion: string
  /** Ordered list of what this segment cares most about. Static per pop_type in P1. */
  priorities: string[]
  /** Phase 4+. Optional in P1. */
  generation_id?: string
}
