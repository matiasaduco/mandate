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
// src/engine/pipeline/stage2_economy.ts. Curve shape:
//   if effective_rate ≤ TAX_DAMPENING_BREAKPOINT/100 → multiplier = 1
//   else multiplier = 1 - TAX_DAMPENING_K_P1 × (rate − breakpoint)²

// T-031 — Convex quadratic decay coefficient applied above the dampening
// breakpoint. Lower k → softer punishment for high-tax strategies; higher k
// makes high-tax viability collapse faster. Verified monotonic in [0, 0.60].
export const TAX_DAMPENING_K_P1 = 0.5

// T-031 — Phase 1 GDP-incidence weights for the 3 tax sliders. Sum = 1.0 by
// design. Income > corporate > consumption reflects the placeholder Aurelia
// incidence assumption; revisit when the per-sector tax accounting in P5 lands.
export const TAX_INCIDENCE_WEIGHTS_P1 = {
  income: 0.6,
  corporate: 0.25,
  consumption: 0.15,
} as const

// T-031 — Symmetric noise band on per-tick sector growth.
//   output_next = output_prev × (SECTOR_BASE_GROWTH + uniform[-half, +half])
// SECTOR_BASE_GROWTH = 1.0: noise-mean expected growth is 0 (steady-state).
// Half-band 0.005 keeps per-tick drift sub-percent for 60-tick playtests.
export const SECTOR_BASE_GROWTH = 1.0
export const SECTOR_GROWTH_NOISE_HALF_BAND = 0.005

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

// --- POP happiness (P1, T-031) --------------------------------------------
//
// Subtracted from a POP's priority-driven raw happiness when its post-tax
// income clamps to 0. Severe by design (the vault flags it as a "severe"
// driver). T-031 tunes this from the pre-balance placeholder 20 → 40 so the
// punitive-regime mass_uprising strategy can drive smoothed approval below
// APPROVAL_CRISIS_THRESHOLD over 6+ consecutive ticks. Income clamping does
// not fire on the Aurelia start (every POP has positive post-tax income), so
// this knob does not alter the T-012 determinism lock.

export const INCOME_CLAMPED_HAPPINESS_PENALTY_P1 = 40

// --- Decrees (P1, T-031) ---------------------------------------------------
//
// Magnitudes and durations for the three Phase 1 decrees. Costs are charged
// at stage 0 when the decree is issued; effects apply for `duration` ticks
// (stage 2 for output_boost, stage 3 for happiness bumps) and the entry is
// pruned at stage 3 once its ticks_remaining reaches 0.
//
// INDUSTRIAL_SUBSIDY_COST_P1 is LOCKED by [[Simple Economy]] AC #5 — do not
// change without a Decisions Log entry.

export const PUBLIC_ADDRESS_HAPPINESS_DELTA_P1 = 5
export const PUBLIC_ADDRESS_DURATION_P1 = 1
export const EMERGENCY_RELIEF_HAPPINESS_DELTA_P1 = 10
export const EMERGENCY_RELIEF_DURATION_P1 = 3
export const EMERGENCY_RELIEF_COST_P1 = 3_000
export const INDUSTRIAL_SUBSIDY_PCT_P1 = 0.1
export const INDUSTRIAL_SUBSIDY_DURATION_P1 = 5
/** LOCKED by [[Simple Economy]] AC #5. */
export const INDUSTRIAL_SUBSIDY_COST_P1 = 5_000

// --- Climate / pollution (P4+, tracked from P1) ---------------------------

export const INDUSTRY_POLLUTION_COEFFICIENT = 0.1

// --- UI / feedback --------------------------------------------------------

export const EVENT_FEED_LENGTH = 12
export const TREND_HISTORY_TICKS = 24
