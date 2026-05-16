// T-007 — Stage 0: apply queued decisions.
//
// One `it()` per AC checkbox from [[Decision Mechanics]] / Phase 1 Tickets:
//   1. Queueing a single slider change applies it at the next stage 0, exactly once.
//   2. Queueing two changes to the same slider in the same pause window
//      results in only the final value applied; one `PolicyChanged` emitted
//      with `old_value` = pre-pause value, `new_value` = final.
//   3. A slider value pushed beyond TAX_INCOME_RANGE clamps to the range;
//      engine logs a warning.
//   4. `PolicyChanged` and `DecreeIssued` carry `tick` = the tick in which
//      they were applied.
//
// Plus the edge cases called out in the brief.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { createFixtureEngine } from '@test-utils'
import type { Decision, Engine, EngineEvent } from '@engine/types'
import { TAX_INCOME_RANGE } from '@engine/tunables'

function collectEvents(engine: Engine): EngineEvent[] {
  const events: EngineEvent[] = []
  engine.subscribe((e) => events.push(e))
  return events
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('T-007 stage 0 — apply queued decisions', () => {
  it('Queueing a single slider change applies it at the next stage 0, exactly once', () => {
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    // Aurelia starts with tax_income = 25 (see fixture).
    engine.applyDecisions([{ type: 'slider', slider_id: 'tax_income', value: 30 }])

    const snap = engine.tick()

    // Slider was overwritten in-place.
    expect(snap.country.sliders.tax_income).toBe(30)
    // Queue is empty after draining.
    expect(snap.decision_queue).toEqual([])
    // Exactly one PolicyChanged event with old=25, new=30.
    const policyEvents = events.filter((e) => e.type === 'PolicyChanged')
    expect(policyEvents).toHaveLength(1)
    expect(policyEvents[0]).toMatchObject({
      type: 'PolicyChanged',
      slider_id: 'tax_income',
      old_value: 25,
      new_value: 30,
    })

    // A subsequent tick with no new decisions emits no further PolicyChanged.
    engine.tick()
    expect(events.filter((e) => e.type === 'PolicyChanged')).toHaveLength(1)
  })

  it('Queueing two changes to the same slider in the same pause window results in only the final value applied; one PolicyChanged emitted with old_value = pre-pause value, new_value = final', () => {
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    // Two changes to the same slider during the same pause window.
    const first: Decision = { type: 'slider', slider_id: 'tax_income', value: 28 }
    const second: Decision = { type: 'slider', slider_id: 'tax_income', value: 35 }
    engine.applyDecisions([first, second])

    const snap = engine.tick()

    // Only the final value persists.
    expect(snap.country.sliders.tax_income).toBe(35)
    expect(snap.decision_queue).toEqual([])

    // Exactly one collapsed PolicyChanged event.
    const policyEvents = events.filter((e) => e.type === 'PolicyChanged')
    expect(policyEvents).toHaveLength(1)
    expect(policyEvents[0]).toMatchObject({
      type: 'PolicyChanged',
      slider_id: 'tax_income',
      old_value: 25, // pre-pause Aurelia baseline
      new_value: 35, // final clamped value, not the intermediate 28
    })
  })

  it('A slider value pushed beyond TAX_INCOME_RANGE clamps to the range; engine logs a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const [min, max] = TAX_INCOME_RANGE

    // (a) Above the max → clamps to max.
    const engineHigh = createFixtureEngine()
    const eventsHigh = collectEvents(engineHigh)
    engineHigh.applyDecisions([
      { type: 'slider', slider_id: 'tax_income', value: max + 25 },
    ])
    const snapHigh = engineHigh.tick()
    expect(snapHigh.country.sliders.tax_income).toBe(max)
    const policyHigh = eventsHigh.filter((e) => e.type === 'PolicyChanged')
    expect(policyHigh).toHaveLength(1)
    expect(policyHigh[0]).toMatchObject({ new_value: max })

    // (b) Below the min → clamps to min.
    const engineLow = createFixtureEngine()
    engineLow.applyDecisions([{ type: 'slider', slider_id: 'tax_income', value: min - 10 }])
    const snapLow = engineLow.tick()
    expect(snapLow.country.sliders.tax_income).toBe(min)

    // (c) Warning was logged — at least once, for at least the high case.
    expect(warnSpy).toHaveBeenCalled()
    const warnText = warnSpy.mock.calls.map((args) => String(args[0])).join('\n')
    expect(warnText).toMatch(/tax_income/)
    expect(warnText).toMatch(/clamp/i)

    // (d) Clamping must not throw — already proven by reaching this point.
  })

  it('PolicyChanged and DecreeIssued carry tick = the tick in which they were applied', () => {
    // The drain happens at stage 0 of the tick being processed; `state.tick`
    // is pre-increment, so a queue applied to tick N emits with `tick: N`.
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    // Tick 0 → 1: emitted events should carry tick=0.
    engine.applyDecisions([
      { type: 'slider', slider_id: 'tax_income', value: 28 },
      { type: 'decree', decree_id: 'public_address' },
    ])
    const afterTick1 = engine.tick()
    expect(afterTick1.tick).toBe(1)

    const tick0Events = events.slice()
    const policy0 = tick0Events.find((e) => e.type === 'PolicyChanged')
    const decree0 = tick0Events.find((e) => e.type === 'DecreeIssued')
    expect(policy0).toBeDefined()
    expect(decree0).toBeDefined()
    expect(policy0!.tick).toBe(0)
    expect(decree0!.tick).toBe(0)

    // Queue another batch — applied at tick 1 → 2: events carry tick=1.
    engine.applyDecisions([
      { type: 'slider', slider_id: 'tax_corporate', value: 32 },
      { type: 'decree', decree_id: 'emergency_relief', target_pop: 'rural_workers' },
    ])
    const afterTick2 = engine.tick()
    expect(afterTick2.tick).toBe(2)

    const newEvents = events.slice(tick0Events.length)
    const policy1 = newEvents.find((e) => e.type === 'PolicyChanged')
    const decree1 = newEvents.find((e) => e.type === 'DecreeIssued')
    expect(policy1).toBeDefined()
    expect(decree1).toBeDefined()
    expect(policy1!.tick).toBe(1)
    expect(decree1!.tick).toBe(1)
  })

  // --- Edge cases from the brief --------------------------------------------

  it('Multiple slider changes to the same slider during pause → only final value, one collapsed event', () => {
    // Reinforces AC #2 with three same-slider decisions split across two
    // applyDecisions calls — proves FIFO visibility across calls *and*
    // single-event collapsing in the same assertion.
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    engine.applyDecisions([{ type: 'slider', slider_id: 'tax_income', value: 28 }])
    engine.applyDecisions([
      { type: 'slider', slider_id: 'tax_income', value: 32 },
      { type: 'slider', slider_id: 'tax_income', value: 40 },
    ])

    const snap = engine.tick()
    expect(snap.country.sliders.tax_income).toBe(40)
    const policy = events.filter((e) => e.type === 'PolicyChanged')
    expect(policy).toHaveLength(1)
    expect(policy[0]).toMatchObject({ old_value: 25, new_value: 40 })
  })

  it('Slider clamping beyond range → log + clamp, no throw', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const engine = createFixtureEngine()

    expect(() => {
      engine.applyDecisions([
        { type: 'slider', slider_id: 'tax_income', value: 999 },
      ])
      engine.tick()
    }).not.toThrow()

    expect(warnSpy).toHaveBeenCalled()
  })

  it('Decree emission carries tick = state.tick of the tick being processed (pre-increment)', () => {
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    // Advance a few ticks first so we are not asserting on tick 0.
    engine.tick() // tick 0 → 1
    engine.tick() // tick 1 → 2

    engine.applyDecisions([
      { type: 'decree', decree_id: 'industrial_subsidy' },
    ])
    const snap = engine.tick() // tick 2 → 3
    expect(snap.tick).toBe(3)

    const decree = events.filter((e) => e.type === 'DecreeIssued')
    expect(decree).toHaveLength(1)
    expect(decree[0]).toMatchObject({
      type: 'DecreeIssued',
      decree_id: 'industrial_subsidy',
      cost: 0, // T-018 placeholder
      effect: null, // T-018 placeholder
      tick: 2, // pre-increment value of the tick being processed
    })
  })

  // --- Additional coverage on the slider-to-field mapping -------------------

  it('Budget slider decisions write to country.budget_shares (not country.sliders) and clamp to [0,1]', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    engine.applyDecisions([
      { type: 'slider', slider_id: 'budget_health', value: 0.3 },
      { type: 'slider', slider_id: 'budget_education', value: 1.5 }, // > 1 → clamps to 1
    ])
    const snap = engine.tick()

    expect(snap.country.budget_shares.health).toBe(0.3)
    expect(snap.country.budget_shares.education).toBe(1)
    expect(warnSpy).toHaveBeenCalled()

    // Two PolicyChanged events, one per touched slider.
    const policy = events.filter((e) => e.type === 'PolicyChanged')
    expect(policy.map((e) => e.slider_id).sort()).toEqual([
      'budget_education',
      'budget_health',
    ])
  })

  it('Decree decisions emit one DecreeIssued each and do not mutate sliders or budget_shares', () => {
    const before = createAureliaState()
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    engine.applyDecisions([
      { type: 'decree', decree_id: 'public_address' },
      { type: 'decree', decree_id: 'emergency_relief', target_pop: 'urban_workers' },
      { type: 'decree', decree_id: 'industrial_subsidy' },
    ])
    const snap = engine.tick()

    // Sliders + budget_shares untouched.
    expect(snap.country.sliders).toEqual(before.country.sliders)
    expect(snap.country.budget_shares).toEqual(before.country.budget_shares)

    // Three DecreeIssued events, in queued order.
    const decrees = events.filter((e) => e.type === 'DecreeIssued')
    expect(decrees).toHaveLength(3)
    expect(decrees.map((e) => e.decree_id)).toEqual([
      'public_address',
      'emergency_relief',
      'industrial_subsidy',
    ])
    // Each carries the T-018 placeholders.
    for (const e of decrees) {
      expect(e.cost).toBe(0)
      expect(e.effect).toBeNull()
      expect(e.tick).toBe(0)
    }
    // target_pop only set on the decree that supplied it.
    const relief = decrees.find((e) => e.decree_id === 'emergency_relief')!
    expect(relief.target_pop).toBe('urban_workers')
    const address = decrees.find((e) => e.decree_id === 'public_address')!
    expect(address.target_pop).toBeUndefined()
  })

  it('Empty decision_queue is a no-op: no events, no state mutation', () => {
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    const before = createAureliaState()
    const snap = engine.tick()

    expect(snap.decision_queue).toEqual([])
    expect(snap.country.sliders).toEqual(before.country.sliders)
    expect(snap.country.budget_shares).toEqual(before.country.budget_shares)
    // No PolicyChanged / DecreeIssued from an empty stage 0.
    expect(events.filter((e) => e.type === 'PolicyChanged')).toEqual([])
    expect(events.filter((e) => e.type === 'DecreeIssued')).toEqual([])
  })

  it('Setting a slider to its current value emits no PolicyChanged (no-op write is silent)', () => {
    // Aurelia starts with tax_income = 25. Re-applying 25 should be a no-op.
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    engine.applyDecisions([{ type: 'slider', slider_id: 'tax_income', value: 25 }])
    const snap = engine.tick()

    expect(snap.country.sliders.tax_income).toBe(25)
    expect(events.filter((e) => e.type === 'PolicyChanged')).toEqual([])
  })
})
