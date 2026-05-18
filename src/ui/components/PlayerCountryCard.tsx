// T-035 — Player country card.
//
// A persistent, top-left, 280×360 card representing the player's country at a
// glance. Sits inside the panels-host but OUTSIDE the floating PanelLayer —
// it is part of the HUD, not a panel. Cannot be dragged in Phase 1.5.
//
// Designed once here so Phase 3 — Global World can instantiate one per-country
// on the world map without re-design. Reusability invariants:
//   - Takes a `country: Country` PROP. No hard-coded `country.id === 'aurelia'`
//     anywhere. The synthetic-country snapshot test gates this.
//   - Takes a narrow `trends` prop with the two scalar series the card uses
//     (approval + treasury). No assumption on length — does `.slice(-12)` so
//     a length-1 cold-load buffer is safe and so a future caller can pass a
//     longer or shorter series.
//   - Status chips are SNAPSHOT-derived (decrees from `active_decrees`,
//     warning chips from `country.approval` / `country.treasury` vs
//     `APPROVAL_WARN_THRESHOLDS`). NOT event-derived. The RTL test mutates the
//     store snapshot directly to assert chip visibility transitions; that
//     models the "engine event fires → snapshot updates → chip appears" path
//     without an event-injection harness.
//
// Reads:
//   - country.{name, government_type, banner_color, head_of_state, pops}
//   - country.approval (for the warning chip threshold logic + headline number)
//   - country.treasury (for the bankruptcy-looming chip)
//   - state.active_decrees (for decree chips)
//   - trends.approval / trends.treasury (.slice(-12) for the sparklines)
//
// Writes / Emits: nothing. Read-only view; the engine ↔ UI contract is not
// invoked from this component.
//
// Visual register: matches T-034's skinned panels (same border / radius /
// shadow tokens). Inline CSS variables on the banner so the colour can come
// from arbitrary countries in Phase 3 without a theme rebuild.

import { useMemo } from 'react'

import type { ActiveDecree, Country } from '@engine/types'
import { APPROVAL_WARN_THRESHOLDS } from '@engine/tunables'
import { formatNumber, formatPercent, formatTitle } from '@ui/components/format'
import { Tooltip } from '@ui/components/Tooltip'
import { TrendSparkline } from '@ui/components/TrendSparkline'

/**
 * Trends prop shape — a narrow subset of the store's `Trends` slice. Two
 * scalar series, both read-only. The card slices the last 12 inline so the
 * caller does not have to know about `TREND_HISTORY_TICKS / 2`. No new domain
 * type promoted to the store layer for this — the two arrays are enough.
 */
export type PlayerCountryCardTrends = {
  /** Last N ticks of country.approval. Card slices the last 12. */
  approval: readonly number[]
  /** Last N ticks of country.treasury. Card slices the last 12. */
  treasury: readonly number[]
}

export type PlayerCountryCardProps = {
  country: Country
  trends: PlayerCountryCardTrends
  /** Active decrees from `EngineState.active_decrees`. Drives one chip per entry. */
  activeDecrees: readonly ActiveDecree[]
}

/**
 * How many trailing samples each sparkline shows. The card visually targets
 * "the last year-ish" — half of the engine's TREND_HISTORY_TICKS buffer. Kept
 * inline here (not a new tunable) per the brief.
 */
const CARD_TREND_SAMPLES = 12

/**
 * Compute the weighted-mean POP ideology, weighted by `pop.size`. Returns
 * `null` when the population sums to 0 (synthetic countries with no POPs);
 * the caller renders a neutral "Centrist" label in that case so we never
 * surface a `NaN`. Single-axis Phase 1 stub — Phase 2 expands ideology into
 * a vector at which point this collapses into a vector-mean.
 */
function computeIdeologyMean(country: Country): number | null {
  let weightedSum = 0
  let totalSize = 0
  for (const pop of country.pops) {
    weightedSum += pop.ideology * pop.size
    totalSize += pop.size
  }
  if (totalSize === 0) return null
  return weightedSum / totalSize
}

/**
 * Human label for the ideology mean. Aurelia's start (~ −0.076) reads as
 * "Slightly progressive"; a clean 0 reads as "Centrist". The bands are
 * inline display thresholds — not engine-visible — so no tunable promotion.
 */
