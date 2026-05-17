// T-026 — Threshold warning banner.
//
// Sits between the TopBar and the panel grid. Reads `loss_counters` from the
// snapshot and renders zero, one, or two banner rows depending on which clock
// is currently > 0:
//   - bankruptcy_negative_balance_ticks → bankruptcy clock banner
//   - approval_below_crisis_ticks       → approval crisis clock banner
// Hidden entirely (no DOM) when both counters are 0 — keeps the dashboard
// quiet at steady state.
//
// View-only consumer of the store. No engine handles, no decision queueing.

import {
  APPROVAL_CRISIS_TICKS,
  BANKRUPTCY_NEGATIVE_BALANCE_TICKS,
} from '@engine/tunables'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'

export type WarningBannerProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component then resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
}

/**
 * Severity hint: above half the tunable triggers an `is-critical` modifier
 * (deeper red). Display-only; the engine doesn't care.
 */
function isCritical(current: number, limit: number): boolean {
  return current / limit > 0.5
}

export function WarningBanner({ store }: WarningBannerProps) {
  // Resolve the store ONCE per render — same pattern as other panels.
  const resolved: GameStore = store ?? getGameStore()

  // Narrow selectors so the banner re-renders only when the relevant counter
  // changes (Zustand referential equality on numeric scalars).
  const bankruptcyTicks = resolved(
    (s: GameStoreState) => s.snapshot.loss_counters.bankruptcy_negative_balance_ticks,
  )
  const approvalCrisisTicks = resolved(
    (s: GameStoreState) => s.snapshot.loss_counters.approval_below_crisis_ticks,
  )

  // Both clocks at 0 → nothing to show. Returning null keeps the slot from
  // taking layout space at steady state.
  if (bankruptcyTicks <= 0 && approvalCrisisTicks <= 0) {
    return null
  }

  return (
    <div
      className="warning-banner"
      data-testid="warning-banner"
      role="alert"
      aria-live="polite"
    >
      {bankruptcyTicks > 0 ? (
        <div
          className={`warning-banner__row warning-banner__row--bankruptcy${
            isCritical(bankruptcyTicks, BANKRUPTCY_NEGATIVE_BALANCE_TICKS)
              ? ' is-critical'
              : ''
          }`}
          data-testid="warning-banner-bankruptcy"
          data-ticks={bankruptcyTicks}
        >
          <span className="warning-banner__icon" aria-hidden="true">
            ⚠
          </span>
          <span className="warning-banner__text">
            {`Bankruptcy clock: ${bankruptcyTicks}/${BANKRUPTCY_NEGATIVE_BALANCE_TICKS} ticks`}
          </span>
        </div>
      ) : null}
      {approvalCrisisTicks > 0 ? (
        <div
          className={`warning-banner__row warning-banner__row--approval${
            isCritical(approvalCrisisTicks, APPROVAL_CRISIS_TICKS) ? ' is-critical' : ''
          }`}
          data-testid="warning-banner-approval"
          data-ticks={approvalCrisisTicks}
        >
          <span className="warning-banner__icon" aria-hidden="true">
            ⚠
          </span>
          <span className="warning-banner__text">
            {`Approval crisis: ${approvalCrisisTicks}/${APPROVAL_CRISIS_TICKS} ticks`}
          </span>
        </div>
      ) : null}
    </div>
  )
}
