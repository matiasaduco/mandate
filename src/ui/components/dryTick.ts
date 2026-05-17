// T-027 — Pure dry-tick helper for the slider preview.
//
// Given an engine snapshot + a candidate Decision, this builds an isolated
// engine on top of a structuredClone of the snapshot, applies the decision,
// runs one tick, and returns the directional diffs (approval, treasury, top
// affected POPs by happiness) for the preview UI to band-format.
//
// IMPORTANT: this never touches the live engine. The clone is the only state
// the dry engine ever sees, and the dry engine is GC'd as soon as this
// function returns. The cache lives in `useSliderPreview.ts` — this module
// stays purely functional so it is trivial to unit-test without React.
//
// Determinism: the dry engine is constructed with a FIXED seed (`DRY_TICK_SEED
// = 1`) regardless of the live engine's seed. RNG drift vs the live engine is
// acceptable for a directional preview, and a fixed seed keeps the cache key
// stable across UI re-renders (otherwise the same (slider_id, value) pair
// would produce a different result if the live engine had advanced its PRNG
// state between cache hits).

import { createEngine } from '@engine'
import type { Decision, EngineState } from '@engine'
import type { PopType } from '@engine/types'

/**
 * Deterministic PRNG seed for the dry-tick engine. Fixed constant — see
 * module-level comment for the rationale.
 */
export const DRY_TICK_SEED = 1

/**
 * Per-POP happiness delta produced by the dry tick. `pop_type` is the POP
 * segment id (matches `country.pops[i].pop_type`); `dHappiness` is signed.
 */
export type PopHappinessDelta = {
  pop_type: PopType
  dHappiness: number
}

/**
 * Result of running a dry tick against the live snapshot with a candidate
 * decision applied. All values are signed deltas (after − before).
 *
 * `popDeltas` is sorted by `|dHappiness|` descending and capped at 3 — the
 * preview UI renders this directly. Callers that need a different cap or sort
 * order should re-derive from a richer return shape (which we don't have a
 * use-case for yet).
 */
export type PreviewResult = {
  dApproval: number
  dTreasury: number
  popDeltas: PopHappinessDelta[]
}

/**
 * Hard cap on `popDeltas` length. The vault brief calls for "top 1–3 POPs by
 * |Δ happiness|" — we always return up to 3; the UI further filters out POPs
 * whose absolute delta rounds to zero (see `SliderPreview.tsx`).
 */
const TOP_POP_DELTA_COUNT = 3

/**
 * Run a dry tick against a clone of `snapshot` with `decision` applied at
 * stage 0. Returns directional deltas for the preview UI. Never mutates the
 * input snapshot — `structuredClone` is the only state the dry engine ever
 * touches.
 */
export function runDryTick(snapshot: EngineState, decision: Decision): PreviewResult {
  // structuredClone deep-copies the EngineState. The engine itself also
  // structured-clones its initial state inside createEngine, so we are
  // double-safe against accidental shared references between the live and
  // dry snapshots.
  const clone = structuredClone(snapshot)
  const dryEngine = createEngine(clone, { seed: DRY_TICK_SEED })
  dryEngine.applyDecisions([decision])
  const after = dryEngine.tick()

  const dApproval = after.country.approval - snapshot.country.approval
  const dTreasury = after.country.treasury - snapshot.country.treasury

  // Index the BEFORE pops by type so we can diff in O(n).
  const prevPopByType = new Map(snapshot.country.pops.map((p) => [p.pop_type, p]))

  const popDeltas: PopHappinessDelta[] = after.country.pops
    .map((p) => {
      const prev = prevPopByType.get(p.pop_type)
      const dHappiness = prev ? p.happiness - prev.happiness : 0
      return { pop_type: p.pop_type, dHappiness }
    })
    .sort((a, b) => Math.abs(b.dHappiness) - Math.abs(a.dHappiness))
    .slice(0, TOP_POP_DELTA_COUNT)

  return { dApproval, dTreasury, popDeltas }
}
