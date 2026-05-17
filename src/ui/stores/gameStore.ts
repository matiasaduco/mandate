// T-019 — Zustand store + engine ↔ UI bridge.
//
// The store is the single point of contact between the headless engine and all
// React components. Components read from the store via selectors and push
// decisions back via `enqueueDecision`. The UI never mutates `snapshot`
// directly — it is a view-only consumer of `engine.tick()` snapshots and the
// event bus.
//
// Engine ↔ UI contract (locked in Decisions Log):
//   - engine.applyDecisions(decisions)  — queued; drained at stage 0 next tick
//   - engine.tick()                     — runs the pipeline, returns snapshot
//   - engine.subscribe(listener)        — event stream
//
// Same-tick mutation is forbidden: `enqueueDecision` only enqueues; the engine
// drains at stage 0 of the next tick. See CLAUDE.md invariant #3.

import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { createEngine, createEngineFromSavedState } from '@engine'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { EVENT_FEED_LENGTH, TREND_HISTORY_TICKS } from '@engine/tunables'
import type {
  Decision,
  Engine,
  EngineEvent,
  EngineState,
} from '@engine'

/**
 * Scalar series tracked by the rolling trend buffers consumed by
 * `OverviewPanel` (T-022) and any other UI surface that needs a sparkline.
 * Fixed set in Phase 1 — the panel renders one sparkline per key.
 */
export type TrendKey = 'population' | 'gdp' | 'treasury' | 'approval' | 'stability'

export type Trends = Record<TrendKey, number[]>

/**
 * Capacity for each trend buffer, mirrored from the vault tunable so the UI
 * never inlines the literal. Re-exported so panel code can size axes / labels
 * off the same value without re-importing from the engine tunables module.
 */
export const TREND_BUFFER_CAPACITY = TREND_HISTORY_TICKS

/** Sample the five tracked scalars from an engine snapshot. */
function sampleTrendValues(snapshot: EngineState): Record<TrendKey, number> {
  return {
    population: snapshot.country.population,
    gdp: snapshot.country.gdp,
    treasury: snapshot.country.treasury,
    approval: snapshot.country.approval,
    stability: snapshot.country.stability,
  }
}

/**
 * Build an initial trends container seeded with the starting snapshot value
 * for each tracked scalar. Length 1 per buffer at construction (pre-tick).
 */
function seedTrends(snapshot: EngineState): Trends {
  const sample = sampleTrendValues(snapshot)
  return {
    population: [sample.population],
    gdp: [sample.gdp],
    treasury: [sample.treasury],
    approval: [sample.approval],
    stability: [sample.stability],
  }
}

/**
 * Append the latest snapshot values to each buffer, trimming the oldest entry
 * once we exceed `TREND_HISTORY_TICKS`. Returns a new Trends object — never
 * mutates the input (Zustand requires referential change to notify).
 */
function pushTrendSample(prev: Trends, snapshot: EngineState): Trends {
  const sample = sampleTrendValues(snapshot)
  const append = (buf: number[], value: number): number[] => {
    const next = buf.length >= TREND_HISTORY_TICKS ? buf.slice(1) : buf.slice()
    next.push(value)
    return next
  }
  return {
    population: append(prev.population, sample.population),
    gdp: append(prev.gdp, sample.gdp),
    treasury: append(prev.treasury, sample.treasury),
    approval: append(prev.approval, sample.approval),
    stability: append(prev.stability, sample.stability),
  }
}

export type GameStoreState = {
  /** Latest engine snapshot. Read-only from the UI's perspective. */
  snapshot: EngineState
  /**
   * T-025 — The engine snapshot from the tick BEFORE `snapshot`. Used by the
   * PoliticsPanel to compute per-POP happiness deltas for the "Why?" tooltip
   * (see `politicsWhy.ts`). `null` on first paint (no prior tick) and on the
   * very first `advance()` it is set to the initial seeded state. Each
   * subsequent `advance()` rotates: the current `snapshot` becomes the new
   * `prevSnapshot`, and the freshly ticked state becomes the new `snapshot`.
   * Carried on the store rather than derived because the engine itself does
   * not retain history beyond `approval_prev` / `treasury_prev`.
   */
  prevSnapshot: EngineState | null
  /** Recent engine events, FIFO, capped at EVENT_FEED_LENGTH. */
  events: EngineEvent[]
  /**
   * Tick speed multiplier. 0 = paused; 1/2/4 from `SPEEDS`. The store does not
   * drive the tick loop — that lives in `useTickLoop` (T-020). `setSpeed(0)`
   * is just a state write here.
   */
  speed: number
  /**
   * T-022 — Rolling per-scalar history of the last `TREND_HISTORY_TICKS`
   * snapshots. Each buffer starts at length 1 (seeded with the starting
   * snapshot's value) and grows by 1 per `advance()`, capped at
   * `TREND_HISTORY_TICKS` (oldest dropped on overflow). The UI consumes these
   * buffers via narrow selectors — no derived state on the engine.
   */
  trends: Trends

  /** Run one engine tick and store the resulting snapshot. */
  advance: () => void
  /** Queue a decision for the next tick (no same-tick application). */
  enqueueDecision: (decision: Decision) => void
  /** Set the desired tick speed; the tick loop reads this in T-020. */
  setSpeed: (speed: number) => void
  /**
   * T-028 — Replace the underlying engine with one rebuilt from a saved
   * EngineState. Tears down the existing engine subscription, builds a fresh
   * engine via `createEngineFromSavedState` (which restores the PRNG cursor),
   * re-subscribes to events, and resets the UI-only derived state
   * (`trends`, `events`, `prevSnapshot`) to a fresh-boot shape so the panels
   * render as if this were the first paint. Callers should pause the engine
   * (`setSpeed(0)`) before calling this so no tick fires mid-swap; the UI
   * helper `SaveLoadControls` does this automatically.
   */
  loadState: (state: EngineState) => void
}

