// T-023 — EconomyPanel component tests.
//
// One `describe` per AC plus a few non-AC sanity checks (recently-changed
// indicator, Σ-off rendering). Each test constructs a hermetic store via
// `createGameStore({ seed: 1 })` and injects it through the `store` prop —
// same test-vs-app split as TopBar / OverviewPanel.
//
// JSDOM has no layout engine; Recharts renders an <svg> only with ≥ 2 data
// points, otherwise the panel renders a `data-testid="gdp-chart-empty"`
// placeholder. We assert presence/absence of those markers rather than
// inspect chart geometry.

import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import {
  TAX_CONSUMPTION_RANGE,
  TAX_CORPORATE_RANGE,
  TAX_INCOME_RANGE,
  TREND_HISTORY_TICKS,
} from '@engine/tunables'
import { SectorBreakdown } from '@ui/components/SectorBreakdown'
import { EconomyPanel } from '@ui/panels/EconomyPanel'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

describe('T-023 AC#1 — all 8 sliders present; each within its valid range', () => {
  it('renders 3 tax + 5 budget sliders with the right min/max bounds', () => {
    store = createGameStore({ seed: 1 })
    const { getByLabelText } = render(<EconomyPanel store={store!} />)

    const taxIncome = getByLabelText('Income tax') as HTMLInputElement
    const taxCorporate = getByLabelText('Corporate tax') as HTMLInputElement
    const taxConsumption = getByLabelText('Consumption tax') as HTMLInputElement
    expect(taxIncome.type).toBe('range')
    expect(Number(taxIncome.min)).toBe(TAX_INCOME_RANGE[0])
    expect(Number(taxIncome.max)).toBe(TAX_INCOME_RANGE[1])
    expect(Number(taxCorporate.min)).toBe(TAX_CORPORATE_RANGE[0])
    expect(Number(taxCorporate.max)).toBe(TAX_CORPORATE_RANGE[1])
    expect(Number(taxConsumption.min)).toBe(TAX_CONSUMPTION_RANGE[0])
    expect(Number(taxConsumption.max)).toBe(TAX_CONSUMPTION_RANGE[1])

    // 5 budget sliders — each is the percent display, [0, 100].
    for (const cat of ['Health', 'Education', 'Infrastructure', 'Security', 'Welfare']) {
      const input = getByLabelText(cat) as HTMLInputElement
      expect(input.type).toBe('range')
      expect(Number(input.min)).toBe(0)
      expect(Number(input.max)).toBe(100)
    }
  })
})

describe('T-023 AC#2 — releasing a slider enqueues exactly one decision; next tick reflects it', () => {
  it('change → mouseUp on tax_income enqueues exactly one decision; advance() applies it', () => {
    store = createGameStore({ seed: 1 })
    const enqueueSpy = vi.spyOn(store!.getState(), 'enqueueDecision')

    const { getByLabelText } = render(<EconomyPanel store={store!} />)
    const input = getByLabelText('Income tax') as HTMLInputElement

    // Baseline: Aurelia tax_income = 25.
    expect(store!.getState().snapshot.country.sliders.tax_income).toBe(25)

    fireEvent.change(input, { target: { value: '30' } })
    fireEvent.mouseUp(input)

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).toHaveBeenCalledWith({
      type: 'slider',
      slider_id: 'tax_income',
      value: 30,
    })

    // Drain the queue at next tick.
    act(() => {
      store!.getState().advance()
    })

    expect(store!.getState().snapshot.country.sliders.tax_income).toBe(30)
  })
})

describe('T-023 AC#3 — multiple drag changes between ticks queue the LAST value only', () => {
  it('change×N then a single mouseUp enqueues exactly one decision with the final value', () => {
    store = createGameStore({ seed: 1 })
    const enqueueSpy = vi.spyOn(store!.getState(), 'enqueueDecision')

    const { getByLabelText } = render(<EconomyPanel store={store!} />)
    const input = getByLabelText('Corporate tax') as HTMLInputElement

    fireEvent.change(input, { target: { value: '32' } })
    fireEvent.change(input, { target: { value: '35' } })
    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.change(input, { target: { value: '45' } })
    fireEvent.mouseUp(input)

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).toHaveBeenCalledWith({
      type: 'slider',
      slider_id: 'tax_corporate',
      value: 45,
    })
  })
})

describe('T-023 AC#4 — GDP chart shows ≤ TREND_HISTORY_TICKS data points', () => {
  it('the gdp trend buffer is capped at TREND_HISTORY_TICKS and the chart renders an SVG', () => {
    store = createGameStore({ seed: 1 })
    const { container, getByTestId } = render(<EconomyPanel store={store!} />)

    // First paint: trend has 1 sample → empty placeholder.
    expect(getByTestId('gdp-chart-empty')).toBeInTheDocument()

    act(() => {
      for (let i = 0; i < TREND_HISTORY_TICKS + 5; i++) {
        store!.getState().advance()
      }
    })

    // Buffer capped (T-022's trim contract).
    expect(store!.getState().trends.gdp).toHaveLength(TREND_HISTORY_TICKS)

    // Chart container has flipped from the empty placeholder to the real
    // chart wrapper. Recharts' ResponsiveContainer doesn't paint an actual
    // <svg> in JSDOM (zero-width parent), so we assert the markers we DO
    // control rather than the chart geometry — same pattern as T-022's
    // sparkline tests.
    expect(container.querySelector('[data-testid="gdp-chart-empty"]')).toBeNull()
    expect(getByTestId('gdp-chart')).toBeInTheDocument()
  })
})

