import { describe, expect, it } from 'vitest'
import * as Tunables from '../../src/engine/tunables'

// These values mirror ~/Documents/Tycoon/06 - Reference/Tunables.md.
// If a test fails, either the vault changed or the export drifted — sync them
// rather than rubber-stamp.
describe('tunables match the vault (T-003)', () => {
  it('time', () => {
    expect(Tunables.TICK_LENGTH_MONTHS).toBe(1)
    expect(Tunables.REAL_SECONDS_PER_TICK_AT_1X).toBe(3.0)
    expect(Tunables.SPEEDS).toEqual([0, 1, 2, 4])
  })

  it('loss conditions', () => {
    expect(Tunables.BANKRUPTCY_NEGATIVE_BALANCE_TICKS).toBe(3)
    expect(Tunables.APPROVAL_CRISIS_THRESHOLD).toBe(15)
    expect(Tunables.APPROVAL_CRISIS_TICKS).toBe(6)
    expect(Tunables.APPROVAL_WARN_THRESHOLDS).toEqual([30, 20, 15])
  })

  it('tax & economy', () => {
    expect(Tunables.TAX_INCOME_RANGE).toEqual([0, 60])
    expect(Tunables.TAX_CORPORATE_RANGE).toEqual([0, 60])
    expect(Tunables.TAX_CONSUMPTION_RANGE).toEqual([0, 30])
    expect(Tunables.TAX_DAMPENING_BREAKPOINT).toBe(40)
    expect(Tunables.BUDGET_CATEGORIES_P1).toEqual([
      'health',
      'education',
      'infrastructure',
      'security',
      'welfare',
    ])
  })

  it('approval', () => {
    expect(Tunables.APPROVAL_INERTIA_TAU).toBe(4)
    expect(Tunables.APPROVAL_FLOOR).toBe(0)
    expect(Tunables.APPROVAL_CEILING).toBe(100)
  })

  it('pops', () => {
    expect(Tunables.POP_SEGMENTS_P1).toEqual([
      'urban_workers',
      'rural_workers',
      'middle_class',
      'capitalists',
      'intelligentsia',
    ])
    expect(Tunables.HAPPINESS_RANGE).toEqual([0, 100])
    expect(Tunables.HAPPINESS_INERTIA_TAU).toBe(3)
    expect(Tunables.RADICALIZATION_PASSIVE_DECAY).toBe(0.5)
  })

  it('pollution and ui', () => {
    expect(Tunables.INDUSTRY_POLLUTION_COEFFICIENT).toBe(0.1)
    expect(Tunables.EVENT_FEED_LENGTH).toBe(12)
    expect(Tunables.TREND_HISTORY_TICKS).toBe(24)
  })
})
