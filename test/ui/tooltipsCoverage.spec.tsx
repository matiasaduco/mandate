// T-032 AC #1 — Numeric-surface coverage test.
//
// Renders every panel that surfaces numeric / textual readouts and asserts
// that each AC-listed surface is wrapped in the project Tooltip primitive
// (i.e. carries a `data-tooltip-key` attribute pointing at a canonical entry
// in `tooltips.ts`).
//
// We assert *coverage*, not the Radix popover surface here. The Radix open /
// focus / Escape contract is exercised in `Tooltip.spec.tsx` independently —
// duplicating that here would only re-test Radix. What this file proves is
// the wiring: that every panel actually wraps its surfaces with the primitive
// keyed against the right canonical entry.

import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import { EconomyPanel } from '@ui/panels/EconomyPanel'
import { EventFeed } from '@ui/components/EventFeed'
import { OverviewPanel } from '@ui/panels/OverviewPanel'
import { PoliticsPanel } from '@ui/panels/PoliticsPanel'
import { SocietyPanel } from '@ui/panels/SocietyPanel'
import { TopBar } from '@ui/components/TopBar'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'
import type { EngineEvent } from '@engine/types'
import { TOOLTIPS } from '@ui/copy/tooltips'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

/**
 * Helper: assert that the rendered subtree contains at least one element
 * whose `data-tooltip-key` matches the given key. Centralises the assertion
 * so each panel test stays a single readable expression.
 */
function expectKey(container: HTMLElement, key: keyof typeof TOOLTIPS): void {
  const found = container.querySelector(`[data-tooltip-key="${key}"]`)
  expect(
    found,
    `Expected at least one element with data-tooltip-key="${String(key)}" in the rendered subtree`,
  ).not.toBeNull()
}

describe('T-032 AC #1 — TopBar wraps every numeric surface in <Tooltip>', () => {
  it('treasury, approval, calendar, and speed control are tooltip triggers', () => {
    store = createGameStore({ seed: 1 })
    const { container } = render(<TopBar store={store!} />)
    expectKey(container, 'country.treasury')
    expectKey(container, 'country.approval')
    expectKey(container, 'TICK_LENGTH_MONTHS')
    expectKey(container, 'SPEEDS')
  })
})

describe('T-032 AC #1 — Overview panel wraps all 7 KPI cards', () => {
  it('population, gdp, treasury, approval, stability, government, head_of_state', () => {
    store = createGameStore({ seed: 1 })
    const { container } = render(<OverviewPanel store={store!} />)
    expectKey(container, 'country.population')
    expectKey(container, 'country.gdp')
    expectKey(container, 'country.treasury')
    expectKey(container, 'country.approval')
    expectKey(container, 'country.stability')
    expectKey(container, 'country.government')
    expectKey(container, 'country.head_of_state')
  })
})

describe('T-032 AC #1 — Economy panel wraps every slider + sector row + chart legend', () => {
  it('3 tax sliders + 5 budget sliders + sector output/employment + GDP trend wrap', () => {
    store = createGameStore({ seed: 1 })
    const { container } = render(<EconomyPanel store={store!} />)
    // Tax sliders.
    expectKey(container, 'tax.income')
    expectKey(container, 'tax.corporate')
    expectKey(container, 'tax.consumption')
    // Budget sliders.
    expectKey(container, 'budget.health')
    expectKey(container, 'budget.education')
    expectKey(container, 'budget.infrastructure')
    expectKey(container, 'budget.security')
    expectKey(container, 'budget.welfare')
    // Sector rows surface output + employment via the SectorBreakdown.
    expectKey(container, 'sector.output')
    expectKey(container, 'sector.employment')
    // GDP / balance flow values + chart legend (TREND_HISTORY_TICKS).
    expectKey(container, 'country.gdp')
    expectKey(container, 'country.balance')
    expectKey(container, 'TREND_HISTORY_TICKS')
    expectKey(container, 'TAX_INCIDENCE_WEIGHTS_P1')
  })
})

describe('T-032 AC #1 — Society panel wraps each POP row\'s metrics', () => {
  it('happiness bar, employment cell, ideology dot, and priority chips wrap', () => {
    store = createGameStore({ seed: 1 })
    const { container } = render(<SocietyPanel store={store!} />)
    expectKey(container, 'pop.happiness')
    expectKey(container, 'pop.employment_rate')
    expectKey(container, 'pop.ideology')
    expectKey(container, 'pop.priorities')
  })
})

describe('T-032 AC #1 — Politics panel wraps approval value, drivers, breakdown, decree buttons', () => {
  it('approval, smoothing, drivers, contribution bars, and each decree button wrap', () => {
    store = createGameStore({ seed: 1 })
    const { container } = render(<PoliticsPanel store={store!} />)
    expectKey(container, 'country.approval')
    expectKey(container, 'APPROVAL_INERTIA_TAU')
    expectKey(container, 'politics.approval_drivers')
    expectKey(container, 'politics.contribution_bar')
    expectKey(container, 'decree.public_address')
    expectKey(container, 'decree.emergency_relief')
    expectKey(container, 'decree.industrial_subsidy')
  })
})

describe('T-032 AC #1 — Event feed wraps each event row by event type', () => {
  it('each rendered event surfaces a tooltip key under event.*', () => {
    // Hand-craft the engine-event set so the feed renders one of each P1 type.
    const events: EngineEvent[] = [
      { type: 'PolicyChanged', slider_id: 'tax_income', old_value: 25, new_value: 26, tick: 1 },
      {
        type: 'DecreeIssued',
        decree_id: 'public_address',
        cost: 0,
        effect: { type: 'happiness_bump_all', delta: 5 },
        tick: 1,
      },
      { type: 'TreasuryThresholdCrossed', direction: 'below', threshold: 0, tick: 2 },
      { type: 'ApprovalThresholdCrossed', direction: 'below', threshold: 30, tick: 2 },
      {
        type: 'GameOver',
        reason: 'bankruptcy',
        final_state_snapshot: createAureliaState() as never,
        tick: 3,
      },
    ]
    const { container } = render(<EventFeed events={events} />)
    expectKey(container, 'event.PolicyChanged')
    expectKey(container, 'event.DecreeIssued')
    expectKey(container, 'event.TreasuryThresholdCrossed')
    expectKey(container, 'event.ApprovalThresholdCrossed')
    expectKey(container, 'event.GameOver')
  })
})
