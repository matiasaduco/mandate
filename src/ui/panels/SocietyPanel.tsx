// T-024 — Society panel.
//
// Read-only POP-by-POP view. One row per POP shows: name, size (absolute +
// % of total population), happiness bar, top 3 priorities with hover tooltips,
// employment rate, and a single-axis ideology indicator.
//
// Sorting: default = size descending. Clicking the "Happiness" header switches
// to happiness descending. Clicking "Size" again returns to the default. Sort
// state is panel-local (`useState`) — not part of the gameStore, since it
// doesn't affect any other surface.
//
// Per the Player View contract (stage 7, read-only), no engine handles are
// touched here — everything flows through the gameStore. Same store-injection
// pattern as Overview / Economy panels: tests pass their own
// `createGameStore({ seed: 1 })`; app code passes nothing and the singleton is
// resolved exactly once per render.
//
// Priority tooltip text is computed by `priorityTooltip()` in
// `societyPriorityTooltip.ts`. See that file for the per-priority mapping.

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useMemo, useState } from 'react'

import type { POP } from '@engine/types'
import { HAPPINESS_RANGE } from '@engine/tunables'
import { formatNumber, formatTitle } from '@ui/components/format'
import { IdeologyDot } from '@ui/components/IdeologyDot'
import { PriorityChip } from '@ui/components/PriorityChip'
import { Tooltip } from '@ui/components/Tooltip'
import {
  priorityTooltip,
  type PriorityTooltipContext,
} from '@ui/panels/societyPriorityTooltip'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'
import { MOTION_KPI_TWEEN_MS, SPRING_KPI } from '@ui/theme/tokens'

export type SocietyPanelProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component then resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
}

/** Sort mode for the panel's row ordering. */
type SortMode = 'size' | 'happiness'

/** Clamp a number into a closed range (defensive — also visible in tests). */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Build the ordered list of POPs for the panel. Stable: ties broken by
 * `pop_type` ascending so the rendered order is deterministic regardless of
 * the input order in the fixture.
 */
function orderPops(pops: POP[], sortBy: SortMode): POP[] {
  const sorted = pops.slice()
  sorted.sort((a, b) => {
    const primary = sortBy === 'size' ? b.size - a.size : b.happiness - a.happiness
    if (primary !== 0) return primary
    // Deterministic tie-break.
    return a.pop_type < b.pop_type ? -1 : a.pop_type > b.pop_type ? 1 : 0
  })
  return sorted
}

