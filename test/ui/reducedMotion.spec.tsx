// T-034 — Reduced-motion test.
//
// Asserts that when the user's `(prefers-reduced-motion: reduce)` media query
// matches, every animated surface in the HUD collapses to a zero-duration /
// no-transform variant. We stub `window.matchMedia` so framer-motion's
// `useReducedMotion()` consistently returns `true`, then probe three surfaces
// that branch on that hook:
//   - The OverviewPanel KPI card writes `data-kpi-tween="instant"` and renders
//     the value as a plain `<span>` (no AnimatePresence).
//   - The PoliticsPanel approval headline does the same on its `<meter>`.
//   - The SocietyPanel per-row happiness value does the same.
//   - The EventFeed items carry `data-slide-in="instant"`.
//
// JSDOM does not implement `matchMedia` natively. The stub is installed in
// `beforeEach` and torn down in `afterEach` so cross-test pollution can't leak
// reduced-motion into unrelated suites.

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EngineEvent } from '@engine/types'
import { EventFeed } from '@ui/components/EventFeed'
import { OverviewPanel } from '@ui/panels/OverviewPanel'
import { PoliticsPanel } from '@ui/panels/PoliticsPanel'
import { SocietyPanel } from '@ui/panels/SocietyPanel'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

function makeMatchMedia(): (query: string) => MediaQueryList {
  return (query: string) =>
    ({
      // framer-motion queries `(prefers-reduced-motion)` (no `: reduce`),
      // standards-aware code may also query `(prefers-reduced-motion: reduce)`.
      // Match both so any caller sees `matches: true`.
      matches:
        query === '(prefers-reduced-motion)' ||
        query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList
}

let store: GameStore | null = null

beforeEach(() => {
  // framer-motion's `useReducedMotion()` reads `window.matchMedia` on mount.
  // We replace it with a stub that reports `matches: true` for the reduced
  // motion query so every motion-aware component sees the reduced-motion path
  // synchronously on first render.
  Object.defineProperty(window, 'matchMedia', {
    value: makeMatchMedia(),
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  store?.destroy()
  store = null
})

describe('T-034 AC — reduced motion collapses HUD animations to instant', () => {
  it('OverviewPanel KPI cards render with data-kpi-tween="instant"', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<OverviewPanel store={store!} />)
    // Each NumericCard wraps the value in a span carrying the data-kpi-tween
    // attribute set from `useReducedMotion()`. Under reduced motion this is
    // `'instant'` and the value renders as a plain `<span>` (no motion).
    const populationCard = getByTestId('overview-population')
    const valueEl = populationCard.querySelector('[data-kpi-tween]')
    expect(valueEl).not.toBeNull()
    expect(valueEl?.getAttribute('data-kpi-tween')).toBe('instant')
  })

  it('PoliticsPanel approval headline collapses to data-kpi-tween="instant"', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    const headline = getByTestId('politics-approval-value')
    expect(headline.getAttribute('data-kpi-tween')).toBe('instant')
  })

  it('SocietyPanel happiness values collapse to data-kpi-tween="instant"', () => {
    store = createGameStore({ seed: 1 })
    const { container } = render(<SocietyPanel store={store!} />)
    // Each row publishes the same attribute; we just need at least one row
    // present in the canonical Aurelia fixture.
    const happinessValues = container.querySelectorAll(
      '.society-panel__happiness-value[data-kpi-tween]',
    )
    expect(happinessValues.length).toBeGreaterThan(0)
    happinessValues.forEach((el) => {
      expect(el.getAttribute('data-kpi-tween')).toBe('instant')
    })
  })

  it('EventFeed items carry data-slide-in="instant" under reduced motion', () => {
    const events: EngineEvent[] = [
      {
        type: 'PolicyChanged',
        slider_id: 'tax_income',
        old_value: 25,
        new_value: 26,
        tick: 1,
      },
    ]
    const { getAllByTestId } = render(<EventFeed events={events} />)
    const items = getAllByTestId('event-feed-item')
    expect(items.length).toBe(1)
    expect(items[0].getAttribute('data-slide-in')).toBe('instant')
  })
})
