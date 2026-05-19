// T-029 — Acceptance harness for [[Player View]].
//
// Player View is the only Phase 1 system page whose ACs are entirely
// UI-rendered. Per the T-029 brief, this file owns one cross-panel
// integration test that mounts an app-shaped subtree (TopBar + the four
// panels + EventFeed) wired against the singleton store, and exercises one
// happy-path flow (slider change → tick advance → event feed updates) to
// prove the panels and the top bar are wired through a single snapshot.
// The dedicated per-AC proofs live in the existing component specs (cited
// per AC below).
//
// Why this file is .ts (engine-folder convention) but uses RTL: the
// acceptance harness explicitly co-locates one .spec per system page under
// test/engine/acceptance/. Player View is UI-only, so this file imports
// React + RTL — but stays inside the acceptance folder so vault-syncer's
// system-page → test-file mapping is uniform.
//
// Mounting strategy: we don't import the `src/App` module directly (no path
// alias is mapped to it, and the lint rule forbids `../../` deep relative
// imports under test/). Instead we render the same composition the App.tsx
// shell defines, using the `@ui/*` aliases that are valid in tests. This
// keeps the integration test in sync with App.tsx by structure — adding a
// panel here is a one-line mirror.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { EventFeed } from '@ui/components/EventFeed'
import { TopBar } from '@ui/components/TopBar'
import { WarningBanner } from '@ui/components/WarningBanner'
import { EconomyPanel } from '@ui/panels/EconomyPanel'
import { OverviewPanel } from '@ui/panels/OverviewPanel'
import { PoliticsPanel } from '@ui/panels/PoliticsPanel'
import { SocietyPanel } from '@ui/panels/SocietyPanel'
import { getGameStore, resetGameStoreSingleton } from '@ui/stores/gameStore'

/**
 * Mirror of the `AppContent` composition in `src/App.tsx` (Player View shell
 * in its not-game-over branch). All four panels + the top bar + the event
 * feed render against the singleton store — same as the production app.
 */
function PlayerViewShell() {
  return (
    <>
      <TopBar />
      <main className="app__main">
        <WarningBanner />
        <div className="app__main-grid">
          <div className="app__main-panels">
            <OverviewPanel />
            <EconomyPanel />
            <SocietyPanel />
            <PoliticsPanel />
          </div>
          <aside className="app__sidebar">
            <EventFeed />
          </aside>
        </div>
      </main>
    </>
  )
}

// T-036 — The singleton now starts idle (`route.kind === 'menu'`, engine
// null) so the main-menu flow can boot a fresh run. The Player View
// acceptance shell expects an engine, so each test boots one with a fixed
// seed before mounting. This mirrors what MainMenu does in production after
// the player clicks "Start".
beforeEach(() => {
  getGameStore().getState().bootEngine({ seed: 1 })
})

afterEach(() => {
  cleanup()
  resetGameStoreSingleton()
})

