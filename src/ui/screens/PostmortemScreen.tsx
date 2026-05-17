// T-026 — Postmortem (game-over) screen.
//
// Renders in place of the 4-panel dashboard when `state.game_over === true`.
// TopBar stays visible (see App.tsx). Shows:
//   - reason headline + body copy
//   - final tick, final approval (formatted), final treasury (formatted)
//   - last 12 events via <EventFeed events={...} limit={12} />
//   - "Restart" button that resets the singleton store and signals the App to
//     re-mount its content
//
// Reset semantics: per the T-026 brief, restart resets the WHOLE store. We
// call `resetGameStoreSingleton()` then invoke the parent's `onRestart`
// callback so the App can bump its key (forcing a full re-mount with the
// fresh singleton). Tests can pass their own `onRestart` to observe the call.

import type { EngineEvent, GameOverReason } from '@engine/types'
import { EventFeed } from '@ui/components/EventFeed'
import { formatNumber, formatPercent } from '@ui/components/format'
import {
  getGameStore,
  resetGameStoreSingleton,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'

export type PostmortemScreenProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component then resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
  /**
   * Called after the restart routine. App code wires this to a `resetKey`
   * bump that re-mounts the dashboard subtree. Tests can spy on it to assert
   * the restart click path fired.
   */
  onRestart?: () => void
}

/** Headline + body copy per `GameOverReason`. */
const REASON_COPY: Record<GameOverReason, { headline: string; body: string }> = {
  bankruptcy: {
    headline: 'Bankruptcy',
    body:
      "Aurelia's treasury collapsed. Creditors are at the gates. Your government has fallen.",
  },
  mass_uprising: {
    headline: 'Mass uprising',
    body:
      'The people have lost faith. Streets fill. The government has fallen.',
  },
}

/** Number of events shown in the postmortem (display-only). */
const POSTMORTEM_RECENT_EVENTS = 12

export function PostmortemScreen({ store, onRestart }: PostmortemScreenProps) {
  // Resolve the store ONCE per render — same pattern as other panels. Whether
  // the App passes the singleton or a test injects a custom store, the
  // selectors below see a stable hook identity for the lifetime of the mount.
  const resolved: GameStore = store ?? getGameStore()

  // Narrow selectors so the postmortem only re-renders when its slices change.
  // In practice the engine stops mutating after game-over, so these read once
  // and stay still.
  const reason = resolved((s: GameStoreState) => s.snapshot.game_over_reason)
  const tick = resolved((s: GameStoreState) => s.snapshot.tick)
  const approval = resolved((s: GameStoreState) => s.snapshot.country.approval)
  const treasury = resolved((s: GameStoreState) => s.snapshot.country.treasury)
  const events: EngineEvent[] = resolved((s: GameStoreState) => s.events)

  // Defensive: if a caller renders <PostmortemScreen /> while the engine is
  // still alive (no `game_over_reason`), fall back to a neutral message rather
  // than crash. The App only mounts us when `state.game_over === true`, so
  // this branch should be unreachable in practice.
  const copy =
    reason !== null
      ? REASON_COPY[reason]
      : { headline: 'Game over', body: 'The simulation has ended.' }

  const handleRestart = () => {
    // Tear down the singleton store (engine subscription + state). The very
    // next `getGameStore()` call (after App bumps `resetKey` and re-mounts)
    // will lazily construct a fresh store with a fresh engine — back to
    // Aurelia at tick 0.
    resetGameStoreSingleton()
    onRestart?.()
  }

  return (
    <main
      className="postmortem"
      data-testid="postmortem"
      data-reason={reason ?? 'unknown'}
      aria-label="Postmortem"
    >
      <section className="postmortem__inner">
        <header className="postmortem__header">
          <h1 className="postmortem__headline" data-testid="postmortem-headline">
            {copy.headline}
          </h1>
          <p className="postmortem__body" data-testid="postmortem-body">
            {copy.body}
          </p>
        </header>

        <dl className="postmortem__stats" data-testid="postmortem-stats">
          <div className="postmortem__stat">
            <dt className="postmortem__stat-label">Final tick</dt>
            <dd className="postmortem__stat-value" data-testid="postmortem-tick">
              {tick}
            </dd>
          </div>
          <div className="postmortem__stat">
            <dt className="postmortem__stat-label">Final approval</dt>
            <dd
              className="postmortem__stat-value"
              data-testid="postmortem-approval"
            >
              {formatPercent(approval)}
            </dd>
          </div>
          <div className="postmortem__stat">
            <dt className="postmortem__stat-label">Final treasury</dt>
            <dd
              className="postmortem__stat-value"
              data-testid="postmortem-treasury"
            >
              {formatNumber(treasury)}
            </dd>
          </div>
        </dl>

        <section className="postmortem__events" aria-label="Recent events">
          {/* Pass the store-resolved events explicitly so EventFeed doesn't
              need to re-read the store; this also lets us cap the list at the
              postmortem-specific number independent of the store cap. */}
          <EventFeed
            store={resolved}
            events={events}
            limit={POSTMORTEM_RECENT_EVENTS}
            heading="Final events"
          />
        </section>

        <button
          type="button"
          className="postmortem__restart"
          data-testid="postmortem-restart"
          onClick={handleRestart}
        >
          Restart
        </button>
      </section>
    </main>
  )
}
