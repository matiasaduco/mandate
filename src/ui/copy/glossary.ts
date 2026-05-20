// T-037 — In-game glossary copy.
//
// Single source of truth for the Help / Glossary screen. Merges:
//   1. Every term in `~/Documents/Tycoon/06 - Reference/Glossary.md` —
//      verbatim where possible, lightly edited for screen rendering.
//   2. A curated subset of `tooltips.ts` entries that carry player-facing
//      game-mechanic descriptions (tunables, derived metrics) — referenced
//      here so the glossary is a complete lookup table, not a secondary copy.
//
// Drift test: `test/ui/glossary.drift.spec.ts` compares every key here
// against `GLOSSARY_VAULT_KEYS` (the hand-maintained canonical list extracted
// from Glossary.md) and vice versa. When you add a new term to the vault,
// update GLOSSARY_VAULT_KEYS in that test file AND add the entry here.
//
// Key naming convention:
//   - Vault terms: lowercase snake_case matching the concept name.
//   - Tunable-sourced terms: uppercase matching the tunables.ts export name.
//   - Tooltip-sourced terms: dot-notation matching the TOOLTIPS key.
// All keys are strings; the value is { term, body }.

/** Shape of one glossary entry. */
export type GlossaryEntry = {
  /** The display name shown in the glossary list. */
  term: string
  /** Explanatory prose. One to three sentences. */
  body: string
}

