// T-023 — Economy panel.
//
// First WRITABLE UI surface. Reads the player's tax sliders, budget shares,
// per-tick flows, GDP trend, and sector breakdown; writes are confined to
// `enqueueDecision` slider commits (per the Player View contract, stage 7 is
// read-only / writes via the decision queue, never direct state mutation).
//
// Composition:
//   - "Tax policy"  — 3 tax sliders + tax_income flow headline.
//   - "Budget"      — 5 budget-share sliders + Σ indicator + spend / balance.
//   - "GDP"         — GdpChart over the rolling TREND_HISTORY_TICKS trend.
//   - "Sectors"     — SectorBreakdown (output + employment_share per sector).
//
// UX conventions (per brief):
//   - Sliders commit on release only (see `<Slider>` for the contract).
//   - Tax slider display = raw integer percent (slider value IS the percent).
//   - Budget slider display = raw share × 100 (rendered 0–100 step 1). On
//     commit, divide by 100 to get the share the engine consumes.
//   - Σ indicator: turns red if outside 100 ± BUDGET_SHARE_DISPLAY_TOLERANCE
//     (percent space). Engine already normalizes inside stage 2 with a warning
//     — UI does not force sum=1.0 on commit.
//   - "Recently changed" indicator: scan the engine's PolicyChanged events for
//     the most recent matching slider_id; show the indicator if
//     `snapshot.tick - event.tick <= RECENTLY_CHANGED_TICK_WINDOW`.
//   - `flows.balance` paints red when negative (matches OverviewPanel's
//     negative-treasury treatment).

import { useMemo } from 'react'

import type { EngineEvent, SliderId } from '@engine/types'
import {
  BUDGET_CATEGORIES_P1,
  TAX_CONSUMPTION_RANGE,
  TAX_CORPORATE_RANGE,
  TAX_INCOME_RANGE,
} from '@engine/tunables'
import { formatNumber, formatTitle } from '@ui/components/format'
import { GdpChart } from '@ui/components/GdpChart'
import { SectorBreakdown } from '@ui/components/SectorBreakdown'
import { Slider } from '@ui/components/Slider'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'

export type EconomyPanelProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component then resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
}

// Display-only tolerance for the Σ indicator. The engine's stage-2
// `SHARE_NORMALIZE_TOLERANCE` is 0.001 (share space); the UI works in percent
// space, so we compare against 1.0 (= 1% of the percent total). Module-local
// because it is purely a display threshold and never touches engine math.
const BUDGET_SHARE_DISPLAY_TOLERANCE = 1.0

// How many ticks back the "recently changed" indicator considers the slider
// fresh. Display-only — does not affect the engine state. Picked so a single
// commit shows the indicator for the tick it lands AND the immediately
// following tick (covers the perception gap between commit and rendered
// snapshot under 1× speed).
const RECENTLY_CHANGED_TICK_WINDOW = 2

const BUDGET_CATEGORIES = BUDGET_CATEGORIES_P1 as readonly (typeof BUDGET_CATEGORIES_P1)[number][]

/**
 * Build a `Record<SliderId, boolean>` indicating, per slider, whether the most
 * recent `PolicyChanged` event for that slider lies within
 * `RECENTLY_CHANGED_TICK_WINDOW` ticks of the current tick. Memoized on the
 * events array reference + current tick — both stable across unrelated
 * re-renders, so this rebuilds only when the event feed actually grows or the
 * tick actually advances.
 */
function computeRecentlyChanged(
  events: EngineEvent[],
  currentTick: number,
): Partial<Record<SliderId, boolean>> {
  const out: Partial<Record<SliderId, boolean>> = {}
  // Walk newest-to-oldest so we can short-circuit per slider on the first
  // match.
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.type !== 'PolicyChanged') continue
    if (out[ev.slider_id] !== undefined) continue
    out[ev.slider_id] = currentTick - ev.tick <= RECENTLY_CHANGED_TICK_WINDOW
  }
  return out
}

