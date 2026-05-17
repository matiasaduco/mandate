// T-024 — Small chip rendering a single POP priority with a tooltip.
//
// The tooltip text is computed by the parent panel (via `priorityTooltip` in
// `SocietyPanel.tsx`) so this component stays presentational — it only knows
// how to render the chip and surface the tooltip text via the native `title`
// attribute. Native `title=""` is intentional for P1: it covers screen reader
// announcement (RTL can assert via `getAttribute('title')`), needs zero
// runtime, and ships an accessible name without a custom popover infra.
// T-027 (slider preview) is the natural place to introduce a richer tooltip
// system if/when one is needed.
//
// The display name capitalizes words after splitting on `_` (e.g.
// `low_income_tax` → "Low Income Tax"). The shared `formatTitle` helper only
// capitalizes the first character, so we use a small local helper instead.

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
  return (
    <span
      className="priority-chip"
      title={tooltip}
      // Mirror `title` into `aria-label` so RTL queries that prefer accessible
      // name + a11y tools both see the tooltip text. Useful since `title` is
      // not always exposed as an accessible name by every AT.
      aria-label={`${formatPriorityLabel(priority)}: ${tooltip}`}
      data-testid={`priority-${priority}`}
    >
      {formatPriorityLabel(priority)}
    </span>
  )
}
