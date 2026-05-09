import { describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../src/engine'
import { createAureliaState } from '../../src/engine/fixtures/aurelia'

describe('engine contract (T-002)', () => {
  it('tick() advances the tick counter by exactly 1', () => {
    const engine = createEngine(createAureliaState(), { seed: 1 })
    const next = engine.tick()
    expect(next.tick).toBe(1)
  })

  it('tick() returns a fresh snapshot — no shared reference with internal state', () => {
    const engine = createEngine(createAureliaState(), { seed: 1 })
    const a = engine.tick()
    const b = engine.tick()
    expect(a).not.toBe(b)
    expect(a.country).not.toBe(b.country)
    expect(a.decision_queue).not.toBe(b.decision_queue)
    // Mutating the returned snapshot must not affect subsequent ticks.
    a.tick = 999
    a.country.treasury = -1
    a.decision_queue.push({ type: 'slider', slider_id: 'tax_income', value: 50 })
    const c = engine.tick()
    expect(c.tick).toBe(3)
    expect(c.country.treasury).toBe(50_000)
    expect(c.decision_queue).toHaveLength(0)
  })

  it('subscribe() returns an unsubscribe function and supports multiple listeners', () => {
    const engine = createEngine(createAureliaState(), { seed: 1 })
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = engine.subscribe(a)
    const unsubB = engine.subscribe(b)
    expect(typeof unsubA).toBe('function')
    expect(typeof unsubB).toBe('function')
    unsubA()
    unsubB()
    // No events fire in T-002, but unsubscribe must not throw.
    engine.tick()
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  it('applyDecisions() queues decisions for the next tick (consumed by stage 0 in T-007)', () => {
    const engine = createEngine(createAureliaState(), { seed: 1 })
    engine.applyDecisions([{ type: 'slider', slider_id: 'tax_income', value: 30 }])
    expect(() => engine.tick()).not.toThrow()
  })
})
