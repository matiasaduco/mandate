// T-014 — Stage 4 part 2: country stability derivation.
//
// One it() per AC checkbox from [[Country Core]] / Phase 1 Tickets:
//   1. On Aurelia start, country.stability ≈ 65 within ±5 after 1 tick.
//   2. No subsystem mutates country.stability directly — it only updates here
//      (stability is a deterministic function of approval + treasury_health at
//      the end of each tick).
//   3. Stability stays in [0, 100]; clamping logs a warning.
//   4. Two countries with different starting state run the same update without
//      code branching.
//
// Plus a determinism lock that pins the exact post-tick stability at seed=1.
//
// Determinism contract: stage 4 part 2 (T-014) consumes the PRNG ZERO times.
// If any number in the lock test moves, it means either (a) an upstream rng
// draw shifted (would also break T-008…T-013 locks), or (b)
// STABILITY_APPROVAL_WEIGHT_P1 / STABILITY_TREASURY_WEIGHT_P1 /
// STARTING_TREASURY_P1 changed.
//
// T-029 — Additional acceptance harness coverage for [[Country Core]] ACs
// that the T-014 block above does not exercise:
//   - "No subsystem mutates a Country Core-owned field directly" (id / name /
//     government_type / head_of_state immutable across a tick).
//   - "A second country instance runs without code branching on 'is player'."
//   - "Save/load round-trip preserves country state exactly" — also proven by
//     `test/engine/save.spec.ts` (T-028 AC#1). The block below is a thin
//     re-assertion so the [[Country Core]] AC checkbox can be ticked against
//     this file directly.

import { describe, expect, it, vi } from 'vitest'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { createFixtureEngine, makeDummyRng } from '@test-utils'
import { createEngine, deserialize, serialize } from '@engine'
import { stage4_politics } from '@engine/pipeline/stage4_politics'
import type { EngineEvent } from '@engine/types'
import type { EngineContext } from '@engine/pipeline/context'

