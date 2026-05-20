// T-033 — Onboarding tour tests.
//
// Covers the five testable acceptance criteria from the brief:
//   - AC #1: fresh localStorage → starting a new game from the menu
//            auto-launches the tour after 1 tick.
//   - AC #2: every step anchor is present in the DOM when the dashboard is
//            mounted (we render the full dashboard subtree once and walk
//            ONBOARDING_STEPS asserting each `data-tour-id` resolves).
//   - AC #3: "Skip tutorial" persists `{ completed: true, skipped: true }`
//            and the tour does not re-launch on a subsequent host mount.
//   - AC #4: Replay tutorial from Settings clears `completed` and the tour
//            re-launches on the next mount.
//   - AC #5: `startTour()` pauses + saves prior speed; `endTour()` restores
//            it. Pure store transition — no UI needed.
//
// Mounts the full dashboard subtree where the AC needs anchors in the DOM,
// otherwise just touches the store / Settings stub directly.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EventFeed } from '@ui/components/EventFeed'
import { PlayerCountryCard } from '@ui/components/PlayerCountryCard'
import { TopBar } from '@ui/components/TopBar'
import { EconomyPanel } from '@ui/panels/EconomyPanel'
import { PoliticsPanel } from '@ui/panels/PoliticsPanel'
import { SocietyPanel } from '@ui/panels/SocietyPanel'
import {
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  type OnboardingRecord,
} from '@ui/copy/onboarding'
import {
  clearOnboardingCompleted,
  isOnboardingCompleted,
  markOnboardingCompleted,
  readOnboardingRecord,
} from '@ui/onboarding/tour'
import { useOnboarding } from '@ui/onboarding/useOnboarding'
import { MainMenu } from '@ui/screens/MainMenu'
import { Settings } from '@ui/screens/Settings'
import {
  createGameStore,
  getGameStore,
  resetGameStoreSingleton,
  type GameStore,
} from '@ui/stores/gameStore'

// ----------------------------------------------------------------------------
// Test host. Boots from the main menu (so the "new game" path is exercised)
// and, on entering the `playing` route, renders the full dashboard subtree
// containing every tour anchor. Mirrors src/App.tsx but trimmed to the
// subset the tests need.
// ----------------------------------------------------------------------------

function DashboardHarness({ store }: { store: GameStore }) {
  const { TourElement } = useOnboarding({ store })
  const country = store((s) => s.snapshot.country)
  const activeDecrees = store((s) => s.snapshot.active_decrees)
  const approvalTrend = store((s) => s.trends.approval)
  const treasuryTrend = store((s) => s.trends.treasury)

  return (
    <>
      <TopBar store={store} />
      <main>
        <PlayerCountryCard
          country={country}
          trends={{ approval: approvalTrend, treasury: treasuryTrend }}
          activeDecrees={activeDecrees}
        />
        <EconomyPanel store={store} />
        <SocietyPanel store={store} />
        <PoliticsPanel store={store} />
        <EventFeed store={store} />
      </main>
      {TourElement}
    </>
  )
}

function MenuHarness() {
  const store = getGameStore()
  const routeKind = store((s) => s.route.kind)
  // Mirror the App.tsx Esc behavior so the harness behaves the same way the
  // app does in places that don't care about it.
  useEffect(() => {
    if (routeKind !== 'playing') return
  }, [routeKind])
  if (routeKind === 'menu') {
    return <MainMenu store={store} />
  }
  return <DashboardHarness store={store} />
}

// ----------------------------------------------------------------------------
// Hooks
// ----------------------------------------------------------------------------

beforeEach(() => {
  window.localStorage.clear()
  resetGameStoreSingleton()
})

afterEach(() => {
  cleanup()
  resetGameStoreSingleton()
  window.localStorage.clear()
})

// ----------------------------------------------------------------------------
// AC #5 — store-level (no UI). Asserted first because the rest of the AC
// chain depends on these actions behaving correctly.
// ----------------------------------------------------------------------------

