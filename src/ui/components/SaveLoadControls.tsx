// T-028 — Save / Load buttons.
//
// Tiny owner of the localStorage I/O for save/load. The engine half
// (`serialize` / `deserialize` / `createEngineFromSavedState`) is pure;
// this component:
//   - on Save: pauses the engine, serializes the current snapshot, writes to
//     localStorage under `mandate_save_v1`.
//   - on Load: pauses the engine, reads from localStorage, deserializes,
//     calls `gameStore.loadState(state)`.
//
// Mid-tick safety (AC #4): both actions call `setSpeed(0)` before reading or
// writing. JS is single-threaded and `tick()` is synchronous, so the pause
// guarantees no tick can interleave between the speed write and the save /
// load operation — the "no half-state writes" invariant is trivially
// satisfied.
//
// `localStorage` access is feature-detected so the component degrades
// gracefully under SSR / restricted browser contexts: both buttons become
// disabled with an explanatory label.

import { useEffect, useState } from 'react'

import { deserialize, SaveLoadError, serialize } from '@engine'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'

/**
 * Module-local localStorage key for the v1 save slot. Not a Tunable — this is
 * an infrastructure constant (per the T-028 brief), not a gameplay parameter.
 */
const SAVE_KEY = 'mandate_save_v1'

/**
 * Window during which the "Saved" feedback indicator stays visible after a
 * successful save. Short enough to feel snappy, long enough for the user to
 * notice. Not a gameplay constant.
 */
const SAVE_FEEDBACK_MS = 1200

export type SaveLoadControlsProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
}

/** Defensive feature check for localStorage. Returns null when unavailable. */
function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // Some browsers throw on access in restricted contexts (e.g. file:// + Safari).
    return null
  }
}

export function SaveLoadControls({ store }: SaveLoadControlsProps) {
  // Resolve store once per render — same pattern as TopBar (T-021).
  const resolved: GameStore = store ?? getGameStore()
  const snapshot = resolved((s: GameStoreState) => s.snapshot)

  const storage = getLocalStorage()
  const [hasSave, setHasSave] = useState<boolean>(() =>
    storage ? storage.getItem(SAVE_KEY) !== null : false,
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<boolean>(false)

  // Refresh the load button enabled-state if another tab writes to localStorage.
  // Simple cross-tab sync; we re-check on every storage event regardless of
  // which key changed, so the button stays correct without per-key filtering.
  useEffect(() => {
    if (!storage) return
    const onStorage = () => setHasSave(storage.getItem(SAVE_KEY) !== null)
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storage])

  const onSave = () => {
    if (!storage) return
    // Pause before serializing so no tick interleaves between the snapshot
    // read above and the localStorage write below (AC #4).
    resolved.getState().setSpeed(0)
    setError(null)
    try {
      storage.setItem(SAVE_KEY, serialize(snapshot))
      setHasSave(true)
      setSaved(true)
      // Drop the "Saved" indicator after the feedback window.
      window.setTimeout(() => setSaved(false), SAVE_FEEDBACK_MS)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(`Save failed: ${message}`)
    }
  }

  const onLoad = () => {
    if (!storage) return
    const raw = storage.getItem(SAVE_KEY)
    if (raw === null) {
      setError('No saved game found.')
      return
    }
    // Pause before swapping the engine so no tick interleaves (AC #4).
    resolved.getState().setSpeed(0)
    setError(null)
    try {
      const state = deserialize(raw)
      resolved.getState().loadState(state)
    } catch (cause) {
      if (cause instanceof SaveLoadError) {
        setError(`Load failed: ${cause.message}`)
      } else {
        const message = cause instanceof Error ? cause.message : String(cause)
        setError(`Load failed: ${message}`)
      }
    }
  }

  const storageAvailable = storage !== null

  return (
    <div
      className="save-load"
      role="group"
      aria-label="Save and load"
      data-testid="save-load-controls"
      data-error={error !== null ? 'true' : undefined}
      data-saved={saved ? 'true' : undefined}
    >
      <button
        type="button"
        className="save-load__btn"
        onClick={onSave}
        disabled={!storageAvailable}
        data-testid="save-button"
      >
        {saved ? 'Saved' : 'Save'}
      </button>
      <button
        type="button"
        className="save-load__btn"
        onClick={onLoad}
        disabled={!storageAvailable || !hasSave}
        data-testid="load-button"
      >
        Load
      </button>
      {error !== null && (
        <span
          className="save-load__error"
          role="status"
          data-testid="save-load-error"
        >
          {error}
        </span>
      )}
    </div>
  )
}
