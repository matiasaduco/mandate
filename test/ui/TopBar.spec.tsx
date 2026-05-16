// T-021 — TopBar component tests.
//
// Each `describe` heading names the AC it proves. We always construct a
// hermetic store via `createGameStore({ seed: 1 })` (per gameStore.ts: the
// singleton is for app code only) and inject it via the optional `store`
// prop on TopBar — exactly the test-vs-app split documented in the brief.
//
// Conventions:
//   - afterEach destroys the store so the engine subscription is released.
//   - We don't use fake timers here: TopBar itself doesn't drive any timers;
//     it just reads from the store. Tick advances are driven manually via
//     `store.getState().advance()` inside `act(...)`.

import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'
import { TopBar } from '@ui/components/TopBar'
import { formatCalendar } from '@ui/components/calendar'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

describe('T-021 AC#1 — all 5 fields render from Aurelia state on first paint', () => {
  it('shows country name, analogue, calendar (tick 0), treasury, and approval', () => {
    store = createGameStore({ seed: 1 })

    const { getByText, getByTestId } = render(<TopBar store={store!} />)

    // 1. Country name (verbatim from the Aurelia fixture).
    expect(getByText('Republic of Aurelia')).toBeInTheDocument()
    // 2. Analogue chip.
    expect(getByTestId('analogue-chip').textContent).toBe('argentina-like')
    // 3. Calendar — tick 0 maps to "Jan 2024 — Tick 0 / Year 0".
    expect(getByTestId('calendar').textContent).toBe('Jan 2024 — Tick 0 / Year 0')
    // 4. Treasury — 50_000 formatted with US thousand separators.
    expect(getByTestId('treasury').textContent).toContain('50,000')
    expect(getByTestId('treasury').textContent).toContain('Treasury')
    // 5. Approval — Aurelia starts at 56 (already an integer).
    expect(getByTestId('approval').textContent).toContain('56')
    expect(getByTestId('approval').textContent).toContain('Approval')
  })
})

describe('T-021 AC#2 — top bar updates every tick', () => {
  it('calendar text shifts from Tick 0 to Tick 1 after a single advance()', () => {
    store = createGameStore({ seed: 1 })

    const { getByTestId } = render(<TopBar store={store!} />)
    expect(getByTestId('calendar').textContent).toBe('Jan 2024 — Tick 0 / Year 0')

    act(() => {
      store!.getState().advance()
    })

    expect(getByTestId('calendar').textContent).toBe('Feb 2024 — Tick 1 / Year 0')
  })

  it('calendar rolls the year correctly after 12 ticks', () => {
    store = createGameStore({ seed: 1 })

    const { getByTestId } = render(<TopBar store={store!} />)
    act(() => {
      for (let i = 0; i < 12; i++) {
        store!.getState().advance()
      }
    })

    expect(getByTestId('calendar').textContent).toBe('Jan 2025 — Tick 12 / Year 1')
  })
})

describe('T-021 AC#3 — clicking each speed button calls setSpeed; the active button is highlighted', () => {
  it('clicking 2× sets speed=2 and marks the 2× button active (aria-pressed=true)', () => {
    store = createGameStore({ seed: 1, initialSpeed: 0 })

    const { getByText } = render(<TopBar store={store!} />)
    const btn2x = getByText('2×')

    // Baseline: Pause is active, 2× is not.
    expect(getByText('Pause').getAttribute('aria-pressed')).toBe('true')
    expect(btn2x.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn2x)

    expect(store!.getState().speed).toBe(2)
    expect(btn2x.getAttribute('aria-pressed')).toBe('true')
    expect(btn2x.className).toContain('is-active')
    // Pause is no longer active.
    expect(getByText('Pause').getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking Pause from a non-zero speed sets speed=0', () => {
    store = createGameStore({ seed: 1, initialSpeed: 2 })

    const { getByText } = render(<TopBar store={store!} />)
    expect(store!.getState().speed).toBe(2)

    fireEvent.click(getByText('Pause'))

    expect(store!.getState().speed).toBe(0)
    expect(getByText('Pause').getAttribute('aria-pressed')).toBe('true')
    expect(getByText('2×').getAttribute('aria-pressed')).toBe('false')
  })

  it('exposes one button per SPEEDS value (Pause, 1×, 2×, 4×)', () => {
    store = createGameStore({ seed: 1 })
    const { getByText } = render(<TopBar store={store!} />)
    // Confirms the speed control mirrors SPEEDS (and the brief example).
    for (const label of ['Pause', '1×', '2×', '4×']) {
      expect(getByText(label)).toBeInTheDocument()
    }
  })
})

describe('T-021 AC#4 — at speed=0, no tick-pulse animation class is applied', () => {
  it('calendar lacks pulse-active when speed=0; has it when speed>0', () => {
    store = createGameStore({ seed: 1, initialSpeed: 0 })

    const { getByTestId, getByText } = render(<TopBar store={store!} />)
    const calendar = getByTestId('calendar')

    // Speed 0 → no pulse class.
    expect(calendar).not.toHaveClass('pulse-active')

    // Flip to 1× → class applied (same DOM element).
    fireEvent.click(getByText('1×'))
    expect(calendar).toHaveClass('pulse-active')

    // Pause → class removed.
    fireEvent.click(getByText('Pause'))
    expect(calendar).not.toHaveClass('pulse-active')
  })
})

describe('T-021 — calendar formatter (disambiguated mapping from the brief)', () => {
  it.each([
    [0, 'Jan 2024 — Tick 0 / Year 0'],
    [1, 'Feb 2024 — Tick 1 / Year 0'],
    [11, 'Dec 2024 — Tick 11 / Year 0'],
    [12, 'Jan 2025 — Tick 12 / Year 1'],
    [25, 'Feb 2026 — Tick 25 / Year 2'],
  ])('formatCalendar(%i) === %s', (tick, expected) => {
    expect(formatCalendar(tick)).toBe(expected)
  })
})

describe('T-021 — treasury formatting handles negatives (T-026 will color it red later)', () => {
  it('renders a negative treasury with a leading minus sign', () => {
    // Hand-craft a state with negative treasury. The store doesn't care how
    // it got there; this just exercises the leaf formatter.
    const initialState = createAureliaState()
    initialState.country.treasury = -12_345

    store = createGameStore({ seed: 1, initialState })
    const { getByTestId } = render(<TopBar store={store!} />)
    expect(getByTestId('treasury').textContent).toContain('-12,345')
  })
})

describe('T-021 — uses semantic <header> markup', () => {
  it('renders inside a <header> element', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<TopBar store={store!} />)
    expect(getByTestId('topbar').tagName.toLowerCase()).toBe('header')
  })
})