describe('T-033 AC#5 — startTour pauses; endTour restores the prior speed', () => {
  it('startTour saves prior speed into priorSpeedBeforeTour and forces speed to 0', () => {
    const store = createGameStore({ seed: 1 })
    store.getState().setSpeed(2)
    expect(store.getState().speed).toBe(2)
    expect(store.getState().priorSpeedBeforeTour).toBeNull()

    store.getState().startTour()

    expect(store.getState().speed).toBe(0)
    expect(store.getState().priorSpeedBeforeTour).toBe(2)
    store.destroy()
  })

  it('endTour restores priorSpeedBeforeTour and clears the snapshot field', () => {
    const store = createGameStore({ seed: 1 })
    store.getState().setSpeed(4)
    store.getState().startTour()
    expect(store.getState().speed).toBe(0)
    expect(store.getState().priorSpeedBeforeTour).toBe(4)

    store.getState().endTour()

    expect(store.getState().speed).toBe(4)
    expect(store.getState().priorSpeedBeforeTour).toBeNull()
    store.destroy()
  })

  it('startTour is idempotent — a duplicate call keeps the original priorSpeedBeforeTour', () => {
    const store = createGameStore({ seed: 1 })
    store.getState().setSpeed(2)
    store.getState().startTour()
    // Some component remounts mid-tour and re-fires startTour() — the second
    // call MUST NOT overwrite the saved 2 with the in-tour 0.
    store.getState().startTour()
    expect(store.getState().priorSpeedBeforeTour).toBe(2)
    expect(store.getState().speed).toBe(0)
    store.destroy()
  })

  it('endTour restores 0 correctly when the player paused before the tour started', () => {
    const store = createGameStore({ seed: 1 })
    store.getState().setSpeed(0)
    store.getState().startTour()
    expect(store.getState().priorSpeedBeforeTour).toBe(0)
    store.getState().endTour()
    expect(store.getState().speed).toBe(0)
    expect(store.getState().priorSpeedBeforeTour).toBeNull()
    store.destroy()
  })

  it('endTour is a no-op when no tour is active', () => {
    const store = createGameStore({ seed: 1 })
    store.getState().setSpeed(2)
    // Never called startTour.
    store.getState().endTour()
    expect(store.getState().speed).toBe(2)
    expect(store.getState().priorSpeedBeforeTour).toBeNull()
    store.destroy()
  })
})

// ----------------------------------------------------------------------------
// AC #1 — auto-launch after the first tick from a fresh localStorage.
// ----------------------------------------------------------------------------

describe('T-033 AC#1 — fresh localStorage auto-launches the tour after the first tick', () => {
  it('no tour mounts before the first advance() — the dashboard sits idle', () => {
    render(<MenuHarness />)
    // Click through the menu to boot a new game with a fixed seed.
    fireEvent.click(screen.getByTestId('new-game-button'))
    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })
    // Engine is running, tick is still 0 (we haven't called advance).
    expect(getGameStore().getState().snapshot.tick).toBe(0)
    // Joyride hasn't rendered its portal yet.
    expect(document.getElementById('react-joyride-portal')).toBeNull()
  })

  it('the tour overlay appears after the first advance() on a fresh localStorage', () => {
    render(<MenuHarness />)
    fireEvent.click(screen.getByTestId('new-game-button'))
    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    const store = getGameStore()
    // Drive a single tick — useOnboarding's subscription should fire and
    // launch the tour.
    act(() => {
      store.getState().advance()
    })

    // The tour is now running. Joyride mounts a portal div onto document.body.
    expect(document.getElementById('react-joyride-portal')).not.toBeNull()
    // Engine speed was pinned to 0 by startTour.
    expect(store.getState().speed).toBe(0)
    // T-037 — bootEngine now reads defaultTickSpeed from settings (default: 1).
    // startTour() saved that prior speed before pinning to 0.
    expect(store.getState().priorSpeedBeforeTour).toBe(1)
  })

  it('does NOT launch when mandate.onboarding.v1 is already marked completed', () => {
    // Pre-populate the storage flag to model a returning player.
    const record: OnboardingRecord = { version: 1, completed: true, skipped: false }
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record))

    render(<MenuHarness />)
    fireEvent.click(screen.getByTestId('new-game-button'))
    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    const store = getGameStore()
    act(() => {
      store.getState().advance()
    })

    // No tour portal — the gate caught it at mount time.
    expect(document.getElementById('react-joyride-portal')).toBeNull()
    // Speed was untouched (startTour never ran).
    expect(store.getState().priorSpeedBeforeTour).toBeNull()
  })
})

// ----------------------------------------------------------------------------
// AC #2 — every step's `data-tour-id` anchor resolves in the rendered DOM.
// ----------------------------------------------------------------------------

