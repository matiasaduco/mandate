// T-036 AC#2 — After playing at least one tick and quitting to menu,
// "Continue" is enabled and restores the exact state.
//
// Integration-style flow: render <App />, boot a new game, advance ticks,
// open the pause overlay, click Quit. Then assert:
//   - The route is back at `menu`.
//   - The Continue button is enabled.
//   - Clicking Continue restores the snapshot exactly (deep equality of the
//     post-tick state).
//
// Also covers the autosave-failure edge case: when `localStorage.setItem`
// throws (e.g. quota), the route transition still completes — we don't
// trap the player in the dashboard.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTickLoop } from '@ui/hooks/useTickLoop'
import { MainMenu } from '@ui/screens/MainMenu'
import { PauseOverlay } from '@ui/screens/PauseOverlay'
import {
  getGameStore,
  resetGameStoreSingleton,
} from '@ui/stores/gameStore'

/**
 * Same TestApp shape as newGameFlow.spec.tsx — we can't import the App
 * module directly (no path alias; lint forbids `../../`). Two test files
 * carrying the same 20-line stub is acceptable; the duplication is bounded
 * and mirrors the player_view acceptance shell.
 */
function TestApp() {
  const store = getGameStore()
  useTickLoop(store)
  const routeKind = store((s) => s.route.kind)

  if (routeKind === 'menu') {
    return <MainMenu store={store} />
  }
  return (
    <>
      <div data-testid="dashboard-stub">Dashboard stub</div>
      {routeKind === 'paused-menu' && <PauseOverlay store={store} />}
    </>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  resetGameStoreSingleton()
})

afterEach(() => {
  cleanup()
  resetGameStoreSingleton()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('T-036 AC#2 — play → quit → continue restores the exact state', () => {
  it('after ticking and quitting, Continue is enabled and restores the snapshot exactly', () => {
    render(<TestApp />)

    // Boot a new game with a fixed seed so the trajectory is reproducible.
    fireEvent.click(screen.getByTestId('new-game-button'))
    fireEvent.click(screen.getByTestId('seed-toggle'))
    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: '4242' } })
    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    const store = getGameStore()
    expect(store.getState().route.kind).toBe('playing')

    // Advance 3 ticks via the store action.
    act(() => {
      for (let i = 0; i < 3; i++) store.getState().advance()
    })
    const preQuitSnapshot = structuredClone(store.getState().snapshot)
    expect(preQuitSnapshot.tick).toBe(3)

    // Open pause overlay and click Quit.
    act(() => {
      store.getState().openPauseMenu()
    })
    act(() => {
      fireEvent.click(screen.getByTestId('pause-quit'))
    })

    // Back at the menu, Continue should be enabled (autosave was written).
    expect(store.getState().route.kind).toBe('menu')
    expect(screen.getByTestId('continue-button')).not.toBeDisabled()

    // Click Continue. The store boots from the autosave.
    act(() => {
      fireEvent.click(screen.getByTestId('continue-button'))
    })

    // We're back in the playing route. The snapshot equals what we saved.
    expect(store.getState().route.kind).toBe('playing')
    expect(store.getState().snapshot).toEqual(preQuitSnapshot)
  })

  it('quit transition completes even when localStorage.setItem throws (autosave failure is non-blocking)', () => {
    render(<TestApp />)

    fireEvent.click(screen.getByTestId('new-game-button'))
    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    const store = getGameStore()
    act(() => {
      store.getState().advance()
    })

    // Force the autosave write to throw — simulates quota-exceeded.
    const setItemSpy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })

    act(() => {
      store.getState().openPauseMenu()
    })
    act(() => {
      fireEvent.click(screen.getByTestId('pause-quit'))
    })

    // Despite the throw, the route still flipped to menu.
    expect(store.getState().route.kind).toBe('menu')
    expect(setItemSpy).toHaveBeenCalled()
  })
})
