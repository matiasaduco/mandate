// runTick — single pass over the Phase 1 pipeline.
//
// Calls each stage in strict registry order (0 → 1 → 2 → 3 → 4 → 5 → 6 → 7),
// threading the state through each call. Stages are pure: their only side
// effect beyond the returned state is calling `ctx.emit(...)` to buffer events
// for end-of-tick dispatch (handled by the caller).
//
// The stage list is exposed so the engine can also drive it via a configurable
// runner in tests (see test/engine/tick_runner.spec.ts), but production callers
// should just use `runTick`.
//
// See vault: ~/Documents/Tycoon/06 - Reference/Tick Pipeline.md.

import type { EngineState } from '../types'
import type { EngineContext } from './context'
import { stage0_decisions } from './stage0_decisions'
import { stage1_world } from './stage1_world'
import { stage2_economy } from './stage2_economy'
import { stage3_society } from './stage3_society'
import { stage4_politics } from './stage4_politics'
import { stage5_events } from './stage5_events'
import { stage6_ai } from './stage6_ai'
import { stage7_feedback } from './stage7_feedback'

export type Stage = (state: EngineState, ctx: EngineContext) => EngineState

/** The canonical stage list, in execution order. */
export const STAGES: readonly Stage[] = [
  stage0_decisions,
  stage1_world,
  stage2_economy,
  stage3_society,
  stage4_politics,
  stage5_events,
  stage6_ai,
  stage7_feedback,
] as const

export function runTick(state: EngineState, ctx: EngineContext): EngineState {
  let s = state
  for (const stage of STAGES) {
    s = stage(s, ctx)
  }
  return s
}
