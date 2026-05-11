// Stage 6 — AI policy step.
//
// No-op in Phase 1 (single country, player only).
// Phase 3+: iterate AI countries here.

import type { EngineState } from '../types'
import type { EngineContext } from './context'

export function stage6_ai(state: EngineState, _ctx: EngineContext): EngineState {
  return state
}
