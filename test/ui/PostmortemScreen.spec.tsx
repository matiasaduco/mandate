// T-026 — PostmortemScreen component tests.
//
// AC#4 — Postmortem screen shows after `GameOver` and the simulation panels
// are frozen.
//
// Strategy: the component reads `snapshot.game_over_reason` from the store;
// we force the reason directly via `setState` so each test exercises one
// branch deterministically. A separate integration test renders <App /> with
// the singleton in a game-over state to confirm the dashboard panels are
// swapped out for the postmortem.

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import type { GameOverReason } from '@engine/types'
import { PostmortemScreen } from '@ui/screens/PostmortemScreen'
import {
  createGameStore,
  getGameStore,
  resetGameStoreSingleton,
  type GameStore,
} from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  cleanup()
  store?.destroy()
  store = null
  // Tear down the singleton between tests so App-level integration tests
  // don't leak engine subscriptions across runs.
  resetGameStoreSingleton()
})

/**
 * Helper: force the snapshot into game-over state with a chosen reason.
 * Bypasses the engine — we are testing the postmortem surface, not the
 * stage-7 loss logic (which has its own engine acceptance tests in T-016).
 */
function forceGameOver(s: GameStore, reason: GameOverReason): void {
  s.setState((prev) => ({
    snapshot: {
      ...prev.snapshot,
      game_over: true,
      game_over_reason: reason,
    },
  }))
}

describe('T-026 AC#4 — postmortem shows after GameOver with reason copy', () => {
  it('renders the bankruptcy headline + body when reason is bankruptcy', () => {
    store = createGameStore({ seed: 1 })
    forceGameOver(store, 'bankruptcy')

    render(<PostmortemScreen store={store} />)

    expect(screen.getByTestId('postmortem-headline')).toHaveTextContent('Bankruptcy')
    expect(screen.getByTestId('postmortem-body').textContent).toMatch(/treasury collapsed/i)
    expect(screen.getByTestId('postmortem')).toHaveAttribute('data-reason', 'bankruptcy')
  })

  it('renders the mass uprising headline + body when reason is mass_uprising', () => {
    store = createGameStore({ seed: 1 })
    forceGameOver(store, 'mass_uprising')

    render(<PostmortemScreen store={store} />)

    expect(screen.getByTestId('postmortem-headline')).toHaveTextContent('Mass uprising')
    expect(screen.getByTestId('postmortem-body').textContent).toMatch(/people have lost faith/i)
    expect(screen.getByTestId('postmortem')).toHaveAttribute('data-reason', 'mass_uprising')
  })

  it('shows final tick, approval, and treasury from the snapshot', () => {
    store = createGameStore({ seed: 1 })
    forceGameOver(store, 'bankruptcy')

    render(<PostmortemScreen store={store} />)

    // Aurelia start values surface verbatim: tick 0, approval 56, treasury 50000.
    expect(screen.getByTestId('postmortem-tick')).toHaveTextContent('0')
    expect(screen.getByTestId('postmortem-approval').textContent).toMatch(/56/)
    expect(screen.getByTestId('postmortem-treasury').textContent).toMatch(/50,000/)
  })

  it('renders a Restart button that fires the onRestart callback and resets the singleton', () => {
    // Use the singleton so the restart path actually resets it (the production
    // behaviour the AC describes).
    const singleton = getGameStore()
    forceGameOver(singleton, 'bankruptcy')
    // Advance once so the singleton's tick is non-zero — proves the restart
    // returns to a fresh tick=0 store.
    act(() => {
      // Game-over is true so the engine no-ops on tick; mutate tick directly
      // for the precondition.
      singleton.setState((prev) => ({
        snapshot: { ...prev.snapshot, tick: 5 },
      }))
    })
    expect(getGameStore().getState().snapshot.tick).toBe(5)

    const onRestart = vi.fn()
    render(<PostmortemScreen onRestart={onRestart} />)

    act(() => {
      screen.getByTestId('postmortem-restart').click()
    })

    expect(onRestart).toHaveBeenCalledTimes(1)
    // After reset, the next getGameStore() lazily constructs a fresh store
    // (Aurelia at tick 0). The restart handler called resetGameStoreSingleton.
    expect(getGameStore().getState().snapshot.tick).toBe(0)
    expect(getGameStore().getState().snapshot.game_over).toBe(false)
  })
})

describe('T-026 AC#4 — engine end-to-end drives game_over', () => {
  it('forcing bankruptcy conditions for BANKRUPTCY_NEGATIVE_BALANCE_TICKS ticks triggers game_over', () => {
    // Construct an initial state already deep in bankruptcy: treasury < 0 and
    // balance < 0. Stage 7 increments the bankruptcy counter each tick under
    // those conditions and flips game_over after BANKRUPTCY_NEGATIVE_BALANCE_TICKS.
    const initial = createAureliaState()
    initial.country.treasury = -10_000
    initial.flows.balance = -1_000
    // Zero all tax sliders + budget shares so flows.balance stays < 0 every
    // tick (stage 2 recomputes flows from sliders).
    initial.country.sliders.tax_income = 0
    initial.country.sliders.tax_corporate = 0
    initial.country.sliders.tax_consumption = 0
    initial.country.target_budget = 1_000
    for (const k of Object.keys(initial.country.budget_shares) as Array<
      keyof typeof initial.country.budget_shares
    >) {
      initial.country.budget_shares[k] = 0
    }
    initial.country.budget_shares.health = 1.0

    store = createGameStore({ seed: 1, initialState: initial })

    // Drive enough ticks to exceed BANKRUPTCY_NEGATIVE_BALANCE_TICKS. The
    // exact value comes from the tunable but 20 ticks is comfortably above
    // any P1 threshold.
    act(() => {
      for (let i = 0; i < 20; i++) {
        store!.getState().advance()
      }
    })

    expect(store!.getState().snapshot.game_over).toBe(true)
    expect(store!.getState().snapshot.game_over_reason).toBe('bankruptcy')
  })
})
