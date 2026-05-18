// T-032 — Drift test for `src/ui/copy/tooltips.ts`.
//
// This test enforces AC #3 at the code level (per resolved open question §2 in
// the brief): every UI-visible tunable from the curated list has a
// corresponding entry in `tooltips.ts`, and every tunable-mirror key in
// `tooltips.ts` has a non-empty `body`. The "UI-visible" list lives here as
// a TS const — the vault page's editorial state is reviewed by humans, not
// Vitest.
//
// The existing `test/engine/tunables.spec.ts` already enforces vault ↔ code
// mirror on values. This test only covers the new `description` axis at the
// code level.

import { describe, expect, it } from 'vitest'

import * as Tunables from '@engine/tunables'
import { TOOLTIPS, type TooltipKey } from '@ui/copy/tooltips'

/**
 * The set of tunable names that are surfaced in the Phase 1 UI and therefore
 * require a tooltip entry. Sourced verbatim from the T-032 brief — keep in
 * sync if the brief widens (e.g. T-034 adds another visible slider).
 *
 * Entries with no Phase 1 tooltip surface (`RADICALIZATION_PASSIVE_DECAY`,
 * `SECTOR_BASE_GROWTH`, etc., per the brief's "Entries with no Phase 1
 * tooltip surface" paragraph) are deliberately not in this list.
 */
const UI_VISIBLE_TUNABLES = [
  // Time
  'TICK_LENGTH_MONTHS',
  'REAL_SECONDS_PER_TICK_AT_1X',
  'SPEEDS',
  // Loss conditions
  'BANKRUPTCY_NEGATIVE_BALANCE_TICKS',
  'APPROVAL_CRISIS_THRESHOLD',
  'APPROVAL_CRISIS_TICKS',
  'APPROVAL_WARN_THRESHOLDS',
  // Tax & economy
  'TAX_INCOME_RANGE',
  'TAX_CORPORATE_RANGE',
  'TAX_CONSUMPTION_RANGE',
  'TAX_DAMPENING_BREAKPOINT',
  'TAX_INCIDENCE_WEIGHTS_P1',
  // Approval
  'APPROVAL_INERTIA_TAU',
  // POPs
  'HAPPINESS_RANGE',
  'INCOME_CLAMPED_HAPPINESS_PENALTY_P1',
  // Decrees
  'PUBLIC_ADDRESS_HAPPINESS_DELTA_P1',
  'EMERGENCY_RELIEF_HAPPINESS_DELTA_P1',
  'EMERGENCY_RELIEF_DURATION_P1',
  'EMERGENCY_RELIEF_COST_P1',
  'INDUSTRIAL_SUBSIDY_PCT_P1',
  'INDUSTRIAL_SUBSIDY_DURATION_P1',
  'INDUSTRIAL_SUBSIDY_COST_P1',
  // UI / feedback
  'EVENT_FEED_LENGTH',
  'TREND_HISTORY_TICKS',
] as const

/** Derived-metric keys that the brief explicitly calls out. */
const DERIVED_METRIC_KEYS: readonly TooltipKey[] = [
  'country.approval',
  'country.treasury',
  'country.stability',
  'country.population',
  'country.gdp',
  'country.balance',
  'country.government',
  'country.head_of_state',
  'pop.income',
  'pop.happiness',
  'pop.ideology',
  'pop.radicalization',
  'pop.employment_rate',
  'pop.priorities',
  'sector.output',
  'sector.employment',
  'sector.growth',
  'tax.income',
  'tax.corporate',
  'tax.consumption',
  'budget.health',
  'budget.education',
  'budget.infrastructure',
  'budget.security',
  'budget.welfare',
  'decree.public_address',
  'decree.emergency_relief',
  'decree.industrial_subsidy',
  'event.PolicyChanged',
  'event.DecreeIssued',
  'event.TreasuryThresholdCrossed',
  'event.ApprovalThresholdCrossed',
  'event.GameOver',
  'slider.preview',
  'politics.approval_drivers',
  'politics.contribution_bar',
]

describe('T-032 AC #3 — tooltips.ts drift against tunables.ts (code-level)', () => {
  it('every UI-visible tunable has a tooltip entry', () => {
    const missing: string[] = []
    for (const name of UI_VISIBLE_TUNABLES) {
      // Confirm the tunable actually exports — guards against a typo in the
      // curated list above.
      expect(
        Object.prototype.hasOwnProperty.call(Tunables, name),
        `Tunable '${name}' from the UI-visible list is not exported by tunables.ts`,
      ).toBe(true)
      if (!Object.prototype.hasOwnProperty.call(TOOLTIPS, name)) {
        missing.push(name)
      }
    }
    expect(missing, `tooltips.ts is missing entries for: ${missing.join(', ')}`).toEqual([])
  })

  it('every tooltip key whose name matches a tunable has a non-empty body', () => {
    for (const name of UI_VISIBLE_TUNABLES) {
      const entry = (TOOLTIPS as Record<string, { title: string; body: string }>)[name]
      expect(entry, `Tunable '${name}' missing from tooltips.ts`).toBeDefined()
      expect(entry.title.length, `Tunable '${name}' has empty title`).toBeGreaterThan(0)
      expect(entry.body.length, `Tunable '${name}' has empty body`).toBeGreaterThan(0)
    }
  })

  it('every derived-metric key called out in the brief exists in tooltips.ts', () => {
    const missing: string[] = []
    for (const key of DERIVED_METRIC_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(TOOLTIPS, key)) {
        missing.push(key)
      }
    }
    expect(missing, `tooltips.ts is missing derived keys: ${missing.join(', ')}`).toEqual([])
  })

  it('every tooltip entry has a non-empty title and body', () => {
    for (const [key, entry] of Object.entries(TOOLTIPS)) {
      expect(entry.title.length, `'${key}' has empty title`).toBeGreaterThan(0)
      expect(entry.body.length, `'${key}' has empty body`).toBeGreaterThan(0)
    }
  })
})
