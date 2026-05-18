// T-032 — Centralized tooltip copy.
//
// Single source of truth for every tooltip in the player view. Keys mirror
// `Tunables.md` constant names (for entries whose value is surfaced directly
// to the player) plus a small set of `<area>.<metric>` keys for derived /
// per-entity metrics (e.g. `pop.happiness`, `sector.output`,
// `decree.public_address`, `event.PolicyChanged`).
//
// Editorial conventions per the Phase 1.5 brief:
//   - Tone: satirical / Tropico-Suzerain register. No dry spreadsheet copy.
//   - Verbatim where possible: descriptions for tunables that already appear
//     in vault prose are pulled directly from the cited system page. New copy
//     is only invented for derived-metric and event keys (the brief allows it
//     for those — no vault prose exists to mirror).
//   - `affects` is optional and only set where it makes sense (e.g. the
//     income-tax slider lists "Treasury", "Working / middle class approval",
//     "GDP drag").
//   - Constant references (e.g. `APPROVAL_INERTIA_TAU = 4`) are written
//     literally in the copy so the player sees the same constant name they
//     would see in the vault if they ever opened it.
//
// AC #2: no inline string in any component should duplicate one of these
// titles or bodies. Anything that would otherwise need a `title="..."` goes
// through `<Tooltip tooltipKey="...">` instead.

/**
 * Shape of one tooltip entry. `affects` is optional — used when the player
 * benefits from a bullet list of the downstream variables that move with this
 * control / surface.
 */
export type TooltipEntry = {
  title: string
  body: string
  affects?: readonly string[]
}

/**
 * The literal union of every key in the copy map. Derived from the map below
 * so adding a new entry automatically widens the union — no separate type
 * declaration to drift from the runtime map.
 */
export type TooltipKey = keyof typeof TOOLTIPS