/**
 * Listener invoked synchronously when the engine emits an event. Provided so
 * UI code (e.g. T-020's `useTickLoop` auto-pause) can react to threshold
 * crossings without polling the `events` array on every render.
 */
export type GameStoreEventListener = (event: EngineEvent) => void

export type GameStoreOptions = {
  /** PRNG seed for the engine. Required so tests can lock determinism. */
  seed: number
  /**
   * Optional pre-built engine state. Defaults to `createAureliaState()`. Tests
   * can pass a mutated fixture to drive specific scenarios.
   */
  initialState?: EngineState
  /**
   * Initial UI tick speed. Defaults to 0 (paused). The store does not drive
   * the tick loop — this is a UI hint consumed by `useTickLoop` in T-020.
   */
  initialSpeed?: number
}

export type GameStore = UseBoundStore<StoreApi<GameStoreState>> & {
  /**
   * Engine handle owned by this store. Exposed for diagnostics / tests; UI
   * code must NEVER call these methods directly — go through the store actions
   * so events and snapshots stay in sync.
   */
  engine: Engine
  /** Tear down the engine subscription (used by tests that recreate stores). */
  destroy: () => void
  /**
   * T-020 — Forward to the engine's event bus. UI code (`useTickLoop` for the
   * auto-pause hook) subscribes here instead of touching `engine.subscribe`
   * directly, keeping the engine ↔ UI boundary contained to the store. Returns
   * an unsubscribe function. Listeners fire synchronously inside `tick()`
   * (during `bus.flush()`), so any state writes the listener performs (e.g.
   * `setSpeed(0)`) take effect immediately and are observable in the same
   * microtask the tick loop is in.
   *
   * Note: named `subscribeToEvents` (not `subscribe`) to avoid clashing with
   * Zustand's built-in `store.subscribe(stateListener)` API for state changes.
   */
  subscribeToEvents: (listener: GameStoreEventListener) => () => void
}

/**
 * Factory for an isolated game store. Each call wires a fresh engine + a fresh
 * Zustand store + a one-time event subscription. Tests use this directly so
 * each test gets a clean, deterministic slate. App code uses the singleton
 * `useGameStore` below.
 */
