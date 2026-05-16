import { describe, expect, it } from 'vitest'
import { createAureliaState } from '@engine/fixtures/aurelia'
import {
  TAX_INCOME_RANGE,
  TAX_CORPORATE_RANGE,
  TAX_CONSUMPTION_RANGE,
} from '@engine/tunables'

describe('Aurelia fixture (T-005)', () => {
  it('createAureliaState() returns a valid EngineState', () => {
    const s = createAureliaState()
    expect(s.tick).toBe(0)
    expect(s.game_speed).toBe(0)
    expect(s.game_over).toBe(false)
    expect(s.game_over_reason).toBeNull()
    expect(s.country.id).toBe('aurelia')
    expect(s.country.name).toBe('Republic of Aurelia')
  })

  it('the 5 POPs sum to 30,000,000', () => {
    const s = createAureliaState()
    const sum = s.country.pops.reduce((acc, p) => acc + p.size, 0)
    expect(sum).toBe(30_000_000)
  })

  it('the 3 sectors sum to 400,000', () => {
    const s = createAureliaState()
    const sum = s.country.sectors.reduce((acc, sect) => acc + sect.output, 0)
    expect(sum).toBe(400_000)
  })

  it('target_budget is pinned to 100_000 (steady-state tax_income; T-010)', () => {
    const s = createAureliaState()
    expect(s.country.target_budget).toBe(100_000)
  })

  it('the 5 budget shares sum to 1.0 (within float tolerance)', () => {
    const { budget_shares } = createAureliaState().country
    const sum =
      budget_shares.health +
      budget_shares.education +
      budget_shares.infrastructure +
      budget_shares.security +
      budget_shares.welfare
    expect(sum).toBeCloseTo(1.0, 6)
  })

  it('tax sliders are within their TAX_*_RANGE', () => {
    const { sliders } = createAureliaState().country
    const inRange = (v: number, [min, max]: readonly [number, number]) => v >= min && v <= max
    expect(inRange(sliders.tax_income, TAX_INCOME_RANGE)).toBe(true)
    expect(inRange(sliders.tax_corporate, TAX_CORPORATE_RANGE)).toBe(true)
    expect(inRange(sliders.tax_consumption, TAX_CONSUMPTION_RANGE)).toBe(true)
  })

  it('hand-computed approval rollup ≈ 56 (size-weighted POP happiness)', () => {
    // Sanity guard against drift in the fixture. Stage 4 (T-013) will verify
    // this against the engine's own rollup with smoothing.
    const { pops } = createAureliaState().country
    const totalSize = pops.reduce((acc, p) => acc + p.size, 0)
    const weighted = pops.reduce((acc, p) => acc + p.size * p.happiness, 0)
    const approval = weighted / totalSize
    expect(approval).toBeGreaterThan(55)
    expect(approval).toBeLessThan(57)
  })

  it('terrain profile sums to 1.0', () => {
    const t = createAureliaState().country.terrain_profile
    const sum = t.coastline + t.arable + t.mountain + t.forest + t.desert
    expect(sum).toBeCloseTo(1.0, 6)
  })

  it('successive calls return independent state objects', () => {
    const a = createAureliaState()
    const b = createAureliaState()
    expect(a).not.toBe(b)
    expect(a.country).not.toBe(b.country)
    a.country.treasury = 0
    expect(b.country.treasury).toBe(50_000)
  })
})
