// Stage 0 — Apply queued decisions.
//
// Drains `state.decision_queue` and applies each decision to the country.
// In T-006 this is a no-op skeleton: real draining lands in T-007.
//
// Invariant #3 (CLAUDE.md): `applyDecisions` only pushes to the queue; the
// queue is drained here, at stage 0 of the *next* tick — never same-tick.

import type { EngineState } from '../types'
import type { EngineContext } from './context'

export function stage0_decisions(state: EngineState, _ctx: EngineContext): EngineState {
  return state
}
