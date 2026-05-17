// T-021 — App shell.
//
// Replaces the Vite scaffold with the first real app surface: a single
// always-visible TopBar plus a `<main>` slot the next UI tickets will fill
// (T-022 Overview, T-023 Economy, T-024 Society, T-025 Politics, T-026 Event
// Feed). useTickLoop is mounted once at the root so the simulation drives
// itself as soon as the user picks a non-zero speed. The store starts at
// speed=0 (paused), so the loop is a no-op until then.

import './App.css'

import { TopBar } from '@ui/components/TopBar'
import { useTickLoop } from '@ui/hooks/useTickLoop'
import { EconomyPanel } from '@ui/panels/EconomyPanel'
import { OverviewPanel } from '@ui/panels/OverviewPanel'
import { getGameStore } from '@ui/stores/gameStore'

function App() {
  // Singleton store resolved once. useTickLoop reads `speed` reactively from
  // the same store TopBar writes to, so clicking a speed button immediately
  // starts/stops the loop.
  useTickLoop(getGameStore())

  return (
    <>
      <TopBar />
      <main className="app__main">
        <OverviewPanel />
        <EconomyPanel />
        {/* Remaining panels arrive in T-024 (Society) → T-025 (Politics) and T-026 (Event Feed). */}
      </main>
    </>
  )
}

export default App
