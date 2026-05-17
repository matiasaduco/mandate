// T-025 — Approval "Why?" driver computation.
//
// Lives in its own module so `PoliticsPanel.tsx` stays a component-only export
// (the `react-refresh/only-export-components` rule forbids mixing component +
// non-component exports — same reason `societyPriorityTooltip.ts` was split
// out in T-024).
//
// Driver math (per ticket brief):
//
//   For each POP in the CURRENT snapshot:
//     prev_h    = prev.country.pops.find(pop_type).happiness   (or 0 if absent)
//     current_h = current.country.pops[i].happiness
//     // Size-weighted contribution delta — the same weighting the engine's
//     // stage 4 rollup uses for approval (size × happiness / total_pop), so
//     // the delta in contribution is a faithful "how much did this POP move
//     // approval this tick?" measure.
//     delta = (current_h - prev_h) × pop.size / total_population
//
//   Sort by |delta| desc, take top N (default 3) regardless of sign.
//
// `formatDriversTooltip` turns the result into multi-line text for the
// tooltip. Three edge-case strings:
//   - prev === null              → "No drivers yet — advance a tick to see
//                                   what moved approval."
//   - all deltas round to 0.0    → "No movement this tick."
//   - otherwise                  → one line per driver, joined with "\n".

import type { EngineState, POP, PopType } from '@engine/types'

/** One row of the "Why?" tooltip. */
export type ApprovalDriver = {
  pop_type: PopType
  /** Size-weighted contribution delta (current − prev), can be negative. */
  delta: number
  prevHappiness: number
  currentHappiness: number
}

/**
 * Compute the top-N approval drivers between two snapshots. Returns an empty
 * array when `prev` is null (no prior tick) — callers should special-case the
 * tooltip text via `formatDriversTooltip`.
 */
export function computeApprovalDrivers(
  prev: EngineState | null,
  current: EngineState,
  topN = 3,
): ApprovalDriver[] {
  if (prev === null) return []

  const totalPop = current.country.population
  if (totalPop <= 0) return []

  // Index prev POPs by pop_type for O(1) lookup. A missing prev POP yields a
  // delta computed against happiness 0 — defensive; shouldn't happen in P1
  // because the POP roster is static, but the snapshot shape allows it.
  const prevByType = new Map<PopType, POP>()
  for (const p of prev.country.pops) {
    prevByType.set(p.pop_type, p)
  }

  const drivers: ApprovalDriver[] = current.country.pops.map((pop) => {
    const prevPop = prevByType.get(pop.pop_type)
    const prevH = prevPop?.happiness ?? 0
    const delta = ((pop.happiness - prevH) * pop.size) / totalPop
    return {
      pop_type: pop.pop_type,
      delta,
      prevHappiness: prevH,
      currentHappiness: pop.happiness,
    }
  })

  // Sort by absolute delta descending; tie-break on pop_type to keep ordering
  // deterministic (matters for the "No movement" edge — also for tests under
  // tiny floating-point noise).
  drivers.sort((a, b) => {
    const diff = Math.abs(b.delta) - Math.abs(a.delta)
    if (diff !== 0) return diff
    return a.pop_type < b.pop_type ? -1 : a.pop_type > b.pop_type ? 1 : 0
  })

  return drivers.slice(0, topN)
}

/**
 * Build the multi-line tooltip text from a driver list.
 *
 * Decision contract:
 *   - `drivers.length === 0` (i.e. prev was null)        → "No drivers yet …"
 *   - `allDeltasZero === true`                           → "No movement this tick."
 *   - otherwise                                          → newline-joined lines:
 *       `<POP display name>: <signed delta with 1 decimal> (happiness <prev> → <current>)`
 *
 * `allDeltasZero` is computed by the caller from the full delta set (not just
 * the top N) so that returning `[]` doesn't conflate "no prev" with "no
 * movement".
 */
export function formatDriversTooltip(
  drivers: ApprovalDriver[],
  allDeltasZero: boolean,
): string {
  if (drivers.length === 0) {
    return 'No drivers yet — advance a tick to see what moved approval.'
  }
  if (allDeltasZero) {
    return 'No movement this tick.'
  }
  return drivers.map(driverLine).join('\n')
}

/** Render the display name for a POP type: "urban_workers" → "Urban Workers". */
function formatPopName(popType: PopType): string {
  return popType
    .split('_')
    .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

/** Render a single driver line. Signed delta with 1 decimal. */
function driverLine(driver: ApprovalDriver): string {
  const sign = driver.delta > 0 ? '+' : driver.delta < 0 ? '' : '±'
  const deltaStr = `${sign}${driver.delta.toFixed(1)}`
  return `${formatPopName(driver.pop_type)}: ${deltaStr} (happiness ${Math.round(
    driver.prevHappiness,
  )} → ${Math.round(driver.currentHappiness)})`
}