function formatIdeologyLabel(mean: number | null): string {
  if (mean === null) return 'Centrist'
  const abs = Math.abs(mean)
  if (abs < 0.05) return 'Centrist'
  const direction = mean < 0 ? 'progressive' : 'conservative'
  if (abs < 0.2) return `Slightly ${direction}`
  if (abs < 0.5) return `${direction.charAt(0).toUpperCase() + direction.slice(1)}`
  return `Strongly ${direction}`
}

/**
 * Threshold-warning level. Drives both the chip text AND the chip's severity
 * class. `null` = no warning fires (above the highest threshold).
 *
 * Order matters: the smallest threshold (= most severe) wins. Mirrors the
 * "is-critical / is-warning / is-notice" escalation used elsewhere in the UI.
 */
type WarningLevel = 'critical' | 'warning' | 'notice' | null

/**
 * Map the current approval against APPROVAL_WARN_THRESHOLDS = [30, 20, 15].
 * Returns the most severe level whose threshold the approval has crossed
 * (≤), or null when approval is above 30.
 *
 *  approval ≤ 15 → critical
 *  approval ≤ 20 → warning
 *  approval ≤ 30 → notice
 *  else          → null (no chip)
 */
function approvalWarningLevel(approval: number): WarningLevel {
  // Walk thresholds in ascending order (15, 20, 30) so the smallest crossed
  // threshold wins. The tunable is `[30, 20, 15] as const` — slice + sort so
  // a future reorder cannot silently flip the severity.
  const sorted = [...APPROVAL_WARN_THRESHOLDS].sort((a, b) => a - b)
  if (approval <= sorted[0]) return 'critical'
  if (approval <= sorted[1]) return 'warning'
  if (approval <= sorted[2]) return 'notice'
  return null
}

/** Player-facing label for each approval warning level. */
function approvalWarningLabel(level: WarningLevel): string | null {
  switch (level) {
    case 'critical':
      return 'Approval crisis'
    case 'warning':
      return 'Approval low'
    case 'notice':
      return 'Approval slipping'
    default:
      return null
  }
}

/**
 * Format a decree id (e.g. `industrial_subsidy`) as a chip label
 * ("Industrial subsidy"). Keeps the chip register sentence-cased and
 * lowercase to match the other UI chips.
 */
function formatDecreeChipLabel(decreeId: string): string {
  const spaced = decreeId.replace(/_/g, ' ')
  return formatTitle(spaced)
}

/**
 * Player country card. See file header for the full contract.
 *
 * Renders inside `PLAYER_CARD_ZONE` (280×360) via `.player-country-card` CSS —
 * positioning is owned by the stylesheet, not by inline style, so the same
 * component can be mounted into a non-fixed parent on the Phase 3 world map
 * without inheriting absolute-positioning baggage.
 */