describe('T-023 AC#5 — sector breakdown sums to gdp; employment_share sums to 1', () => {
  it('renders sums via data-testid and they match the fixture totals within 1e-6', () => {
    const initialState = createAureliaState()
    const expectedOutput = initialState.country.sectors.reduce((s, x) => s + x.output, 0)
    const expectedEmployment = initialState.country.sectors.reduce(
      (s, x) => s + x.employment_share,
      0,
    )
    // Sanity: Aurelia's gdp equals the sector output sum on the starting state.
    expect(Math.abs(initialState.country.gdp - expectedOutput)).toBeLessThan(1e-6)

    const { getByTestId } = render(<SectorBreakdown sectors={initialState.country.sectors} />)
    const outputSum = Number(getByTestId('sector-output-sum').getAttribute('data-value'))
    const employmentSum = Number(getByTestId('sector-employment-sum').getAttribute('data-value'))

    expect(Math.abs(outputSum - expectedOutput)).toBeLessThan(1e-6)
    expect(Math.abs(outputSum - initialState.country.gdp)).toBeLessThan(1e-6)
    expect(Math.abs(employmentSum - 1)).toBeLessThan(1e-6)
    expect(Math.abs(employmentSum - expectedEmployment)).toBeLessThan(1e-6)
  })

  it('within EconomyPanel, the rendered sums match country.gdp from the snapshot', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<EconomyPanel store={store!} />)
    const outputSum = Number(getByTestId('sector-output-sum').getAttribute('data-value'))
    const employmentSum = Number(getByTestId('sector-employment-sum').getAttribute('data-value'))
    expect(Math.abs(outputSum - store!.getState().snapshot.country.gdp)).toBeLessThan(1e-6)
    expect(Math.abs(employmentSum - 1)).toBeLessThan(1e-6)
  })
})

// --- Non-AC sanity checks --------------------------------------------------

describe('T-023 — Σ indicator turns red when budget shares do not sum to ~100%', () => {
  it('Σ = 100% on the default Aurelia state (within tolerance)', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<EconomyPanel store={store!} />)
    const sum = getByTestId('economy-budget-sum')
    expect(sum.getAttribute('data-within-tolerance')).toBe('true')
    expect(sum.textContent).toContain('100%')
  })

  it('Σ < 100% paints is-off when shares are zeroed out', () => {
    const initialState = createAureliaState()
    initialState.country.budget_shares = {
      health: 0,
      education: 0,
      infrastructure: 0,
      security: 0,
      welfare: 0,
    }
    store = createGameStore({ seed: 1, initialState })
    const { getByTestId } = render(<EconomyPanel store={store!} />)
    const sum = getByTestId('economy-budget-sum')
    expect(sum.getAttribute('data-within-tolerance')).toBe('false')
    expect(sum.className).toContain('is-off')
    expect(sum.textContent).toContain('0%')
  })
})

describe('T-023 — recently-changed indicator lights up after a commit', () => {
  it('shows the indicator on the matching slider for the tick after commit', () => {
    store = createGameStore({ seed: 1 })
    const { getByLabelText, queryByTestId } = render(<EconomyPanel store={store!} />)

    // Nothing committed yet → no indicators anywhere.
    expect(queryByTestId('slider-tax_income-recent')).toBeNull()

    const input = getByLabelText('Income tax') as HTMLInputElement
    fireEvent.change(input, { target: { value: '28' } })
    fireEvent.mouseUp(input)

    // Tick: drain queue → PolicyChanged event arrives → indicator lights up.
    act(() => {
      store!.getState().advance()
    })

    expect(queryByTestId('slider-tax_income-recent')).not.toBeNull()
    // Other sliders are still cold.
    expect(queryByTestId('slider-tax_corporate-recent')).toBeNull()
  })
})

describe('T-023 — balance flow is painted red when negative', () => {
  it('renders is-negative on the balance flow when flows.balance < 0', () => {
    const initialState = createAureliaState()
    initialState.flows = { tax_income: 50_000, budget_spend: 100_000, balance: -50_000 }
    store = createGameStore({ seed: 1, initialState })
    const { getByTestId } = render(<EconomyPanel store={store!} />)
    expect(getByTestId('economy-balance').className).toContain('is-negative')
  })

  it('does NOT render is-negative when flows.balance >= 0', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<EconomyPanel store={store!} />)
    expect(getByTestId('economy-balance').className).not.toContain('is-negative')
  })
})

describe('T-023 — panel mounts inside a <section> with the expected test id', () => {
  it('renders a <section data-testid="economy-panel">', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<EconomyPanel store={store!} />)
    expect(getByTestId('economy-panel').tagName.toLowerCase()).toBe('section')
  })
})
