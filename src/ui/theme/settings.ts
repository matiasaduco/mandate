// T-037 — Settings persistence module.
//
// Owns the `mandate.settings.v1` localStorage key. Completely independent of
// the T-028 save key (`mandate.save.v1`), the T-034 layout key
// (`mandate.layout.v1`), and the T-033 onboarding key
// (`mandate.onboarding.v1`). Resetting a save does NOT reset settings; a
// layout reset does NOT reset settings; and so on.
//
// Schema (version 1):
//   {
//     "version": 1,
//     "defaultTickSpeed": 0 | 1 | 2 | 4,
//     "language": "en" | "es"
//   }
//
// Any parse failure, missing field, or version mismatch silently falls back to
// DEFAULT_SETTINGS — no migration logic in Phase 1.5.

import { SPEEDS } from '@engine/tunables'

/** localStorage key for persisted settings. Independent of all other keys. */
export const SETTINGS_KEY = 'mandate.settings.v1'

/**
 * The persisted shape for player settings. `version` lets us migrate cleanly
 * when the schema changes — bump the literal and add a migration branch.
 */
export type SettingsState = {
  version: 1
  /** Which speed the engine boots at when starting a new game. */
  defaultTickSpeed: 0 | 1 | 2 | 4
  /** UI language. English-only in Phase 1.5; Spanish is Phase 5. */
  language: 'en' | 'es'
}

/**
 * Factory default. Returned when localStorage is unavailable, the key is
 * absent, the JSON is malformed, or the version does not match.
 * `defaultTickSpeed: 1` matches pre-T-037 behavior (1× on boot).
 */
export const DEFAULT_SETTINGS: SettingsState = {
  version: 1,
  defaultTickSpeed: 1,
  language: 'en',
}

/** The valid `defaultTickSpeed` values, sourced from the engine tunables. */
const VALID_SPEEDS = SPEEDS as readonly number[]

/**
 * Type guard for `SettingsState`. Returns true iff the value has every
 * required field with a valid type.
 */
function isSettingsState(value: unknown): value is SettingsState {
  if (value === null || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  if (rec.version !== 1) return false
  if (!VALID_SPEEDS.includes(rec.defaultTickSpeed as number)) return false
  if (rec.language !== 'en' && rec.language !== 'es') return false
  return true
}

/**
 * Load settings from localStorage. Returns `DEFAULT_SETTINGS` on any of:
 * localStorage unavailable, missing key, parse failure, schema mismatch.
 *
 * Synchronous on purpose — callers (MainMenu Start handler) read this inline
 * before calling `bootEngine`, so no async gap exists between reading settings
 * and acting on them.
 */
export function loadSettings(): SettingsState {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS }
  let raw: string | null
  try {
    raw = localStorage.getItem(SETTINGS_KEY)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
  if (raw === null) return { ...DEFAULT_SETTINGS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
  if (!isSettingsState(parsed)) return { ...DEFAULT_SETTINGS }
  return parsed
}

/**
 * Persist settings to localStorage. Silently no-ops on any storage error —
 * settings loss is recoverable (the next session just starts at defaults again).
 */
export function saveSettings(settings: SettingsState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Swallow — best-effort persistence.
  }
}

/**
 * Remove the settings key from localStorage, effectively resetting to
 * defaults on the next `loadSettings()` call.
 */
export function resetSettings(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(SETTINGS_KEY)
  } catch {
    // Swallow.
  }
}