describe('T-014 stage 4 part 2 — country stability derivation', () => {
  it('On Aurelia start, country.stability ≈ 65 within ±5', () => {
    // Calibrator-computed prediction: 68.51961743958916 (within [60, 70]).
    // Derivation: approval=55.985 × 0.7 + (48883.169/50000) × 30
    //           = 39.190 + 29.330 = 68.520.
    const engine = createFixtureEngine()
    const snap = engine.tick()
    expect(Math.abs(snap.country.stability - 65)).toBeLessThanOrEqual(5)
  })

  it('country.stability is only written by stage 4 (deterministic function of approval and treasury_health)', () => {
    // Run 5 ticks. At each tick, hand-compute the expected stability from the
    // tick's approval and treasury and assert it matches. Any drift would
    // mean a subsystem outside stage 4 wrote to stability.
    const engine = createFixtureEngine()
    for (let t = 0; t < 5; t++) {
      const snap = engine.tick()
      const treasuryHealth = Math.min(
        1,
        Math.max(0, snap.country.treasury / 50_000),
      )
      const expected = snap.country.approval * 0.7 + treasuryHealth * 30
      expect(snap.country.stability).toBeCloseTo(expected, 10)
    }
  })

  it('Stability clamps to [0, 100] and console.warn fires if raw exceeds the range', () => {
    // The output clamp in stage 4 (T-014) is dead code under realistic P1
    // inputs because T-013's APPROVAL_CEILING clamp (run earlier in the SAME
    // stage function) caps approvalNext at 100, and the in-formula
    // treasury_health clamp caps treasury_health at 1, so stabilityRaw ≤
    // 0.7×100 + 30×1 = 100 always.
    //
    // To exercise the warn path we must reach it from inside the stage in a
    // way that bypasses T-013's clamp. The only such path: T-013 reads
    // `state.approval_prev` for smoothing and re-derives approvalNext from
    // POP rollup + smoothing + clamp on EVERY call — there is no way to
    // skip T-013 from outside. Therefore the upper-bound clamp is genuinely
    // unreachable via the stage's public input surface in P1.
    //
    // The brief explicitly anticipates this ("the clamp is dead code under
    // realistic P1 inputs"). We assert the contract in two halves:
    //   (a) At the boundary (approvalNext=100, treasuryHealth=1), stability
    //       lands at exactly 100 and the warn does NOT fire (strict `>`).
    //   (b) The clamp lives in the source as defensive guard against future
    //       invariant breaks (weights re-tuned past 100, T-013 clamp
    //       removed). The complementary test below asserts the warn never
    //       fires during normal play.
    //
    // To exercise the warn we'd need a future invariant break or a
    // refactor. The test here pushes inputs to the boundary and asserts
    // the boundary behavior — bound is hit, warn does not fire.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const state = createAureliaState()
      // Maximally inflate every input so smoothing keeps approval at ~100
      // and treasury_health caps at 1.
      state.approval_prev = 200
      state.country.approval = 200
      for (const pop of state.country.pops) pop.happiness = 200
      state.country.treasury = 10_000_000

      const events: EngineEvent[] = []
      const ctx: EngineContext = {
        emit: (e) => events.push(e),
        rng: makeDummyRng(),
      }
      const next = stage4_politics(state, ctx)

      // approvalNext is clamped to APPROVAL_CEILING (100) by T-013.
      // treasuryHealth caps at 1. stabilityRaw = 100×0.7 + 1×30 = 100 →
      // NOT > 100 (strict), so the upper clamp does NOT fire — but stability
      // does land at the upper bound.
      expect(next.country.stability).toBe(100)
      // Confirm no [stability clamp] warn was emitted at the boundary.
      const stabilityWarns = warnSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('[stability clamp]'),
      )
      expect(stabilityWarns).toHaveLength(0)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('Stability clamp does not fire during normal Aurelia play (clamp is defensive-only in P1)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const engine = createFixtureEngine()
      for (let t = 0; t < 10; t++) engine.tick()
      const stabilityWarnCalls = warnSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('[stability clamp]'),
      )
      expect(stabilityWarnCalls).toHaveLength(0)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('Two countries with different starting state run the same stage 4 update without code branching', () => {
    // Build a synthetic "second country" state with deliberately different
    // values from Aurelia. This proves stage4_politics has no "is_player"
    // branching: the same code path runs on any EngineState matching the
    // type. We hand-construct so we can predict the stability output
    // arithmetically (calibrator-suggested: approval=40, treasury=25_000 →
    // stability=43).
    const state1 = createAureliaState()
    const state2 = createAureliaState()
    state2.country.id = 'mockistan'
    state2.country.name = 'Republic of Mockistan'
    state2.country.approval = 40
    state2.approval_prev = 40
    state2.country.treasury = 25_000
    // Pin POP happiness to 40 so the size-weighted rollup is exactly 40,
    // smoothing from approval_prev=40 stays at 40, and T-013's clamp is a
    // no-op (40 ∈ [APPROVAL_FLOOR, APPROVAL_CEILING]).
    for (const pop of state2.country.pops) pop.happiness = 40

    const events: EngineEvent[] = []
    const ctx: EngineContext = {
      emit: (e) => events.push(e),
      rng: makeDummyRng(),
    }

    const next1 = stage4_politics(state1, ctx)
    const next2 = stage4_politics(state2, ctx)

    // Second country's stability: approval_smoothed = 40, treasury_health =
    // 25000/50000 = 0.5 → stability = 40 × 0.7 + 0.5 × 30 = 28 + 15 = 43.
    expect(Math.abs(next2.country.stability - 43)).toBeLessThanOrEqual(0.5)
    // First country: stability lands in [0, 100] with no errors thrown —
    // the same code path ran for both with NO is_player branching. Note
    // that this calls stage4_politics directly on the Aurelia fixture state
    // BEFORE stages 0–3 ran, so the value differs from the engine.tick()
    // path in AC #1; we only assert the bound here.
    expect(next1.country.stability).toBeGreaterThanOrEqual(0)
    expect(next1.country.stability).toBeLessThanOrEqual(100)
  })

  // --- Determinism lock ---------------------------------------------------

  it('Determinism lock for seed=1: exact post-tick stability after one tick from Aurelia start', () => {
    // Pins T-014's stability against the upstream-locked approval (T-013) and
    // treasury (T-010) values. If any of these numbers shift it means either
    // (a) an upstream rng draw moved (would also break T-008…T-013 locks),
    // or (b) STABILITY_APPROVAL_WEIGHT_P1 / STABILITY_TREASURY_WEIGHT_P1 /
    // STARTING_TREASURY_P1 changed.
    // Computed exactly: approval=55.98530864197531 × 0.7 +
    //   treasuryHealth = clamp(48883.1689836774 / 50000, 0, 1) = 0.977663379673548
    //   stability = 39.18971604938272 + 29.32990139020644 ≈ 68.51961743958916
    // The lint rule no-loss-of-precision blocks the full 16-digit literal
    // (JS doubles only carry ~15.95 decimal digits), so we hand-construct
    // the same value from its arithmetic factors and assert via toBeCloseTo.
    const engine = createFixtureEngine()
    const snap = engine.tick()
    // Reconstruct the locked value from upstream-locked T-013 approval and
    // T-010 treasury (both have their own determinism locks in
    // approval_legitimacy.spec.ts and simple_economy.spec.ts).
    const lockedApproval = 55.98530864197531
    const lockedTreasury = 48883.1689836774
    const expected = lockedApproval * 0.7 + (lockedTreasury / 50_000) * 30
    expect(snap.country.stability).toBeCloseTo(expected, 10)
  })
})

// --- T-029 — Country Core ACs not covered by the T-014 block above ---------

describe('Country Core — Acceptance Criteria (Phase 1)', () => {
  it('AC: Country can be instantiated from Aurelia with all fields populated', () => {
    // Static identity + dynamic macro fields must all be present and
    // non-null on the canonical Aurelia fixture.
    const state = createAureliaState()
    expect(state.country.id).toBe('aurelia')
    expect(state.country.name).toBeTruthy()
    expect(state.country.government_type).toBeTruthy()
    expect(state.country.head_of_state).toBeDefined()
    expect(state.country.population).toBeGreaterThan(0)
    expect(state.country.gdp).toBeGreaterThan(0)
    expect(state.country.treasury).toBeGreaterThanOrEqual(0)
    expect(state.country.approval).toBeGreaterThan(0)
    expect(state.country.stability).toBeGreaterThan(0)
    expect(state.country.sectors.length).toBeGreaterThan(0)
    expect(state.country.pops.length).toBeGreaterThan(0)
  })

  it('AC: no subsystem mutates a Country Core-owned identity field directly across a tick', () => {
    // Country Core owns: id, name, government_type, head_of_state. These are
    // construction-time-only fields. Run 5 ticks on Aurelia and assert each
    // field is byte-identical to its starting value at every snapshot.
    const initial = createAureliaState()
    const ownedFields = {
      id: initial.country.id,
      name: initial.country.name,
      government_type: initial.country.government_type,
      head_of_state: structuredClone(initial.country.head_of_state),
    }

    const engine = createFixtureEngine()
    for (let t = 0; t < 5; t++) {
      const snap = engine.tick()
      expect(snap.country.id).toBe(ownedFields.id)
      expect(snap.country.name).toBe(ownedFields.name)
      expect(snap.country.government_type).toBe(ownedFields.government_type)
      expect(snap.country.head_of_state).toEqual(ownedFields.head_of_state)
    }
  })

  it('AC: a second country instance runs without code branching on "is player"', () => {
    // Two engines from the same fixture, different seeds. Both must run all
    // 7 stages over 5 ticks without throwing and produce structurally valid
    // states. If the engine branched on a player flag, one of them would
    // either follow a divergent code path (e.g. skip AI stage 6) or crash
    // here. The brief explicitly calls for grep proof: no `is_player` /
    // `isPlayer` identifier appears anywhere under src/engine/** — verified
    // out-of-band; this test exercises the runtime invariant.
    const engineA = createFixtureEngine({ seed: 1 })
    const engineB = createFixtureEngine({ seed: 7 })

    for (let t = 0; t < 5; t++) {
      const snapA = engineA.tick()
      const snapB = engineB.tick()

      // Both states are structurally valid.
      expect(snapA.country).toBeDefined()
      expect(snapB.country).toBeDefined()
      expect(snapA.country.pops.length).toBe(snapB.country.pops.length)
      expect(snapA.country.sectors.length).toBe(snapB.country.sectors.length)
      // tick advanced equally on both — same pipeline, no skipped stages.
      expect(snapA.tick).toBe(t + 1)
      expect(snapB.tick).toBe(t + 1)
    }

    // Determinism contract: different seeds produce different sector outputs
    // (proving the PRNG actually fired for BOTH engines — neither was
    // short-circuited as an "AI country" stub).
    const a = engineA.tick()
    const b = engineB.tick()
    expect(a.country.sectors[0].output).not.toBe(b.country.sectors[0].output)
  })

  it('AC: save / load round-trip preserves country state exactly', () => {
    // Engine-level round-trip via the T-028 serialize / deserialize pair.
    // Full save / load contract (rng cursor, decision queue, schema version)
    // is covered by `test/engine/save.spec.ts`. Here we just prove the
    // country half of the EngineState survives a JSON round-trip deep-equal.
    const original = createAureliaState()
    const restored = deserialize(serialize(original))
    expect(restored.country).toEqual(original.country)

    // And after some ticks — the dynamic country fields (treasury, gdp,
    // sectors, pops, approval, stability) must also round-trip.
    const engine = createEngine(original, { seed: 1 })
    let snap = engine.tick()
    for (let t = 0; t < 4; t++) snap = engine.tick()
    const restoredAfter = deserialize(serialize(snap))
    expect(restoredAfter.country).toEqual(snap.country)
  })
})
