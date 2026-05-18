// T-025 — Issue-decree button with cost gate + confirm dialog.
//
// Reusable per-decree control rendered by the PoliticsPanel. Encapsulates
// three rules:
//
//   1. Cost gate — `disabled` when `cost > treasury`. The engine ALSO drops
//      decrees whose cost exceeds treasury at stage 0 (silently, no event),
//      so this is purely a UX guard: the player shouldn't see an enabled
//      button that does nothing on click.
//
//   2. Confirm dialog — only when `cost > 0`. Using `window.confirm` is a
//      deliberate P1 choice (per ticket brief): a custom modal can ship in
//      T-031's polish pass; for now `confirm` is the smallest reliable
//      interaction surface and is trivial to stub in tests.
//
//   3. Free decrees (cost === 0) skip the dialog and enqueue immediately —
//      no surprise modal for a costless action.
//
// The button is intentionally dumb: it does not know about the engine, the
// store, or `enqueueDecision`. The panel wires `onIssue` to the store.

import type { DecreeId } from '@engine/types'
import { formatNumber, formatTitle } from '@ui/components/format'
import { Tooltip } from '@ui/components/Tooltip'
import type { TooltipKey } from '@ui/copy/tooltips'

export type DecreeButtonProps = {
  /** Catalog id (e.g. `industrial_subsidy`). Used for the test hook + label. */
  decreeId: DecreeId
  /** Cost in credits read from `DECREE_CATALOG_P1[decreeId].cost_treasury`. */
  cost: number
  /** Current `country.treasury`. Drives the disabled gate. */
  treasury: number
  /** Called with the decreeId once the issue is confirmed (or immediately if free). */
  onIssue: (decreeId: DecreeId) => void
}

/** Render the decree id as a human-readable title: `industrial_subsidy` → `Industrial Subsidy`. */
function decreeLabel(decreeId: DecreeId): string {
  return decreeId
    .split('_')
    .map((part) => formatTitle(part))
    .join(' ')
}

export function DecreeButton({ decreeId, cost, treasury, onIssue }: DecreeButtonProps) {
  const label = decreeLabel(decreeId)
  const disabled = cost > treasury
  const costDisplay = cost === 0 ? 'Free' : `${formatNumber(cost)} credits`

  const handleClick = () => {
    // Defensive: don't enqueue if disabled. The button is also `disabled` at
    // the DOM level, so this branch is mostly belt-and-braces against
    // programmatic clicks.
    if (disabled) return
    if (cost > 0) {
      // `window.confirm` blocks the event loop; tests stub it via
      // `vi.spyOn(window, 'confirm').mockReturnValue(true|false)`. The message
      // string is asserted in T-025 AC#3 — keep the comma-separated number
      // formatting (`formatNumber` does this) intact.
      const ok = window.confirm(`Issue '${label}'? Cost: ${formatNumber(cost)} credits.`)
      if (!ok) return
    }
    onIssue(decreeId)
  }

  // Tooltip key mirrors the decree id under the `decree.*` namespace in
  // tooltips.ts. The static map keeps the cost/effect/duration copy in one
  // place per the AC #2 "no inline literal duplicates canonical copy" rule.
  const tooltipKey = `decree.${decreeId}` as TooltipKey

  return (
    <Tooltip tooltipKey={tooltipKey} motionVariant="hud">
      <button
        type="button"
        className="decree-btn"
        data-testid={`decree-btn-${decreeId}`}
        onClick={handleClick}
        disabled={disabled}
      >
        <span className="decree-btn__label">{label}</span>
        <span className="decree-btn__cost" data-testid={`decree-btn-${decreeId}-cost`}>
          {costDisplay}
        </span>
      </button>
    </Tooltip>
  )
}
