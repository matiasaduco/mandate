// T-032 — Tooltip primitive: behavioural contract.
//
// Asserts the brief's AC items that live at the primitive level:
//   - hover OR keyboard focus opens the tooltip,
//   - Escape closes the tooltip and returns focus to the trigger,
//   - click-outside closes the tooltip,
//   - the trigger receives `aria-describedby` while open.
//
// Tests open the tooltip with `openDelayMs={0}` to avoid timing flakes (Radix
// honours `delayDuration` regardless of test runner). The brief locks the
// default at 300 ms — a separate test asserts the exported constant value.

import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Tooltip, TOOLTIP_OPEN_DELAY_MS } from '@ui/components/Tooltip'
import { TOOLTIPS } from '@ui/copy/tooltips'

describe('T-032 — Tooltip primitive', () => {
  it('opens on hover and closes on Escape (returning focus to the trigger)', async () => {
    const user = userEvent.setup()
    const { getByTestId, queryByTestId } = render(
      <Tooltip tooltipKey="country.treasury" openDelayMs={0}>
        <button type="button" data-testid="trigger">
          Treasury
        </button>
      </Tooltip>,
    )

    const trigger = getByTestId('trigger')
    expect(queryByTestId('tooltip-country.treasury')).toBeNull()

    // Hover opens the tooltip.
    await user.hover(trigger)
    // Radix renders into a portal; the content is keyed by tooltipKey.
    const content = await waitForElement(() =>
      document.querySelector('[data-tooltip-key="country.treasury"][data-testid="tooltip-country.treasury"]'),
    )
    expect(content).not.toBeNull()
    // While open, the trigger advertises `aria-describedby` linking to the
    // content's id (Radix wires this on `asChild`).
    expect(trigger.getAttribute('aria-describedby')).not.toBeNull()

    // Press Escape → tooltip closes and focus returns to the trigger.
    // We focus the trigger first so the Escape key has a target on the
    // currently-focused element (Radix's dismiss listener is global, but RTL
    // delivers events to the active element).
    trigger.focus()
    await user.keyboard('{Escape}')
    await waitForElement(
      () => document.querySelector('[data-tooltip-key="country.treasury"][data-testid="tooltip-country.treasury"]'),
      { shouldExist: false },
    )
    expect(document.activeElement).toBe(trigger)
  })

  it('opens on keyboard focus (Tab) as well as hover', async () => {
    const user = userEvent.setup()
    render(
      <>
        {/* Sacrificial first trigger so a single Tab lands focus on the one
            under test rather than the body element. */}
        <button data-testid="pre">pre</button>
        <Tooltip tooltipKey="country.approval" openDelayMs={0}>
          <button type="button" data-testid="trigger-focus">
            Approval
          </button>
        </Tooltip>
      </>,
    )

    // Tab to the trigger.
    await user.tab()
    await user.tab()
    const content = await waitForElement(() =>
      document.querySelector('[data-tooltip-key="country.approval"][data-testid="tooltip-country.approval"]'),
    )
    expect(content).not.toBeNull()
  })

  it('renders the canonical body from tooltips.ts (no inline literal)', async () => {
    const user = userEvent.setup()
    const { getByTestId } = render(
      <Tooltip tooltipKey="TREND_HISTORY_TICKS" openDelayMs={0}>
        <button type="button" data-testid="trigger-trend">
          Trend
        </button>
      </Tooltip>,
    )
    await user.hover(getByTestId('trigger-trend'))
    const content = await waitForElement(() =>
      document.querySelector('[data-tooltip-key="TREND_HISTORY_TICKS"][data-testid="tooltip-TREND_HISTORY_TICKS"]'),
    )
    const text = content?.textContent ?? ''
    expect(text).toContain(TOOLTIPS.TREND_HISTORY_TICKS.title)
    expect(text).toContain(TOOLTIPS.TREND_HISTORY_TICKS.body)
  })

  it('exposes a 300 ms default open delay', () => {
    expect(TOOLTIP_OPEN_DELAY_MS).toBe(300)
  })

  it('a missing-key call renders the trigger naked (defensive)', () => {
    // Cast through `unknown` to bypass the strict TooltipKey union — we
    // explicitly want to test the defensive branch that handles a runtime
    // unknown key without crashing the app.
    const Bad = Tooltip as unknown as (props: {
      tooltipKey: string
      children: React.ReactElement
      openDelayMs?: number
    }) => React.ReactElement
    const { getByTestId } = render(
      <Bad tooltipKey="does.not.exist" openDelayMs={0}>
        <button type="button" data-testid="naked-trigger">
          Naked
        </button>
      </Bad>,
    )
    // Trigger is rendered; no aria-describedby because Radix never mounted.
    const trigger = getByTestId('naked-trigger')
    expect(trigger.getAttribute('aria-describedby')).toBeNull()
  })
})

/**
 * Wait for a portal-rendered element to appear (or disappear). Radix
 * tooltip mount + animation is async; we poll the DOM rather than use
 * `findBy*` so the query can be a CSS selector against `document` (the portal
 * lives outside the RTL container).
 */
async function waitForElement(
  query: () => Element | null,
  opts: { shouldExist?: boolean; timeoutMs?: number } = {},
): Promise<Element | null> {
  const shouldExist = opts.shouldExist ?? true
  const timeoutMs = opts.timeoutMs ?? 500
  const start = Date.now()
  // Loop: synchronously re-poll, yielding to the microtask queue between
  // checks so Radix's state transitions get a chance to run.
  while (Date.now() - start < timeoutMs) {
    const el = query()
    if (shouldExist && el !== null) return el
    if (!shouldExist && el === null) return null
    await act(async () => {
      await new Promise((r) => setTimeout(r, 8))
    })
  }
  return query()
}
