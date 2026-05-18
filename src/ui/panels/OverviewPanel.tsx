// T-022 — Overview panel (country dashboard).
//
// First panel surface. View-only consumer of the gameStore: reads seven scalar
// / textual fields off `snapshot.country` and the per-scalar rolling buffers
// off `trends`. Renders 7 cards in a responsive CSS Grid with a tiny Recharts
// sparkline under the 5 numeric ones; `government_type` and `head_of_state`
// stay text-only because they don't move in P1.
//
// Per the Player View contract (stage 7, read-only), no engine handles are
// touched here — everything flows through the store.
//
// Component-level concerns:
//   - Same store-injection pattern as TopBar (T-021): tests pass their own
//     `createGameStore({ seed: 1 })`; app code passes nothing and the singleton
//     is resolved exactly once per render via `getGameStore()`.
//   - Narrow Zustand selectors per field so each card re-renders only when its
//     own slice changes (T-019 AC#4). Sparklines reuse a single selector per
//     scalar — passing the same array reference means no re-render when the
//     buffer didn't change.
//   - Treasury card gets the `is-negative` modifier when `country.treasury < 0`
//     (per UX micro-convention "negative balance is visually flagged"). The
//     `flows.balance` concept is a per-tick flow and is not appropriate for a
//     stock card.

import { formatNumber, formatPercent, formatTitle } from '@ui/components/format'
import { Tooltip } from '@ui/components/Tooltip'
import { TrendSparkline } from '@ui/components/TrendSparkline'
import type { TooltipKey } from '@ui/copy/tooltips'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
  type TrendKey,
} from '@ui/stores/gameStore'

export type OverviewPanelProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component then resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
}

/** Render a numeric card with a label, formatted value, and sparkline. */
function NumericCard({
  label,
  testId,
  value,
  formatted,
  trendKey,
  tooltipKey,
  store,
  extraClassName,
}: {
  label: string
  testId: string
  value: number
  formatted: string
  trendKey: TrendKey
  tooltipKey: TooltipKey
  store: GameStore
  extraClassName?: string
}) {
  // Subscribe to just this scalar's buffer. The selector returns the same
  // array reference between ticks unless `push/trim` produced a new one, so
  // Zustand's referential equality keeps us from re-rendering on unrelated
  // store writes.
  const trend = store((s: GameStoreState) => s.trends[trendKey])
  return (
    <Tooltip tooltipKey={tooltipKey}>
      <div
        className={`overview-card overview-card--${trendKey}${extraClassName ? ` ${extraClassName}` : ''}`}
        data-testid={testId}
        data-value={value}
        tabIndex={0}
      >
        <div className="overview-card__label">{label}</div>
        <div className="overview-card__value">{formatted}</div>
        <TrendSparkline data={trend} />
      </div>
    </Tooltip>
  )
}

/** Render a text-only card (government type, head of state). No sparkline. */
function TextCard({
  label,
  testId,
  primary,
  secondary,
  tooltipKey,
}: {
  label: string
  testId: string
  primary: string
  secondary?: string
  tooltipKey: TooltipKey
}) {
  return (
    <Tooltip tooltipKey={tooltipKey}>
      <div
        className={`overview-card overview-card--text overview-card--${testId}`}
        data-testid={testId}
        tabIndex={0}
      >
        <div className="overview-card__label">{label}</div>
        <div className="overview-card__value overview-card__value--text">{primary}</div>
        {secondary !== undefined ? (
          <div className="overview-card__secondary">{secondary}</div>
        ) : null}
      </div>
    </Tooltip>
  )
}

export function OverviewPanel({ store }: OverviewPanelProps) {
  // Resolve the store ONCE per render. Same pattern as TopBar — both branches
  // return a bound Zustand hook with stable identity for the mount.
  const resolved: GameStore = store ?? getGameStore()

  // Narrow selectors, one per displayed field. Re-renders fire only when the
  // selected slice changes.
  const population = resolved((s: GameStoreState) => s.snapshot.country.population)
  const gdp = resolved((s: GameStoreState) => s.snapshot.country.gdp)
  const treasury = resolved((s: GameStoreState) => s.snapshot.country.treasury)
  const approval = resolved((s: GameStoreState) => s.snapshot.country.approval)
  const stability = resolved((s: GameStoreState) => s.snapshot.country.stability)
  const governmentType = resolved((s: GameStoreState) => s.snapshot.country.government_type)
  const headOfState = resolved((s: GameStoreState) => s.snapshot.country.head_of_state)

  return (
    <section className="overview-panel" data-testid="overview-panel" aria-label="Country overview">
      <NumericCard
        label="Population"
        testId="overview-population"
        value={population}
        formatted={formatNumber(population)}
        trendKey="population"
        tooltipKey="country.population"
        store={resolved}
      />
      <NumericCard
        label="GDP"
        testId="overview-gdp"
        value={gdp}
        formatted={formatNumber(gdp)}
        trendKey="gdp"
        tooltipKey="country.gdp"
        store={resolved}
      />
      <NumericCard
        label="Treasury"
        testId="overview-treasury"
        value={treasury}
        formatted={formatNumber(treasury)}
        trendKey="treasury"
        tooltipKey="country.treasury"
        store={resolved}
        extraClassName={treasury < 0 ? 'is-negative' : undefined}
      />
      <NumericCard
        label="Approval"
        testId="overview-approval"
        value={approval}
        formatted={formatPercent(approval)}
        trendKey="approval"
        tooltipKey="country.approval"
        store={resolved}
      />
      <NumericCard
        label="Stability"
        testId="overview-stability"
        value={stability}
        formatted={formatPercent(stability)}
        trendKey="stability"
        tooltipKey="country.stability"
        store={resolved}
      />
      <TextCard
        label="Government"
        testId="overview-government"
        primary={formatTitle(governmentType)}
        tooltipKey="country.government"
      />
      <TextCard
        label="Head of State"
        testId="overview-head-of-state"
        primary={headOfState.name}
        secondary={headOfState.party}
        tooltipKey="country.head_of_state"
      />
    </section>
  )
}
