// T-022 — OverviewPanel component tests.
//
// Each `describe` heading names the AC it proves. We always construct a
// hermetic store via `createGameStore({ seed: 1 })` (per gameStore.ts: the
// singleton is for app code only) and inject it via the optional `store`
// prop on OverviewPanel — same test-vs-app split as TopBar (T-021).
//
// JSDOM has no layout engine; Recharts renders an <svg> when there are at
// least 2 data points, otherwise we render an empty placeholder div with
// `data-testid="trend-sparkline-empty"`. We assert presence/absence of those
// markers rather than trying to inspect the rendered chart geometry.

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import { TREND_HISTORY_TICKS } from '@engine/tunables'
import { OverviewPanel } from '@ui/panels/OverviewPanel'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

describe('T-022 AC#1 — all 7 fields render correct values for Aurelia on first paint', () => {
  it('shows population, gdp, treasury, approval, stability, government_type, head_of_state', () => {
    store = createGameStore({ seed: 1 })

    const { getByTestId } = render(<OverviewPanel store={store!} />)

    // 1. Population — 30,000,000 with US thousand separators.
    expect(getByTestId('overview-population').textContent).toContain('Population')
    expect(getByTestId('overview-population').textContent).toContain('30,000,000')

    // 2. GDP — 400,000.
    expect(getByTestId('overview-gdp').textContent).toContain('GDP')
    expect(getByTestId('overview-gdp').textContent).toContain('400,000')

    // 3. Treasury — 50,000.
    expect(getByTestId('overview-treasury').textContent).toContain('Treasury')
    expect(getByTestId('overview-treasury').textContent).toContain('50,000')

    // 4. Approval — 56 (integer 0–100).
    expect(getByTestId('overview-approval').textContent).toContain('Approval')
    expect(getByTestId('overview-approval').textContent).toContain('56')

    // 5. Stability — 65 (integer 0–100).
    expect(getByTestId('overview-stability').textContent).toContain('Stability')
    expect(getByTestId('overview-stability').textContent).toContain('65')

    // 6. Government type — capitalized for display.
    expect(getByTestId('overview-government').textContent).toContain('Government')
    expect(getByTestId('overview-government').textContent).toContain('Democracy')

    // 7. Head of state — name + party from Aurelia fixture.
    expect(getByTestId('overview-head-of-state').textContent).toContain('Head of State')
    expect(getByTestId('overview-head-of-state').textContent).toContain('Elena Vorra')
    expect(getByTestId('overview-head-of-state').textContent).toContain('Center Coalition')
  })
})

describe('T-022 AC#2 — trend strips show data accumulated over the last ≤ TREND_HISTORY_TICKS ticks', () => {
  it('on first paint, buffers have length 1 (just the seeded starting value)', () => {
    store = createGameStore({ seed: 1 })
    render(<OverviewPanel store={store!} />)

    // length 1 → not enough for a real line; the sparkline renders its empty
    // placeholder. Each numeric card owns one sparkline; 5 numeric cards =
    // 5 empty placeholders on first paint.
    const { trends } = store.getState()
    expect(trends.treasury).toHaveLength(1)
    expect(trends.population).toHaveLength(1)
  })

  it('after TREND_HISTORY_TICKS + 5 advances, the treasury buffer is exactly TREND_HISTORY_TICKS long', () => {
    store = createGameStore({ seed: 1 })
    render(<OverviewPanel store={store!} />)

    act(() => {
      for (let i = 0; i < TREND_HISTORY_TICKS + 5; i++) {
        store!.getState().advance()
      }
    })

    const { trends } = store.getState()
    expect(trends.treasury).toHaveLength(TREND_HISTORY_TICKS)
    expect(trends.gdp).toHaveLength(TREND_HISTORY_TICKS)
    expect(trends.approval).toHaveLength(TREND_HISTORY_TICKS)
  })

  it('after 2+ advances, the sparkline switches from empty placeholder to a real SVG chart', () => {
    store = createGameStore({ seed: 1 })
    const { container } = render(<OverviewPanel store={store!} />)

    // First paint: all sparklines are empty placeholders (length-1 buffers).
    expect(container.querySelectorAll('[data-testid="trend-sparkline-empty"]').length).toBeGreaterThan(0)

    act(() => {
      store!.getState().advance()
      store!.getState().advance()
    })

    // After 2 advances every numeric buffer has length 3 — sparklines render
    // a real chart now, so the empty placeholder is gone for all numeric cards.
    expect(container.querySelectorAll('[data-testid="trend-sparkline-empty"]').length).toBe(0)
    expect(container.querySelectorAll('[data-testid="trend-sparkline"]').length).toBeGreaterThan(0)
  })
})

describe('T-022 AC#3 — negative balance is visually flagged on the treasury card', () => {
  it('treasury card has is-negative class when treasury < 0', () => {
    const initialState = createAureliaState()
    initialState.country.treasury = -1_000
    store = createGameStore({ seed: 1, initialState })

    const { getByTestId } = render(<OverviewPanel store={store!} />)
    expect(getByTestId('overview-treasury')).toHaveClass('is-negative')
  })

  it('treasury card does NOT have is-negative class at default Aurelia (50,000)', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<OverviewPanel store={store!} />)
    expect(getByTestId('overview-treasury')).not.toHaveClass('is-negative')
  })

  it('treasury card does NOT have is-negative class at exactly 0', () => {
    const initialState = createAureliaState()
    initialState.country.treasury = 0
    store = createGameStore({ seed: 1, initialState })

    const { getByTestId } = render(<OverviewPanel store={store!} />)
    expect(getByTestId('overview-treasury')).not.toHaveClass('is-negative')
  })
})

describe('T-022 — text-only cards do not render sparklines', () => {
  it('government card has no sparkline element', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<OverviewPanel store={store!} />)
    const govCard = getByTestId('overview-government')
    expect(govCard.querySelector('[data-testid="trend-sparkline"]')).toBeNull()
    expect(govCard.querySelector('[data-testid="trend-sparkline-empty"]')).toBeNull()
  })

  it('head-of-state card has no sparkline element', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<OverviewPanel store={store!} />)
    const hosCard = getByTestId('overview-head-of-state')
    expect(hosCard.querySelector('[data-testid="trend-sparkline"]')).toBeNull()
    expect(hosCard.querySelector('[data-testid="trend-sparkline-empty"]')).toBeNull()
  })
})

describe('T-022 — panel mounts inside a <section> with the expected test id', () => {
  it('renders a <section data-testid="overview-panel">', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<OverviewPanel store={store!} />)
    expect(getByTestId('overview-panel').tagName.toLowerCase()).toBe('section')
  })
})
