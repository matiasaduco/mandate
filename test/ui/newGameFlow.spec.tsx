// T-036 AC#3 — New game with an explicit seed is deterministic.
//
// The acceptance criterion: "New game" with an explicit seed produces a
// deterministic run identical to a direct `createEngine({ seed })` boot,
// proven by an RTL + engine integration test that ticks 5 times and compares
// snapshots.
//
// Strategy:
//   1. Ground truth: build a direct engine from `createAureliaState()` with
//      seed = 12345, tick 5 times, capture the final snapshot.
//   2. UI path: render <App /> → click "New game" → toggle "Use seed" →
//      enter 12345 → click "Start". The store now holds a freshly booted
//      engine.  Tick 5 times via the store action, capture the final
//      snapshot.
//   3. Assert the two snapshots are deeply equal.
//
// This proves the menu boot path uses exactly the same engine construction
// as `createEngine({ seed })` with no UI-side state injection that would
// drift determinism.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createEngine } from '@engine'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { useTickLoop } from '@ui/hooks/useTickLoop'
import { MainMenu } from '@ui/screens/MainMenu'
import { PauseOverlay } from '@ui/screens/PauseOverlay'
import {
  getGameStore,
  resetGameStoreSingleton,
} from '@ui/stores/gameStore'

/**
 * Mirror of `src/App.tsx`'s top-level route branching. We can't import the
 * App module directly (no path alias) and the lint rule forbids `../../`
 * deep relatives, so each route-aware test re-implements the same branch.
 * Mirrors the same pattern used in `test/engine/acceptance/player_view.spec.tsx`.
 */
function TestApp() {
  const store = getGameStore()
  useTickLoop(store)
  const routeKind = store((s) => s.route.kind)

  // Esc → openPauseMenu — same as App.tsx, so menu flow tests can assert
  // both the button and the keystroke path.
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

  if (routeKind === 'menu') {
    return <MainMenu store={store} />
  }
  // Determinism / restart tests don't care about the full dashboard — we
  // only need the route transitions and the pause overlay surface. Real
  // dashboard mounting lives in the player_view acceptance test.
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
})

describe('T-036 AC#3 — explicit-seed determinism (menu boot vs direct engine)', () => {
  it('starting a new game with seed=12345 produces the same snapshot after 5 ticks as a direct createEngine', () => {
    const SEED = 12345

    // --- Ground truth: direct engine boot + 5 ticks ---------------------
    const directEngine = createEngine(createAureliaState(), { seed: SEED })
    for (let i = 0; i < 5; i++) directEngine.tick()
    const directState = directEngine.tick.constructor // dummy ref so we have something
    // The engine doesn't expose getState() but tick() returns the snapshot.
    // To capture the post-5-tick state we run 4 ticks and read the 5th's
    // return value. We restart the engine to ensure a clean comparison.
    void directState
    const directEngine2 = createEngine(createAureliaState(), { seed: SEED })
    let directFinal = directEngine2.tick()
    for (let i = 0; i < 4; i++) directFinal = directEngine2.tick()

    // --- UI path: render App, click through to a booted engine ----------
    render(<TestApp />)

    // We start on the main menu. Click "New game", flip the seed toggle,
    // enter the seed, click Start.
    fireEvent.click(screen.getByTestId('new-game-button'))
    fireEvent.click(screen.getByTestId('seed-toggle'))
    fireEvent.change(screen.getByTestId('seed-input'), {
      target: { value: String(SEED) },
    })

    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    // The store is now playing with a fresh engine seeded at 12345.
    const store = getGameStore()
    const route = store.getState().route
    expect(route.kind).toBe('playing')
    if (route.kind === 'playing') {
      expect(route.seed).toBe(SEED)
    }

    // Tick 5 times via the store action — same code path useTickLoop uses.
    act(() => {
      for (let i = 0; i < 5; i++) store.getState().advance()
    })

    const menuFinal = store.getState().snapshot

    // Deep equality — the snapshot shape includes RNG cursor, decree state,
    // approval comparator, every POP, every sector. Any drift between the
    // menu boot path and the direct engine surfaces here.
    expect(menuFinal).toEqual(directFinal)
  })

  it('two consecutive new-game runs with the same seed produce identical snapshots', () => {
    // Stronger guarantee: the menu boot itself is repeatable. Run twice,
    // capture both final states, assert equality.
    const SEED = 7777

    const runOnce = (): unknown => {
      resetGameStoreSingleton()
      const { unmount } = render(<TestApp />)
      fireEvent.click(screen.getByTestId('new-game-button'))
      fireEvent.click(screen.getByTestId('seed-toggle'))
      fireEvent.change(screen.getByTestId('seed-input'), {
        target: { value: String(SEED) },
      })
      act(() => {
        fireEvent.click(screen.getByTestId('start-button'))
      })
      const store = getGameStore()
      act(() => {
        for (let i = 0; i < 5; i++) store.getState().advance()
      })
      const final = store.getState().snapshot
      unmount()
      return final
    }

    const a = runOnce()
    const b = runOnce()
    expect(a).toEqual(b)
  })
})

describe('T-036 AC#4 — Restart replays from tick 0 with the same seed', () => {
  it('after Restart, the engine evolves identically to the prior run from tick 0', () => {
    const SEED = 31337

    // --- First run: boot, tick 5, capture each tick's snapshot ----------
    render(<TestApp />)
    fireEvent.click(screen.getByTestId('new-game-button'))
    fireEvent.click(screen.getByTestId('seed-toggle'))
    fireEvent.change(screen.getByTestId('seed-input'), {
      target: { value: String(SEED) },
    })
    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    const store = getGameStore()
    const firstRun: unknown[] = []
    act(() => {
      for (let i = 0; i < 5; i++) {
        store.getState().advance()
        firstRun.push(structuredClone(store.getState().snapshot))
      }
    })

    // --- Open pause overlay, click Restart, confirm ---------------------
    act(() => {
      store.getState().openPauseMenu()
    })
    expect(store.getState().route.kind).toBe('paused-menu')

    fireEvent.click(screen.getByTestId('pause-restart'))
    act(() => {
      fireEvent.click(screen.getByTestId('restart-confirm-button'))
    })

    // Back to playing, fresh engine, same seed.
    const restartRoute = store.getState().route
    expect(restartRoute.kind).toBe('playing')
    if (restartRoute.kind === 'playing') {
      expect(restartRoute.seed).toBe(SEED)
    }
    // Tick counter is back at 0.
    expect(store.getState().snapshot.tick).toBe(0)

    // --- Second run: tick 5, capture each tick's snapshot ---------------
    const secondRun: unknown[] = []
    act(() => {
      for (let i = 0; i < 5; i++) {
        store.getState().advance()
        secondRun.push(structuredClone(store.getState().snapshot))
      }
    })

    // Tick-by-tick equality.
    expect(secondRun).toEqual(firstRun)
  })
})
