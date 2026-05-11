// Engine context passed to every pipeline stage.
//
// A stage is a pure function `(state, ctx) => state`. Its only allowed side
// effects are returning a new state and calling `ctx.emit(...)` to buffer
// events for end-of-tick dispatch.

import type { EngineEvent } from '../types'
import type { Rng } from '../rng'

export type EngineContext = {
  /** Buffer an event for end-of-tick dispatch. */
  emit: (event: EngineEvent) => void
  /** Seeded PRNG — the only allowed source of randomness in the engine. */
  rng: Rng
}
