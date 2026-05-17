// T-028 — Save / load serialization for EngineState.
//
// Pure functions over strings. The engine is headless (CLAUDE.md invariant #1),
// so this module does NOT touch `localStorage`, `window`, or the DOM — the UI
// (`SaveLoadControls`) owns the actual I/O. We just convert state ↔ JSON and
// enforce schema versioning.
//
// Payload shape (locked):
//   {
//     "schema_version": 1,
//     "state": <EngineState as JSON>
//   }
//
// The schema version is bumped whenever the EngineState shape changes in a
// way that would break round-trips of older saves. For now (Phase 1) there is
// only one version. Saves with a missing or mismatched `schema_version` throw
// `SaveLoadError` so the UI can surface a clear failure rather than silently
// loading a malformed state.

import type { EngineState } from './types'

/**
 * Current save schema version. Mirrors the format of the JSON envelope.
 * Bump together with a migration path when EngineState gains/removes fields
 * in a way that breaks deserialization of older saves.
 */
export const SAVE_SCHEMA_VERSION = 1

/**
 * Thrown by `deserialize` on any failure that prevents reconstructing an
 * `EngineState` from JSON: parse error, missing envelope, missing/mismatched
 * `schema_version`, or missing inner `state` object. Carries the underlying
 * cause via `Error.cause` when one exists (e.g. SyntaxError from JSON.parse)
 * so callers can surface debug info without leaking internals.
 */
export class SaveLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SaveLoadError'
  }
}

/**
 * Wrap an `EngineState` in the versioned envelope and serialize to a JSON
 * string. Pure — never throws on a well-formed EngineState (all engine state
 * is JSON-safe by construction: numbers, strings, booleans, plain objects,
 * and arrays thereof).
 */
export function serialize(state: EngineState): string {
  return JSON.stringify({
    schema_version: SAVE_SCHEMA_VERSION,
    state,
  })
}

/**
 * Parse a save string back into an EngineState. Validates the envelope shape
 * and `schema_version` before returning the inner state.
 *
 * Throws `SaveLoadError` on:
 *   - invalid JSON (wrapped JSON.parse SyntaxError)
 *   - non-object root
 *   - missing or non-numeric `schema_version`
 *   - `schema_version !== SAVE_SCHEMA_VERSION`
 *   - missing `state` object
 *
 * The returned EngineState is structurally trusted (engine code re-validates
 * via TypeScript at compile time and via `createEngineFromSavedState` at
 * runtime by passing it to `createEngine`). We don't deep-validate every
 * field here — the engine surface contract assumes JSON-faithful round trips
 * from `serialize`, not arbitrary user-authored JSON.
 */
export function deserialize(json: string): EngineState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (cause) {
    throw new SaveLoadError('Save data is not valid JSON.', { cause })
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new SaveLoadError('Save envelope is missing — expected an object.')
  }

  const envelope = parsed as { schema_version?: unknown; state?: unknown }

  if (typeof envelope.schema_version !== 'number') {
    throw new SaveLoadError('Save envelope is missing `schema_version`.')
  }

  if (envelope.schema_version !== SAVE_SCHEMA_VERSION) {
    throw new SaveLoadError(
      `Save schema_version ${envelope.schema_version} does not match expected ${SAVE_SCHEMA_VERSION}.`,
    )
  }

  if (envelope.state === null || typeof envelope.state !== 'object') {
    throw new SaveLoadError('Save envelope is missing `state` object.')
  }

  // Trusted cast: shape matches by contract (we wrote it via `serialize`).
  return envelope.state as EngineState
}
