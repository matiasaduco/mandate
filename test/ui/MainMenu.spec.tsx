// T-036 — MainMenu component tests.
//
// Covers the AC items the menu surface owns directly:
//   - AC #1: fresh localStorage → menu opens, Continue is disabled.
//   - Settings + Help stubs render keyboard-accessibly and dismiss via Esc.
//   - "New game" → seed flow renders, toggle reveals the field, Start
//     transitions to the playing route via `bootEngine`.
//   - Save corruption (deserialize throws) → Continue stays disabled, no crash.
//
// Determinism (AC #3) lives in newGameFlow.spec.tsx — it needs the engine
// integration. AC #2 (play → quit → continue) lives in quitToMenu.spec.tsx.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { serialize } from '@engine'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { MainMenu } from '@ui/screens/MainMenu'
import {
  AUTOSAVE_KEY,
  getGameStore,
  resetGameStoreSingleton,
} from '@ui/stores/gameStore'

beforeEach(() => {
  window.localStorage.clear()
  resetGameStoreSingleton()
})

afterEach(() => {
  cleanup()
  resetGameStoreSingleton()
  window.localStorage.clear()
})

describe('T-036 AC#1 — fresh localStorage opens the main menu with Continue disabled', () => {
  it('renders the main menu with the Continue button disabled when no save exists', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)

    // The menu surface is present, with the title from MENU_COPY.
    expect(screen.getByTestId('main-menu')).toBeInTheDocument()
    expect(screen.getByTestId('menu-heading').textContent).toContain('Mandate')

    // Continue is disabled because localStorage has no autosave.
    expect(screen.getByTestId('continue-button')).toBeDisabled()
  })

  it('Continue is enabled when a valid serialized state lives in localStorage', () => {
    const state = createAureliaState()
    window.localStorage.setItem(AUTOSAVE_KEY, serialize(state))

    const store = getGameStore()
    render(<MainMenu store={store} />)

    expect(screen.getByTestId('continue-button')).not.toBeDisabled()
  })

  it('Continue stays disabled when the save in localStorage is corrupted', () => {
    // Edge Case from the brief: deserialize throws → menu must not crash and
    // Continue must remain unavailable.
    window.localStorage.setItem(AUTOSAVE_KEY, '{not-json')

    const store = getGameStore()
    render(<MainMenu store={store} />)

    expect(screen.getByTestId('main-menu')).toBeInTheDocument()
    expect(screen.getByTestId('continue-button')).toBeDisabled()
  })

  it('Continue stays disabled when the save has the wrong schema_version', () => {
    window.localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ schema_version: 999, state: createAureliaState() }),
    )

    const store = getGameStore()
    render(<MainMenu store={store} />)

    expect(screen.getByTestId('continue-button')).toBeDisabled()
  })
})

describe('T-036 — Settings and Help stubs are keyboard-reachable and Esc-dismissible', () => {
  it('opens the Settings stub and closes it via Esc', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)

    fireEvent.click(screen.getByTestId('settings-button'))
    expect(screen.getByTestId('settings')).toBeInTheDocument()
    // T-037 replaced the stub — the heading is now the real "Settings" title.
    expect(screen.getByTestId('settings').textContent).toContain('Settings')

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(screen.queryByTestId('settings')).toBeNull()
  })

  it('opens the Help stub and closes it via the Close button', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)

    fireEvent.click(screen.getByTestId('help-button'))
    expect(screen.getByTestId('glossary')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('glossary-close'))
    expect(screen.queryByTestId('glossary')).toBeNull()
  })

  it('Settings stub closes via backdrop click', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)

    fireEvent.click(screen.getByTestId('settings-button'))
    expect(screen.getByTestId('settings')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-backdrop'))
    expect(screen.queryByTestId('settings')).toBeNull()
  })
})

describe('T-036 — New game flow: country picker + seed toggle', () => {
  it('clicking New game opens the country / seed form', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)

    fireEvent.click(screen.getByTestId('new-game-button'))

    expect(screen.getByTestId('country-aurelia')).toBeInTheDocument()
    expect(screen.getByTestId('seed-toggle')).toBeInTheDocument()
    // Toggle off by default → field hidden, random-note shown.
    expect(screen.queryByTestId('seed-input')).toBeNull()
    expect(screen.getByTestId('seed-random-note')).toBeInTheDocument()
  })

  it('flipping the seed toggle reveals the numeric input', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)

    fireEvent.click(screen.getByTestId('new-game-button'))
    fireEvent.click(screen.getByTestId('seed-toggle'))

    expect(screen.getByTestId('seed-input')).toBeInTheDocument()
    expect(screen.queryByTestId('seed-random-note')).toBeNull()
  })

  it('Start with a random seed transitions to the playing route via bootEngine', () => {
    const store = getGameStore()
    expect(store.getState().route.kind).toBe('menu')

    render(<MainMenu store={store} />)
    fireEvent.click(screen.getByTestId('new-game-button'))

    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    const route = store.getState().route
    expect(route.kind).toBe('playing')
    if (route.kind === 'playing') {
      // Seed is a positive 32-bit unsigned int — picked by pickRandomSeed.
      expect(route.seed).toBeGreaterThanOrEqual(1)
      expect(route.seed).toBeLessThanOrEqual(4_294_967_295)
    }
    // Engine handle is now non-null.
    expect(store.engine).not.toBeNull()
  })

  it('Start with an explicit seed uses that seed verbatim', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)
    fireEvent.click(screen.getByTestId('new-game-button'))
    fireEvent.click(screen.getByTestId('seed-toggle'))
    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: '12345' } })

    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    const route = store.getState().route
    expect(route.kind).toBe('playing')
    if (route.kind === 'playing') {
      expect(route.seed).toBe(12345)
    }
  })

  it('Start with a non-integer / out-of-range seed shows an error and does NOT boot', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)
    fireEvent.click(screen.getByTestId('new-game-button'))
    fireEvent.click(screen.getByTestId('seed-toggle'))

    // Negative → rejected.
    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: '-1' } })
    fireEvent.click(screen.getByTestId('start-button'))
    expect(screen.getByTestId('seed-error')).toBeInTheDocument()
    expect(store.getState().route.kind).toBe('menu')

    // Zero → rejected (range starts at 1).
    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('start-button'))
    expect(screen.getByTestId('seed-error')).toBeInTheDocument()
    expect(store.getState().route.kind).toBe('menu')

    // Above 2^32 - 1 → rejected.
    fireEvent.change(screen.getByTestId('seed-input'), {
      target: { value: '99999999999' },
    })
    fireEvent.click(screen.getByTestId('start-button'))
    expect(screen.getByTestId('seed-error')).toBeInTheDocument()
    expect(store.getState().route.kind).toBe('menu')
  })

  it('Back button returns from the form to the root menu', () => {
    const store = getGameStore()
    render(<MainMenu store={store} />)
    fireEvent.click(screen.getByTestId('new-game-button'))
    expect(screen.getByTestId('country-aurelia')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('back-button'))

    // Back at the root menu — Continue button visible again.
    expect(screen.getByTestId('continue-button')).toBeInTheDocument()
    expect(screen.queryByTestId('country-aurelia')).toBeNull()
  })
})
