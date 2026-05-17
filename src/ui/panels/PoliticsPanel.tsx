// T-025 — Politics panel.
//
// Composition (top-to-bottom):
//   1. Approval headline      — big integer + trend arrow + "Why?" help with
//                               tooltip listing the top 3 per-POP drivers.
//   2. Breakdown              — one row per POP showing size-weighted
//                               contribution + a bar (width proportional to
//                               contribution). Sorted by contribution desc.
//   3. Decrees                — one DecreeButton per entry in
//                               `DECREE_CATALOG_P1`. Confirm-on-click for
//                               costed decrees; disabled when treasury < cost.
//
// Reads from the engine snapshot (via the store) only — no engine handles
// touched. Writes (decree issues) go through `enqueueDecision` per the
// Player View contract (stage 7 is queue-write).
//
// Trend arrow:
//   - Compares `country.approval` against `state.approval_prev` (the
//     post-stage-4 previous value the engine retains for its own threshold
//     detection). A small deadband (APPROVAL_TREND_DEADBAND) absorbs tiny
//     smoothing-noise oscillations so the arrow doesn't flicker between
//     ticks at steady state. Display-only constant, defined module-local —
//     no engine math depends on it.
//
// "Why?" tooltip:
//   - `prevSnapshot === null` (first paint) → "No drivers yet …"
//   - All POP deltas round to 0.0           → "No movement this tick."
//   - Otherwise                              → top 3 drivers by |delta|.
//   See `politicsWhy.ts` for the math.

import { useMemo } from 'react'

import { DECREE_CATALOG_P1 } from '@engine/entities/Decree'
import type { DecreeId, EngineState, POP, PopType } from '@engine/types'
import {
  APPROVAL_CEILING,
  APPROVAL_FLOOR,
  HAPPINESS_RANGE,
} from '@engine/tunables'
import { DecreeButton } from '@ui/components/DecreeButton'
import { formatTitle } from '@ui/components/format'
import {
  computeApprovalDrivers,
  formatDriversTooltip,
} from '@ui/panels/politicsWhy'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'

export type PoliticsPanelProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component then resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
}

/**
 * Trend-arrow deadband. Display-only: we treat `|current − prev| <= this` as
 * "no change" so the arrow doesn't flicker on sub-unit smoothing noise. Lives
 * here because nothing in the engine depends on it — it's a UI polish knob.
 */
const APPROVAL_TREND_DEADBAND = 0.05

/** Stable order for the decree button list — matches the catalog declaration. */
const DECREE_IDS_RENDER_ORDER: readonly DecreeId[] = [
  'public_address',
  'emergency_relief',
  'industrial_subsidy',
] as const

/** Pretty-printer for POP type identifiers in the breakdown table. */
function formatPopName(popType: PopType): string {
  return popType
    .split('_')
    .map((p) => formatTitle(p))
    .join(' ')
}

/** Per-POP approval breakdown row. */
type BreakdownRow = {
  pop_type: PopType
  /** size-weighted contribution to approval: `size × happiness / total_pop`. */
  contribution: number
}

/**
 * Build the breakdown rows, sorted by contribution desc. Uses
 * `country.approval_by_pop` for per-POP happiness if present, else falls back
 * to `pop.happiness` (P1 invariant: `approval_by_pop[type] === pop.happiness`).
 */
function buildBreakdown(
  pops: POP[],
  approvalByPop: Partial<Record<PopType, number>>,
  totalPopulation: number,
): BreakdownRow[] {
  if (totalPopulation <= 0) return []
  const rows = pops.map((pop) => {
    const happiness = approvalByPop[pop.pop_type] ?? pop.happiness
    return {
      pop_type: pop.pop_type,
      contribution: (pop.size * happiness) / totalPopulation,
    }
  })
  rows.sort((a, b) => {
    const diff = b.contribution - a.contribution
    if (diff !== 0) return diff
    return a.pop_type < b.pop_type ? -1 : a.pop_type > b.pop_type ? 1 : 0
  })
  return rows
}

/**
 * Pick the trend arrow glyph for the headline. Symmetric deadband around
 * `prev` so steady-state ticks render `→`, not `↑↓↑↓`.
 */
function trendArrow(current: number, prev: number): '↑' | '↓' | '→' {
  if (current > prev + APPROVAL_TREND_DEADBAND) return '↑'
  if (current < prev - APPROVAL_TREND_DEADBAND) return '↓'
  return '→'
}

