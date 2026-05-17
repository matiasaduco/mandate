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

// T-028 — Save / load surface. The engine owns serialization (versioned JSON
// envelope) and the factory that restores an engine from a saved snapshot
// with its PRNG cursor intact. The UI does the actual localStorage I/O.
export {
  serialize,
  deserialize,
  SaveLoadError,
  SAVE_SCHEMA_VERSION,
} from './save'

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
    // T-028 — Persist the PRNG cursor into the snapshot so save/load can
    // restore the exact trajectory. Aurelia's seed state is 0 (irrelevant —
    // `createEngine` builds the RNG from `options.seed`, not this field), but
    // after the first tick the snapshot's `rng_state` reflects every draw
    // consumed by stages 1–6 of this tick. `createEngineFromSavedState`
    // restores this value into a fresh RNG via `rng.setState(...)`.
    state = { ...state, rng_state: rng.getState() }
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

  return { applyDecisions, tick, subscribe, rng }
}

/**
 * T-028 — Rebuild an engine from a previously serialized snapshot, restoring
 * the exact PRNG cursor so the post-load trajectory matches a never-saved
 * run tick-for-tick.
 *
 * Implementation note: we do NOT change `createEngine` itself — Aurelia's
 * fixture pins `rng_state: 0` and existing T-009 / T-010 determinism locks
 * depend on the seed (not this field) seeding the PRNG. Instead, this factory
 * wraps `createEngine` and immediately overrides the freshly-created RNG's
 * cursor with the saved `state.rng_state`. The `seed: 1` passed below is
 * therefore a throwaway — the immediate `setState` overrides it.
 *
 * The save's `decision_queue` is preserved as-is so any decisions the player
 * queued before saving still fire at stage 0 of the next tick post-load
 * (resolved ambiguity in the T-028 brief).
 */
export function createEngineFromSavedState(state: EngineState): Engine {
  const engine = createEngine(state, { seed: 1 })
  engine.rng.setState(state.rng_state)
  return engine
}

function cloneState(state: EngineState): EngineState {
  // structuredClone is sufficient for the Phase 1 state shape (plain JSON-like data).
  return structuredClone(state)
}
