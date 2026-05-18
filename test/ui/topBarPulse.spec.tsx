// T-034 — TopBar pulse classification test.
//
// Asserts that the treasury and approval cells receive the correct pulse class
// (`is-warning` / `is-critical`) at the documented thresholds. The thresholds
// themselves live in `APPROVAL_WARN_THRESHOLDS = [30, 20, 15]` (tunables) and
// MUST NOT be inlined — we import them and read them positionally so a vault
// re-balancing of the threshold list keeps the test honest.
//
// Pulse class rules (from TopBar.tsx — re-verified here as a contract):
//   - treasury <= 0                             → topbar__stat--treasury is-critical
//   - approval <= APPROVAL_WARN_THRESHOLDS[2]   → topbar__stat--approval is-critical
//   - approval <= APPROVAL_WARN_THRESHOLDS[1]   → topbar__stat--approval is-warning
//   - approval <= APPROVAL_WARN_THRESHOLDS[0]   → topbar__stat--approval is-warning
//   - else                                      → no pulse class
//
// Same store-injection pattern as the existing TopBar tests: construct a
// hermetic store with `createGameStore({ seed: 1, initialState })` so the
// fixture's approval / treasury start at the test-required values.

import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import { APPROVAL_WARN_THRESHOLDS } from '@engine/tunables'
import { TopBar } from '@ui/components/TopBar'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

// Helper: build a store whose initial snapshot has the requested approval +
// treasury values. We start from the canonical Aurelia state so every other
// engine invariant stays intact.
function makeStoreWith(approval: number, treasury: number): GameStore {
  const initialState = createAureliaState()
  initialState.country.approval = approval
  initialState.country.treasury = treasury
  return createGameStore({ seed: 1, initialState })
}

describe('T-034 AC — approval pulse classes match APPROVAL_WARN_THRESHOLDS', () => {
  const [warn1, warn2, crisis] = APPROVAL_WARN_THRESHOLDS

  it(`approval at warn1 (${warn1}) renders the approval cell with is-warning`, () => {
    store = makeStoreWith(warn1, 50_000)
    const { getByTestId } = render(<TopBar store={store!} />)
    const approvalCell = getByTestId('approval')
    expect(approvalCell.classList.contains('is-warning')).toBe(true)
    expect(approvalCell.classList.contains('is-critical')).toBe(false)
    expect(approvalCell.getAttribute('data-pulse')).toBe('is-warning')
  })

  it(`approval at warn2 (${warn2}) renders the approval cell with is-warning`, () => {
    store = makeStoreWith(warn2, 50_000)
    const { getByTestId } = render(<TopBar store={store!} />)
    const approvalCell = getByTestId('approval')
    expect(approvalCell.classList.contains('is-warning')).toBe(true)
    expect(approvalCell.classList.contains('is-critical')).toBe(false)
    expect(approvalCell.getAttribute('data-pulse')).toBe('is-warning')
  })

  it(`approval at crisis (${crisis}) renders the approval cell with is-critical`, () => {
    store = makeStoreWith(crisis, 50_000)
    const { getByTestId } = render(<TopBar store={store!} />)
    const approvalCell = getByTestId('approval')
    expect(approvalCell.classList.contains('is-critical')).toBe(true)
    // `is-warning` MUST NOT also be present — `is-critical` wins the classifier.
    expect(approvalCell.classList.contains('is-warning')).toBe(false)
    expect(approvalCell.getAttribute('data-pulse')).toBe('is-critical')
  })

  it(`approval above warn1 (${warn1 + 1}) has no pulse class`, () => {
    store = makeStoreWith(warn1 + 1, 50_000)
    const { getByTestId } = render(<TopBar store={store!} />)
    const approvalCell = getByTestId('approval')
    expect(approvalCell.classList.contains('is-warning')).toBe(false)
    expect(approvalCell.classList.contains('is-critical')).toBe(false)
    expect(approvalCell.getAttribute('data-pulse')).toBe('none')
  })

  it(`approval below crisis (${crisis - 1}) still renders is-critical`, () => {
    store = makeStoreWith(crisis - 1, 50_000)
    const { getByTestId } = render(<TopBar store={store!} />)
    const approvalCell = getByTestId('approval')
    expect(approvalCell.classList.contains('is-critical')).toBe(true)
    expect(approvalCell.getAttribute('data-pulse')).toBe('is-critical')
  })
})

describe('T-034 AC — treasury <= 0 triggers the critical pulse class', () => {
  it('treasury = 0 renders the treasury cell with is-critical', () => {
    // Pick an approval value comfortably above warn1 so the approval cell
    // doesn't also accrue a pulse class — keeps the assertion focused.
    store = makeStoreWith(APPROVAL_WARN_THRESHOLDS[0] + 10, 0)
    const { getByTestId } = render(<TopBar store={store!} />)
    const treasuryCell = getByTestId('treasury')
    expect(treasuryCell.classList.contains('is-critical')).toBe(true)
    expect(treasuryCell.getAttribute('data-pulse')).toBe('critical')
  })

  it('treasury < 0 renders the treasury cell with is-critical', () => {
    store = makeStoreWith(APPROVAL_WARN_THRESHOLDS[0] + 10, -1)
    const { getByTestId } = render(<TopBar store={store!} />)
    const treasuryCell = getByTestId('treasury')
    expect(treasuryCell.classList.contains('is-critical')).toBe(true)
    expect(treasuryCell.getAttribute('data-pulse')).toBe('critical')
  })

  it('treasury > 0 has no pulse class', () => {
    store = makeStoreWith(APPROVAL_WARN_THRESHOLDS[0] + 10, 1_000)
    const { getByTestId } = render(<TopBar store={store!} />)
    const treasuryCell = getByTestId('treasury')
    expect(treasuryCell.classList.contains('is-critical')).toBe(false)
    expect(treasuryCell.getAttribute('data-pulse')).toBe('none')
  })
})
