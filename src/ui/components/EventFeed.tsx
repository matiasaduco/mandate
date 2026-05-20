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

import { motion, useReducedMotion } from 'framer-motion'

import type { EngineEvent } from '@engine/types'
import { eventSeverity, formatEvent } from '@ui/components/eventCopy'
import { Tooltip } from '@ui/components/Tooltip'
import type { TooltipKey } from '@ui/copy/tooltips'
import {
  getGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'
import { EASE_OUT_CUBIC, MOTION_EVENT_SLIDE_IN_MS } from '@ui/theme/tokens'

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
  // T-034: each new event slides in from the right. Reduced-motion users get
  // an instant transition (no slide, no opacity tween). `useReducedMotion()`
  // returns the current value of the `(prefers-reduced-motion: reduce)` media
  // query — framer-motion sets it from `window.matchMedia` once on mount.
  const reducedMotion = useReducedMotion()

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
        data-tour-id="event-feed"
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
    <aside
      className="event-feed"
      data-testid="event-feed"
      data-tour-id="event-feed"
      aria-label="Event feed"
    >
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
          // Trigger explanation lives in tooltips.ts under `event.<Type>`.
          const tooltipKey = `event.${event.type}` as TooltipKey
          // Slide-in transition (T-034). Reduced-motion: zero duration +
          // initial=animate so the entry pops into place instantly. The
          // `data-slide-in` attribute is asserted by the reduced-motion test.
          const transition = reducedMotion === true
            ? { duration: 0 }
            : { duration: MOTION_EVENT_SLIDE_IN_MS / 1000, ease: EASE_OUT_CUBIC }
          return (
            <motion.li
              key={key}
              className={`event-feed__item event-feed__item--${severity}`}
              data-testid="event-feed-item"
              data-event-type={event.type}
              data-event-tick={event.tick}
              data-severity={severity}
              data-slide-in={reducedMotion === true ? 'instant' : 'slide'}
              tabIndex={0}
              initial={reducedMotion === true ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={transition}
            >
              <Tooltip tooltipKey={tooltipKey}>
                <span className="event-feed__item-inner">
                  <span className="event-feed__tick" aria-hidden="true">
                    {`t${event.tick}`}
                  </span>
                  <span className="event-feed__text">{formatEvent(event)}</span>
                </span>
              </Tooltip>
            </motion.li>
          )
        })}
      </ul>
    </aside>
  )
}