export function EconomyPanel({ store }: EconomyPanelProps) {
  // Resolve the store ONCE per render — same pattern as TopBar / OverviewPanel.
  const resolved: GameStore = store ?? getGameStore()

  // Narrow selectors per displayed slice. The slider values come straight off
  // `country.sliders` / `country.budget_shares`; everything else is read-only.
  const sliders = resolved((s: GameStoreState) => s.snapshot.country.sliders)
  const budgetShares = resolved((s: GameStoreState) => s.snapshot.country.budget_shares)
  const sectors = resolved((s: GameStoreState) => s.snapshot.country.sectors)
  const gdp = resolved((s: GameStoreState) => s.snapshot.country.gdp)
  const flows = resolved((s: GameStoreState) => s.snapshot.flows)
  const tick = resolved((s: GameStoreState) => s.snapshot.tick)
  const events = resolved((s: GameStoreState) => s.events)
  const gdpTrend = resolved((s: GameStoreState) => s.trends.gdp)

  // "Recently changed" indicator map. Memoized so the inner Slider components
  // see a stable `recentlyChanged` prop when nothing relevant changed.
  const recentlyChanged = useMemo(
    () => computeRecentlyChanged(events, tick),
    [events, tick],
  )

  // Single dispatch helper — every slider in the panel funnels through this so
  // the decision shape stays consistent (engine `SliderDecision`).
  const commitSlider = (slider_id: SliderId, value: number) => {
    resolved.getState().enqueueDecision({ type: 'slider', slider_id, value })
  }

  // --- Budget share calculations -----------------------------------------
  // We render shares as integer percents (0–100). On commit we divide by 100
  // to land back in share space [0, 1] before enqueueing.
  const budgetPercents = BUDGET_CATEGORIES.map((cat) => budgetShares[cat] * 100)
  const budgetSumPercent = budgetPercents.reduce((a, b) => a + b, 0)
  const budgetWithinTolerance =
    Math.abs(budgetSumPercent - 100) <= BUDGET_SHARE_DISPLAY_TOLERANCE
  const balanceIsNegative = flows.balance < 0

  return (
    <section
      className="economy-panel"
      data-testid="economy-panel"
      aria-label="Country economy"
    >
      {/* --- Tax policy -------------------------------------------------- */}
      <section className="economy-panel__section" aria-labelledby="economy-tax-heading">
        <h3 id="economy-tax-heading">Tax policy</h3>
        <div className="economy-panel__flow">
          <span className="economy-panel__flow-label">Tax income (per tick)</span>
          <span className="economy-panel__flow-value" data-testid="economy-tax-income">
            {formatNumber(flows.tax_income)}
          </span>
        </div>
        <div className="economy-panel__sliders">
          <Slider
            id="tax_income"
            label="Income tax"
            min={TAX_INCOME_RANGE[0]}
            max={TAX_INCOME_RANGE[1]}
            value={sliders.tax_income}
            onCommit={(v) => commitSlider('tax_income', v)}
            formatDisplay={(v) => `${v}%`}
            recentlyChanged={recentlyChanged.tax_income ?? false}
          />
          <Slider
            id="tax_corporate"
            label="Corporate tax"
            min={TAX_CORPORATE_RANGE[0]}
            max={TAX_CORPORATE_RANGE[1]}
            value={sliders.tax_corporate}
            onCommit={(v) => commitSlider('tax_corporate', v)}
            formatDisplay={(v) => `${v}%`}
            recentlyChanged={recentlyChanged.tax_corporate ?? false}
          />
          <Slider
            id="tax_consumption"
            label="Consumption tax"
            min={TAX_CONSUMPTION_RANGE[0]}
            max={TAX_CONSUMPTION_RANGE[1]}
            value={sliders.tax_consumption}
            onCommit={(v) => commitSlider('tax_consumption', v)}
            formatDisplay={(v) => `${v}%`}
            recentlyChanged={recentlyChanged.tax_consumption ?? false}
          />
        </div>
      </section>

      {/* --- Budget ----------------------------------------------------- */}
      <section className="economy-panel__section" aria-labelledby="economy-budget-heading">
        <h3 id="economy-budget-heading">Budget</h3>
        <div className="economy-panel__flow">
          <span className="economy-panel__flow-label">Budget spend (per tick)</span>
          <span className="economy-panel__flow-value" data-testid="economy-budget-spend">
            {formatNumber(flows.budget_spend)}
          </span>
        </div>
        <div className="economy-panel__flow">
          <span className="economy-panel__flow-label">Balance (per tick)</span>
          <span
            className={`economy-panel__flow-value${balanceIsNegative ? ' is-negative' : ''}`}
            data-testid="economy-balance"
          >
            {formatNumber(flows.balance)}
          </span>
        </div>
        <div className="economy-panel__sliders">
          {BUDGET_CATEGORIES.map((cat, idx) => {
            const sliderId: SliderId = `budget_${cat}`
            return (
              <Slider
                key={cat}
                id={sliderId}
                label={formatTitle(cat)}
                min={0}
                max={100}
                // Round to integer percent — the slider step is 1, so values
                // arriving from the engine that are tiny fractions of a
                // percent (e.g. 22 from 0.22) land cleanly. Math.round is a
                // belt-and-braces guard.
                value={Math.round(budgetPercents[idx])}
                onCommit={(v) => commitSlider(sliderId, v / 100)}
                formatDisplay={(v) => `${v}%`}
                recentlyChanged={recentlyChanged[sliderId] ?? false}
              />
            )
          })}
        </div>
        <div
          className={`economy-panel__sum${budgetWithinTolerance ? '' : ' is-off'}`}
          data-testid="economy-budget-sum"
          data-within-tolerance={budgetWithinTolerance}
        >
          {`Σ = ${Math.round(budgetSumPercent)}%`}
          {budgetWithinTolerance ? null : (
            <span className="economy-panel__sum-hint">
              {budgetSumPercent < 100
                ? ` (under by ${Math.round(100 - budgetSumPercent)}%)`
                : ` (over by ${Math.round(budgetSumPercent - 100)}%)`}
            </span>
          )}
        </div>
      </section>

      {/* --- GDP -------------------------------------------------------- */}
      <section className="economy-panel__section" aria-labelledby="economy-gdp-heading">
        <h3 id="economy-gdp-heading">GDP</h3>
        <div className="economy-panel__flow">
          <span className="economy-panel__flow-label">Current GDP</span>
          <span className="economy-panel__flow-value" data-testid="economy-gdp">
            {formatNumber(gdp)}
          </span>
        </div>
        <GdpChart data={gdpTrend} />
      </section>

      {/* --- Sectors ---------------------------------------------------- */}
      <section className="economy-panel__section" aria-labelledby="economy-sectors-heading">
        <h3 id="economy-sectors-heading">Sectors</h3>
        <SectorBreakdown sectors={sectors} />
      </section>
    </section>
  )
}
