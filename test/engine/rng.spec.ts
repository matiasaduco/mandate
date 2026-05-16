import { describe, expect, it } from 'vitest'
import { createRng } from '@engine/rng'

describe('seeded PRNG (T-003)', () => {
  it('two RNGs with the same seed produce identical sequences', () => {
    const a = createRng(42)
    const b = createRng(42)
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds produce different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('next() values are in [0, 1)', () => {
    const r = createRng(1)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('nextRange(min, max) values are in [min, max)', () => {
    const r = createRng(1)
    for (let i = 0; i < 1000; i++) {
      const v = r.nextRange(10, 20)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThan(20)
    }
  })

  it('getState/setState round-trip resumes the same sequence', () => {
    const r = createRng(7)
    for (let i = 0; i < 5; i++) r.next()
    const checkpoint = r.getState()
    const tail1 = [r.next(), r.next(), r.next()]
    r.setState(checkpoint)
    const tail2 = [r.next(), r.next(), r.next()]
    expect(tail1).toEqual(tail2)
  })
})
