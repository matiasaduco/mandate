// T-036 — PauseOverlay component tests.
//
// Covers the overlay's dismissal contract (Esc / backdrop / Resume button),
// the restart confirmation flow (open → cancel keeps the overlay; open →
// confirm calls `restartGame`), and the Quit-to-menu transition.
//
// The full quit-then-continue cycle lives in quitToMenu.spec.tsx; this file
// asserts the overlay surface behaviour in isolation, with the store
// pre-positioned in the paused-menu route.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PauseOverlay } from '@ui/screens/PauseOverlay'
import {
  createGameStore,
  type GameStore,
} from '@ui/stores/gameStore'

let store: GameStore | null = null

/**
 * Helper: place the store into the paused-menu route. createGameStore
 * auto-boots the engine and starts at `playing`; openPauseMenu transitions
 * to `paused-menu` and sets speed=0.
 */
function setupPausedStore(seed = 1): GameStore {
  const s = createGameStore({ seed, initialSpeed: 1 })
  s.getState().openPauseMenu()
  return s
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  store?.destroy()
  store = null
  window.localStorage.clear()
})

describe('T-036 — PauseOverlay renders and exposes Resume / Restart / Quit', () => {
  it('renders heading + the three primary actions', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    expect(screen.getByTestId('pause-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('pause-resume')).toBeInTheDocument()
    expect(screen.getByTestId('pause-restart')).toBeInTheDocument()
    expect(screen.getByTestId('pause-quit')).toBeInTheDocument()
  })

  it('Resume button transitions back to playing', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    act(() => {
      fireEvent.click(screen.getByTestId('pause-resume'))
    })

    expect(store.getState().route.kind).toBe('playing')
  })

  it('Esc resumes when no confirmation is open', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(store.getState().route.kind).toBe('playing')
  })

  it('Backdrop click resumes', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-overlay-backdrop'))

    expect(store.getState().route.kind).toBe('playing')
  })
})

describe('T-036 — Restart requires confirmation and replays with the same seed', () => {
  it('clicking Restart opens the confirmation modal; engine stays as-is until confirmed', () => {
    store = setupPausedStore(42)
    // Advance once so we have a non-zero tick to compare against.
    store.getState().resumeFromPause()
    store.getState().advance()
    store.getState().openPauseMenu()
    expect(store.getState().snapshot.tick).toBe(1)

    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-restart'))
    expect(screen.getByTestId('restart-confirm')).toBeInTheDocument()

    // Cancel — engine should still be at tick 1.
    fireEvent.click(screen.getByTestId('restart-cancel'))
    expect(screen.queryByTestId('restart-confirm')).toBeNull()
    expect(store.getState().snapshot.tick).toBe(1)
  })

  it('confirming Restart resets the tick counter and preserves the seed', () => {
    store = setupPausedStore(42)
    store.getState().resumeFromPause()
    store.getState().advance()
    store.getState().advance()
    store.getState().openPauseMenu()
    expect(store.getState().snapshot.tick).toBe(2)

    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-restart'))
    act(() => {
      fireEvent.click(screen.getByTestId('restart-confirm-button'))
    })

    // Back to a fresh run.
    expect(store.getState().snapshot.tick).toBe(0)
    const route = store.getState().route
    expect(route.kind).toBe('playing')
    if (route.kind === 'playing') {
      expect(route.seed).toBe(42)
    }
  })

  it('Esc inside the restart confirmation closes the confirm first (not the overlay)', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-restart'))
    expect(screen.getByTestId('restart-confirm')).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    // The confirm closed; the overlay is still up.
    expect(screen.queryByTestId('restart-confirm')).toBeNull()
    expect(screen.getByTestId('pause-overlay')).toBeInTheDocument()
    expect(store.getState().route.kind).toBe('paused-menu')
  })
})

describe('T-036 — Quit to menu autosaves and clears the engine', () => {
  it('clicking Quit transitions to the menu route and writes an autosave', () => {
    store = setupPausedStore(99)
    render(<PauseOverlay store={store} />)

    expect(window.localStorage.getItem('mandate.save.v1')).toBeNull()

    act(() => {
      fireEvent.click(screen.getByTestId('pause-quit'))
    })

    expect(store.getState().route.kind).toBe('menu')
    // Engine handle is null after a clean quit.
    expect(store.engine).toBeNull()
    // Autosave was written.
    expect(window.localStorage.getItem('mandate.save.v1')).not.toBeNull()
  })
})

describe('T-037 — PauseOverlay Settings and Help buttons', () => {
  it('clicking Settings opens the Settings modal inside the overlay', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-settings'))

    // Settings modal is now visible.
    expect(screen.getByTestId('settings')).toBeInTheDocument()
    // The pause overlay itself is no longer visible (Settings replaced it).
    expect(screen.queryByTestId('pause-overlay')).toBeNull()
  })

  it('clicking Help opens the Glossary modal inside the overlay', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-help'))

    // Glossary modal is now visible.
    expect(screen.getByTestId('glossary')).toBeInTheDocument()
    expect(screen.queryByTestId('pause-overlay')).toBeNull()
  })

  it('closing Settings from the pause overlay returns to the overlay (not playing)', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-settings'))
    expect(screen.getByTestId('settings')).toBeInTheDocument()

    // Close the Settings modal — should return to the pause overlay.
    fireEvent.click(screen.getByTestId('settings-close'))

    expect(screen.queryByTestId('settings')).toBeNull()
    expect(screen.getByTestId('pause-overlay')).toBeInTheDocument()
    // Route is still paused-menu, not playing.
    expect(store.getState().route.kind).toBe('paused-menu')
  })

  it('closing Glossary from the pause overlay returns to the overlay', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-help'))
    fireEvent.click(screen.getByTestId('glossary-close'))

    expect(screen.queryByTestId('glossary')).toBeNull()
    expect(screen.getByTestId('pause-overlay')).toBeInTheDocument()
    expect(store.getState().route.kind).toBe('paused-menu')
  })

  it('Esc from Settings returns to the overlay, not to playing', () => {
    store = setupPausedStore()
    render(<PauseOverlay store={store} />)

    fireEvent.click(screen.getByTestId('pause-settings'))
    expect(screen.getByTestId('settings')).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    // After Esc inside Settings the route should still be paused.
    expect(store.getState().route.kind).toBe('paused-menu')
  })
})
