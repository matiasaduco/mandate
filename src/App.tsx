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
// The store is the singleton — `getGameStore()` returns the same instance for
// every component on the page. Restart works by tearing down that singleton
// (`resetGameStoreSingleton()` inside `<PostmortemScreen />`) and bumping
// `resetKey` here so the dashboard subtree re-mounts. The bump forces every
// child that resolves the singleton to pick up the freshly-constructed one.

import { useState } from 'react'

import './App.css'

import { EventFeed } from '@ui/components/EventFeed'
import { PanelLayer } from '@ui/components/PanelLayer'
import { TopBar } from '@ui/components/TopBar'
import { WarningBanner } from '@ui/components/WarningBanner'
import { useTickLoop } from '@ui/hooks/useTickLoop'
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

  // Subscribe to just `game_over` so the dashboard ↔ postmortem swap fires
  // only on the transition, not on every snapshot update.
  const gameOver = store((s) => s.snapshot.game_over)

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
              {/* T-035 reserves the top-left zone for the PlayerCountryCard.
                  PanelLayer's default positions already steer clear of it; we
                  don't mount the card here — that's T-035 scope. */}
              <PanelLayer />
            </div>
            <aside className="app__sidebar">
              <EventFeed />
            </aside>
          </div>
        </main>
      )}
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
