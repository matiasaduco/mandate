# CLAUDE.md

Repo-level context for Claude Code (and any future agent) working on **Mandate**.

## What this project is

Mandate is a single-player **geopolitical simulator**. The player governs one country; every other country runs on the same rules. Narrative is emergent, not scripted.

The full design lives in an Obsidian vault (separate from this repo):

- **Vault path:** `~/Documents/Tycoon`
- **Vault entry point:** `~/Documents/Tycoon/00 - Index.md`
- **Phase 1 tickets (current scope):** `~/Documents/Tycoon/08 - Tickets/Phase 1 Tickets.md`

The vault is the **source of truth** for:
- Design decisions (`06 - Reference/Decisions Log.md` — append-only, do not relitigate).
- Tunables — every numeric constant by name (`06 - Reference/Tunables.md`).
- Per-system contracts (Owns / Reads / Writes / Emits / Consumes / Tick stage) and Acceptance Criteria, under `02 - Simulation/` and `03 - Gameplay/`.
- Fixtures (`07 - Examples/Sample Country - Aurelia.md`, `Sample Tick.md`).

## Conventions

- **Conversation:** Spanish. **Written deliverables (code, docs, commit messages):** English.
- **Tickets:** worked in dependency order from `Phase 1 Tickets.md`. Each ticket maps to one or more system pages' Acceptance Criteria; closing a ticket means an automated test asserts the relevant AC.
- **No literals in engine logic.** Reference [Tunables](src/engine/tunables.ts) by name. Adding a constant? Add it to the vault first, then mirror it here.
- **No invented fixture data.** Use `createAureliaState()` from `src/engine/fixtures/aurelia.ts` for any concrete example.

## Architecture invariants

These are enforced by lint where possible and by reviewer attention everywhere else.

1. **Engine is headless.** `src/engine/**` cannot import from `src/ui/**`, React, the DOM, or any UI library. ESLint rule enforces this.
2. **Engine is deterministic.** No `Math.random` under `src/engine/**` — use the seeded PRNG from `src/engine/rng.ts`. ESLint rule enforces this.
3. **Decisions are queued.** UI calls `engine.applyDecisions(decisions)` and the queue is drained at stage 0 of the next tick. Same-tick mutation is forbidden.
4. **Same-tick reads are explicit.** A system at stage N may read state written in stages `< N` of the same tick. Reads from stage `≥ N` are last-tick reads.
5. **All countries run the same systems.** AI countries are not simplified — they share code with the player's country. Differences live in *state*, not *rules*.
6. **The simulation is the source of truth.** UI is a view-only consumer of `engine.tick()` snapshots and event subscriptions.

The Engine ↔ UI contract is exactly three functions:

```ts
engine.applyDecisions(decisions: Decision[]): void
engine.tick(): EngineState
engine.subscribe(listener: (event: EngineEvent) => void): () => void
```

## Stack (locked)

- TypeScript (strict) + React 19
- Vite 8 (build / dev) + Vitest 4 (tests)
- Zustand (UI store, single source of truth for `engine snapshot`)
- Recharts (dataviz)
- pnpm
- ESLint 10 flat config + Prettier
- localStorage in Phase 1; IndexedDB later if size demands

The choice of UI lib is irrelevant at the engine level — the engine knows nothing about it.

## Tick pipeline (Phase 1)

```
0. Apply queued decisions
1. World layer            (no-op in P1)
2. Country economy        (sectors → GDP → tax_income → budget → treasury)
3. Country society        (POP income → happiness)
4. Country politics       (approval rollup + smoothing → stability)
5. Events resolution      (threshold events)
6. AI policy step         (no-op in P1)
7. UI / feedback + loss check
```

Full registry: `~/Documents/Tycoon/06 - Reference/Tick Pipeline.md`.

## File structure

```
src/
  engine/
    entities/       Country, POP, Sector, Decision, GameControl
    pipeline/       stage0_decisions, stage2_economy, stage3_society, …  (T-006+)
    events/         event bus + types  (T-006+)
    fixtures/       aurelia.ts (canonical Phase 1 starting state)
    tunables.ts     every constant from the vault, by name
    rng.ts          seeded PRNG (mulberry32)
    types.ts        Decision / EngineEvent / EngineState
    index.ts        public API: createEngine + applyDecisions / tick / subscribe
  ui/
    stores/         Zustand bridge to engine  (T-019)
    panels/         Overview / Economy / Society / Politics  (T-022 → T-025)
    components/     TopBar, Slider, EventFeed, …
    hooks/          useTickLoop, …
test/
  setup.ts          jest-dom matchers
  engine/
    contract.spec.ts        engine API plumbing
    rng.spec.ts             determinism
    tunables.spec.ts        vault ↔ code mirror
    aurelia.spec.ts         fixture sanity
    acceptance/             one file per system page (T-029)
```

## Commands

```bash
pnpm dev          # Vite dev server
pnpm test         # vitest run (CI-style)
pnpm test:watch   # interactive
pnpm test:ui      # vitest UI
pnpm lint         # ESLint flat config
pnpm build        # tsc -b + vite build (also the typecheck gate)
pnpm format       # prettier --write .
```

## How to work on a ticket

1. Open `~/Documents/Tycoon/08 - Tickets/Phase 1 Tickets.md` and find the ticket.
2. Read the **References** section of the ticket — every linked vault page.
3. Implement.
4. Write tests for each Acceptance Criteria item (`test/engine/acceptance/<system>.spec.ts`).
5. Make the tests pass. Verify `pnpm lint` and `pnpm build` are still green.
6. When all AC are green: check the boxes on the system page in the vault and reference the test path.

## Commit conventions

- Single-line subject in imperative mood, ≤ 72 chars.
- Reference the ticket id when applicable: `T-007: drain decision queue at stage 0`.
- Body explains *why* when it isn't obvious from the diff. No body for trivial changes.
- One ticket may take multiple commits; that's fine.

## Things to NOT do

- Do not relitigate decisions in `06 - Reference/Decisions Log.md`. Reopen explicitly if needed, with a new entry.
- Do not invent fixture data. Use Aurelia.
- Do not inline numeric constants in engine logic. Use Tunables.
- Do not import React / DOM / Zustand from `src/engine/**`.
- Do not call `Math.random` in the engine.
- Do not create `*.md` files (READMEs, design docs, summaries) unless the user asks.
