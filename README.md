# Mandate

A single-player **geopolitical simulator**. You govern one country; every other country runs on the same rules. There is no scripted narrative — the story is whatever emerges from millions of POPs reacting to your tax sliders, budget allocations, and decrees.

> **Status:** early development. Phase 1 (core engine, single country, no AI opponents) is in progress.

## Stack

- TypeScript (strict) + React 19
- Vite 8 + Vitest 4
- Zustand (UI store) + Recharts (dataviz)
- Headless simulation engine (no React, no DOM, no `Math.random` — fully deterministic from a seed)

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # vitest
pnpm build        # tsc + production bundle
pnpm lint
```

## Architecture in one paragraph

The simulation is a **headless TypeScript module** under `src/engine/` exposing exactly three functions: `applyDecisions(decisions)`, `tick()`, `subscribe(listener)`. The UI under `src/ui/` reads snapshots returned by `tick()`, pushes player decisions through the queue, and listens for events. The engine knows nothing about React, the DOM, or storage. This separation makes the simulation testable, deterministic, and replaceable.

## Design

The full design (systems, contracts, tunables, tickets) lives in a separate Obsidian vault. It is **not** in this repo. If you have access:

- Vault: `~/Documents/Tycoon/`
- Index: `~/Documents/Tycoon/00 - Index.md`
- Phase 1 tickets: `~/Documents/Tycoon/08 - Tickets/Phase 1 Tickets.md`

Highlights, in case you don't:

- Tick = 1 in-game month, ~3 real seconds at 1×.
- One country in Phase 1 ("Aurelia", a middle-income democracy archetype). World layer activates Phase 3.
- Five POP segments (urban workers, rural workers, middle class, capitalists, intelligentsia), each with their own happiness drivers. Approval is a size-weighted roll-up.
- Two loss conditions in Phase 1: bankruptcy and mass uprising. Elections, coups, revolutions, and wars arrive in later phases.
- Tone is satirical (Tropico / Suzerain register) — confined to the narrative layer; the simulation itself is neutral.

## Contributing

Not open for contributions yet — design and tickets are still in flux.

## License

[MIT](LICENSE)