export function createGameStore(options: GameStoreOptions): GameStore {
  const { seed, initialState, initialSpeed = 0 } = options

  // Build the engine first so the store's initial snapshot can be the
  // un-ticked starting state. The first `advance()` the UI calls then
  // advances tick from 0 → 1 (AC #1).
  const seedState = initialState ?? createAureliaState()
  // Mutable engine handle so `loadState` (T-028) can swap the underlying
  // engine after a load. UI code goes through actions / `subscribeToEvents`
  // which always read the current value, so callers never hold a stale
  // reference.
  let engine: Engine = createEngine(seedState, { seed })

  /**
   * Subscribe the listener that pushes engine events into the store's `events`
   * buffer (capped at EVENT_FEED_LENGTH, FIFO). Returns the unsubscribe. The
   * subscription is recreated on `loadState` so the new engine's events flow
   * into the same store.
   */
  const subscribeEventBuffer = (): (() => void) =>
    engine.subscribe((event: EngineEvent) => {
      store.setState((prev) => {
        const next = [...prev.events, event]
        if (next.length > EVENT_FEED_LENGTH) {
          // Drop oldest entries until we are back at the cap.
          next.splice(0, next.length - EVENT_FEED_LENGTH)
        }
        return { events: next }
      })
    })

  const store = create<GameStoreState>((set) => ({
    snapshot: seedState,
    // T-025: no prior tick on first paint. After the first `advance()` this
    // becomes the initial seed state; rotated each subsequent advance.
    prevSnapshot: null,
    events: [],
    speed: initialSpeed,
    // T-022: seed the trend buffers with one sample of the starting state so
    // the OverviewPanel can render a (1-point) sparkline on first paint without
    // a guard for empty arrays. Subsequent advance() calls append one sample
    // each, capped at TREND_HISTORY_TICKS.
    trends: seedTrends(seedState),

    advance: () => {
      const nextSnapshot = engine.tick()
      // Functional setter: rotate prev → current → next in a single set call
      // so React subscribers see a single coherent state transition. The
      // previously-current `snapshot` becomes the new `prevSnapshot` BEFORE
      // we overwrite it — this is the comparator the PoliticsPanel "Why?"
      // tooltip uses to compute per-POP happiness deltas.
      set((prev) => ({
        prevSnapshot: prev.snapshot,
        snapshot: nextSnapshot,
        trends: pushTrendSample(prev.trends, nextSnapshot),
      }))
    },

    enqueueDecision: (decision: Decision) => {
      // Push-only to the engine queue. The engine drains it at stage 0 of the
      // next tick — same-tick mutation is forbidden (CLAUDE.md invariant #3).
      engine.applyDecisions([decision])
      // Intentionally no state mutation here: the UI sees the change only
      // after the next `advance()` flushes through the pipeline.
    },

    setSpeed: (speed: number) => set({ speed }),

    loadState: (loaded: EngineState) => {
      // T-028 — Swap the engine for one rebuilt from the loaded state,
      // preserving the PRNG cursor via `createEngineFromSavedState`. Order
      // matters: unsubscribe the OLD engine's event bus first, build the
      // NEW engine, re-subscribe, then commit the store state in one set so
      // React subscribers see a single coherent transition.
      unsubscribe()
      engine = createEngineFromSavedState(loaded)
      unsubscribe = subscribeEventBuffer()
      boundStore.engine = engine
      set({
        snapshot: loaded,
        // No prior tick after a load — mirrors fresh-boot semantics so the
        // PoliticsPanel "Why?" tooltip waits for the next advance() to gain
        // a comparator (T-025).
        prevSnapshot: null,
        events: [],
        // Re-seed the trend buffers from the loaded snapshot so sparklines
        // render with a single sample (matches first-paint semantics).
        trends: seedTrends(loaded),
      })
    },
  }))

  // Subscribe once to the engine event stream and push to `events`, FIFO,
  // capped at EVENT_FEED_LENGTH (oldest dropped on overflow). The bus flushes
  // at the end of `engine.tick()`, so all events generated by a single
  // `advance()` arrive synchronously before the snapshot setter resolves.
  // Mutable so `loadState` can rebind to the new engine.
  let unsubscribe = subscribeEventBuffer()

  const boundStore = store as GameStore
  boundStore.engine = engine
  boundStore.destroy = () => {
    unsubscribe()
  }
  // T-020: thin passthrough to the engine event bus. UI hooks (`useTickLoop`)
  // use this for auto-pause subscriptions so the engine handle stays private.
  // Resolved lazily so loadState's engine swap is transparent to subscribers
  // — but each `subscribeToEvents(listener)` call captures the engine that
  // was current at call time. Tests that exercise loadState should re-mount
  // useTickLoop / re-subscribe after load if they need events from the new
  // engine.
  boundStore.subscribeToEvents = (listener: GameStoreEventListener) =>
    engine.subscribe(listener)
  return boundStore
}

// --- Singleton ------------------------------------------------------------
//
// `useGameStore` is the singleton hook React components import. It builds an
// engine seeded from the URL (`?seed=`) if present, else `Date.now()`. Tests
// MUST NOT use this singleton — they should construct their own store via
// `createGameStore({ seed: <fixed> })` so each test is hermetic.

function resolveBootSeed(): number {
  if (typeof window === 'undefined') {
    return Date.now()
  }
  const raw = new URLSearchParams(window.location.search).get('seed')
  if (raw === null) {
    return Date.now()
  }
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

let singleton: GameStore | null = null

/**
 * Lazy-initialized singleton accessor. The first call constructs the store
 * (seeded from the URL or `Date.now()`); subsequent calls return the same
 * instance. Tests MUST construct their own store via `createGameStore` rather
 * than touch this singleton.
 */
export function getGameStore(): GameStore {
  if (singleton === null) {
    singleton = createGameStore({ seed: resolveBootSeed() })
  }
  return singleton
}

/**
 * Reset the singleton — for tests that explicitly need to exercise the
 * boot-from-URL path. App code should never call this.
 */
export function resetGameStoreSingleton(): void {
  if (singleton !== null) {
    singleton.destroy()
    singleton = null
  }
}

/**
 * Singleton React hook. Components import this and call it with a selector
 * (`useGameStore((s) => s.snapshot.tick)`) so they re-render only when their
 * selected slice changes (Zustand referential equality by default).
 *
 * Forwarded straight to the singleton store; the singleton is constructed on
 * first call. Calling without a selector returns the full state (Zustand's
 * default behavior) — prefer a selector to keep re-renders minimal.
 */
export function useGameStore<T>(selector: (state: GameStoreState) => T): T
export function useGameStore(): GameStoreState
export function useGameStore<T>(selector?: (state: GameStoreState) => T): T | GameStoreState {
  const store = getGameStore()
  // Zustand's bound hook is itself a function with two overloads (no args = full state).
  // We forward unconditionally; the cast is safe because the hook resolves the right one.
  if (selector === undefined) return store()
  return store(selector)
}