/** The full glossary map. Keys are stable identifiers; values are entries. */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  // =========================================================================
  // Core simulation  (Glossary.md § "Core simulation")
  // =========================================================================

  simulation: {
    term: 'Simulation',
    body: 'The deterministic-enough process that advances world state by one tick. All countries run the same rules — differences live in state, not code.',
  },

  tick: {
    term: 'Tick',
    body: 'One unit of simulated time, equal to one in-game month. At 1× speed roughly 3 real seconds pass per tick. Policy changes and events resolve at tick boundaries.',
  },

  tick_stage: {
    term: 'Tick stage',
    body: 'A position 1–7 in the per-tick update pipeline. Each system declares its stage; a system at stage N may read state written in stages < N of the same tick.',
  },

  state: {
    term: 'State',
    body: 'The complete set of variables describing the world at a point in time. Lives in entities (Country, POP, Sector). The simulation is the source of truth — the UI is a view-only consumer.',
  },

  system: {
    term: 'System',
    body: 'A bounded set of variables and rules with a contract (owns / reads / writes / emits / consumes). Each system has one page in the design vault.',
  },

  entity: {
    term: 'Entity',
    body: 'A first-class object in the data model: Country, POP, Sector, Election, Treaty, etc. Entities hold state that persists across ticks.',
  },

  stock_flow: {
    term: 'Stock vs. Flow',
    body: 'A stock is a quantity (treasury = 1000). A flow is a per-tick change (income = +200/tick). Stocks accumulate flows. Treasury is a stock; balance is a flow.',
  },

  derived_state: {
    term: 'Derived state',
    body: 'State that is recomputed each tick from other state, never set directly. GDP is derived from sector outputs; stability is derived from approval. Derived state cannot be edited.',
  },

  hidden_visible_state: {
    term: 'Hidden vs. Visible state',
    body: 'Some state is true but not shown to the player (true corruption). Some is shown only as estimates (polls). Phase 1 shows all values directly; fog of war arrives in Phase 4.',
  },

  // =========================================================================
  // Player-facing  (Glossary.md § "Player-facing")
  // =========================================================================

  player: {
    term: 'Player',
    body: 'The human running the game. Controls one country. Every other country runs the same rules on autopilot — differences are in state, not special code paths.',
  },

  decision: {
    term: 'Decision',
    body: 'Any input the player provides. Has a type: slider, decree, law, project, diplomatic action. Decisions are queued and drained at stage 0 of the next tick — never applied mid-tick.',
  },

  slider: {
    term: 'Slider',
    body: 'A persistent continuous input (tax rate, budget share). Set once, applies every tick until changed. Changes are committed on release, not on drag.',
  },

  decree: {
    term: 'Decree',
    body: 'A one-shot executive action. Immediate, often with a treasury cost. Three Phase 1 decrees: Public Address, Emergency Relief, Industrial Subsidy.',
  },

  law: {
    term: 'Law',
    body: 'A persistent rule change requiring legislative process. Phase 2+. Slower to pass than a decree but more durable in its effects.',
  },

  project: {
    term: 'Project',
    body: 'A multi-tick investment with delayed payoff (Phase 4+). Requires sustained budget allocation before the benefit materialises.',
  },

  // =========================================================================
  // Country  (Glossary.md § "Country")
  // =========================================================================

  pop: {
    term: 'POP',
    body: 'A population segment. Phase 1 has 5: urban workers, rural workers, middle class, capitalists, intelligentsia. Each POP has size, income, happiness, ideology, and a ranked list of priorities.',
  },

  sector: {
    term: 'Sector',
    body: 'A coarse economic category. Phase 1 has three: agriculture, industry, services. Each sector has an output level that contributes to GDP.',
  },

  industry: {
    term: 'Industry',
    body: 'A concrete economic activity (mining, manufacturing, finance…). Phase 5 replaces coarse sectors with industries. In Phase 1 "industry" refers to the mid-tier sector.',
  },

  approval: {
    term: 'Approval',
    body: 'Size-weighted aggregate of POP happiness. Ranges 0–100. Exponentially smoothed (τ = 4 ticks) so short bursts of popularity do not swing the dial wildly. Phase 1 scalar; Phase 4 adds polling noise.',
  },

  legitimacy: {
    term: 'Legitimacy',
    body: 'Slow-moving "right to govern". Phase 2+. Distinct from approval — a regime can have low approval but high legitimacy (or vice versa).',
  },

  stability: {
    term: 'Stability',
    body: 'Derived 0–100 indicator of how close the country is to a regime-shaking crisis. In Phase 1 it tracks approval closely; later phases mix in radicalization, scandals, and institutional trust.',
  },

  treasury: {
    term: 'Treasury',
    body: 'Liquid funds the government holds. Stock variable: tax income flows in, budget spend and decree costs flow out. Going negative for 3 consecutive ticks while the balance stays negative ends the run.',
  },

  balance: {
    term: 'Balance',
    body: 'Per-tick flow = tax_income − budget_spend. Positive surplus accumulates in the treasury; negative balance drains it. The bankruptcy clock starts when balance is negative AND the treasury has already gone red.',
  },

  government_type: {
    term: 'Government type',
    body: 'Democracy, autocracy, or hybrid. Fixed at country setup in Phase 1. Phase 2+ unlocks transitions — for now it is a label, not a lever.',
  },

  // =========================================================================
  // World  (Glossary.md § "World")
  // =========================================================================

  bloc: {
    term: 'Bloc',
    body: 'A group of countries with aligned interests. Emergent or named. Phase 3+.',
  },

  soft_power: {
    term: 'Soft power',
    body: 'Influence through culture, economy, and institutions — not force. Phase 4+.',
  },

  fx: {
    term: 'FX',
    body: 'Foreign exchange (currency). Phase 5. Phase 1 uses a single credit unit.',
  },

  // =========================================================================
  // Vault conventions  (Glossary.md § "Vault conventions")
  // =========================================================================

  system_contract: {
    term: 'System Contract',
    body: 'The standard section in each system page declaring Owns / Reads / Writes / Emits / Consumes / Tick stage. Used by the ticket-generation workflow to keep systems coherent.',
  },

  acceptance_criteria: {
    term: 'Acceptance Criteria',
    body: 'Testable conditions for "this system is done in phase N". A ticket is closed only when an automated test asserts every AC item.',
  },

  edge_case: {
    term: 'Edge Case',
    body: 'A boundary or zero/extreme condition with explicit expected behavior documented in the system page. Zero-income POPs, empty event feeds, and corrupt saves are typical examples.',
  },

  status_frontmatter: {
    term: 'Status (frontmatter)',
    body: 'Lifecycle flag on each vault page: idea | drafted | locked. "locked" means the design is approved — changes require a Decisions Log entry.',
  },

  phase_frontmatter: {
    term: 'Phase (frontmatter)',
    body: 'The earliest phase (1–5) in which the system appears. Phase 1 is the playable MVP. Phase 5 is the full simulation.',
  },
}
