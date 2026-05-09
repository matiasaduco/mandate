// Seeded PRNG — mulberry32. Cheap, fast, good enough for game-of-life-tier
// stochasticity. The engine must only read randomness through this module so
// that runs are reproducible from a seed.
//
// Determinism guarantees (see vault: Tech Stack § Determinism):
//   - Two engines created with the same seed and given the same input
//     produce identical sequences of next() / nextRange().
//   - The internal state is part of the engine snapshot (T-028) so save/load
//     resumes the exact trajectory.

export type Rng = {
  next: () => number
  nextRange: (min: number, max: number) => number
  getState: () => number
  setState: (state: number) => void
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function nextRange(min: number, max: number): number {
    return min + next() * (max - min)
  }

  function getState(): number {
    return state
  }

  function setState(s: number): void {
    state = s >>> 0
  }

  return { next, nextRange, getState, setState }
}
