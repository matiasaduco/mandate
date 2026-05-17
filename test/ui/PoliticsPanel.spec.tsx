// T-025 — PoliticsPanel component tests.
//
// One `describe` per AC + a few non-AC sanity checks (trend arrow, "Why?"
// edge cases, the smaller render contract). Each test constructs a hermetic
// store via `createGameStore({ seed: 1 })` and injects it through the
// `store` prop — same pattern as the other panels.

import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import { DECREE_CATALOG_P1 } from '@engine/entities/Decree'
import { PoliticsPanel } from '@ui/panels/PoliticsPanel'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
  // Always restore any window.confirm spy we installed in a test so the next
  // test starts with the JSDOM default.
  vi.restoreAllMocks()
})

describe('T-025 AC#1 — approval breakdown sums match country.approval (size-weighted)', () => {
  it('sum of per-POP contribution bars equals country.approval within ±0.5', () => {
    store = createGameStore({ seed: 1 })
    const { getAllByTestId } = render(<PoliticsPanel store={store!} />)

    const bars = getAllByTestId(/^approval-contrib-/)
    expect(bars).toHaveLength(5) // one per Aurelia POP

    const sum = bars.reduce((acc, el) => acc + Number(el.textContent), 0)
    const approval = store!.getState().snapshot.country.approval
    // Aurelia's stage-4 rollup at tick=0 = 1679.2M / 30M ≈ 55.97; rounded to
    // one decimal per bar then summed is within 0.5 of the displayed approval.
    expect(Math.abs(sum - approval)).toBeLessThanOrEqual(0.5)
  })

  it('rows are sorted by contribution descending', () => {
    store = createGameStore({ seed: 1 })
    const { getAllByTestId } = render(<PoliticsPanel store={store!} />)

    const rows = getAllByTestId(/^approval-row-/)
    const values = rows.map((row) =>
      Number(row.querySelector('[data-testid^="approval-contrib-"]')!.textContent),
    )
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i])
    }
    // Sanity: urban_workers (12M × 55 / 30M ≈ 22.0) is the largest contributor.
    expect(rows[0].getAttribute('data-pop-type')).toBe('urban_workers')
  })
})

describe('T-025 AC#2 — "Why?" tooltip names a real top-driver after a tax-up tick', () => {
  it('on first paint with no prior tick, tooltip shows the "No drivers yet" message', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    const why = getByTestId('politics-why')
    expect(why.getAttribute('title')).toContain('No drivers yet')
  })

  it('after a single quiet advance(), tooltip is one of "No movement" or names a real POP', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    act(() => {
      store!.getState().advance()
    })
    const why = getByTestId('politics-why')
    const text = why.getAttribute('title') ?? ''
    // Either steady-state (no movement) OR a driver line for a real POP.
    const popNames = ['Urban Workers', 'Rural Workers', 'Middle Class', 'Capitalists', 'Intelligentsia']
    const hasPop = popNames.some((n) => text.includes(n))
    expect(text === 'No movement this tick.' || hasPop).toBe(true)
  })

  it('after a tax_income spike to 60, top driver is urban_workers or middle_class with a negative delta', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)

    // Push tax_income to the ceiling — this triggers the tax bite in stage 3
    // happiness derivation: urban_workers / middle_class lose happiness most
    // (they have `low_consumption_tax` / `low_income_tax` priorities and high
    // income); capitalists are flat; rural_workers least affected.
    act(() => {
      store!.getState().enqueueDecision({
        type: 'slider',
        slider_id: 'tax_income',
        value: 60,
      })
      store!.getState().advance()
    })

    const why = getByTestId('politics-why')
    const text = why.getAttribute('title') ?? ''
    const firstLine = text.split('\n')[0]
    // The brief: assert the POP name AND a minus sign in the text. We don't
    // hardcode the delta — the engine's coefficients can drift in T-031.
    const namesUrbanOrMiddle =
      firstLine.includes('Urban Workers') || firstLine.includes('Middle Class')
    expect(namesUrbanOrMiddle).toBe(true)
    expect(firstLine).toMatch(/-\d/) // a signed negative number
  })
})

