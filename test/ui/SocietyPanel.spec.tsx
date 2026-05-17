// T-024 — SocietyPanel component tests.
//
// One `describe` per AC + a few non-AC sanity checks (table semantics, the
// ideology dot's aria value, defensive clamps for happiness out of range and
// population == 0). Each test constructs a hermetic store via
// `createGameStore({ seed: 1 })` and injects it through the `store` prop —
// same test-vs-app split as TopBar / Overview / EconomyPanel.

import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import { HAPPINESS_RANGE, POP_SEGMENTS_P1 } from '@engine/tunables'
import { SocietyPanel } from '@ui/panels/SocietyPanel'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

describe('T-024 AC#1 — all 5 POPs from Aurelia render correctly', () => {
  it('renders one row per POP with the expected POP types', () => {
    store = createGameStore({ seed: 1 })
    const { getAllByTestId } = render(<SocietyPanel store={store!} />)

    // One <tr> per POP — query by the per-row test id pattern.
    const rows = getAllByTestId(/^society-row-/)
    expect(rows).toHaveLength(POP_SEGMENTS_P1.length)
    expect(rows).toHaveLength(5)

    // Each Aurelia POP type has a row.
    for (const popType of POP_SEGMENTS_P1) {
      expect(rows.some((r) => r.getAttribute('data-pop-type') === popType)).toBe(true)
    }
  })

  it('urban_workers row shows size 12,000,000 + 40%, happiness 55, employment 92%, ideology, and 3 priority chips', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)

    const row = getByTestId('society-row-urban_workers')
    const u = within(row)

    // Size: absolute (12,000,000) and percent of total population (12M / 30M = 40%).
    expect(u.getByTestId('society-size-urban_workers').textContent).toBe('12,000,000')
    expect(u.getByTestId('society-size-pct-urban_workers').textContent).toBe('40%')

    // Happiness value chip = 55 (Aurelia urban_workers happiness).
    expect(u.getByTestId('society-happiness-value-urban_workers').textContent).toBe('55')

    // Employment rate 0.92 → 92%.
    expect(u.getByTestId('society-employment-urban_workers').textContent).toBe('92%')

    // The three Aurelia priorities render as chips.
    expect(u.getByTestId('priority-jobs')).toBeInTheDocument()
    expect(u.getByTestId('priority-healthcare')).toBeInTheDocument()
    expect(u.getByTestId('priority-low_consumption_tax')).toBeInTheDocument()

    // Ideology dot wrapper present with per-POP testIdSuffix.
    expect(u.getByTestId('ideology-track-urban_workers')).toBeInTheDocument()
  })
})

describe('T-024 AC#2 — happiness bars stay within HAPPINESS_RANGE', () => {
  it('every happiness bar reports aria-valuenow inside HAPPINESS_RANGE on the default Aurelia state', () => {
    store = createGameStore({ seed: 1 })
    const { getAllByRole } = render(<SocietyPanel store={store!} />)

    const bars = getAllByRole('progressbar')
    expect(bars).toHaveLength(5)
    for (const bar of bars) {
      expect(bar.getAttribute('aria-valuemin')).toBe(String(HAPPINESS_RANGE[0]))
      expect(bar.getAttribute('aria-valuemax')).toBe(String(HAPPINESS_RANGE[1]))
      const v = Number(bar.getAttribute('aria-valuenow'))
      expect(v).toBeGreaterThanOrEqual(HAPPINESS_RANGE[0])
      expect(v).toBeLessThanOrEqual(HAPPINESS_RANGE[1])
    }
  })

  it('clamps an out-of-range POP happiness (150) to HAPPINESS_RANGE[1] in the rendered bar', () => {
    const initialState = createAureliaState()
    // Force urban_workers happiness above the legal ceiling. The engine writes
    // within range every tick (stage 3 clamps), but the UI defensively clamps
    // before painting so a corrupt fixture / initial state never overflows.
    const target = initialState.country.pops.find((p) => p.pop_type === 'urban_workers')!
    target.happiness = 150
    store = createGameStore({ seed: 1, initialState })

    const { getByTestId } = render(<SocietyPanel store={store!} />)
    const bar = getByTestId('society-happiness-urban_workers')
    const v = Number(bar.getAttribute('aria-valuenow'))
    expect(v).toBe(HAPPINESS_RANGE[1])

    // The displayed integer next to the bar is also clamped.
    expect(getByTestId('society-happiness-value-urban_workers').textContent).toBe(
      String(HAPPINESS_RANGE[1]),
    )
  })

  it('clamps a negative POP happiness (-10) to HAPPINESS_RANGE[0]', () => {
    const initialState = createAureliaState()
    const target = initialState.country.pops.find((p) => p.pop_type === 'capitalists')!
    target.happiness = -10
    store = createGameStore({ seed: 1, initialState })

    const { getByTestId } = render(<SocietyPanel store={store!} />)
    const bar = getByTestId('society-happiness-capitalists')
    expect(Number(bar.getAttribute('aria-valuenow'))).toBe(HAPPINESS_RANGE[0])
  })
})

