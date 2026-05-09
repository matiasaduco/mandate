import type {
  Decision,
  Engine,
  EngineEvent,
  EngineEventListener,
  EngineOptions,
  EngineState,
} from './types'
import { createRng, type Rng } from './rng'

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
//   - applyDecisions(decisions): UI calls before stage 0 of the next tick.
//   - tick(): advances one tick and returns a fresh state snapshot.
//   - subscribe(listener): listens for events fired during the tick.
//
// Phase 1 (T-002): pipeline stages are no-ops; tick() only increments `tick`.
// They are wired up across T-006 → T-018.
export function createEngine(initialState: EngineState, options: EngineOptions): Engine {
  let state: EngineState = cloneState(initialState)
  const listeners = new Set<EngineEventListener>()
  const rng: Rng = createRng(options.seed)
  void rng // wired into stage 2/3/5 randomness in T-008+.

  function applyDecisions(decisions: Decision[]): void {
    state = {
      ...state,
      decision_queue: [...state.decision_queue, ...decisions],
    }
  }

  function tick(): EngineState {
    // Pipeline stages 0–7 will live here (T-006+).
    // Until then, we just advance the tick counter and return a fresh snapshot.
    state = {
      ...state,
      tick: state.tick + 1,
    }
    return cloneState(state)
  }

  function subscribe(listener: EngineEventListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  // Reserved for stage runners — emit events through the bus.
  // Exported as a closed-over helper so stages can call it via the engine context (T-006).
  function _emit(event: EngineEvent): void {
    for (const listener of listeners) {
      listener(event)
    }
  }
  void _emit // currently unused; wired up in T-006.

  return { applyDecisions, tick, subscribe }
}

function cloneState(state: EngineState): EngineState {
  // structuredClone is sufficient for the Phase 1 state shape (plain JSON-like data).
  return structuredClone(state)
}