describe('T-025 AC#3 — decree buttons trigger confirm dialog when cost > 0', () => {
  it('industrial_subsidy (cost 5000) prompts a confirm dialog with the cost amount', () => {
    store = createGameStore({ seed: 1 })
    // Mock so the dialog auto-confirms; assert call count + arguments.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const enqueueSpy = vi.spyOn(store!.getState(), 'enqueueDecision')

    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    fireEvent.click(getByTestId('decree-btn-industrial_subsidy'))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    // The cost arrives with US thousand separators (formatNumber).
    expect(confirmSpy.mock.calls[0][0]).toContain('5,000')
    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).toHaveBeenCalledWith({ type: 'decree', decree_id: 'industrial_subsidy' })
  })

  it('declining the confirm dialog enqueues nothing', () => {
    store = createGameStore({ seed: 1 })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const enqueueSpy = vi.spyOn(store!.getState(), 'enqueueDecision')

    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    fireEvent.click(getByTestId('decree-btn-industrial_subsidy'))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('public_address (cost 0) enqueues immediately WITHOUT a confirm dialog', () => {
    store = createGameStore({ seed: 1 })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const enqueueSpy = vi.spyOn(store!.getState(), 'enqueueDecision')

    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    fireEvent.click(getByTestId('decree-btn-public_address'))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).toHaveBeenCalledWith({ type: 'decree', decree_id: 'public_address' })
  })
})

describe('T-025 AC#4 — disabled state activates when treasury insufficient', () => {
  it('with treasury = 1000, industrial_subsidy (5000) and emergency_relief (3000) are disabled; public_address (0) is enabled', () => {
    const initialState = createAureliaState()
    initialState.country.treasury = 1000
    store = createGameStore({ seed: 1, initialState })

    const { getByTestId } = render(<PoliticsPanel store={store!} />)

    expect(
      (getByTestId('decree-btn-industrial_subsidy') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (getByTestId('decree-btn-emergency_relief') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (getByTestId('decree-btn-public_address') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('with treasury = 10_000, all three decrees are enabled', () => {
    const initialState = createAureliaState()
    initialState.country.treasury = 10_000
    store = createGameStore({ seed: 1, initialState })

    const { getByTestId } = render(<PoliticsPanel store={store!} />)

    expect(
      (getByTestId('decree-btn-industrial_subsidy') as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(
      (getByTestId('decree-btn-emergency_relief') as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(
      (getByTestId('decree-btn-public_address') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('clicking a disabled industrial_subsidy button enqueues nothing and never prompts', () => {
    const initialState = createAureliaState()
    initialState.country.treasury = 100
    store = createGameStore({ seed: 1, initialState })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const enqueueSpy = vi.spyOn(store!.getState(), 'enqueueDecision')

    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    fireEvent.click(getByTestId('decree-btn-industrial_subsidy'))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(enqueueSpy).not.toHaveBeenCalled()
  })
})

// --- Non-AC sanity checks --------------------------------------------------

describe('T-025 — trend arrow reflects approval delta', () => {
  it('renders → (steady) when approval == approval_prev', () => {
    const initialState = createAureliaState()
    initialState.country.approval = 56
    initialState.approval_prev = 56
    store = createGameStore({ seed: 1, initialState })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    expect(getByTestId('politics-trend-arrow').getAttribute('data-direction')).toBe('steady')
  })

  it('renders ↑ (rising) when approval > approval_prev by more than the deadband', () => {
    const initialState = createAureliaState()
    initialState.country.approval = 60
    initialState.approval_prev = 56
    store = createGameStore({ seed: 1, initialState })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    expect(getByTestId('politics-trend-arrow').getAttribute('data-direction')).toBe('rising')
  })

  it('renders ↓ (falling) when approval < approval_prev by more than the deadband', () => {
    const initialState = createAureliaState()
    initialState.country.approval = 50
    initialState.approval_prev = 56
    store = createGameStore({ seed: 1, initialState })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    expect(getByTestId('politics-trend-arrow').getAttribute('data-direction')).toBe('falling')
  })
})

describe('T-025 — panel renders inside a <section> with the expected test id', () => {
  it('renders <section data-testid="politics-panel">', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    expect(getByTestId('politics-panel').tagName.toLowerCase()).toBe('section')
  })
})

describe('T-025 — decree button list mirrors DECREE_CATALOG_P1', () => {
  it('renders exactly the three Phase-1 decrees', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    for (const decreeId of Object.keys(DECREE_CATALOG_P1)) {
      expect(getByTestId(`decree-btn-${decreeId}`)).toBeInTheDocument()
    }
  })
})

describe('T-025 — approval value is rounded to an integer', () => {
  it('renders the rounded country.approval as the headline number', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<PoliticsPanel store={store!} />)
    const value = getByTestId('politics-approval-value').textContent
    expect(value).toBe(String(Math.round(store!.getState().snapshot.country.approval)))
  })
})
