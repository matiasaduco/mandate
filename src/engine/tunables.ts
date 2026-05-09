// Every numeric constant in the simulation, mirrored from the vault:
//   ~/Documents/Tycoon/06 - Reference/Tunables.md
//
// Engine logic must reference these by name. Adding a new constant?
//   1. Add it to Tunables.md first.
//   2. Then export it here with the same name and value.
//   3. Reference it from logic — never inline the literal.

// --- Time -----------------------------------------------------------------

export const TICK_LENGTH_MONTHS = 1
export const REAL_SECONDS_PER_TICK_AT_1X = 3.0
export const SPEEDS = [0, 1, 2, 4] as const

// --- Loss conditions ------------------------------------------------------

export const BANKRUPTCY_NEGATIVE_BALANCE_TICKS = 3
export const APPROVAL_CRISIS_THRESHOLD = 15
export const APPROVAL_CRISIS_TICKS = 6
export const APPROVAL_WARN_THRESHOLDS = [30, 20, 15] as const

// --- Tax & economy --------------------------------------------------------

export const TAX_INCOME_RANGE = [0, 60] as const
export const TAX_CORPORATE_RANGE = [0, 60] as const
export const TAX_CONSUMPTION_RANGE = [0, 30] as const
export const TAX_DAMPENING_BREAKPOINT = 40
// TAX_DAMPENING_CURVE: convex, monotonic. Specific function lives in
// src/engine/pipeline/stage2_economy.ts and is balanced in T-031.

export const BUDGET_CATEGORIES_P1 = [
  'health',
  'education',
  'infrastructure',
  'security',
  'welfare',
] as const

// --- Approval -------------------------------------------------------------

export const APPROVAL_INERTIA_TAU = 4
export const APPROVAL_FLOOR = 0
export const APPROVAL_CEILING = 100

// --- POPs -----------------------------------------------------------------

export const POP_SEGMENTS_P1 = [
  'urban_workers',
  'rural_workers',
  'middle_class',
  'capitalists',
  'intelligentsia',
] as const

export const HAPPINESS_RANGE = [0, 100] as const
export const HAPPINESS_INERTIA_TAU = 3
export const RADICALIZATION_PASSIVE_DECAY = 0.5

// --- Climate / pollution (P4+, tracked from P1) ---------------------------

export const INDUSTRY_POLLUTION_COEFFICIENT = 0.1

// --- UI / feedback --------------------------------------------------------

export const EVENT_FEED_LENGTH = 12
export const TREND_HISTORY_TICKS = 24
