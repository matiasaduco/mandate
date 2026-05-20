// T-033 — Onboarding hook.
//
// Owns the joyride lifecycle. Mounted unconditionally inside the `playing`
// route branch of `<App>`; gates its own behavior on the `mandate.onboarding.v1`
// flag + the engine tick count.
//
// Contract:
//   - On mount, reads `isOnboardingCompleted()`. If true → no-op for this
//     session (the tour does not re-launch on subsequent runs — AC #3).
//   - If not completed, watches the engine snapshot tick. The tour activates
//     the FIRST time the tick transitions from 0 to a positive value
//     (Resolved Decision #1: "after 1 tick" = after the first `advance()`).
//   - On tour start: calls `store.startTour()` (which saves prior speed +
//     pauses the engine).
//   - On tour end / skip: calls `store.endTour()` (restores speed) and
//     persists completion via `markOnboardingCompleted(skipped)`.
//
// Idempotency: the host component re-mounting must NOT relaunch the tour
// once it has been completed (Edge Case in brief). The `localStorage` read at
// hook startup handles that — a remount that finds `completed === true`
// returns early.
//
// The hook returns the `<Joyride>` element to render (or `null` when the
// tour is not active). The caller mounts it inside the dashboard subtree so
// it lives within the same DOM root as the tour anchors.

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Joyride, STATUS, type EventData } from 'react-joyride'

import {
  isOnboardingCompleted,
  markOnboardingCompleted,
  TOUR_OPTIONS,
  TOUR_STEPS,
} from '@ui/onboarding/tour'
import type { GameStore } from '@ui/stores/gameStore'

export type UseOnboardingOptions = {
  /** Game store handle. The hook calls `startTour` / `endTour` actions on it. */
  store: GameStore
}

export type UseOnboardingReturn = {
  /**
   * The `<Joyride>` element ready to mount. `null` until the tour decides to
   * fire (or `null` permanently if the tour was already completed). The host
   * renders this unconditionally — joyride's overlay portal handles its own
   * stacking.
   */
  TourElement: ReactElement | null
  /**
   * `true` once the tour has launched in this session. Diagnostic — the hook
   * does not require callers to read it.
   */
  running: boolean
}

/**
 * React hook that wires joyride to the game store. See module header for the
 * full contract.
 */
export function useOnboarding({ store }: UseOnboardingOptions): UseOnboardingReturn {
  // Capture the "is this run gated" decision ONCE at mount. A subsequent
  // localStorage flip from elsewhere in the app (e.g. the player clearing
  // the flag mid-session via Settings) requires the host component to
  // re-mount to take effect — matching the behavior of the menu's
  // `checkSaveAvailable()` lazy initializer (T-036).
  const [gated] = useState<boolean>(() => isOnboardingCompleted())

  // `running` flips to true the first time we decide to launch the tour. It
  // stays true until the tour completes / skips — joyride's `run` prop reads
  // this so the overlay mounts / unmounts in sync.
  const [running, setRunning] = useState<boolean>(false)

  // Guard against double-firing the auto-launch. Once `hasAutoLaunched.current`
  // is true we never set `running` from the tick watcher again — only an
  // explicit replay path (Settings button → clearOnboardingCompleted +
  // host remount) can re-arm the hook.
  const hasAutoLaunched = useRef<boolean>(false)

  // --- Auto-launch on the first tick ------------------------------------
  //
  // Subscribe to Zustand state changes and fire the tour the first time the
  // snapshot's `tick` goes from 0 to a positive value. Using a store
  // subscription (rather than `useEffect` on a selector) keeps the gate
  // outside the React render cycle — the tick transition might happen in a
  // microtask scheduled by the tick loop, and we want to react to it
  // immediately rather than wait for the next render.
  useEffect(() => {
    if (gated) return
    // Defensive early-out: if the engine is already past tick 0 at mount
    // (e.g. host re-mounted mid-session — shouldn't happen in app code but
    // is reachable in tests), launch immediately rather than wait for
    // another tick.
    if (!hasAutoLaunched.current && store.getState().snapshot.tick > 0) {
      hasAutoLaunched.current = true
      store.getState().startTour()
      setRunning(true)
      return
    }
    const unsubscribe = store.subscribe((state) => {
      if (hasAutoLaunched.current) return
      if (state.snapshot.tick > 0) {
        hasAutoLaunched.current = true
        store.getState().startTour()
        setRunning(true)
      }
    })
    return unsubscribe
  }, [gated, store])

  // --- Joyride event handler ---------------------------------------------
  //
  // react-joyride v3 fires `onEvent` on every lifecycle transition. We act
  // on the terminal states (FINISHED / SKIPPED) — both end the tour and
  // persist completion. The `skipped` flag distinguishes them so the
  // persisted record carries the right semantic.
  const handleEvent = (data: EventData): void => {
    const { status } = data
    const isFinished = status === STATUS.FINISHED
    const isSkipped = status === STATUS.SKIPPED
    if (isFinished || isSkipped) {
      setRunning(false)
      store.getState().endTour()
      markOnboardingCompleted(isSkipped)
    }
  }

  // The `<Joyride>` element. Mounted only once `running === true` — joyride
  // itself has a `run` prop, but we additionally gate rendering so the
  // overlay portal doesn't sit in the DOM as a no-op while waiting for the
  // first tick.
  const TourElement = running ? (
    <Joyride
      {...TOUR_OPTIONS}
      steps={[...TOUR_STEPS]}
      run={running}
      onEvent={handleEvent}
    />
  ) : null

  return { TourElement, running }
}
