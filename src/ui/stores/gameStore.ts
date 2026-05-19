// T-019 — Zustand store + engine ↔ UI bridge.
// T-036 — Route slice + boot / quit / pause actions for the main menu flow.
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
//
// T-036 — The store grew a `route` slice and a set of lifecycle actions
// (`bootEngine`, `bootEngineFromSave`, `quitToMenu`, `openPauseMenu`,
// `resumeFromPause`, `restartGame`). The legacy `createGameStore({ seed })`
// factory still auto-boots an engine on construction — every existing test
// path depends on that. Only the singleton (`getGameStore()`) defaults to a
// pre-engine, idle state (`route.kind === 'menu'`, engine null). App code
// resolves the singleton and calls `bootEngine` from the main menu screen.

import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { createEngine, createEngineFromSavedState, deserialize, serialize } from '@engine'
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

/**
 * T-036 — Top-level UI route. Discriminated union — every screen is one
 * `kind`. The pause overlay is its own route (NOT a sibling modal on top of
 * `playing`) so a single render branch decides what the app shows.
 *
 *   - `menu`: idle, no engine. Main menu screen renders.
 *   - `playing`: engine running (paused or not, controlled by `speed`).
 *   - `paused-menu`: engine still alive, overlay open. `setSpeed(0)` is
 *     applied alongside the route transition so the tick loop quiesces while
 *     the overlay is on screen.
 *
 * The `seed` and `startedAt` carried by `playing` / `paused-menu` are what
 * the Restart button replays from — they survive `restartGame()` so the new
 * engine boots with the same seed.
 */
export type Route =
  | { kind: 'menu' }
  | { kind: 'playing'; seed: number; startedAt: number }
  | { kind: 'paused-menu'; seed: number; startedAt: number }

/**
 * T-036 — Engine slice. The store always carries a `snapshot` (an Aurelia
 * placeholder in the idle / menu state, the live engine snapshot when
 * playing) — keeping the type non-nullable means existing selectors
 * (`s.snapshot.country.name`, etc.) don't need null guards everywhere. The
 * semantic "are we in a session?" question is answered by `route.kind`, and
 * App-level routing ensures dashboard components only mount when
 * `route.kind === 'playing'` (so the placeholder snapshot is never rendered).
 *
 * `prevSnapshot`, `events`, and `trends` are reset to their fresh-boot shape
 * on every `bootEngine` / `quitToMenu` transition.
 */
export type GameStoreState = {
  /**
   * T-036 — Top-level route. Drives App-level branching: `menu` → MainMenu,
   * `playing` → dashboard, `paused-menu` → dashboard + overlay.
   */
  route: Route
  /**
   * Latest engine snapshot. Read-only from the UI's perspective. In the idle
   * `menu` route this carries an unused Aurelia placeholder — App-level
   * branching ensures consumers only mount when an engine is alive.
   */
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

  // --- T-036 lifecycle actions ---------------------------------------------

  /**
   * T-036 — Construct a fresh engine with the given seed (and optional
   * starting state, defaulting to `createAureliaState()`) and transition to
   * the `playing` route. If an engine is already alive it is torn down first
   * (unsubscribe) so the new one's events flow into a clean store. Resets
   * `events`, `trends`, `prevSnapshot` to fresh-boot shape.
   */
  bootEngine: (options: { seed: number; initialState?: EngineState }) => void
  /**
   * T-036 — Construct a fresh engine from a serialized save string. Throws
   * `SaveLoadError` (re-thrown from `deserialize`) on parse / version
   * mismatch — the caller (MainMenu Continue button) catches and surfaces.
   */
  bootEngineFromSave: (raw: string) => void
  /**
   * T-036 — Pause + tear down the current engine and return to the main
   * menu. Autosaves the current snapshot to `mandate.save.v1` before tearing
   * down; if the write throws (quota), the transition still proceeds.
   * Engine reference becomes null; `snapshot` / `prevSnapshot` clear.
   */
  quitToMenu: () => void
  /**
   * T-036 — Open the pause overlay during `playing`. Sets `speed = 0` and
   * transitions the route to `paused-menu` with the same `seed` / `startedAt`
   * preserved.
   */
  openPauseMenu: () => void
  /**
   * T-036 — Close the pause overlay and return to `playing`. Speed stays at
   * 0 — the player can resume manually via the speed control (matches the
   * existing Pause button semantics in the TopBar).
   */
  resumeFromPause: () => void
  /**
   * T-036 — Dispose the current engine and immediately boot a fresh one with
   * the same `seed` (read from `route`). Starting state is always
   * `createAureliaState()`, NOT any persisted autosave. Transition goes
   * paused-menu → playing.
   */
  restartGame: () => void

  // --- T-033 onboarding lifecycle -----------------------------------------

  /**
   * T-033 — Speed snapshot taken when `startTour()` fires. The onboarding
   * tour auto-pauses the engine (`setSpeed(0)`) so the player can focus on
   * the tooltip without ticks landing under them. On tour end the field is
   * read back and passed to `setSpeed` so the prior cadence is restored —
   * including the (legal) case where the prior speed was already 0.
   *
   * `null` while no tour is active. Idempotent: a duplicate `startTour()`
   * call while a tour is already running keeps the original snapshot, so a
   * stray re-mount of the host component never overwrites the "real" prior
   * speed with the in-tour 0.
   */
  priorSpeedBeforeTour: number | null
  /**
   * T-033 — Snapshot `speed` into `priorSpeedBeforeTour` and force the
   * engine to pause (`setSpeed(0)`). No-op if a tour is already active
   * (priorSpeedBeforeTour !== null) — see field docs.
   */
  startTour: () => void
  /**
   * T-033 — Restore the speed saved by `startTour()` and clear
   * `priorSpeedBeforeTour`. No-op if no tour is active.
   */
  endTour: () => void
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
   * Engine handle owned by this store, or null while idle (T-036). Exposed
   * for diagnostics / tests; UI code must NEVER call these methods directly —
   * go through the store actions so events and snapshots stay in sync.
   */
  engine: Engine | null
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
   * T-036 — While idle (engine null), this returns a no-op unsubscriber. The
   * tick loop hook mounts unconditionally; subscriptions to a null engine
   * just don't fire.
   *
   * Note: named `subscribeToEvents` (not `subscribe`) to avoid clashing with
   * Zustand's built-in `store.subscribe(stateListener)` API for state changes.
   */
  subscribeToEvents: (listener: GameStoreEventListener) => () => void
}

