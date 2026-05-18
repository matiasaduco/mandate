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

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useMemo, useState } from 'react'

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
import { Slider, type SliderProps } from '@ui/components/Slider'
import { SliderPreview } from '@ui/components/SliderPreview'
import { Tooltip } from '@ui/components/Tooltip'
import type { TooltipKey } from '@ui/copy/tooltips'
import { useSliderPreview } from '@ui/hooks/useSliderPreview'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'
import { MOTION_KPI_TWEEN_MS, SPRING_KPI } from '@ui/theme/tokens'

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
 * T-034 — Animated KPI value used by the panel's flow headlines. Mirrors the
 * `NumericCard` pattern in OverviewPanel: a spring-tweened `motion.span` keyed
 * by the displayed formatted text, wrapped in AnimatePresence so the in/out
 * tween fires every time the rendered value changes. Reduced-motion bypasses
 * both AnimatePresence and the spring so the DOM stays static and the test
 * harness can assert the absence of motion side-effects.
 *
 * Kept private to this module: the politics / society panels use the same
 * pattern but with their own colocated definitions so each panel owns the
 * specifics (className, test hooks) without indirection.
 */
function KpiValue({
  formatted,
  className,
  testId,
}: {
  formatted: string
  className?: string
  testId?: string
}) {
  const reducedMotion = useReducedMotion()
  const transition =
    reducedMotion === true
      ? { duration: 0 }
      : {
          type: 'spring' as const,
          ...SPRING_KPI,
          duration: MOTION_KPI_TWEEN_MS / 1000,
        }
  if (reducedMotion === true) {
    return (
      <span
        className={className}
        data-testid={testId}
        data-kpi-tween="instant"
      >
        {formatted}
      </span>
    )
  }
  return (
    <span
      className={className}
      data-testid={testId}
      data-kpi-tween="spring"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={formatted}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={transition}
        >
          {formatted}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

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

/**
 * T-027 — Per-slider wrapper that owns its own candidate state and renders
 * the `<SliderPreview>` into the `preview` slot on `<Slider>`. Kept private
 * to this module: the EconomyPanel uses it 8 times (3 tax + 5 budget); no
 * other panel has writable sliders yet so there's no use-case for sharing.
 *
 * Why a wrapper rather than calling `useSliderPreview` 8x in EconomyPanel:
 *   - Each invocation needs an isolated candidate state — colocating in a
 *     child keeps the per-slider state lifecycle tight.
 *   - React's rules-of-hooks forbid calling hooks inside loops; the budget
 *     sliders are mapped over `BUDGET_CATEGORIES`, so the wrapper is the
 *     idiomatic way to hoist `useSliderPreview` out of that loop.
 *
 * On commit, the wrapper clears its candidate so the preview disappears once
 * the player releases — by the next tick the snapshot reflects the new value
 * and there is nothing more to preview from the current position.
 */
type PreviewedSliderProps = {
  store: GameStore
  sliderId: SliderId
  /**
   * Maps the slider's RAW thumb value (what the input emits) to the engine's
   * decision-value space. Tax sliders pass identity; budget sliders divide
   * by 100 (percent → share). Mirrors the parent's `commitSlider` math so
   * the preview and the commit speak the same currency.
   */
  toDecisionValue: (raw: number) => number
  /**
   * Forward-only commit handler — exactly the same function the Slider would
   * have called without the preview wiring. The wrapper invokes it after
   * clearing its local candidate so the preview disappears immediately on
   * release.
   */
  onCommit: (raw: number) => void
} & Pick<
  SliderProps,
  | 'id'
  | 'label'
  | 'min'
  | 'max'
  | 'value'
  | 'formatDisplay'
  | 'recentlyChanged'
  | 'tooltipKey'
>

function PreviewedSlider({
  store,
  sliderId,
  toDecisionValue,
  onCommit,
  // Pass through to Slider. Pulled out only so the prop spread below stays
  // typed against `SliderProps`.
  tooltipKey,
  ...sliderProps
}: PreviewedSliderProps) {
  // Per-slider local candidate. `null` means "no drag in progress" → no
  // preview rendered. Cleared on commit so the preview vanishes on release.
  const [candidate, setCandidate] = useState<number | null>(null)
  // Translate the raw thumb value into engine-decision space BEFORE calling
  // the hook so the cache key uses the same units the engine will see on
  // commit. Otherwise a budget slider would cache by percent (e.g. 22) but
  // commit a share (0.22) and the preview would mismatch.
  const candidateForEngine = candidate === null ? null : toDecisionValue(candidate)
  const result = useSliderPreview(sliderId, candidateForEngine, store)

  return (
    <Slider
      {...sliderProps}
      tooltipKey={tooltipKey}
      onCommit={(v) => {
        setCandidate(null)
        onCommit(v)
      }}
      onCandidateChange={(v) => setCandidate(v)}
      preview={<SliderPreview result={result} sliderId={sliderId} />}
    />
  )
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
        <Tooltip tooltipKey="TAX_INCIDENCE_WEIGHTS_P1">
          <div className="economy-panel__flow" tabIndex={0}>
            <span className="economy-panel__flow-label">Tax income (per tick)</span>
            <KpiValue
              formatted={formatNumber(flows.tax_income)}
              className="economy-panel__flow-value"
              testId="economy-tax-income"
            />
          </div>
        </Tooltip>
        <div className="economy-panel__sliders">
          <PreviewedSlider
            store={resolved}
            sliderId="tax_income"
            id="tax_income"
            label="Income tax"
            min={TAX_INCOME_RANGE[0]}
            max={TAX_INCOME_RANGE[1]}
            value={sliders.tax_income}
            onCommit={(v) => commitSlider('tax_income', v)}
            toDecisionValue={(v) => v}
            formatDisplay={(v) => `${v}%`}
            recentlyChanged={recentlyChanged.tax_income ?? false}
            tooltipKey="tax.income"
          />
          <PreviewedSlider
            store={resolved}
            sliderId="tax_corporate"
            id="tax_corporate"
            label="Corporate tax"
            min={TAX_CORPORATE_RANGE[0]}
            max={TAX_CORPORATE_RANGE[1]}
            value={sliders.tax_corporate}
            onCommit={(v) => commitSlider('tax_corporate', v)}
            toDecisionValue={(v) => v}
            formatDisplay={(v) => `${v}%`}
            recentlyChanged={recentlyChanged.tax_corporate ?? false}
            tooltipKey="tax.corporate"
          />
          <PreviewedSlider
            store={resolved}
            sliderId="tax_consumption"
            id="tax_consumption"
            label="Consumption tax"
            min={TAX_CONSUMPTION_RANGE[0]}
            max={TAX_CONSUMPTION_RANGE[1]}
            value={sliders.tax_consumption}
            onCommit={(v) => commitSlider('tax_consumption', v)}
            toDecisionValue={(v) => v}
            formatDisplay={(v) => `${v}%`}
            recentlyChanged={recentlyChanged.tax_consumption ?? false}
            tooltipKey="tax.consumption"
          />
        </div>
      </section>

      {/* --- Budget ----------------------------------------------------- */}
      <section className="economy-panel__section" aria-labelledby="economy-budget-heading">
        <h3 id="economy-budget-heading">Budget</h3>
        <Tooltip tooltipKey="country.balance">
          <div className="economy-panel__flow" tabIndex={0}>
            <span className="economy-panel__flow-label">Budget spend (per tick)</span>
            <KpiValue
              formatted={formatNumber(flows.budget_spend)}
              className="economy-panel__flow-value"
              testId="economy-budget-spend"
            />
          </div>
        </Tooltip>
        <Tooltip tooltipKey="country.balance">
          <div className="economy-panel__flow" tabIndex={0}>
            <span className="economy-panel__flow-label">Balance (per tick)</span>
            <KpiValue
              formatted={formatNumber(flows.balance)}
              className={`economy-panel__flow-value${balanceIsNegative ? ' is-negative' : ''}`}
              testId="economy-balance"
            />
          </div>
        </Tooltip>
        <div className="economy-panel__sliders">
          {BUDGET_CATEGORIES.map((cat, idx) => {
            const sliderId: SliderId = `budget_${cat}`
            const budgetTooltipKey = `budget.${cat}` as TooltipKey
            return (
              <PreviewedSlider
                key={cat}
                store={resolved}
                sliderId={sliderId}
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
                // Budget sliders display percent (0–100) but the engine
                // consumes a share (0–1). Mirror the commit-path divide for
                // the preview so cache keys + decisions stay in sync.
                toDecisionValue={(v) => v / 100}
                formatDisplay={(v) => `${v}%`}
                recentlyChanged={recentlyChanged[sliderId] ?? false}
                tooltipKey={budgetTooltipKey}
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
        <Tooltip tooltipKey="country.gdp">
          <div className="economy-panel__flow" tabIndex={0}>
            <span className="economy-panel__flow-label">Current GDP</span>
            <KpiValue
              formatted={formatNumber(gdp)}
              className="economy-panel__flow-value"
              testId="economy-gdp"
            />
          </div>
        </Tooltip>
        <Tooltip tooltipKey="TREND_HISTORY_TICKS">
          <div
            className="economy-panel__gdp-chart"
            tabIndex={0}
            data-testid="economy-gdp-chart-wrap"
          >
            <GdpChart data={gdpTrend} />
          </div>
        </Tooltip>
      </section>

      {/* --- Sectors ---------------------------------------------------- */}
      <section className="economy-panel__section" aria-labelledby="economy-sectors-heading">
        <h3 id="economy-sectors-heading">Sectors</h3>
        <SectorBreakdown sectors={sectors} />
      </section>
    </section>
  )
}
