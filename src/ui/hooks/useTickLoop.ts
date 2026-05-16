// T-020 — Tick loop hook + speed controls.
//
// Drives the engine forward at the current `speed` setting by re-scheduling
// `gameStore.advance()` with `setTimeout` recursion. `setTimeout` (not
// `setInterval`) gives us clean cancel-on-pause semantics: when `speed` flips
// to 0, the effect cleanup clears the pending timer and no further ticks
// scheduled until `speed` becomes non-zero again.
//
// System contract (vault: 02 - Simulation / Time & Tick):
//   - Owns the wall-clock → tick mapping. Engine has no knowledge of real time.
//   - Interval at speed s is REAL_SECONDS_PER_TICK_AT_1X / s seconds. At
//     speed 0 the loop is cancelled (NOT scheduled with an infinite delay).
//   - Resume after pause does NOT catch up missed ticks: the next tick fires
//     after one full interval.
//
// Engine boundary (CLAUDE.md invariant #6): the hook never imports from
// `src/engine/**` except for the tunable constants (`SPEEDS`,
// `REAL_SECONDS_PER_TICK_AT_1X`) — pure values, no runtime engine handles. The
// engine event stream is consumed via `store.subscribeToEvents`, a thin
// passthrough added on the store in T-020.

import { useEffect } from 'react'

import {
  REAL_SECONDS_PER_TICK_AT_1X,
  SPEEDS,
} from '@engine/tunables'
import type { GameStore } from '@ui/stores/gameStore'

/**
 * Speed values the UI is allowed to write to the store. Anything outside this
 * set is rejected with a warning. Mirrors the `SPEEDS` tunable.
 */
const ALLOWED_SPEEDS: ReadonlySet<number> = new Set(SPEEDS)

/**
 * Wrap the store's `setSpeed` with vault-spec validation. Components and
 * `useTickLoop` should call this helper instead of touching `store.setSpeed`
 * directly so invalid values are uniformly rejected. The validation lives in
 * the UI (per vault System Contract for Time & Tick): the engine has no
 * concept of game speed.
 */
export function setSpeedSafe(store: GameStore, requested: number): void {
  if (!ALLOWED_SPEEDS.has(requested)) {
    console.warn(
      `[useTickLoop] setSpeed(${requested}) rejected — not in SPEEDS ${JSON.stringify(SPEEDS)}`,
    )
    return
  }
  store.getState().setSpeed(requested)
}

/**
 * Mount-once tick loop driver. Reads `speed` from the supplied store; when
 * speed > 0, recursively schedules `store.getState().advance()` every
 * `REAL_SECONDS_PER_TICK_AT_1X / speed` seconds. When speed = 0, cancels the
 * loop. Also subscribes (once) to the engine event stream and triggers
 * auto-pause on `ApprovalThresholdCrossed` and `TreasuryThresholdCrossed`.
 *
 * Idempotent if mounted multiple times — each invocation manages its own
 * timer + its own event subscription. App code should mount this exactly once
 * at the root (e.g. in `<App />`).
 *
 * Tests construct their own store via `createGameStore({ seed })` and pass it
 * in directly. App code passes the singleton from `getGameStore()`.
 */
export function useTickLoop(store: GameStore): void {
  // Drive re-runs on speed changes so the cleanup cancels any in-flight timer
  // before scheduling the next one. Reading speed via the Zustand hook (not
  // getState) is what triggers the effect to re-run.
  const speed = store((s) => s.speed)

  useEffect(() => {
    if (speed <= 0) {
      // Paused: nothing to schedule. The effect cleanup of the previous run
      // already cleared any pending timer.
      return
    }

    const intervalMs = (REAL_SECONDS_PER_TICK_AT_1X / speed) * 1000

    // setTimeout recursion: each tick schedules the next ONLY after the
    // current advance() resolves. If a tick exceeds the nominal interval, the
    // loop naturally degrades — no piling up of missed ticks. Resume after
    // pause therefore waits one full interval before the next tick (no
    // catch-up; see vault Time & Tick AC).
    let timerId: ReturnType<typeof setTimeout> | null = null

    const scheduleNext = () => {
      timerId = setTimeout(() => {
        // Pull `advance` via getState() each tick so we always invoke the
        // latest store action (no stale closure if the store is replaced —
        // even though in practice it never is).
        store.getState().advance()
        // Re-check inside the callback: if an auto-pause listener flipped
        // speed to 0 during this tick (synchronous emit inside advance()),
        // bail out and let the speed-change effect re-run handle scheduling.
        if (store.getState().speed > 0) {
          scheduleNext()
        }
      }, intervalMs)
    }

    scheduleNext()

    return () => {
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
      }
    }
  }, [store, speed])

  // Auto-pause: subscribe to the engine event bus once on mount. The listener
  // reads `setSpeedSafe` via the supplied `store` ref (stable across renders)
  // so we never need to re-subscribe on speed change. Events fire
  // synchronously inside `advance()` — by the time the setTimeout callback
  // checks `store.getState().speed` above, the auto-pause has already taken
  // effect.
  useEffect(() => {
    const unsubscribe = store.subscribeToEvents((event) => {
      if (
        event.type === 'ApprovalThresholdCrossed' ||
        event.type === 'TreasuryThresholdCrossed'
      ) {
        setSpeedSafe(store, 0)
      }
    })
    return unsubscribe
  }, [store])
}