/** T-036 — localStorage key for the autosave slot. Phase 1.5 spec. */
export const AUTOSAVE_KEY = 'mandate.save.v1'

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
 * T-036 — Empty trends shape for the idle (no-engine) store. Each buffer is
 * an empty array; selectors guarding on `snapshot === null` never read these.
 */
function emptyTrends(): Trends {
  return {
    population: [],
    gdp: [],
    treasury: [],
    approval: [],
    stability: [],
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

/**
 * T-036 — Internal factory variant. Builds the store, optionally pre-booting
 * an engine. The exported `createGameStore` always pre-boots (test
 * compatibility); the singleton accessor starts idle.
 */
type InternalFactoryOptions = {
  /** Boot an engine immediately with these params. Omit for idle / menu start. */
  boot?: GameStoreOptions
}

function createGameStoreInternal(options: InternalFactoryOptions): GameStore {
  // Mutable engine handle so lifecycle actions can swap / clear it. UI code
  // goes through actions / `subscribeToEvents` which always read the current
  // value, so callers never hold a stale reference.
  let engine: Engine | null = null
  // Mutable so `loadState` / `bootEngine` / `quitToMenu` can rebind. The
  // initial value is a no-op for the idle path.
  let unsubscribe: () => void = () => {}

  /**
   * Subscribe the listener that pushes engine events into the store's
   * `events` buffer (capped at EVENT_FEED_LENGTH, FIFO). Returns the
   * unsubscribe. The subscription is recreated whenever the engine is
   * swapped.
   */
  const subscribeEventBuffer = (target: Engine): (() => void) =>
    target.subscribe((event: EngineEvent) => {
      store.setState((prev) => {
        const next = [...prev.events, event]
        if (next.length > EVENT_FEED_LENGTH) {
          // Drop oldest entries until we are back at the cap.
          next.splice(0, next.length - EVENT_FEED_LENGTH)
        }
        return { events: next }
      })
    })

  /**
   * Tear down the current engine subscription and clear the handle. Idempotent
   * — calling twice is safe (unsubscribe becomes a no-op).
   */
  const teardownEngine = (): void => {
    unsubscribe()
    unsubscribe = () => {}
    engine = null
    boundStore.engine = null
  }

  // Initial state. Legacy path uses the caller's initialState (or Aurelia).
  // Idle path uses an Aurelia placeholder — never rendered (App routes on
  // `route.kind`), but keeps `snapshot` non-nullable so existing selectors
  // don't need null guards.
  const initialEngineState: EngineState = options.boot
    ? (options.boot.initialState ?? createAureliaState())
    : createAureliaState()
  const initialSpeed = options.boot?.initialSpeed ?? 0

  const store = create<GameStoreState>((set, get) => ({
    // Route — idle path starts at `menu`; legacy boot path starts at
    // `playing` so existing tests / app code see a running session
    // immediately.
    route: options.boot
      ? { kind: 'playing', seed: options.boot.seed, startedAt: Date.now() }
      : { kind: 'menu' },
    snapshot: initialEngineState,
    // T-025: no prior tick on first paint. After the first `advance()` this
    // becomes the initial seed state; rotated each subsequent advance.
    prevSnapshot: null,
    events: [],
    speed: initialSpeed,
    // T-022: seed the trend buffers with one sample of the starting state so
    // the OverviewPanel can render a (1-point) sparkline on first paint without
    // a guard for empty arrays. Subsequent advance() calls append one sample
    // each, capped at TREND_HISTORY_TICKS. Idle path: empty buffers (the
    // placeholder snapshot is not rendered, so a single seeded sample would
    // be misleading).
    trends: options.boot ? seedTrends(initialEngineState) : emptyTrends(),
    // T-033 — No tour active at store construction. Set by `startTour()`
    // and cleared by `endTour()`. See field docs above.
    priorSpeedBeforeTour: null,

    advance: () => {
      // T-036 — guard: no-op if no engine is alive. App code never calls this
      // in the idle path (the tick loop hook itself reads `speed`, which the
      // idle store keeps at 0), but the guard makes the contract explicit.
      if (engine === null) return
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
      if (engine === null) return
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
      unsubscribe = subscribeEventBuffer(engine)
      boundStore.engine = engine
      set({
        // T-036 — coming through Load should land in the playing route. The
        // seed-of-record for Restart is unknown after load (we did not save
        // the original seed in v1); we fall back to a fresh random one so a
        // post-load Restart still works. Phase 2 ticket can persist the seed.
        route: {
          kind: 'playing',
          seed: pickRandomSeed(),
          startedAt: Date.now(),
        },
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

    // --- T-036 lifecycle actions ----------------------------------------

    bootEngine: ({ seed, initialState }) => {
      // Tear down any existing engine so we start from a clean slate.
      teardownEngine()
      const seedState = initialState ?? createAureliaState()
      engine = createEngine(seedState, { seed })
      unsubscribe = subscribeEventBuffer(engine)
      boundStore.engine = engine
      set({
        route: { kind: 'playing', seed, startedAt: Date.now() },
        snapshot: seedState,
        prevSnapshot: null,
        events: [],
        speed: 0,
        trends: seedTrends(seedState),
      })
    },

    bootEngineFromSave: (raw: string) => {
      // deserialize throws SaveLoadError on parse / version mismatch — let it
      // propagate so the MainMenu Continue handler can surface the failure.
      const loaded = deserialize(raw)
      // Reuse loadState — it does the engine swap, the event re-subscribe,
      // and the fresh-boot reset for `events` / `trends` / `prevSnapshot`.
      get().loadState(loaded)
    },

    quitToMenu: () => {
      // Pause first so no tick can fire between here and the teardown below
      // (single-threaded JS, but the order makes the invariant explicit).
      set({ speed: 0 })
      // Autosave attempt. Failures are non-blocking: the route still flips to
      // menu even if localStorage throws (quota exceeded, restricted ctx).
      const current = get().snapshot
      if (current !== null && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(AUTOSAVE_KEY, serialize(current))
        } catch {
          // Swallow — Phase 1.5 spec: transition proceeds on autosave failure.
        }
      }
      teardownEngine()
      set({
        route: { kind: 'menu' },
        // Reset to an Aurelia placeholder — never rendered (App branches on
        // `route.kind`), but keeps the snapshot type non-nullable so existing
        // selectors don't need null guards.
        snapshot: createAureliaState(),
        prevSnapshot: null,
        events: [],
        trends: emptyTrends(),
      })
    },

    openPauseMenu: () => {
      const route = get().route
      if (route.kind !== 'playing') return
      set({
        route: { kind: 'paused-menu', seed: route.seed, startedAt: route.startedAt },
        speed: 0,
      })
    },

    resumeFromPause: () => {
      const route = get().route
      if (route.kind !== 'paused-menu') return
      set({
        route: { kind: 'playing', seed: route.seed, startedAt: route.startedAt },
      })
    },

    restartGame: () => {
      const route = get().route
      // Pull the seed-of-record from the active route. If we are somehow not
      // in a session (defensive), bail.
      if (route.kind !== 'playing' && route.kind !== 'paused-menu') return
      const seed = route.seed
      // Tear down + boot fresh. The initial state is ALWAYS Aurelia, never an
      // autosave (per the Edge Cases section of the brief).
      teardownEngine()
      const seedState = createAureliaState()
      engine = createEngine(seedState, { seed })
      unsubscribe = subscribeEventBuffer(engine)
      boundStore.engine = engine
      set({
        route: { kind: 'playing', seed, startedAt: Date.now() },
        snapshot: seedState,
        prevSnapshot: null,
        events: [],
        speed: 0,
        trends: seedTrends(seedState),
      })
    },

    // --- T-033 onboarding lifecycle ---------------------------------------

    startTour: () => {
      // Idempotent: a stray re-mount of the host component must not overwrite
      // the captured prior speed with the in-tour 0. If a tour is already
      // active, leave the snapshot alone — `endTour` will still restore the
      // ORIGINAL prior value.
      if (get().priorSpeedBeforeTour !== null) return
      const currentSpeed = get().speed
      set({
        priorSpeedBeforeTour: currentSpeed,
        speed: 0,
      })
    },

    endTour: () => {
      const prior = get().priorSpeedBeforeTour
      // Defensive: nothing to restore if no tour is active. Clearing a
      // null-prior is a no-op write.
      if (prior === null) return
      set({
        speed: prior,
        priorSpeedBeforeTour: null,
      })
    },
  }))

  // Pre-boot path: if the caller asked for an engine on construction (legacy
  // createGameStore), wire it up now. We do this AFTER `create(...)` returns
  // so `store.setState` is available for the event-buffer subscription.
  if (options.boot) {
    engine = createEngine(initialEngineState as EngineState, { seed: options.boot.seed })
    unsubscribe = subscribeEventBuffer(engine)
  }

  const boundStore = store as GameStore
  boundStore.engine = engine
  // `destroy` releases the engine event subscription but keeps the engine
  // handle accessible — preserves the pre-T-036 contract used by tests that
  // poke at `store.engine` after `destroy()` to assert no further events
  // flow into the store. T-036 lifecycle actions (`bootEngine`,
  // `quitToMenu`, `restartGame`) tear down BOTH subscription and handle.
  boundStore.destroy = () => {
    unsubscribe()
    unsubscribe = () => {}
  }
  // T-020: thin passthrough to the engine event bus. UI hooks (`useTickLoop`)
  // use this for auto-pause subscriptions so the engine handle stays private.
  // T-036 — While idle (engine null), returns a no-op unsubscriber so callers
  // can mount unconditionally. Each `subscribeToEvents(listener)` call
  // captures the engine that was current at call time.
  boundStore.subscribeToEvents = (listener: GameStoreEventListener) => {
    if (engine === null) return () => {}
    return engine.subscribe(listener)
  }
  return boundStore
}

/**
 * Factory for an isolated game store with an engine pre-booted on
 * construction. Each call wires a fresh engine + a fresh Zustand store + a
 * one-time event subscription. Tests use this directly so each test gets a
 * clean, deterministic slate. App code uses the singleton `getGameStore()`
 * below, which (T-036) defaults to an idle state instead.
 */
export function createGameStore(options: GameStoreOptions): GameStore {
  return createGameStoreInternal({ boot: options })
}

// --- Singleton ------------------------------------------------------------
//
// `useGameStore` is the singleton hook React components import. T-036 — the
// singleton now starts IDLE (`route.kind === 'menu'`, engine null). The main
// menu screen calls `bootEngine({ seed })` to transition to a playing route.
// Tests MUST NOT use this singleton — they should construct their own store
// via `createGameStore({ seed: <fixed> })` so each test is hermetic.

/**
 * T-036 — Draw a 32-bit positive seed from the platform CSPRNG. Excluding 0
 * keeps us inside the `[1, 4294967295]` range the brief locks. Falls back to
 * `Date.now()` (clamped to the same range) when `crypto.getRandomValues` is
 * unavailable (very old node test runners; jsdom provides it).
 */
export function pickRandomSeed(): number {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buf)
    // Reject 0 so the [1, 2^32 - 1] invariant holds. Re-roll once is enough
    // in practice — the probability is 1/2^32.
    if (buf[0] !== 0) return buf[0]
    return 1
  }
  // Date.now() returns 13-digit ms-since-epoch; mod into the 32-bit range.
  const fallback = Date.now() % 4_294_967_295
  return fallback === 0 ? 1 : fallback
}

let singleton: GameStore | null = null

/**
 * Lazy-initialized singleton accessor. T-036 — the singleton constructs in
 * an idle state (`route.kind === 'menu'`, engine null). Subsequent calls
 * return the same instance. Tests MUST construct their own store via
 * `createGameStore` rather than touch this singleton.
 */
export function getGameStore(): GameStore {
  if (singleton === null) {
    singleton = createGameStoreInternal({})
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