export const TOOLTIPS = {
  // -----------------------------------------------------------------------
  // Time / speed (Glossary § Tick + Tunables § Time)
  // -----------------------------------------------------------------------
  TICK_LENGTH_MONTHS: {
    title: 'Tick length',
    body: 'One unit of simulated time. Each tick is one in-game month — long enough that policy changes have measurable effects, short enough that you experience a full term in a session.',
  },
  REAL_SECONDS_PER_TICK_AT_1X: {
    title: 'Real time per tick',
    body: 'At 1× speed, roughly 3 real-world seconds pass per tick. That gives about 36 seconds per simulated year — enough to read what just happened, not so much that you start refreshing your inbox.',
  },
  SPEEDS: {
    title: 'Game speed',
    body: 'Pause, 1×, 2×, or 4×. Pause freezes the tick counter so you can browse, plan, and queue decisions. The higher speeds compress real time per tick — speed changes apply at the next tick boundary.',
  },

  // -----------------------------------------------------------------------
  // Loss conditions (Tunables § Loss conditions)
  // -----------------------------------------------------------------------
  BANKRUPTCY_NEGATIVE_BALANCE_TICKS: {
    title: 'Bankruptcy clock',
    body: 'Treasury below zero and balance still negative for 3 consecutive ticks ends the run. Three months to fix a deficit before the auditors get involved.',
  },
  APPROVAL_CRISIS_THRESHOLD: {
    title: 'Crisis threshold',
    body: 'Smoothed approval below 15 for 6 consecutive ticks ends the run as a mass uprising. A Phase 1 stand-in for the full revolutions system — same trigger, fewer barricades.',
  },
  APPROVAL_CRISIS_TICKS: {
    title: 'Crisis tick count',
    body: 'Six consecutive ticks under the crisis threshold and the regime falls. Bring approval back above 15 before the counter expires and the clock resets.',
  },
  APPROVAL_WARN_THRESHOLDS: {
    title: 'Approval warnings',
    body: 'Escalating UI warnings fire when smoothed approval crosses 30, 20, and 15. At 15 you are one bad month from a mass uprising — treat the colour as advisory.',
  },

  // -----------------------------------------------------------------------
  // Tax & economy (Tunables § Tax & economy + Simple Economy § High-tax curve)
  // -----------------------------------------------------------------------
  TAX_INCOME_RANGE: {
    title: 'Income tax',
    body: 'Slider range 0–60%. Direct tax on wages. The biggest single lever on revenue — also the fastest way to anger workers and the middle class.',
    affects: ['Treasury', 'Urban / rural / middle-class approval', 'GDP drag above 40%'],
  },
  TAX_CORPORATE_RANGE: {
    title: 'Corporate tax',
    body: 'Slider range 0–60%. Levied on industry profits. Capitalists hate it; the treasury appreciates it. Push it too high and industry growth quietly stalls.',
    affects: ['Treasury', 'Capitalist approval', 'Industry growth'],
  },
  TAX_CONSUMPTION_RANGE: {
    title: 'Consumption tax',
    body: 'Slider range 0–30%. A regressive levy on spending. Quietly raises revenue from everyone — and irritates everyone in equal measure, especially urban workers.',
    affects: ['Treasury', 'All POPs (regressive)'],
  },
  TAX_DAMPENING_BREAKPOINT: {
    title: 'High-tax penalty',
    body: 'Above ~40% effective tax rate, sector output starts to decay (informal economy, capital flight). The curve is convex — small increases hurt little, large increases hurt a lot. This is the main brake on tax-and-spend strategies.',
  },
  TAX_INCIDENCE_WEIGHTS_P1: {
    title: 'Tax incidence',
    body: 'Phase 1 split of where each tax slider lands on GDP: income 60%, corporate 25%, consumption 15%. A placeholder until per-sector tax accounting arrives in Phase 5.',
  },

  // -----------------------------------------------------------------------
  // Approval (Tunables § Approval)
  // -----------------------------------------------------------------------
  APPROVAL_INERTIA_TAU: {
    title: 'Approval smoothing',
    body: 'Exponential smoothing with τ = 4 ticks. Prevents whiplash — a spike of good news will not move approval thirty points in one month. The "true" number you see is already smoothed.',
  },

  // -----------------------------------------------------------------------
  // POPs (Tunables § POPs + § Phase 1 economy free-parameters)
  // -----------------------------------------------------------------------
  HAPPINESS_RANGE: {
    title: 'Happiness',
    body: 'Each POP segment has its own happiness on a 0–100 scale, computed from a weighted sum of its priorities. Approval is just the size-weighted average — small POPs with strong opinions barely move the dial.',
  },
  INCOME_CLAMPED_HAPPINESS_PENALTY_P1: {
    title: 'Income clamp penalty',
    body: 'When taxes drive a POP\'s post-tax income to zero, their happiness takes a flat 40-point hit. Severe by design — it is what makes punitive tax regimes actually punitive.',
  },

  // -----------------------------------------------------------------------
  // Decrees (Tunables § Phase 1 decree placeholders) + per-decree summaries
  // -----------------------------------------------------------------------
  PUBLIC_ADDRESS_HAPPINESS_DELTA_P1: {
    title: 'Public address payload',
    body: 'One-tick +5 happiness to every POP. Costs nothing, lasts a month, soothes the masses just long enough to do something unpopular next.',
  },
  EMERGENCY_RELIEF_HAPPINESS_DELTA_P1: {
    title: 'Emergency relief payload',
    body: '+10 happiness to one targeted POP for the duration. Targeted, expensive, and explicitly transactional — pick the segment whose anger is loudest.',
  },
  EMERGENCY_RELIEF_DURATION_P1: {
    title: 'Emergency relief duration',
    body: 'Three ticks of sustained +10 happiness for the targeted POP. Plenty of time to schedule another announcement before the effect wears off.',
  },
  EMERGENCY_RELIEF_COST_P1: {
    title: 'Emergency relief cost',
    body: 'Costs 3,000 credits, charged immediately at stage 0 when issued. If the treasury cannot cover it, the decree is silently rejected — no event fires.',
  },
  INDUSTRIAL_SUBSIDY_PCT_P1: {
    title: 'Industrial subsidy payload',
    body: '+10% output boost on the industry sector for the duration. Capitalists love it; the treasury notices.',
  },
  INDUSTRIAL_SUBSIDY_DURATION_P1: {
    title: 'Industrial subsidy duration',
    body: 'Five ticks of +10% industry output. Long enough to lift GDP and treasury, short enough that you have to choose to renew.',
  },
  INDUSTRIAL_SUBSIDY_COST_P1: {
    title: 'Industrial subsidy cost',
    body: 'Costs 5,000 credits, charged immediately at stage 0. Locked by the Simple Economy contract — do not expect the number to move in Phase 1.',
  },

  // -----------------------------------------------------------------------
  // UI / feedback (Tunables § UI / feedback)
  // -----------------------------------------------------------------------
  EVENT_FEED_LENGTH: {
    title: 'Event feed depth',
    body: 'The right sidebar keeps the last 12 events, newest first. Older entries roll off — the feed is a heartbeat, not an archive.',
  },
  TREND_HISTORY_TICKS: {
    title: 'Trend history',
    body: 'Sparklines and the GDP chart cover the last 24 ticks (~2 years). Long enough to see a policy land, short enough that ancient mistakes do not flatten the curve.',
  },

  // -----------------------------------------------------------------------
  // Derived metrics — country (Glossary § Country)
  // -----------------------------------------------------------------------
  'country.approval': {
    title: 'Approval',
    body: 'Size-weighted average of POP happiness on a 0–100 scale, then exponentially smoothed (τ = 4 ticks). In Phase 1 this is the true number — the polled-with-noise variant arrives in Phase 4.',
  },
  'country.treasury': {
    title: 'Treasury',
    body: 'Liquid funds the government holds. Stock variable: tax_income flows in, budget_spend and decree costs flow out. Negative for three consecutive ticks while the balance stays negative ends the run.',
  },
  'country.stability': {
    title: 'Stability',
    body: 'A 0–100 readout of how close the country is to a regime-shaking crisis. In Phase 1 it tracks approval closely; later phases mix in radicalization, scandals, and institutional trust.',
  },
  'country.population': {
    title: 'Population',
    body: 'Sum of all POP sizes. Read by Approval & Legitimacy as the denominator on the size-weighted average — small but loud POPs do not flip the regime on their own.',
  },
  'country.gdp': {
    title: 'GDP',
    body: 'Sum of sector outputs (agriculture + industry + services). Recomputed every tick. The tax base — when GDP shrinks, every tax slider gets quieter.',
  },
  'country.balance': {
    title: 'Balance (per tick)',
    body: 'tax_income − budget_spend. Positive surplus accumulates in the treasury; negative balance drains it. The bankruptcy clock starts when the balance is negative AND the treasury has already gone red.',
  },
  'country.government': {
    title: 'Government type',
    body: 'Democracy, autocracy, or hybrid. Fixed at country setup in Phase 1. Phase 2 unlocks transitions — for now it is a label, not a lever.',
  },
  'country.head_of_state': {
    title: 'Head of state',
    body: 'The face of the regime. The party affiliation matters in Phase 2 when elections arrive; in Phase 1 it is mostly atmosphere.',
  },

  // -----------------------------------------------------------------------
  // PlayerCountryCard surfaces (T-035)
  // -----------------------------------------------------------------------
  'country.banner': {
    title: 'Country banner',
    body: 'The country\'s banner colour — one of the visual cues that will identify it on the Phase 3 world map. In Phase 1 it is decorative; in Phase 3 it is how you tell allies from rivals at a glance.',
  },
  'country.leader': {
    title: 'Leader',
    body: 'The head of state, listed with role and party. The party affiliation is flavour in Phase 1; it gains mechanical weight in Phase 2 when elections arrive.',
  },
  'country.ideology': {
    title: 'National ideology',
    body: 'The weighted mean of every POP\'s ideology, weighted by population size. A single progressive ↔ conservative axis in Phase 1 — Phase 2 splits this into a multi-axis vector that drives elections and party formation.',
  },

  // -----------------------------------------------------------------------
  // Derived metrics — POPs
  // -----------------------------------------------------------------------
  'pop.income': {
    title: 'POP income',
    body: 'Per-capita income, recomputed each tick from sector employment and tax incidence. When income clamps to zero, the income-clamp penalty kicks in.',
  },
  'pop.happiness': {
    title: 'POP happiness',
    body: 'A 0–100 scalar driven by the POP\'s priorities — jobs, healthcare, education, security, tax burden. Phase 1 keeps it on a single axis; needs-based splits arrive in Phase 4.',
  },
  'pop.ideology': {
    title: 'Ideology',
    body: 'A single progressive ↔ conservative axis in Phase 1 — the dot position is the POP\'s leaning. Phase 2 expands this into a multi-axis vector that drives elections and party formation.',
  },
  'pop.radicalization': {
    title: 'Radicalization',
    body: 'Rises slowly when happiness stays low; passive decay when conditions are good. Inert in Phase 1 — Phase 4 turns this into protests, strikes, and worse.',
  },
  'pop.employment_rate': {
    title: 'Employment rate',
    body: 'Fraction of the POP currently employed. Drives the jobs priority directly: a "jobs" POP with low employment is an unhappy POP, regardless of how much you spend on welfare.',
  },
  'pop.priorities': {
    title: 'Priorities',
    body: 'The ordered list of what this segment cares most about — jobs, security, healthcare, education, tax burden. Static in Phase 1; the weighting drives every line of happiness math.',
  },

  // -----------------------------------------------------------------------
  // Derived metrics — sectors
  // -----------------------------------------------------------------------
  'sector.output': {
    title: 'Sector output',
    body: 'Per-tick economic output for one of the three Phase 1 sectors (agriculture, industry, services). Grows with employment, decays with over-taxation, sums into GDP.',
  },
  'sector.employment': {
    title: 'Employment share',
    body: 'Fraction of the workforce in this sector. Sums to 1.0 across all three sectors. Used by POPs to compute their jobs-priority outcome.',
  },
  'sector.growth': {
    title: 'Sector growth',
    body: 'Per-tick output drift. Phase 1 noise stays sub-percent so steady-state tracks GDP cleanly; the high-tax curve is the only systematic drag above 40% effective rate.',
  },

  // -----------------------------------------------------------------------
  // Tax surfaces (sliders) — separate from RANGE keys because the slider
  // surface itself is the player-facing metric, not the range tuple.
  // -----------------------------------------------------------------------
  'tax.income': {
    title: 'Income tax',
    body: 'Direct tax on wages. The biggest single lever on revenue — also the fastest way to anger workers and the middle class. Range 0–60%; output starts to decay above 40% effective rate.',
    affects: ['Treasury', 'Urban / rural / middle-class approval', 'GDP drag above 40%'],
  },
  'tax.corporate': {
    title: 'Corporate tax',
    body: 'Levied on industry profits. Capitalists hate it; the treasury appreciates it. Push it too high and industry growth quietly stalls. Range 0–60%.',
    affects: ['Treasury', 'Capitalist approval', 'Industry growth'],
  },
  'tax.consumption': {
    title: 'Consumption tax',
    body: 'A regressive levy on spending. Quietly raises revenue from everyone — and irritates everyone in equal measure, especially urban workers. Range 0–30%.',
    affects: ['Treasury', 'All POPs (regressive)'],
  },

  // -----------------------------------------------------------------------
  // Budget surfaces (sliders)
  // -----------------------------------------------------------------------
  'budget.health': {
    title: 'Health budget',
    body: 'Per-capita health funding. Drives approval for urban and rural workers — under-fund it and the working class notices first.',
  },
  'budget.education': {
    title: 'Education budget',
    body: 'Per-capita education funding. The middle class and intelligentsia care most; long-term productivity rides on this in later phases.',
  },
  'budget.infrastructure': {
    title: 'Infrastructure budget',
    body: 'Funds roads, ports, grids. Slow-burn lever on long-term GDP growth — under-fund it and the deficit looks fine until growth dies.',
  },
  'budget.security': {
    title: 'Security budget',
    body: 'Funds police and stability. Capitalists like a quiet street; the working class notices when security spend crowds out social services.',
  },
  'budget.welfare': {
    title: 'Welfare budget',
    body: 'Direct transfers to the working class. The single fastest way to lift urban-worker happiness — and the single fastest way to bleed the treasury.',
  },

  // -----------------------------------------------------------------------
  // Decree surfaces (one per Phase 1 decree)
  // -----------------------------------------------------------------------
  'decree.public_address': {
    title: 'Public address',
    body: 'A one-tick +5 happiness bump to every POP, free of charge. Use it to smooth over a single bad month — it does not solve anything, it just buys you the next tick.',
    affects: ['All POP happiness (+5, 1 tick)'],
  },
  'decree.emergency_relief': {
    title: 'Emergency relief',
    body: 'Target one POP with +10 happiness for 3 ticks. Costs 3,000 credits at stage 0. Pick the segment whose anger is loudest before it becomes everyone\'s problem.',
    affects: ['Targeted POP happiness (+10, 3 ticks)', 'Treasury (−3,000, immediate)'],
  },
  'decree.industrial_subsidy': {
    title: 'Industrial subsidy',
    body: '+10% industry output for 5 ticks. Costs 5,000 credits at stage 0. Lifts GDP and capitalists; spend it when growth is what you actually need.',
    affects: ['Industry sector output (+10%, 5 ticks)', 'Treasury (−5,000, immediate)'],
  },

  // -----------------------------------------------------------------------
  // Event-feed entries — each explains the trigger
  // -----------------------------------------------------------------------
  'event.PolicyChanged': {
    title: 'Policy changed',
    body: 'A slider was committed at stage 0 of this tick. Fires exactly once per applied change; repeated drags during pause collapse to the final value.',
  },
  'event.DecreeIssued': {
    title: 'Decree issued',
    body: 'A decree was applied at stage 0: its cost reduced the treasury immediately and its effect entered the active-decrees list. Free decrees fire the event with zero cost.',
  },
  'event.TreasuryThresholdCrossed': {
    title: 'Treasury threshold crossed',
    body: 'The treasury crossed zero this tick. Crossing below starts the bankruptcy clock; crossing back above clears it.',
  },
  'event.ApprovalThresholdCrossed': {
    title: 'Approval threshold crossed',
    body: 'Smoothed approval crossed one of the warning levels (30 / 20 / 15). Debounced over the smoothing window so it does not spam when approval hovers near a threshold.',
  },
  'event.GameOver': {
    title: 'Game over',
    body: 'Bankruptcy or mass uprising. Fires exactly once per run; no further ticks process. The postmortem screen takes over above the panel grid.',
  },

  // -----------------------------------------------------------------------
  // Composite UI surfaces — politics breakdown + slider preview band
  // -----------------------------------------------------------------------
  'politics.approval_drivers': {
    title: 'Why approval moved',
    body: 'The top 3 POPs whose happiness moved most since last tick. Drivers are ranked by absolute delta — a POP that dropped 5 points outweighs one that rose 2, regardless of size.',
  },
  'politics.contribution_bar': {
    title: 'Approval contribution',
    body: 'Size-weighted contribution to the headline approval number: size × happiness / total population. Bigger bar = bigger share of the rollup, not necessarily bigger swing.',
  },
  'slider.preview': {
    title: 'Predicted impact',
    body: 'Directional ranges, not exact numbers — the simulation is honest about confidence. Phase 1 shows bands; Phase 2 may add scenario branches as the model gets richer.',
  },
} as const satisfies Record<string, TooltipEntry>
