// T-021 — Top bar (always-visible header).
//
// First user-facing UI component. View-only: reads `country.name`,
// `country.analogue`, `country.treasury`, `country.approval`, `tick`, and
// `speed` from the supplied store (or the singleton, in app code). The only
// write path is the speed segmented control, which goes through
// `setSpeedSafe` so SPEEDS validation lives in one place (T-020).
//
// Per the vault Player View contract (stage 7 / read-only), no engine handles
// are touched here — everything goes through the store.
//
// Component-level concerns:
//   - Narrow selectors so each field's re-render is isolated (T-019 AC#4).
//   - The store-prop pattern (test injection vs app singleton): tests pass
//     their own store via the `store` prop; app code passes nothing and the
//     component resolves the singleton via `getGameStore()` ONCE at the top
//     of the component. That keeps the hook call sequence stable across
//     renders (we always call the same bound hook for a given mount).
//
// Calendar mapping (disambiguated in the brief — vault example was off-by-one):
//   month = tick % 12 (0 = Jan)
//   year  = CALENDAR_START_YEAR + floor(tick / 12)
//   year offset = floor(tick / 12)
//   Format: "<MonShort> <Year> — Tick <tick> / Year <yearOffset>"

import { SPEEDS } from '@engine/tunables'
import { formatCalendar } from '@ui/components/calendar'
import { formatNumber, formatPercent } from '@ui/components/format'
import { SaveLoadControls } from '@ui/components/SaveLoadControls'
import { Tooltip } from '@ui/components/Tooltip'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'
import { setSpeedSafe } from '@ui/hooks/useTickLoop'

export type TopBarProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component then resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
}

export function TopBar({ store }: TopBarProps) {
  // Resolve the store ONCE per render. Both branches return a `GameStore`,
  // which IS a Zustand bound hook (`(selector) => T`). Because the resolved
  // identity is stable for the lifetime of a mount (singleton is module-level,
  // injected store is owned by the test), all subsequent hook calls happen
  // in a consistent order — rules-of-hooks compliant.
  const resolved: GameStore = store ?? getGameStore()

  const name = resolved((s: GameStoreState) => s.snapshot.country.name)
  const analogue = resolved((s: GameStoreState) => s.snapshot.country.analogue)
  const tick = resolved((s: GameStoreState) => s.snapshot.tick)
  const treasury = resolved((s: GameStoreState) => s.snapshot.country.treasury)
  const approval = resolved((s: GameStoreState) => s.snapshot.country.approval)
  const speed = resolved((s: GameStoreState) => s.speed)

  const onSpeedClick = (next: number) => {
    // Route through setSpeedSafe so SPEEDS validation lives in one place
    // (T-020). The resolved store is the same instance we read from above —
    // no risk of writing to a different store than we render against.
    setSpeedSafe(resolved, next)
  }

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar__country">
        <span className="topbar__country-name">{name}</span>
        <span className="topbar__country-analogue" data-testid="analogue-chip">
          {analogue}
        </span>
      </div>

      <Tooltip tooltipKey="TICK_LENGTH_MONTHS">
        <div
          className={`topbar__calendar${speed > 0 ? ' pulse-active' : ''}`}
          data-testid="calendar"
          tabIndex={0}
        >
          {formatCalendar(tick)}
        </div>
      </Tooltip>

      <div className="topbar__stats">
        <Tooltip tooltipKey="country.treasury">
          <div className="topbar__stat" data-testid="treasury" tabIndex={0}>
            <span className="topbar__stat-label">Treasury</span>
            <span className="topbar__stat-value">{formatNumber(treasury)}</span>
          </div>
        </Tooltip>
        <Tooltip tooltipKey="country.approval">
          <div className="topbar__stat" data-testid="approval" tabIndex={0}>
            <span className="topbar__stat-label">Approval</span>
            <span className="topbar__stat-value">{formatPercent(approval)}</span>
          </div>
        </Tooltip>
      </div>

      <Tooltip tooltipKey="SPEEDS">
        <div
          className="topbar__speed"
          role="group"
          aria-label="Simulation speed"
          data-testid="speed-control"
          tabIndex={0}
        >
          {SPEEDS.map((s) => {
            const isActive = s === speed
            const label = s === 0 ? 'Pause' : `${s}×`
            return (
              <button
                key={s}
                type="button"
                className={`topbar__speed-btn${isActive ? ' is-active' : ''}`}
                aria-pressed={isActive}
                data-speed={s}
                onClick={() => onSpeedClick(s)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </Tooltip>

      {/* T-028 — Save / Load controls. Pauses the engine before each action
         so the mid-tick safety invariant is trivially satisfied. */}
      <SaveLoadControls store={resolved} />
    </header>
  )
}
