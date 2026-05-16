// Shared test helpers for the Mandate engine tests.
//
// Centralizes the two patterns that repeat across acceptance specs:
//   1. `createFixtureEngine(...)` — the canonical Aurelia + seed=1 engine
//      handle. Optionally takes a pre-mutated `state` and/or a custom `seed`.
//      Future T-029 (acceptance harness) referenced this helper by name.
//   2. `makeDummyRng()` — a stateless Rng stub for tests that call a stage
//      function directly (`stage4_politics(state, ctx)`) and need an
//      EngineContext but consume zero PRNG draws.
//
// Tests import from '@test-utils' (alias → './helpers').

import { createEngine } from '@engine'
import { createAureliaState } from '@engine/fixtures/aurelia'
import type { Rng } from '@engine/rng'
import type { Engine, EngineState } from '@engine/types'

export type CreateFixtureEngineOptions = {
  /**
   * Pre-built engine state. Defaults to a fresh `createAureliaState()`.
   * Pass a custom state when the test needs to mutate fixture values
   * (e.g. set `pop.happiness = 5` for crossing tests).
   */
  state?: EngineState
  /** PRNG seed. Defaults to 1 so determinism locks stay stable across tests. */
  seed?: number
}

/**
 * Construct the canonical fixture engine for acceptance tests: Aurelia state
 * + seed=1. Both can be overridden. Use this in preference to inlining
 * `createEngine(createAureliaState(), { seed: 1 })` — it kills 40+ duplicates
 * across the test tree.
 */
export function createFixtureEngine(opts: CreateFixtureEngineOptions = {}): Engine {
  const { state = createAureliaState(), seed = 1 } = opts
  return createEngine(state, { seed })
}

/**
 * Stateless Rng stub for tests that invoke stage functions directly and need
 * an `EngineContext` but never consume PRNG draws. Mirrors the `Rng` shape so
 * TypeScript is satisfied. `getState`/`setState` use a local closure so
 * round-trip behavior is sane if a test ever does call them.
 */
export function makeDummyRng(): Rng {
  let s = 0
  return {
    next: () => 0,
    nextRange: () => 0,
    getState: () => s,
    setState: (next: number) => {
      s = next
    },
  }
}
