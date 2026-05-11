// Per-tick event bus.
//
// Stages emit events through `EngineContext.emit`. Emitted events are buffered
// in the bus during the tick and dispatched in a single pass to subscribers at
// the end of `tick()` (after stage 7), then the buffer is cleared. No mid-stage
// dispatch — this keeps stage logic free of side effects beyond the returned
// state and the queued events.

import type { EngineEvent, EngineEventListener } from '../types'

export type EventBus = {
  /** Buffer an event for end-of-tick dispatch. */
  emit: (event: EngineEvent) => void
  /** Dispatch all buffered events to listeners, then clear the buffer. */
  flush: () => void
  /** Number of events currently buffered (test helper). */
  size: () => number
}

export function createEventBus(listeners: Set<EngineEventListener>): EventBus {
  let buffer: EngineEvent[] = []

  function emit(event: EngineEvent): void {
    buffer.push(event)
  }

  function flush(): void {
    if (buffer.length === 0) return
    // Snapshot the buffer first so listeners that emit during dispatch
    // don't observe a partially-drained buffer.
    const events = buffer
    buffer = []
    for (const event of events) {
      for (const listener of listeners) {
        listener(event)
      }
    }
  }

  function size(): number {
    return buffer.length
  }

  return { emit, flush, size }
}