describe('T-024 AC#3 — sort by happiness reorders rows', () => {
  it('default sort = size desc; clicking Happiness header switches to happiness desc; Size restores', () => {
    store = createGameStore({ seed: 1 })
    const { getAllByTestId, getByTestId } = render(<SocietyPanel store={store!} />)

    const readOrder = () =>
      getAllByTestId(/^society-row-/).map((r) => r.getAttribute('data-pop-type'))

    // Default = size desc: urban_workers (12M), middle_class (8M),
    // rural_workers (6M), intelligentsia (3.4M), capitalists (0.6M).
    expect(readOrder()).toEqual([
      'urban_workers',
      'middle_class',
      'rural_workers',
      'intelligentsia',
      'capitalists',
    ])

    // Click the Happiness sort button.
    fireEvent.click(getByTestId('society-sort-happiness'))

    // Happiness desc: capitalists (70), middle_class (60), intelligentsia (58),
    // urban_workers (55), rural_workers (50).
    expect(readOrder()).toEqual([
      'capitalists',
      'middle_class',
      'intelligentsia',
      'urban_workers',
      'rural_workers',
    ])

    // Click Size — back to the original ordering.
    fireEvent.click(getByTestId('society-sort-size'))
    expect(readOrder()).toEqual([
      'urban_workers',
      'middle_class',
      'rural_workers',
      'intelligentsia',
      'capitalists',
    ])
  })

  it('the active sort button reports aria-pressed=true', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)

    expect(getByTestId('society-sort-size').getAttribute('aria-pressed')).toBe('true')
    expect(getByTestId('society-sort-happiness').getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(getByTestId('society-sort-happiness'))
    expect(getByTestId('society-sort-size').getAttribute('aria-pressed')).toBe('false')
    expect(getByTestId('society-sort-happiness').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('T-024 AC#4 — tooltip shows the resolved outcome value for each priority', () => {
  it('urban_workers jobs chip → Employment: 92% (read from POP.employment_rate)', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)

    const row = getByTestId('society-row-urban_workers')
    const chip = within(row).getByTestId('priority-jobs')
    expect(chip.getAttribute('title')).toBe('Employment: 92%')
  })

  it('urban_workers healthcare chip → Health budget: 22% (read from budget_shares.health)', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)

    const row = getByTestId('society-row-urban_workers')
    const chip = within(row).getByTestId('priority-healthcare')
    // Aurelia health share = 0.22 → "22%".
    expect(chip.getAttribute('title')).toBe('Health budget: 22%')
  })

  it('urban_workers low_consumption_tax chip → Consumption tax: 15% (read from sliders)', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)
    const row = getByTestId('society-row-urban_workers')
    const chip = within(row).getByTestId('priority-low_consumption_tax')
    expect(chip.getAttribute('title')).toBe('Consumption tax: 15%')
  })

  it('intelligentsia civil_liberties chip → "Not modeled in Phase 1" (no P1 backing field)', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)
    const row = getByTestId('society-row-intelligentsia')
    const chip = within(row).getByTestId('priority-civil_liberties')
    expect(chip.getAttribute('title')).toBe('Not modeled in Phase 1')
  })

  it('rural_workers agriculture_support chip → Agriculture output: 48,000 (read from sectors)', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)
    const row = getByTestId('society-row-rural_workers')
    const chip = within(row).getByTestId('priority-agriculture_support')
    expect(chip.getAttribute('title')).toBe('Agriculture output: 48,000')
  })

  it('capitalists low_corporate_tax chip → Corporate tax: 30% (read from sliders)', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)
    const row = getByTestId('society-row-capitalists')
    const chip = within(row).getByTestId('priority-low_corporate_tax')
    expect(chip.getAttribute('title')).toBe('Corporate tax: 30%')
  })
})

// --- Non-AC sanity checks --------------------------------------------------

describe('T-024 — panel mounts inside a <section> with the expected test id', () => {
  it('renders a <section data-testid="society-panel">', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)
    expect(getByTestId('society-panel').tagName.toLowerCase()).toBe('section')
  })
})

describe('T-024 — ideology dot exposes its numeric value via aria-label', () => {
  it('intelligentsia (ideology = -0.5) reports aria-label "Ideology: -0.50"', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)
    const track = getByTestId('ideology-track-intelligentsia')
    expect(track.getAttribute('aria-label')).toBe('Ideology: -0.50')
  })

  it('middle_class (ideology = 0) reports aria-label "Ideology: 0.00"', () => {
    store = createGameStore({ seed: 1 })
    const { getByTestId } = render(<SocietyPanel store={store!} />)
    const track = getByTestId('ideology-track-middle_class')
    expect(track.getAttribute('aria-label')).toBe('Ideology: 0.00')
  })
})

describe('T-024 — degenerate fixture: population == 0 → size % falls back to "–%"', () => {
  it('renders "–%" rather than NaN% when total population is 0', () => {
    const initialState = createAureliaState()
    initialState.country.population = 0
    store = createGameStore({ seed: 1, initialState })
    const { getByTestId } = render(<SocietyPanel store={store!} />)
    expect(getByTestId('society-size-pct-urban_workers').textContent).toBe('–%')
  })
})
