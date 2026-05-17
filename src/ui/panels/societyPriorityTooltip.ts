// T-024 — Priority → tooltip text resolver for SocietyPanel.
//
// Lives in its own module so `SocietyPanel.tsx` stays a component-only export
// (react-refresh ESLint rule forbids mixing component + non-component
// exports). The engine's `resolvePriority()` is not exposed on the snapshot,
// and duplicating its math in the UI would couple this panel to module-local
// stage 3 constants — bad. Instead each priority maps to a snapshot field
// that is the closest proxy for "the underlying outcome value the POP is
// reacting to". A few priorities (`food_prices`, `services`,
// `business_friendly`, `stability`, `civil_liberties`, `environment`) have no
// Phase 1 model and render as "Not modeled in Phase 1".

import type { POP } from '@engine/types'
import { formatNumber } from '@ui/components/format'

/**
 * Snapshot slice the tooltip resolver needs. Keeping this narrow makes it
 * trivial to update the snapshot shape later without touching every priority
 * branch.
 */
export type PriorityTooltipContext = {
  pop: POP
  budget_shares: { health: number; education: number; security: number }
  sliders: { tax_income: number; tax_corporate: number; tax_consumption: number }
  agricultureOutput: number
}

/**
 * Map a priority key to the snapshot-derived tooltip text. Returns
 * "Not modeled in Phase 1" for any priority without a P1 backing field.
 */
export function priorityTooltip(
  priority: string,
  ctx: PriorityTooltipContext,
): string {
  switch (priority) {
    case 'jobs':
      // employment_rate is 0..1; display as integer percent.
      return `Employment: ${Math.round(ctx.pop.employment_rate * 100)}%`
    case 'healthcare':
      return `Health budget: ${Math.round(ctx.budget_shares.health * 100)}%`
    case 'education':
      return `Education budget: ${Math.round(ctx.budget_shares.education * 100)}%`
    case 'security':
      return `Security budget: ${Math.round(ctx.budget_shares.security * 100)}%`
    case 'agriculture_support':
      return `Agriculture output: ${formatNumber(ctx.agricultureOutput)}`
    case 'low_income_tax':
      return `Income tax: ${ctx.sliders.tax_income}%`
    case 'low_corporate_tax':
      return `Corporate tax: ${ctx.sliders.tax_corporate}%`
    case 'low_consumption_tax':
      return `Consumption tax: ${ctx.sliders.tax_consumption}%`
    default:
      // food_prices, services, business_friendly, stability, civil_liberties,
      // environment — none have a Phase 1 backing simulation field.
      return 'Not modeled in Phase 1'
  }
}