export function PlayerCountryCard({
  country,
  trends,
  activeDecrees,
}: PlayerCountryCardProps) {
  // Trim trend buffers to the last 12 samples. Buffers shorter than 12 pass
  // through unchanged — TrendSparkline handles length-1 buffers with an empty
  // placeholder so cold-load never crashes.
  const approvalSeries = useMemo(
    () => trends.approval.slice(-CARD_TREND_SAMPLES),
    [trends.approval],
  )
  const treasurySeries = useMemo(
    () => trends.treasury.slice(-CARD_TREND_SAMPLES),
    [trends.treasury],
  )

  // Ideology mean is cheap, but memoize so re-rendering the card on every
  // tick doesn't walk the POP list redundantly.
  const ideologyMean = useMemo(() => computeIdeologyMean(country), [country])
  const ideologyLabel = formatIdeologyLabel(ideologyMean)

  // Threshold chips. Recompute every render — the result is a small fixed-size
  // object so no memo is necessary; the React reconciler trims unchanged DOM.
  const approvalLevel = approvalWarningLevel(country.approval)
  const approvalChipLabel = approvalWarningLabel(approvalLevel)
  const treasuryChipVisible = country.treasury <= 0

  // TrendSparkline expects mutable number[]; the prop type uses `readonly` so
  // callers can pass `as const` arrays. Materialize into a plain array at the
  // call site — the underlying data is immutable, the shape is the only thing
  // that changes.
  const approvalSeriesArray = approvalSeries as readonly number[] as number[]
  const treasurySeriesArray = treasurySeries as readonly number[] as number[]

  return (
    <aside
      className="player-country-card"
      data-testid="player-country-card"
      aria-label={`${country.name} — country card`}
    >
      {/* Banner stripe — colour comes from `country.banner_color` so per-country
          theming is trivial in Phase 3. Inline style instead of a CSS variable
          on a parent so the value is co-located with the country prop. */}
      <Tooltip tooltipKey="country.banner">
        <div
          className="player-country-card__banner"
          data-testid="player-country-card-banner"
          /* Inline style drives the rendered colour. Also exposed as a
             data attribute so tests can assert the source colour string
             verbatim — JSDOM normalises CSS colours into `rgb(…)` form, so
             querying `style.background` would lose the hex round-trip. */
          data-banner-color={country.banner_color}
          style={{ background: country.banner_color }}
          tabIndex={0}
          aria-label={`Banner colour: ${country.banner_color}`}
        />
      </Tooltip>

      <div className="player-country-card__identity">
        <div
          className="player-country-card__name"
          data-testid="player-country-card-name"
        >
          {country.name}
        </div>
        <Tooltip tooltipKey="country.government">
          <div
            className="player-country-card__government"
            data-testid="player-country-card-government"
            tabIndex={0}
          >
            {formatTitle(country.government_type)}
          </div>
        </Tooltip>
      </div>

      <Tooltip tooltipKey="country.leader">
        <div
          className="player-country-card__leader"
          data-testid="player-country-card-leader"
          tabIndex={0}
        >
          <div
            className="player-country-card__leader-name"
            data-testid="player-country-card-leader-name"
          >
            <span className="player-country-card__leader-role">
              {country.head_of_state.role}
            </span>{' '}
            {country.head_of_state.name}
          </div>
          <div
            className="player-country-card__leader-party"
            data-testid="player-country-card-leader-party"
          >
            {country.head_of_state.party}
          </div>
        </div>
      </Tooltip>

      {/* Two micro-trend lines: approval + treasury. The sparkline component
          itself renders a placeholder for buffers shorter than 2, so a fresh
          mount looks clean. */}
      <div className="player-country-card__trends">
        <Tooltip tooltipKey="country.approval">
          <div
            className="player-country-card__trend"
            data-testid="player-country-card-trend-approval"
            tabIndex={0}
          >
            <div className="player-country-card__trend-label">Approval</div>
            <TrendSparkline data={approvalSeriesArray} height={24} />
            <div
              className="player-country-card__trend-value"
              data-testid="player-country-card-approval-value"
            >
              {formatPercent(country.approval)}
            </div>
          </div>
        </Tooltip>
        <Tooltip tooltipKey="country.treasury">
          <div
            className={`player-country-card__trend${
              country.treasury < 0 ? ' is-negative' : ''
            }`}
            data-testid="player-country-card-trend-treasury"
            tabIndex={0}
          >
            <div className="player-country-card__trend-label">Treasury</div>
            <TrendSparkline data={treasurySeriesArray} height={24} />
            <div
              className="player-country-card__trend-value"
              data-testid="player-country-card-treasury-value"
            >
              {formatNumber(country.treasury)}
            </div>
          </div>
        </Tooltip>
      </div>

      <Tooltip tooltipKey="country.ideology">
        <div
          className="player-country-card__ideology"
          data-testid="player-country-card-ideology"
          tabIndex={0}
        >
          {ideologyLabel}
        </div>
      </Tooltip>

      <div
        className="player-country-card__chips"
        data-testid="player-country-card-chips"
      >
        {approvalChipLabel !== null && approvalLevel !== null ? (
          <span
            className={`player-country-card__chip player-country-card__chip--${approvalLevel}`}
            data-testid="player-country-card-chip-approval"
          >
            {approvalChipLabel}
          </span>
        ) : null}
        {treasuryChipVisible ? (
          <span
            className="player-country-card__chip player-country-card__chip--critical"
            data-testid="player-country-card-chip-treasury"
          >
            Bankruptcy looming
          </span>
        ) : null}
        {activeDecrees.map((d) => (
          <span
            key={d.decree_id}
            className="player-country-card__chip player-country-card__chip--decree"
            data-testid={`player-country-card-chip-decree-${d.decree_id}`}
          >
            {formatDecreeChipLabel(d.decree_id)}
          </span>
        ))}
      </div>
    </aside>
  )
}
