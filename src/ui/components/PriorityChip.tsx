// T-024 — Small chip rendering a single POP priority with a tooltip.
//
// The per-priority text is computed by the parent panel (via `priorityTooltip`
// in `SocietyPanel.tsx`) and surfaced via the project-wide Radix Tooltip
// primitive (T-032). The Radix surface ships canonical hover-and-focus
// behaviour plus `aria-describedby` wiring; the per-priority text itself is
// still computed in the parent because it is a derived per-POP / per-budget
// readout, not a static copy entry.
//
// We use the project Tooltip primitive in a "free body" form via the
// `priority.label` canonical entry — the per-priority dynamic text is appended
// to the aria-label so screen readers still announce the dynamic context.
//
// The display name capitalizes words after splitting on `_` (e.g.
// `low_income_tax` → "Low Income Tax"). The shared `formatTitle` helper only
// capitalizes the first character, so we use a small local helper instead.

import { Tooltip } from '@ui/components/Tooltip'

export type PriorityChipProps = {
  /** Raw priority key from `POP.priorities` (e.g. `jobs`, `low_income_tax`). */
  priority: string
  /** Pre-computed tooltip text. The parent owns the snapshot lookups. */
  tooltip: string
}

/**
 * Pretty-print a snake_case priority key for chip display.
 * `low_income_tax` → "Low Income Tax".
 */
function formatPriorityLabel(priority: string): string {
  if (priority.length === 0) return priority
  return priority
    .split('_')
    .map((word) =>
      word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ')
}

export function PriorityChip({ priority, tooltip }: PriorityChipProps) {
  // The Radix wrapper surfaces the canonical `pop.priorities` body from
  // `tooltips.ts` (T-032 AC #2 — static copy lives in tooltips.ts, not the
  // component). The per-priority dynamic readout (e.g. "Health budget: 22%")
  // is derived per-POP state and is NOT canonical static copy, so it stays
  // attached to the chip itself via `title` + `aria-label` for screen readers
  // and the legacy T-024 AC#4 contract. The two surfaces are complementary:
  //   - Radix tooltip → static concept explanation
  //   - chip title/aria-label → live per-POP readout
  return (
    <Tooltip tooltipKey="pop.priorities">
      <span
        className="priority-chip"
        tabIndex={0}
        title={tooltip}
        aria-label={`${formatPriorityLabel(priority)}: ${tooltip}`}
        data-testid={`priority-${priority}`}
      >
        {formatPriorityLabel(priority)}
      </span>
    </Tooltip>
  )
}