export function SocietyPanel({ store }: SocietyPanelProps) {
  // Resolve the store ONCE per render — same pattern as TopBar / Overview /
  // Economy panels.
  const resolved: GameStore = store ?? getGameStore()

  // Narrow selectors per displayed slice. Each re-renders the panel only when
  // the underlying slice changes (Zustand referential equality).
  const pops = resolved((s: GameStoreState) => s.snapshot.country.pops)
  const population = resolved((s: GameStoreState) => s.snapshot.country.population)
  const budgetShares = resolved((s: GameStoreState) => s.snapshot.country.budget_shares)
  const sliders = resolved((s: GameStoreState) => s.snapshot.country.sliders)
  const sectors = resolved((s: GameStoreState) => s.snapshot.country.sectors)

  const [sortBy, setSortBy] = useState<SortMode>('size')

  // Memoize the sorted list so unrelated re-renders (e.g. another panel
  // pushing a tick into the store) don't re-sort on every paint.
  const orderedPops = useMemo(() => orderPops(pops, sortBy), [pops, sortBy])

  // Look up agriculture output once per render (used by every POP's
  // `agriculture_support` tooltip).
  const agricultureOutput =
    sectors.find((s) => s.sector_type === 'agriculture')?.output ?? 0

  const [happinessMin, happinessMax] = HAPPINESS_RANGE
  const happinessRangeWidth = happinessMax - happinessMin

  // T-034 — Per-row happiness value gets the same KPI spring-tween pattern as
  // the OverviewPanel cards. Reduced-motion bypasses the spring so the rendered
  // text is a plain `<span>` (no AnimatePresence remount on tick).
  const reducedMotion = useReducedMotion()
  const happinessTransition =
    reducedMotion === true
      ? { duration: 0 }
      : {
          type: 'spring' as const,
          ...SPRING_KPI,
          duration: MOTION_KPI_TWEEN_MS / 1000,
        }

  return (
    <section
      className="society-panel"
      data-testid="society-panel"
      aria-label="Country society"
    >
      <table className="society-panel__table">
        <thead>
          <tr>
            <th scope="col">POP</th>
            <th scope="col" className="society-panel__sortable">
              <button
                type="button"
                className={`society-panel__sort-btn${sortBy === 'size' ? ' is-active' : ''}`}
                onClick={() => setSortBy('size')}
                data-testid="society-sort-size"
                aria-pressed={sortBy === 'size'}
              >
                Size
              </button>
            </th>
            <th scope="col" className="society-panel__sortable">
              <button
                type="button"
                className={`society-panel__sort-btn${sortBy === 'happiness' ? ' is-active' : ''}`}
                onClick={() => setSortBy('happiness')}
                data-testid="society-sort-happiness"
                aria-pressed={sortBy === 'happiness'}
              >
                Happiness
              </button>
            </th>
            <th scope="col">Priorities</th>
            <th scope="col">Employment</th>
            <th scope="col">Ideology</th>
          </tr>
        </thead>
        <tbody>
          {orderedPops.map((pop, popIdx) => {
            // % of total population. Defensive: degenerate state (population
            // == 0) would otherwise NaN out — fall back to "–%".
            const sizePct =
              population > 0 ? Math.round((pop.size / population) * 100) : null

            // Clamp before painting so a corrupt fixture never overflows the
            // bar visually. Aria value reports the CLAMPED number, since that
            // is what the user sees on the bar.
            const happinessClamped = clamp(pop.happiness, happinessMin, happinessMax)
            const happinessPct =
              happinessRangeWidth > 0
                ? ((happinessClamped - happinessMin) / happinessRangeWidth) * 100
                : 0

            const employmentPct = Math.round(pop.employment_rate * 100)

            const tooltipCtx: PriorityTooltipContext = {
              pop,
              budget_shares: budgetShares,
              sliders,
              agricultureOutput,
            }

            return (
              <tr
                key={pop.pop_type}
                data-testid={`society-row-${pop.pop_type}`}
                data-pop-type={pop.pop_type}
                /* T-033 — Anchor the onboarding tour's "Society / POP row"
                   step to whichever POP renders first (varies with sort
                   mode). Only the first row carries the attribute so the
                   joyride anchor query (`[data-tour-id="society-pop-row"]`)
                   resolves to exactly one element. */
                data-tour-id={popIdx === 0 ? 'society-pop-row' : undefined}
              >
                <th scope="row" className="society-panel__pop-name">
                  {formatTitle(pop.pop_type.split('_').join(' '))}
                </th>
                <td className="society-panel__size">
                  <div
                    className="society-panel__size-abs"
                    data-testid={`society-size-${pop.pop_type}`}
                  >
                    {formatNumber(pop.size)}
                  </div>
                  <div
                    className="society-panel__size-pct"
                    data-testid={`society-size-pct-${pop.pop_type}`}
                  >
                    {sizePct === null ? '–%' : `${sizePct}%`}
                  </div>
                </td>
                <td className="society-panel__happiness">
                  <Tooltip tooltipKey="pop.happiness">
                    <div
                      className="society-panel__happiness-bar-track"
                      role="progressbar"
                      aria-valuemin={happinessMin}
                      aria-valuemax={happinessMax}
                      aria-valuenow={happinessClamped}
                      data-testid={`society-happiness-${pop.pop_type}`}
                      tabIndex={0}
                    >
                      <div
                        className="society-panel__happiness-bar"
                        style={{ width: `${happinessPct}%` }}
                      />
                    </div>
                  </Tooltip>
                  <span
                    className="society-panel__happiness-value"
                    data-testid={`society-happiness-value-${pop.pop_type}`}
                    data-kpi-tween={reducedMotion === true ? 'instant' : 'spring'}
                  >
                    {reducedMotion === true ? (
                      <span>{Math.round(happinessClamped)}</span>
                    ) : (
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={Math.round(happinessClamped)}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={happinessTransition}
                        >
                          {Math.round(happinessClamped)}
                        </motion.span>
                      </AnimatePresence>
                    )}
                  </span>
                </td>
                <td className="society-panel__priorities">
                  {pop.priorities.slice(0, 3).map((priority) => (
                    <PriorityChip
                      key={priority}
                      priority={priority}
                      tooltip={priorityTooltip(priority, tooltipCtx)}
                    />
                  ))}
                </td>
                <td
                  className="society-panel__employment"
                  data-testid={`society-employment-${pop.pop_type}`}
                >
                  <Tooltip tooltipKey="pop.employment_rate">
                    <span tabIndex={0}>{`${employmentPct}%`}</span>
                  </Tooltip>
                </td>
                <td className="society-panel__ideology">
                  <Tooltip tooltipKey="pop.ideology">
                    <span tabIndex={0}>
                      <IdeologyDot ideology={pop.ideology} testIdSuffix={pop.pop_type} />
                    </span>
                  </Tooltip>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
