// T-026 — Right-sidebar event feed.
//
// Renders the last `EVENT_FEED_LENGTH` engine events newest-first. The store
// already caps the buffer (gameStore.ts T-019) — this component just reads
// that slice and lets `formatEvent` turn each payload into a sentence.
//
// View-only consumer of the gameStore: zero writes, zero engine handles.
// Same store-injection pattern as the other panels: tests pass their own
// `createGameStore({ seed: 1 })` via the `store` prop; app code passes nothing
// and the singleton resolves via `getGameStore()`.

import type { EngineEvent } from '@engine/types'
import { eventSeverity, formatEvent } from '@ui/components/eventCopy'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'

export type EventFeedProps = {
  /**
   * Optional store override for tests. Tests construct a hermetic store via
   * `createGameStore({ seed: 1 })` and pass it in. App code passes nothing —
   * the component then resolves the singleton via `getGameStore()`.
   */
  store?: GameStore
  /**
   * Optional events override. When supplied, the feed renders these events
   * verbatim and ignores the store's `events` slice. Used by the postmortem
   * screen to show the final-N events sliced from a possibly-already-mutated
   * store, and by tests that want to inject deterministic synthetic events
   * without driving the engine.
   */
  events?: EngineEvent[]
  /**
   * Override the rendered cap (defaults to all events the store provides,
   * already capped at `EVENT_FEED_LENGTH` upstream). Used by the postmortem
   * screen to show the last 12 specifically; passing a smaller number than the
   * store cap keeps the postmortem layout dense even if the cap grows later.
   */
  limit?: number
  /** Optional heading override. Defaults to "Events". */
  heading?: string
}

export function EventFeed({ store, events, limit, heading }: EventFeedProps) {
  // Resolve the store ONCE per render — same pattern as other panels. When the
  // caller passes its own `events` we still resolve a store (cheaply) so the
  // hook call sequence stays stable across renders; we just don't subscribe.
  const resolved: GameStore = store ?? getGameStore()
  const storeEvents = resolved((s: GameStoreState) => s.events)

  // Pick the source list: explicit `events` prop wins, else the store slice.
  const source = events ?? storeEvents
  // Newest-first. Slice to `limit` if provided; otherwise show the whole
  // (already-capped) source.
  const ordered = source.slice().reverse()
  const visible = limit !== undefined ? ordered.slice(0, limit) : ordered

  if (visible.length === 0) {
    return (
      <aside
        className="event-feed event-feed--empty"
        data-testid="event-feed"
        aria-label="Event feed"
      >
        <h3 className="event-feed__heading">{heading ?? 'Events'}</h3>
        <p className="event-feed__empty" data-testid="event-feed-empty">
          No activity yet.
        </p>
      </aside>
    )
  }

  return (
    <aside className="event-feed" data-testid="event-feed" aria-label="Event feed">
      <h3 className="event-feed__heading">{heading ?? 'Events'}</h3>
      <ul className="event-feed__list">
        {visible.map((event, idx) => {
          const severity = eventSeverity(event)
          // Composite key: tick + type + index. Engine events don't carry
          // unique ids, but the index (in the reversed-and-sliced array) is
          // stable for a given store snapshot — Zustand returns a new array
          // reference only when the underlying list grew, at which point the
          // list shifts and re-keying is correct anyway.
          const key = `${event.tick}-${event.type}-${idx}`
          return (
            <li
              key={key}
              className={`event-feed__item event-feed__item--${severity}`}
              data-testid="event-feed-item"
              data-event-type={event.type}
              data-event-tick={event.tick}
              data-severity={severity}
            >
              <span className="event-feed__tick" aria-hidden="true">
                {`t${event.tick}`}
              </span>
              <span className="event-feed__text">{formatEvent(event)}</span>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
