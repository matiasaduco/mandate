import type {
  Decision,
  Engine,
  EngineEvent,
  EngineEventListener,
  EngineOptions,
  EngineState,
} from './types'
import { createRng, type Rng } from './rng'
import { createEventBus } from './events/bus'
import { runTick } from './pipeline/run'
import type { EngineContext } from './pipeline/context'

export type {
  Decision,
  Engine,
  EngineEvent,
  EngineEventListener,
  EngineOptions,
  EngineState,
} from './types'

export type { Rng } from './rng'

// createEngine — single entry point for the headless simulation.
//
// Contract (see vault: 06 - Reference / Tech Stack § Boundary contract):
//   - applyDecisions(decisions): UI calls before stage 0 of the next tick;
//     queued decisions are drained at stage 0 of the *next* tick(), never
//     same-tick (invariant #3).
//   - tick(): runs stages 0–7 once, advances `state.tick`, flushes buffered
//     events to subscribers, and returns a fresh snapshot.
//   - subscribe(listener): listens for events fired at the end of the tick.
//
// T-006 wires the pipeline runner with no-op stages; logic lands in T-007+.
export function createEngine(initialState: EngineState, options: EngineOptions): Engine {
  let state: EngineState = cloneState(initialState)
  const listeners = new Set<EngineEventListener>()
  const rng: Rng = createRng(options.seed)
  const bus = createEventBus(listeners)

  const ctx: EngineContext = {
    emit: (event: EngineEvent) => bus.emit(event),
    rng,
  }

  function applyDecisions(decisions: Decision[]): void {
    // Push-only. The queue is drained at stage 0 of the next tick (T-007).
    state = {
      ...state,
      decision_queue: [...state.decision_queue, ...decisions],
    }
  }

  function tick(): EngineState {
    // T-016: once `game_over` is set, all subsequent tick() calls are no-ops.
    // We return the current state snapshot unchanged WITHOUT advancing the
    // tick counter, running the pipeline, or flushing the event bus. This
    // guard lives at the runner level (rather than inside runTick or stage 7)
    // so stages 0–6 cannot execute and emit stray events after game-over.
    if (state.game_over) {
      return cloneState(state)
    }
    // Run the full Phase 1 pipeline: stages 0 → 7, in order.
    state = runTick(state, ctx)
    // Advance the tick counter once per tick() call.
    state = { ...state, tick: state.tick + 1 }
    // Dispatch all events buffered during the stages, then clear the buffer.
    bus.flush()
    return cloneState(state)
  }

  function subscribe(listener: EngineEventListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { applyDecisions, tick, subscribe }
}

function cloneState(state: EngineState): EngineState {
  // structuredClone is sufficient for the Phase 1 state shape (plain JSON-like data).
  return structuredClone(state)
}
