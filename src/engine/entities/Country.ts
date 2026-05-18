import type { POP, PopType } from './POP'
import type { Sector } from './Sector'

// Field names mirror ~/Documents/Tycoon/06 - Reference/Data Model.md § Country.

export const CLIMATE_ZONES = ['tropical', 'temperate', 'arid', 'continental', 'arctic'] as const
export type ClimateZone = (typeof CLIMATE_ZONES)[number]

export const GOVERNMENT_TYPES = ['democracy', 'autocracy', 'hybrid'] as const
export type GovernmentType = (typeof GOVERNMENT_TYPES)[number]

export type TerrainProfile = {
  /** Each in 0–1. The five sum to 1. */
  coastline: number
  arable: number
  mountain: number
  forest: number
  desert: number
}

export type HeadOfState = {
  name: string
  /** Flavor in P1; mechanical from P2+. */
  party: string
  /**
   * Role label (e.g. `"President"`, `"Prime Minister"`, `"General Secretary"`).
   * T-035 — surfaced by the PlayerCountryCard so the leader chip reads
   * "President Elena Vorra" rather than the bare name. Flavor in P1; mechanical
   * in P2+ when government_type drives role-specific powers. The Tick Pipeline
   * does NOT read this field — it is identity-only metadata.
   */
  role: string
}

export type Country = {
  // Identity (static)
  id: string
  name: string
  analogue: string
  area_km2: number
  terrain_profile: TerrainProfile
  climate_zone: ClimateZone
  /** Empty in Phase 1 (single country). */
  neighbors: string[]
  government_type: GovernmentType
  head_of_state: HeadOfState
  /**
   * Banner / accent colour for this country, stored as a CSS-compatible string
   * (hex like `'#aa3bff'` or any other CSS color). T-035 — read by the
   * PlayerCountryCard for the top stripe; Phase 3 will reuse the same field
   * on the world map per-country. The Tick Pipeline does NOT read this field —
   * it is identity-only metadata, safe to change at any time without affecting
   * the determinism lock.
   */
  banner_color: string

  // Macro state (mostly derived)
  /** Derived: sum of POP sizes. Owner: POP Types. */
  population: number
  /** Derived: sum of sector outputs. Owner: Simple Economy. */
  gdp: number
  /** Stock. Owner: Simple Economy. */
  treasury: number
  /** Derived 0–100. Owner: Approval & Legitimacy. */
  approval: number
  /** Per-POP approval contributions, exposed for UI breakdown (T-025).
   *  In P1 this equals each POP's `happiness` keyed by `pop_type`. Written by
   *  stage 4 every tick. Partial because a fixture without a given POP type
   *  yields no entry. */
  approval_by_pop: Partial<Record<PopType, number>>
  /** Phase 2+. Owner: Approval & Legitimacy. Stored from P1 for forward-compat. */
  legitimacy: number
  /** Derived 0–100. Owner: Country Core. */
  stability: number

  /**
   * Per-tick budget target in credits. P1: pinned to a constant set by the
   * fixture (no auto-sync with `tax_income`, no player slider yet). P2+ will
   * let the player override via decision queue. Stage 2 reads this AS-IS each
   * tick and does NOT overwrite it.
   */
  target_budget: number

  // Inputs grouped on the country (sliders + sector / POP collections)
  pops: POP[]
  sectors: Sector[]
  sliders: SlidersState
  budget_shares: BudgetShares
}

export type SlidersState = {
  /** percent, within TAX_INCOME_RANGE */
  tax_income: number
  /** percent, within TAX_CORPORATE_RANGE */
  tax_corporate: number
  /** percent, within TAX_CONSUMPTION_RANGE */
  tax_consumption: number
}

export type BudgetShares = {
  /** Each share is 0–1; the five must sum to 1.0 (normalized in stage 2). */
  health: number
  education: number
  infrastructure: number
  security: number
  welfare: number
}
