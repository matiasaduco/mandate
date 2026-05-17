// T-027 — Hook that drives the slider "predicted impact" preview.
//
// Given the current candidate value the player is dragging toward, this hook
// runs a dry tick on a clone of the live engine snapshot and returns the
// directional deltas. Results are cached by `(slider_id, candidate_value,
// tick)` so repeated renders of the same drag position are free, and stale
// entries naturally fall out of the working set once a real tick advances.
//
// The cache is module-scoped (shared across all <EconomyPanel> instances) and
// bounded by `PREVIEW_CACHE_CAPACITY`. Map's insertion-order iterator gives us
// a cheap FIFO eviction; we don't need a full LRU for a cache this small.

import { useMemo } from 'react'

import type { Decision } from '@engine'
import type { SliderId } from '@engine/types'
import { runDryTick, type PreviewResult } from '@ui/components/dryTick'
import type { GameStore, GameStoreState } from '@ui/stores/gameStore'

/**
 * Cap on the number of preview results cached at any time. With 8 sliders and
 * ~100 distinct values per slider in a Phase 1 session, 100 entries comfortably
 * keeps the working set hot without unbounded growth. Tunable here only — not
 * exposed as a vault tunable because this is pure cache hygiene with no
 * gameplay impact.
 */
const PREVIEW_CACHE_CAPACITY = 100

/**
 * Module-scoped preview cache. Key is `${sliderId}:${value}:${tick}` so cache
 * entries are scoped to the current snapshot — once `tick` advances, every
 * cached entry becomes addressable by a new key and the old keys fall out
 * naturally as the cap evicts oldest.
 */
const previewCache = new Map<string, PreviewResult>()

/**
 * Build the cache key for a (slider, candidate, tick) tuple. Pulled out as a
 * named helper so tests can construct keys with the same logic when they want
 * to inspect cache state directly.
 */
function cacheKey(sliderId: SliderId, value: number, tick: number): string {
  return `${sliderId}:${value}:${tick}`
}

/**
 * Insert a result into the cache, evicting the oldest entry if we would
 * exceed `PREVIEW_CACHE_CAPACITY`. Map iteration order is insertion order, so
 * `keys().next().value` is the oldest entry — cheap FIFO eviction.
 */
function setCache(key: string, result: PreviewResult): void {
  // If the key is already present, deleting before re-inserting moves it to
  // the back of the iteration order — useful if we ever want LRU later.
  if (previewCache.has(key)) {
    previewCache.delete(key)
  }
  previewCache.set(key, result)
  while (previewCache.size > PREVIEW_CACHE_CAPACITY) {
    const oldest = previewCache.keys().next().value
    if (oldest === undefined) break
    previewCache.delete(oldest)
  }
}

/**
 * Clear the entire preview cache. Test-only utility — production code never
 * needs this (tick-keyed entries fall out naturally). Exposed so RTL tests
 * can guarantee a clean slate between cases.
 */
export function _clearPreviewCacheForTests(): void {
  previewCache.clear()
}

/**
 * Build the engine `Decision` for a given slider id + candidate value. For
 * tax sliders this is the integer percent the engine consumes directly; for
 * budget sliders this is the SHARE (0–1) — the EconomyPanel divides by 100
 * before calling us, so we never need to do it here. See `EconomyPanel.tsx`
 * `commitSlider` for the mirror implementation on the commit path.
 */
function buildDecision(sliderId: SliderId, value: number): Decision {
  return { type: 'slider', slider_id: sliderId, value }
}

/**
 * Hook returning the memoized `PreviewResult` for the (slider, candidate)
 * pair, or `null` when no preview should be shown. The hook reads the live
 * snapshot from `store` but NEVER calls any write API on it — the dry tick
 * runs on a structuredClone inside `runDryTick`.
 *
 * Returns `null` when:
 *   - `candidate` is null (no drag in progress for this slider),
 *   - the live game is over (no point previewing in a postmortem),
 *   - the candidate value matches the committed value AND the dry tick would
 *     produce ~0 deltas — we still run the dry tick in that case so the UI
 *     can render "~0" deterministically (the caller decides whether to hide it
 *     based on the resulting bands).
 */
export function useSliderPreview(
  sliderId: SliderId,
  candidate: number | null,
  store: GameStore,
): PreviewResult | null {
  // Pull just the two slices we actually need. Narrow selectors keep this
  // hook from re-running on unrelated snapshot fields (e.g. POP size changes
  // that don't affect the dry tick's decision-resolution path).
  const snapshot = store((s: GameStoreState) => s.snapshot)
  const tick = snapshot.tick
  const gameOver = snapshot.game_over

  return useMemo(() => {
    if (candidate === null) return null
    // Edge case: don't bother running a dry tick once the game is over. The
    // EconomyPanel is hidden in that state anyway (App.tsx swaps in the
    // postmortem), but defensive null-return keeps the hook safe if a
    // future surface ever surfaces a preview elsewhere.
    if (gameOver) return null

    const key = cacheKey(sliderId, candidate, tick)
    const cached = previewCache.get(key)
    if (cached !== undefined) return cached

    const result = runDryTick(snapshot, buildDecision(sliderId, candidate))
    setCache(key, result)
    return result
    // Depend on the values that actually parameterize the dry tick: snapshot
    // identity (changes per advance() via Zustand's referential write),
    // slider id, candidate, and tick. `gameOver` is derived from snapshot but
    // we list it explicitly for clarity.
  }, [snapshot, sliderId, candidate, tick, gameOver])
}
