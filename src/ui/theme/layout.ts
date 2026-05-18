// T-034 — Panel layout persistence.
//
// Tiny, self-contained module that owns the `mandate.layout.v1` localStorage
// key. The layout state is kept independent from the T-028 save format
// (`mandate.save.v1`): swapping out a save must not blow away the user's
// preferred panel arrangement, and conversely re-arranging panels must not
// invalidate a saved game. AC #4 of the T-034 brief codifies this split.
//
// Schema (version 1):
//   {
//     "version": 1,
//     "panels": {
//       "overview": { x, y, width, height },
//       "economy":  { x, y, width, height },
//       "society":  { x, y, width, height },
//       "politics": { x, y, width, height }
//     }
//   }
//
// Any parse failure, missing field, or version mismatch resets to the token
// defaults — no migration logic in P1.5.

import { DEFAULT_PANEL_POSITIONS } from '@ui/theme/tokens'

/** All four panels managed by the floating-card layer. */
export type PanelId = 'overview' | 'economy' | 'society' | 'politics'

/** Per-panel position + size in CSS pixels, anchored to the panel surface. */
export type PanelLayout = {
  x: number
  y: number
  width: number
  height: number
}

/** Persisted shape. Bump the `version` literal when the schema changes. */
export type LayoutState = {
  version: 1
  panels: Record<PanelId, PanelLayout>
}

/** localStorage key for the persisted layout. Independent of T-028's save key. */
export const LAYOUT_STORAGE_KEY = 'mandate.layout.v1'

/** Stable ordered list of panel ids. Useful for `.map()` callers. */
export const PANEL_IDS: readonly PanelId[] = [
  'overview',
  'economy',
  'society',
  'politics',
] as const

/**
 * Default layout sourced from tokens. Returned as a fresh object so callers
 * can mutate without disturbing the constant.
 */
export function defaultLayout(): LayoutState {
  return {
    version: 1,
    panels: {
      overview: { ...DEFAULT_PANEL_POSITIONS.overview },
      economy: { ...DEFAULT_PANEL_POSITIONS.economy },
      society: { ...DEFAULT_PANEL_POSITIONS.society },
      politics: { ...DEFAULT_PANEL_POSITIONS.politics },
    },
  }
}

/**
 * Type guard: returns true iff `value` is a finite number. We accept integers
 * AND floats since `react-rnd` emits float coordinates while dragging.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Type guard for a single panel's layout fragment. */
function isPanelLayout(value: unknown): value is PanelLayout {
  if (value === null || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  return (
    isFiniteNumber(rec.x) &&
    isFiniteNumber(rec.y) &&
    isFiniteNumber(rec.width) &&
    isFiniteNumber(rec.height)
  )
}

/**
 * Type guard for the whole `LayoutState`. Returns true iff:
 *   - the object has `version === 1`,
 *   - `panels` is an object,
 *   - every PanelId key has a valid `PanelLayout` value.
 * Anything else is treated as corrupt and reset to defaults by the caller.
 */
function isLayoutState(value: unknown): value is LayoutState {
  if (value === null || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  if (rec.version !== 1) return false
  const panels = rec.panels
  if (panels === null || typeof panels !== 'object') return false
  const pmap = panels as Record<string, unknown>
  for (const id of PANEL_IDS) {
    if (!isPanelLayout(pmap[id])) return false
  }
  return true
}

/**
 * Load the persisted layout from localStorage. Returns the default layout on
 * any of: localStorage unavailable, missing key, parse failure, schema mismatch.
 *
 * Synchronous on purpose: panels read this DURING render to avoid the
 * flash-of-default-position the user would otherwise see before a `useEffect`
 * pass landed.
 */
export function loadLayout(): LayoutState {
  if (typeof localStorage === 'undefined') return defaultLayout()
  let raw: string | null
  try {
    raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
  } catch {
    // localStorage can throw on access (privacy mode, disk quota, etc.).
    return defaultLayout()
  }
  if (raw === null) return defaultLayout()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultLayout()
  }
  if (!isLayoutState(parsed)) return defaultLayout()
  return parsed
}

/**
 * Persist the layout to localStorage. Silently no-ops on any storage error
 * (private mode, quota exceeded). The UI does not surface persistence errors
 * for layout — losing a drag is recoverable; blocking the user with a banner
 * is not worth it.
 */
export function saveLayout(layout: LayoutState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // ignore
  }
}

/**
 * Listeners notified after `resetPanelLayout()` clears the persisted entry.
 * The panel-shell component subscribes here so it can recompute its default
 * layout WITHOUT prop-drilling a re-render trigger through `App.tsx`.
 *
 * Why an ad-hoc subscriber set instead of Zustand: layout state lives outside
 * the gameStore on purpose (it is UI-shell state, not snapshot state) and a
 * full store for one boolean would be overkill. The set is module-local and
 * never crosses the engine boundary.
 */
type ResetListener = () => void
const resetListeners = new Set<ResetListener>()

/**
 * Subscribe to "layout was reset" notifications. Returns an unsubscribe fn.
 * Called once by the panel-shell host on mount.
 */
export function subscribeLayoutReset(listener: ResetListener): () => void {
  resetListeners.add(listener)
  return () => {
    resetListeners.delete(listener)
  }
}

/**
 * Clear the persisted layout and notify listeners. Single entry point shared
 * between the T-034 keyboard shortcut and T-037's future "Reset panel layout"
 * button. Stable signature: T-037 wires a button to this exact function.
 */
export function resetPanelLayout(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LAYOUT_STORAGE_KEY)
    } catch {
      // ignore
    }
  }
  for (const listener of resetListeners) {
    listener()
  }
}