export function PoliticsPanel({ store }: PoliticsPanelProps) {
  // Resolve the store ONCE per render — same pattern as the other panels.
  const resolved: GameStore = store ?? getGameStore()

  // Narrow selectors per displayed slice. Each re-renders the panel only when
  // the underlying slice changes (Zustand referential equality).
  const approval = resolved((s: GameStoreState) => s.snapshot.country.approval)
  const approvalPrev = resolved((s: GameStoreState) => s.snapshot.approval_prev)
  const pops = resolved((s: GameStoreState) => s.snapshot.country.pops)
  const approvalByPop = resolved(
    (s: GameStoreState) => s.snapshot.country.approval_by_pop,
  )
  const population = resolved((s: GameStoreState) => s.snapshot.country.population)
  const treasury = resolved((s: GameStoreState) => s.snapshot.country.treasury)
  // Full snapshots needed for the driver-delta computation. We pull whole
  // snapshot references — they only change reference on a tick, so this
  // doesn't cause extra re-renders beyond the ones the other selectors
  // already trigger.
  const snapshot = resolved((s: GameStoreState) => s.snapshot)
  const prevSnapshot = resolved((s: GameStoreState) => s.prevSnapshot)

  // --- "Why?" tooltip text ------------------------------------------------
  // Compute the full delta list once (for the "all zero" check), then take
  // the top 3 for the displayed tooltip. Both branches share the same prev →
  // current diff so the "No movement" message is consistent with what the
  // top-3 view would show.
  const tooltipText = useMemo(() => {
    const drivers = computeApprovalDrivers(prevSnapshot, snapshot, 3)
    // Compute "all zero" against the FULL POP list, not just the top 3, so a
    // tied set doesn't accidentally trip the "no movement" branch.
    const allDrivers = computeApprovalDrivers(prevSnapshot, snapshot, snapshot.country.pops.length)
    const allDeltasZero =
      allDrivers.length > 0 && allDrivers.every((d) => Math.abs(d.delta) < 0.05)
    return formatDriversTooltip(drivers, allDeltasZero)
  }, [prevSnapshot, snapshot])

  // --- Breakdown rows ----------------------------------------------------
  const breakdown = useMemo(
    () => buildBreakdown(pops, approvalByPop, population),
    [pops, approvalByPop, population],
  )

  // Maximum contribution is used for bar widths. Bars are sized as
  // `contribution / max × 100%`, so the largest contributor's bar fills the
  // track and smaller ones scale proportionally. Falls back to 1 if every
  // contribution is 0 to avoid a div-by-zero NaN width.
  const maxContribution = breakdown.reduce(
    (m, row) => (row.contribution > m ? row.contribution : m),
    0,
  )
  const denom = maxContribution > 0 ? maxContribution : 1

  // --- Decree issue handler ----------------------------------------------
  const issueDecree = (decreeId: DecreeId) => {
    resolved.getState().enqueueDecision({ type: 'decree', decree_id: decreeId })
  }

  // --- Render -------------------------------------------------------------
  const arrow = trendArrow(approval, approvalPrev)
  const approvalDisplay = Math.round(approval)
  // Aria value mirrors the rounded display number AND honors the approval
  // domain bounds (APPROVAL_FLOOR / APPROVAL_CEILING from tunables — see
  // ticket brief: "Tunables: APPROVAL_FLOOR, APPROVAL_CEILING, HAPPINESS_RANGE
  // — don't inline.").
  const arrowLabel =
    arrow === '↑' ? 'rising' : arrow === '↓' ? 'falling' : 'steady'

  return (
    <section
      className="politics-panel"
      data-testid="politics-panel"
      aria-label="Country politics"
    >
      {/* --- Approval headline ---------------------------------------- */}
      <section
        className="politics-panel__section"
        aria-labelledby="politics-approval-heading"
      >
        <h3 id="politics-approval-heading">Approval</h3>
        <div className="politics-panel__headline">
          <span
            className="politics-panel__approval-value"
            data-testid="politics-approval-value"
            aria-valuemin={APPROVAL_FLOOR}
            aria-valuemax={APPROVAL_CEILING}
            aria-valuenow={approvalDisplay}
            role="meter"
          >
            {approvalDisplay}
          </span>
          <span
            className={`politics-panel__trend-arrow politics-panel__trend-arrow--${arrowLabel}`}
            data-testid="politics-trend-arrow"
            data-direction={arrowLabel}
            aria-label={`Approval trend: ${arrowLabel}`}
          >
            {arrow}
          </span>
          <span
            className="politics-panel__why"
            data-testid="politics-why"
            title={tooltipText}
            aria-label={`Why? ${tooltipText}`}
          >
            Why?
          </span>
        </div>
      </section>

      {/* --- Per-POP breakdown ---------------------------------------- */}
      <section
        className="politics-panel__section"
        aria-labelledby="politics-breakdown-heading"
      >
        <h3 id="politics-breakdown-heading">Breakdown</h3>
        <ul className="politics-panel__breakdown" data-testid="politics-breakdown">
          {breakdown.map((row) => {
            const widthPct = (row.contribution / denom) * 100
            const [happinessMin, happinessMax] = HAPPINESS_RANGE
            return (
              <li
                key={row.pop_type}
                className="politics-panel__breakdown-row"
                data-testid={`approval-row-${row.pop_type}`}
                data-pop-type={row.pop_type}
              >
                <span className="politics-panel__breakdown-name">
                  {formatPopName(row.pop_type)}
                </span>
                <span
                  className="politics-panel__breakdown-bar-track"
                  role="progressbar"
                  aria-valuemin={happinessMin}
                  aria-valuemax={happinessMax}
                  aria-valuenow={row.contribution}
                >
                  <span
                    className="politics-panel__breakdown-bar"
                    style={{ width: `${widthPct}%` }}
                  />
                </span>
                <span
                  className="politics-panel__breakdown-value"
                  data-testid={`approval-contrib-${row.pop_type}`}
                >
                  {row.contribution.toFixed(1)}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {/* --- Decrees -------------------------------------------------- */}
      <section
        className="politics-panel__section"
        aria-labelledby="politics-decrees-heading"
      >
        <h3 id="politics-decrees-heading">Decrees</h3>
        <div className="politics-panel__decrees">
          {DECREE_IDS_RENDER_ORDER.map((decreeId) => {
            const entry = DECREE_CATALOG_P1[decreeId]
            return (
              <DecreeButton
                key={decreeId}
                decreeId={decreeId}
                cost={entry.cost_treasury}
                treasury={treasury}
                onIssue={issueDecree}
              />
            )
          })}
        </div>
      </section>
    </section>
  )
}

// Re-export so tests that need to type-narrow can import without reaching into
// the engine entities barrel.
export type { EngineState }