describe('Player View — Acceptance Criteria (Phase 1)', () => {
  // AC #1 — "All 4 sections (Overview / Economy / Society / Politics) render
  // data from Aurelia correctly."
  // Per-panel proofs: test/ui/OverviewPanel.spec.tsx,
  // test/ui/EconomyPanel.spec.tsx, test/ui/SocietyPanel.spec.tsx,
  // test/ui/PoliticsPanel.spec.tsx (T-022 → T-025). Here we prove the four
  // panels mount together inside the App shell against the same Aurelia
  // snapshot.
  it('AC: all 4 sections (Overview / Economy / Society / Politics) render together in the App shell', () => {
    render(<PlayerViewShell />)

    // Top bar visible (always-on Player View element).
    expect(screen.getByTestId('topbar')).toBeInTheDocument()

    // Each of the 4 panels rendered its root testid.
    expect(screen.getByTestId('overview-panel')).toBeInTheDocument()
    expect(screen.getByTestId('economy-panel')).toBeInTheDocument()
    expect(screen.getByTestId('society-panel')).toBeInTheDocument()
    expect(screen.getByTestId('politics-panel')).toBeInTheDocument()

    // Cross-panel data consistency on first paint: top bar approval and
    // OverviewPanel approval both come from the same snapshot (56 for
    // Aurelia at tick 0).
    expect(screen.getByTestId('approval').textContent).toContain('56')
    expect(screen.getByTestId('overview-approval').textContent).toContain('56')

    // Sidebar event feed rendered (empty on first paint — no events fired
    // before any tick).
    expect(screen.getByTestId('event-feed')).toBeInTheDocument()
  })

  // AC #2 — "Top bar updates each tick."
  // Per-component proof: test/ui/TopBar.spec.tsx — "T-021 AC#2 — top bar
  // updates every tick". Here we prove the integrated update path:
  // applying a decision → advancing the store → TopBar visibly reflects the
  // new tick AND a downstream panel (Economy) reflects the same commit.
  it('AC: top bar updates each tick — driving advance() in the App shell reflects across TopBar + Economy panel', () => {
    render(<PlayerViewShell />)

    // Capture initial calendar string + slider value before advancing.
    const calendarBefore = screen.getByTestId('calendar').textContent ?? ''
    expect(calendarBefore).toContain('Tick 0')
    expect(screen.getByTestId('slider-tax_income-value').textContent).toContain('25')

    // Commit a slider change via the live UI input. The Slider component
    // commits on mouseUp (per T-023 contract) — fireEvent.change then
    // fireEvent.mouseUp simulates the full drag-and-release.
    const taxIncome = screen.getByLabelText('Income tax') as HTMLInputElement
    fireEvent.change(taxIncome, { target: { value: '30' } })
    fireEvent.mouseUp(taxIncome)

    // Advance the engine once via the store (the tick-loop hook stays paused
    // since initial speed is 0). The decision queued by the mouseUp commit
    // drains at stage 0 of this tick.
    const store = getGameStore()
    act(() => {
      store.getState().advance()
    })

    // TopBar advanced to tick 1.
    expect(screen.getByTestId('calendar').textContent).toContain('Tick 1')
    // Economy panel slider value reflects the committed change (30).
    expect(screen.getByTestId('slider-tax_income-value').textContent).toContain('30')
    // Event feed got at least one new event (PolicyChanged for the commit).
    // The empty placeholder is gone.
    expect(screen.queryByTestId('event-feed-empty')).toBeNull()
    expect(screen.getAllByTestId('event-feed-item').length).toBeGreaterThan(0)
  })

  // AC #3 — "Trend strip shows last TREND_HISTORY_TICKS of any displayed
  // scalar."
  // Proofs: test/ui/OverviewPanel.spec.tsx — "T-022 AC#2 — trend strips show
  // data accumulated over the last ≤ TREND_HISTORY_TICKS ticks";
  // test/ui/gameStore.trends.spec.ts — "T-022 AC#2 — trends buffer caps at
  // TREND_HISTORY_TICKS (oldest dropped)". Structural cite only.
  it('AC: trend strip shows last TREND_HISTORY_TICKS — covered by `test/ui/OverviewPanel.spec.tsx` (T-022 AC#2) and `test/ui/gameStore.trends.spec.ts`', () => {
    expect(true).toBe(true)
  })

  // AC #4 — "Slider changes preview 'predicted impact' before commit (Phase
  // 1: directional ranges, not exact numbers)."
  // Proofs: test/ui/dryTick.spec.ts and test/ui/SliderPreview.spec.tsx.
  // Structural cite only.
  it('AC: slider preview before commit — covered by `test/ui/dryTick.spec.ts` and `test/ui/SliderPreview.spec.tsx`', () => {
    expect(true).toBe(true)
  })

  // AC #5 — "Threshold-crossed warnings appear and don't spam."
  // Proof: test/ui/WarningBanner.spec.tsx — "approval crashing below 30 →
  // exactly one ApprovalThresholdCrossed(below, 30) event fires across
  // consecutive ticks" + "crossing different thresholds (30, 20) fires one
  // event per distinct threshold". Structural cite only.
  it('AC: threshold-crossed warnings appear and do not spam — covered by `test/ui/WarningBanner.spec.tsx`', () => {
    expect(true).toBe(true)
  })
})
