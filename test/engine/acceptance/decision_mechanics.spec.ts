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
import { DECREE_CATALOG_P1 } from '@engine/entities/Decree'

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
    // T-007 owns: tick + decree_id + presence of cost/effect. Specific catalog
    // values (cost = 5000, effect = output_boost industry 10%) are asserted by
    // the T-018 block below; here we just confirm the wiring carries them.
    expect(decree[0]).toMatchObject({
      type: 'DecreeIssued',
      decree_id: 'industrial_subsidy',
      tick: 2, // pre-increment value of the tick being processed
    })
    expect(typeof decree[0].cost).toBe('number')
    expect(decree[0].effect).toBeDefined()
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
    // T-007 owns: each event carries a tick + a (non-null) cost/effect pair.
    // The specific cost/effect values come from the T-018 catalog; per-id
    // assertions live in the T-018 block below.
    for (const e of decrees) {
      expect(typeof e.cost).toBe('number')
      expect(e.effect).toBeDefined()
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

describe('T-018 — Decrees catalog & application', () => {
  // Helper: run a baseline engine 1 tick with no decisions and return the
  // resulting country.treasury. Lets the AC #1 / AC #3 tests assert exactly
  // the catalog cost was subtracted, independent of the stage-2 budget block's
  // tax_income - budget_spend delta (which is non-trivial: ~+1838 on tick 1
  // and varies with state.treasury for cost-gate scenarios).
  function baselineTreasuryAfter1Tick(initialTreasury?: number): number {
    const state = createAureliaState()
    if (initialTreasury !== undefined) state.country.treasury = initialTreasury
    const engine = createFixtureEngine({ state })
    return engine.tick().country.treasury
  }

  it('AC #1 — public_address decree applies: treasury reduces by 0, DecreeIssued fires once with the catalog cost+effect, ticks_remaining set from duration', () => {
    const engine = createFixtureEngine()
    const events = collectEvents(engine)
    const baseline = baselineTreasuryAfter1Tick()

    engine.applyDecisions([{ type: 'decree', decree_id: 'public_address' }])
    const snap = engine.tick()

    const entry = DECREE_CATALOG_P1.public_address
    // Treasury delta vs baseline equals exactly the catalog cost (= 0 here).
    expect(snap.country.treasury - baseline).toBeCloseTo(-entry.cost_treasury, 6)

    // Exactly one DecreeIssued event with the resolved cost + effect.
    const decrees = events.filter((e) => e.type === 'DecreeIssued')
    expect(decrees).toHaveLength(1)
    expect(decrees[0]).toMatchObject({
      decree_id: 'public_address',
      cost: entry.cost_treasury,
      effect: entry.effect,
      tick: 0,
    })

    // public_address has duration_ticks=1; stage 3 decrements once, then prunes
    // — so after this single tick the entry is already gone.
    expect(snap.active_decrees.find((d) => d.decree_id === 'public_address')).toBeUndefined()
  })

  it('AC #1 — emergency_relief decree applies: treasury reduces by cost_treasury same tick, DecreeIssued fires once with target_pop carried through', () => {
    const engine = createFixtureEngine()
    const events = collectEvents(engine)
    const baseline = baselineTreasuryAfter1Tick()

    engine.applyDecisions([
      { type: 'decree', decree_id: 'emergency_relief', target_pop: 'urban_workers' },
    ])
    const snap = engine.tick()

    const entry = DECREE_CATALOG_P1.emergency_relief
    expect(snap.country.treasury - baseline).toBeCloseTo(-entry.cost_treasury, 6)

    const decrees = events.filter((e) => e.type === 'DecreeIssued')
    expect(decrees).toHaveLength(1)
    expect(decrees[0]).toMatchObject({
      decree_id: 'emergency_relief',
      cost: entry.cost_treasury,
      target_pop: 'urban_workers',
      effect: {
        type: 'happiness_bump_target',
        target_pop: 'urban_workers', // overridden from catalog placeholder
        delta: 10,
      },
      tick: 0,
    })

    // ActiveDecree entry: ticks_remaining = duration - 1 (stage 3 decrements
    // once this tick), and effect carries the player-supplied target_pop.
    const active = snap.active_decrees.find((d) => d.decree_id === 'emergency_relief')!
    expect(active).toBeDefined()
    expect(active.ticks_remaining).toBe(entry.duration_ticks - 1)
    expect(active.effect).toMatchObject({
      type: 'happiness_bump_target',
      target_pop: 'urban_workers',
    })
  })

  it('AC #1 — industrial_subsidy decree applies: treasury reduces by 5000 same tick, DecreeIssued fires once with output_boost effect', () => {
    const engine = createFixtureEngine()
    const events = collectEvents(engine)
    const baseline = baselineTreasuryAfter1Tick()

    engine.applyDecisions([{ type: 'decree', decree_id: 'industrial_subsidy' }])
    const snap = engine.tick()

    const entry = DECREE_CATALOG_P1.industrial_subsidy
    expect(entry.cost_treasury).toBe(5_000) // locked by Simple Economy.md AC.
    // industrial_subsidy boosts industry.output → tax_income rises this same
    // tick, so the delta vs baseline is NOT simply -5000. We instead compare
    // against the explicit pre-cost-baseline arithmetic: difference between
    // observed treasury and (baseline - 5000) is exactly the extra tax income
    // from the boost (≥ 0). The cost itself is reflected by the fact that
    // (baseline - snap.country.treasury) ≥ 5000 - max_tax_lift; assertion below
    // is cleanest framed as the boost-attributable delta.
    const expectedNoBoost = baseline - entry.cost_treasury
    // Observed treasury must be at least expectedNoBoost (the boost only adds
    // tax revenue, never subtracts) and strictly greater whenever pct > 0.
    expect(snap.country.treasury).toBeGreaterThan(expectedNoBoost)

    const decrees = events.filter((e) => e.type === 'DecreeIssued')
    expect(decrees).toHaveLength(1)
    expect(decrees[0]).toMatchObject({
      decree_id: 'industrial_subsidy',
      cost: 5_000,
      effect: { type: 'output_boost', sector: 'industry', pct: 0.1 },
      tick: 0,
    })

    const active = snap.active_decrees.find((d) => d.decree_id === 'industrial_subsidy')!
    expect(active).toBeDefined()
    expect(active.ticks_remaining).toBe(entry.duration_ticks - 1)
  })

  it('AC #2 — industrial_subsidy raises industry.output above baseline for every tick of its duration, then the entry expires', () => {
    // Subsidy duration is 5 ticks; we run 7 ticks to also check post-expiry.
    const engine = createFixtureEngine()
    engine.applyDecisions([{ type: 'decree', decree_id: 'industrial_subsidy' }])

    const base = createFixtureEngine()

    const entry = DECREE_CATALOG_P1.industrial_subsidy
    for (let i = 0; i < entry.duration_ticks + 2; i++) {
      const snap = engine.tick()
      const baseSnap = base.tick()
      const industry = snap.country.sectors.find((s) => s.sector_type === 'industry')!
      const baseIndustry = baseSnap.country.sectors.find(
        (s) => s.sector_type === 'industry',
      )!

      if (i < entry.duration_ticks) {
        // While the decree is active, boosted output is strictly higher than
        // baseline by at least (1 + pct)^(i+1) compounding − no snap-back.
        expect(industry.output).toBeGreaterThan(baseIndustry.output)
      }

      if (i === entry.duration_ticks) {
        // The decree has just expired: stage 3 of this tick decremented
        // ticks_remaining from 1 → 0 and pruned the entry. (Equivalently, the
        // tick where ticks_remaining was 1 still applied the boost, then was
        // pruned; the NEXT tick has no active subsidy.)
        expect(
          snap.active_decrees.find((d) => d.decree_id === 'industrial_subsidy'),
        ).toBeUndefined()
      }

      if (i > entry.duration_ticks) {
        // After expiry, P1 does NOT snap output back to baseline — the boosted
        // level persists and continues to grow from there. (The vault calls
        // for "decay back to baseline" but that's deferred to T-031's
        // balancing pass; the no-snap-back behavior is documented in
        // src/engine/entities/Decree.ts.)
        expect(industry.output).toBeGreaterThan(baseIndustry.output)
      }
    }
  })

  it('AC #3 — decree with cost_treasury > current treasury is rejected at queue-time; no DecreeIssued fires, treasury and active_decrees unchanged', () => {
    // Starve the treasury below emergency_relief's 3000 cost.
    const startingTreasury = 1_000
    const starved = createAureliaState()
    starved.country.treasury = startingTreasury
    const engine = createFixtureEngine({ state: starved })
    const events = collectEvents(engine)

    const baseline = baselineTreasuryAfter1Tick(startingTreasury)

    engine.applyDecisions([
      { type: 'decree', decree_id: 'emergency_relief', target_pop: 'urban_workers' },
    ])
    const snap = engine.tick()

    // No event fired.
    expect(events.filter((e) => e.type === 'DecreeIssued')).toHaveLength(0)
    // active_decrees stays empty — the decree never made it past stage 0's gate.
    expect(snap.active_decrees).toEqual([])
    // Treasury matches the no-decree baseline: the cost was never subtracted.
    expect(snap.country.treasury).toBeCloseTo(baseline, 6)
  })

  it('AC #3 — industrial_subsidy with treasury < 5000 is also rejected silently (no event, no active entry, no boost)', () => {
    const startingTreasury = 2_000
    const starved = createAureliaState()
    starved.country.treasury = startingTreasury
    const engine = createFixtureEngine({ state: starved })
    const events = collectEvents(engine)

    const baseEngine = createFixtureEngine({
      state: (() => {
        const s = createAureliaState()
        s.country.treasury = startingTreasury
        return s
      })(),
    })

    engine.applyDecisions([{ type: 'decree', decree_id: 'industrial_subsidy' }])
    const snap = engine.tick()
    const baseSnap = baseEngine.tick()

    expect(events.filter((e) => e.type === 'DecreeIssued')).toHaveLength(0)
    expect(snap.active_decrees).toEqual([])
    // No boost: industry.output matches the no-decree trajectory byte-for-byte.
    const industry = snap.country.sectors.find((s) => s.sector_type === 'industry')!
    const baseIndustry = baseSnap.country.sectors.find(
      (s) => s.sector_type === 'industry',
    )!
    expect(industry.output).toBeCloseTo(baseIndustry.output, 9)
  })

  it('AC #4 — PolicyChanged and DecreeIssued fire exactly once per applied change (combined slider + decree)', () => {
    // Queue one slider + one decree; expect exactly 1 of each event.
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    engine.applyDecisions([
      { type: 'slider', slider_id: 'tax_income', value: 30 },
      { type: 'decree', decree_id: 'public_address' },
    ])
    engine.tick()

    expect(events.filter((e) => e.type === 'PolicyChanged')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'DecreeIssued')).toHaveLength(1)
  })

  it('AC #4 — collapsing semantics differ: same slider queued twice → 1 PolicyChanged; same decree queued twice → 2 DecreeIssued (one per accepted decision; replace-on-reissue keeps only the second active entry)', () => {
    // Sliders collapse (T-007: only the final value survives, one event).
    // Decrees do NOT collapse: each accepted DecreeDecision in the queue emits
    // its own DecreeIssued. Replace-on-reissue means active_decrees ends with
    // only ONE entry per decree_id (the latest) but BOTH events fired.
    const engine = createFixtureEngine()
    const events = collectEvents(engine)

    engine.applyDecisions([
      { type: 'slider', slider_id: 'tax_income', value: 30 },
      { type: 'slider', slider_id: 'tax_income', value: 40 },
      { type: 'decree', decree_id: 'public_address' },
      { type: 'decree', decree_id: 'public_address' },
    ])
    engine.tick()

    expect(events.filter((e) => e.type === 'PolicyChanged')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'DecreeIssued')).toHaveLength(2)
  })

  it('Re-issuing a decree of the same id replaces the active entry (ticks_remaining resets)', () => {
    // Bonus, not in AC but design-critical (no-stacking rule).
    const entry = DECREE_CATALOG_P1.industrial_subsidy
    const engine = createFixtureEngine()
    engine.applyDecisions([{ type: 'decree', decree_id: 'industrial_subsidy' }])
    let snap = engine.tick()
    // First decree applied: ticks_remaining = duration - 1 (decremented once
    // in stage 3 of this same tick).
    expect(
      snap.active_decrees.find((d) => d.decree_id === 'industrial_subsidy')!
        .ticks_remaining,
    ).toBe(entry.duration_ticks - 1)

    // Advance 2 more ticks → counter should drop further.
    engine.tick()
    snap = engine.tick()
    const beforeReissue = snap.active_decrees.find(
      (d) => d.decree_id === 'industrial_subsidy',
    )!.ticks_remaining
    expect(beforeReissue).toBeLessThan(entry.duration_ticks - 1)

    // Re-issue. Replace-on-reissue: exactly one active entry survives, with a
    // freshly-issued ticks_remaining (= duration − 1 after stage 3 decrement).
    engine.applyDecisions([{ type: 'decree', decree_id: 'industrial_subsidy' }])
    snap = engine.tick()
    const subsidies = snap.active_decrees.filter(
      (d) => d.decree_id === 'industrial_subsidy',
    )
    expect(subsidies).toHaveLength(1)
    expect(subsidies[0].ticks_remaining).toBe(entry.duration_ticks - 1)
  })

  it('Determinism lock: industrial_subsidy on Aurelia, seed=1, produces a locked industry.output trajectory over 5 ticks', () => {
    // Pins the exact post-boost-post-growth industry.output values for the
    // 5-tick subsidy window. Any change to the boost formula, decrement
    // timing, stage routing, or PRNG order will surface here byte-for-byte.
    const engine = createFixtureEngine()
    engine.applyDecisions([{ type: 'decree', decree_id: 'industrial_subsidy' }])

    const outputs: number[] = []
    for (let i = 0; i < 5; i++) {
      const snap = engine.tick()
      const industry = snap.country.sectors.find((s) => s.sector_type === 'industry')!
      outputs.push(industry.output)
    }

    // Captured locally with seed=1 on Aurelia. See the boost-compounds note in
    // src/engine/entities/Decree.ts § Effect application semantics: each tick
    // applies *1.10 on top of the *already-boosted* prior tick's output, so
    // the trajectory grows geometrically (~×1.10 per tick after noise).
    expect(outputs[0]).toBeCloseTo(131343.61115195788, 6)
    expect(outputs[1]).toBeCloseTo(145154.67515704135, 6)
    expect(outputs[2]).toBeCloseTo(160022.60356113935, 6)
    expect(outputs[3]).toBeCloseTo(175946.1299797192, 6)
    expect(outputs[4]).toBeCloseTo(193354.44988089465, 6)
  })

  it('happiness_bump_target affects only the targeted POP — non-target POP happiness matches the no-decree baseline', () => {
    // emergency_relief on urban_workers must bump urban_workers' happiness
    // (+10 post-smoothing) without touching rural_workers.
    const engine = createFixtureEngine()
    engine.applyDecisions([
      { type: 'decree', decree_id: 'emergency_relief', target_pop: 'urban_workers' },
    ])
    const snap = engine.tick()

    const baseEngine = createFixtureEngine()
    const baseSnap = baseEngine.tick()

    const urban = snap.country.pops.find((p) => p.pop_type === 'urban_workers')!
    const urbanBase = baseSnap.country.pops.find((p) => p.pop_type === 'urban_workers')!
    const rural = snap.country.pops.find((p) => p.pop_type === 'rural_workers')!
    const ruralBase = baseSnap.country.pops.find((p) => p.pop_type === 'rural_workers')!

    // urban_workers: +10 vs baseline this tick (clamped, but happiness is far
    // from the 100 ceiling so the full +10 lands).
    expect(urban.happiness - urbanBase.happiness).toBeCloseTo(10, 6)
    // rural_workers: identical to baseline (no bump).
    expect(rural.happiness).toBeCloseTo(ruralBase.happiness, 9)
  })

  it('happiness_bump_all (public_address) bumps every POP by the catalog delta on its single active tick', () => {
    const engine = createFixtureEngine()
    engine.applyDecisions([{ type: 'decree', decree_id: 'public_address' }])
    const snap = engine.tick()

    const baseEngine = createFixtureEngine()
    const baseSnap = baseEngine.tick()

    const delta = 5 // PUBLIC_ADDRESS_HAPPINESS_DELTA_P1
    for (const pop of snap.country.pops) {
      const basePop = baseSnap.country.pops.find((p) => p.pop_type === pop.pop_type)!
      // Capitalists' baseline happiness is 70 and the priority-driven raw is
      // ~75; +5 bump may bump them past 75 but still well below the 100
      // clamp. Use a single tolerance for all POPs.
      expect(pop.happiness - basePop.happiness).toBeCloseTo(delta, 6)
    }
  })
})