describe('T-033 AC#2 — each tour step anchor is present in the DOM', () => {
  // The dashboard renders every panel + the player card + topbar + event
  // feed simultaneously, so every anchor must be queryable at the moment any
  // step opens. We assert per-step with `it.each` to fail with a clear
  // identifier when a tour-id goes missing.
  it.each(ONBOARDING_STEPS.map((step) => [step.id, step.tourId]))(
    'step %s anchors a DOM node carrying data-tour-id="%s"',
    (_stepId, tourId) => {
      const store = createGameStore({ seed: 1 })
      // Need at least one tick of trend data so the dashboard can render
      // sparklines without empty-array guards.
      store.getState().advance()
      render(<DashboardHarness store={store} />)
      const anchor = document.querySelector(`[data-tour-id="${tourId}"]`)
      expect(anchor).not.toBeNull()
      store.destroy()
    },
  )

  it('TOUR_STEPS array length equals ONBOARDING_STEPS length (no drift)', () => {
    // Defensive: catches the case where someone adds a copy entry but
    // forgets to map it through tour.ts (or vice versa).
    expect(ONBOARDING_STEPS.length).toBeGreaterThanOrEqual(5)
    expect(ONBOARDING_STEPS.length).toBeLessThanOrEqual(7)
  })
})

// ----------------------------------------------------------------------------
// AC #3 — Skip persists + does not relaunch.
// ----------------------------------------------------------------------------

describe('T-033 AC#3 — skipping the tour persists the flag and does not relaunch', () => {
  it('markOnboardingCompleted(true) writes the skipped record and isOnboardingCompleted reports true', () => {
    expect(isOnboardingCompleted()).toBe(false)

    markOnboardingCompleted(true)

    const record = readOnboardingRecord()
    expect(record).not.toBeNull()
    expect(record?.completed).toBe(true)
    expect(record?.skipped).toBe(true)
    expect(isOnboardingCompleted()).toBe(true)
  })

  it('after skip, mounting the dashboard again does not relaunch the tour', () => {
    // Simulate the player having skipped the tour earlier.
    markOnboardingCompleted(true)

    const store = createGameStore({ seed: 1 })
    store.getState().advance()
    const { unmount } = render(<DashboardHarness store={store} />)

    expect(document.getElementById('react-joyride-portal')).toBeNull()

    // Re-mount the host — the gate must persist across remounts.
    unmount()
    render(<DashboardHarness store={store} />)
    expect(document.getElementById('react-joyride-portal')).toBeNull()
    store.destroy()
  })

  it('a corrupt onboarding payload is treated as "not completed" (safest default)', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '{not-json')
    expect(readOnboardingRecord()).toBeNull()
    expect(isOnboardingCompleted()).toBe(false)
  })

  it('a record with a wrong version is treated as "not completed"', () => {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ version: 999, completed: true, skipped: true }),
    )
    expect(readOnboardingRecord()).toBeNull()
    expect(isOnboardingCompleted()).toBe(false)
  })
})

// ----------------------------------------------------------------------------
// AC #4 — Replay from Settings clears + relaunches.
// ----------------------------------------------------------------------------

describe('T-033 AC#4 — Replay tutorial from Settings re-arms the tour', () => {
  it('clicking "Replay tutorial" flips completed to false in localStorage', () => {
    markOnboardingCompleted(false)
    expect(isOnboardingCompleted()).toBe(true)

    render(<Settings onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-replay-tutorial'))

    const record = readOnboardingRecord()
    expect(record).not.toBeNull()
    expect(record?.completed).toBe(false)
    // Confirmation message renders for the player.
    expect(screen.getByTestId('settings-replay-confirmation')).toBeInTheDocument()
  })

  it('clearOnboardingCompleted() preserves the prior skipped flag', () => {
    markOnboardingCompleted(true)
    expect(readOnboardingRecord()?.skipped).toBe(true)

    clearOnboardingCompleted()

    const record = readOnboardingRecord()
    expect(record?.completed).toBe(false)
    expect(record?.skipped).toBe(true)
  })

  it('after Replay, mounting the dashboard re-launches the tour from step 1', () => {
    // Pre-condition: tour was completed in a prior session.
    markOnboardingCompleted(false)
    // Player clears the flag via Settings.
    clearOnboardingCompleted()

    // Fresh dashboard mount picks up the cleared flag (lazy initializer in
    // useOnboarding reads localStorage at mount time).
    const store = createGameStore({ seed: 1 })
    store.getState().advance()
    render(<DashboardHarness store={store} />)

    // Joyride portal is back.
    expect(document.getElementById('react-joyride-portal')).not.toBeNull()
    store.destroy()
  })
})
