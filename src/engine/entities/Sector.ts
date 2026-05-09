// Field names mirror ~/Documents/Tycoon/06 - Reference/Data Model.md § Sector (P1).
// Phase 5 will replace this with concrete Industry entities.

export const SECTOR_TYPES_P1 = ['agriculture', 'industry', 'services'] as const

export type SectorType = (typeof SECTOR_TYPES_P1)[number]

export type Sector = {
  sector_type: SectorType
  /** ≥ 0, per tick */
  output: number
  /** 0–1, of total workforce */
  employment_share: number
  /** ≥ 0. Tracked but inert in Phase 1; consumed by Pollution in Phase 4+. */
  pollution_coefficient: number
}
