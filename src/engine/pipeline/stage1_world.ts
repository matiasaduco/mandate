// Stage 1 — World layer.
//
// No-op in Phase 1. World-level dynamics (trade, diplomacy, climate forcing)
// land in later phases. The stage exists in the registry so that the pipeline
// shape is stable from Phase 1 onward.

import type { EngineState } from '../types'
import type { EngineContext } from './context'

export function stage1_world(state: EngineState, _ctx: EngineContext): EngineState {
  return state
}
