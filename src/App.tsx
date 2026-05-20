// T-021 — App shell. Expanded in T-026 to host:
//   - the threshold warning banner above the panel grid
//   - the right-sidebar event feed alongside the 4 panels
//   - the postmortem screen as a full takeover when `state.game_over === true`
//     (TopBar stays visible above it)
//
// T-034 — Replaces the static `.app__main-panels` flex stack with the
// `<PanelLayer>` floating-card layer. The four panels are now draggable +
// resizable cards anchored to the surface; layout persists to localStorage
// under `mandate.layout.v1` (independent of T-028's save format).
//
// T-036 — App-level routing on `route.kind`. The shell decides which top-level
// screen to render: MainMenu when idle, the dashboard when playing, and the
// PauseOverlay layered on top when `paused-menu`. Esc during `playing` opens
// the pause overlay; Esc during `paused-menu` is handled by the overlay
// itself (resume or close confirm).
//
// The store is the singleton — `getGameStore()` returns the same instance for
// every component on the page. Restart works by tearing down that singleton
// (`resetGameStoreSingleton()` inside `<PostmortemScreen />`) and bumping
// `resetKey` here so the dashboard subtree re-mounts. The bump forces every
// child that resolves the singleton to pick up the freshly-constructed one.

import { useEffect, useState } from 'react'

import './App.css'

import { EventFeed } from '@ui/components/EventFeed'
import { PanelLayer } from '@ui/components/PanelLayer'
import { PlayerCountryCard } from '@ui/components/PlayerCountryCard'
import { TopBar } from '@ui/components/TopBar'
import { WarningBanner } from '@ui/components/WarningBanner'
import { useTickLoop } from '@ui/hooks/useTickLoop'
import { useOnboarding } from '@ui/onboarding/useOnboarding'
import { MainMenu } from '@ui/screens/MainMenu'
import { PauseOverlay } from '@ui/screens/PauseOverlay'
import { PostmortemScreen } from '@ui/screens/PostmortemScreen'
import { getGameStore } from '@ui/stores/gameStore'

type AppContentProps = {
  /**
   * Called by the postmortem's Restart button (after the singleton has been
   * torn down). The parent bumps `resetKey` to force `AppContent` to re-mount
   * with the freshly-constructed singleton.
   */
  onRestart: () => void
}

function AppContent({ onRestart }: AppContentProps) {
  // Singleton store resolved once per AppContent mount. After a restart, the
  // parent re-mounts AppContent with a fresh `key` and this call resolves the
  // newly-constructed singleton.
  const store = getGameStore()
  useTickLoop(store)
  // T-033 — Mount the onboarding hook. It gates itself on the
  // `mandate.onboarding.v1` flag + the engine tick count; the returned
  // `TourElement` is `null` until the tour actually fires (after the first
  // tick on a fresh localStorage). Rendered into the dashboard branch below
  // so the joyride anchors are all in scope.
  const { TourElement } = useOnboarding({ store })

  // T-036 — Top-level route. Drives which top-level surface renders. We
  // select with `s.route.kind` so re-renders fire only on route transitions,
  // not on every snapshot tick.
  const routeKind = store((s) => s.route.kind)

  // Subscribe to just `game_over` so the dashboard ↔ postmortem swap fires
  // only on the transition, not on every snapshot update.
  const gameOver = store((s) => s.snapshot.game_over)

  // T-035 — Narrow selectors for the PlayerCountryCard. Re-renders fire only
  // when these specific slices change. The card itself is dumb: receives a
  // Country + trends + active_decrees and renders. Phase 3 will pull the same
  // three slices from a country index keyed by id.
  const country = store((s) => s.snapshot.country)
  const activeDecrees = store((s) => s.snapshot.active_decrees)
  const approvalTrend = store((s) => s.trends.approval)
  const treasuryTrend = store((s) => s.trends.treasury)

  // T-036 — Esc during `playing` opens the pause overlay. Esc during
  // `paused-menu` is handled by the overlay itself (which closes the confirm
  // modal first if open, else resumes). We attach at the window level so
  // any focused element catches the key.
  useEffect(() => {
    if (routeKind !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        store.getState().openPauseMenu()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [routeKind, store])

  // --- Route branches ----------------------------------------------------

  if (routeKind === 'menu') {
    // The MainMenu screen owns its own layout — no TopBar / sidebar.
    return <MainMenu store={store} />
  }

  // Playing or paused-menu: dashboard is mounted. Pause overlay layered on
  // top when route is paused-menu.
  return (
    <>
      <TopBar />
      {gameOver ? (
        <PostmortemScreen onRestart={onRestart} />
      ) : (
        <main className="app__main">
          <WarningBanner />
          {/* T-034: the panel grid becomes a floating layer (PanelLayer) and
              the event feed continues to live in a sticky sidebar slot. The
              `app__main-grid` keeps the two-column layout; only the left
              column markup changed. */}
          <div className="app__main-grid">
            <div className="app__panels-host" data-testid="panels-host">
              {/* T-035 — PlayerCountryCard pinned to PLAYER_CARD_ZONE inside
                  the panels-host. It is part of the HUD layer (above
                  PanelLayer in z-order); the panel positions already steer
                  clear of the zone so a cold load has no overlap. */}
              <PlayerCountryCard
                country={country}
                trends={{ approval: approvalTrend, treasury: treasuryTrend }}
                activeDecrees={activeDecrees}
              />
              <PanelLayer />
            </div>
            <aside className="app__sidebar">
              <EventFeed />
            </aside>
          </div>
        </main>
      )}
      {routeKind === 'paused-menu' && <PauseOverlay store={store} />}
      {/* T-033 — Joyride overlay portal. Returns `null` while the tour is
          inactive; the dashboard subtree renders normally underneath. */}
      {TourElement}
    </>
  )
}

function App() {
  // Bump this on restart to force `AppContent` to re-mount with the freshly
  // constructed singleton store. Every child that resolves `getGameStore()`
  // then sees the new instance.
  const [resetKey, setResetKey] = useState(0)
  const handleRestart = () => setResetKey((k) => k + 1)

  return <AppContent key={resetKey} onRestart={handleRestart} />
}

export default App
