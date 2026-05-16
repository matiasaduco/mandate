// T-017 — Stage 6: AI policy stub.
//
// One it() per AC checkbox from Phase 1 Tickets:
//   1. Stage 6 is invoked between 5 and 7 every tick.
//   2. Stage 6 does not mutate state in Phase 1.
//
// Both ACs are already implicitly enforced by T-006's tick_runner.spec.ts
// (STAGES order + no-op invariant on the steady-state path). This file
// makes the assertions explicit and verbatim against the T-017 AC text so
// vault-syncer can tick the Loss Conditions/Tick Pipeline checkboxes
// cleanly and so a future change that turns stage 6 into a real producer
// breaks here loudly rather than in some downstream determinism lock.
//
// Phase 1 has no AI countries at runtime per the 2026-05-06 Decisions Log
// entry "Phase 1 scope locked". Phase 3+ will iterate AI countries here.

import { describe, expect, it } from 'vitest'
import { createAureliaState } from '@engine/fixtures/aurelia'
import { makeDummyRng } from '@test-utils'
import { stage6_ai } from '@engine/pipeline/stage6_ai'
import { STAGES } from '@engine/pipeline/run'
import { stage5_events } from '@engine/pipeline/stage5_events'
import { stage7_feedback } from '@engine/pipeline/stage7_feedback'
import type { EngineContext } from '@engine/pipeline/context'

describe('T-017 stage 6 — AI policy stub', () => {
  it('Stage 6 is invoked between stage 5 and stage 7 every tick', () => {
    // The canonical STAGES registry pins the order; T-006's tick_runner spec
    // already proves runTick calls them in this order. We re-assert the
    // structural neighbor relationship here so a future re-ordering surfaces
    // against the T-017 AC text directly.
    const idx5 = STAGES.indexOf(stage5_events)
    const idx6 = STAGES.indexOf(stage6_ai)
    const idx7 = STAGES.indexOf(stage7_feedback)
    expect(idx5).toBeGreaterThanOrEqual(0)
    expect(idx6).toBe(idx5 + 1)
    expect(idx7).toBe(idx6 + 1)
  })

  it('Stage 6 does not mutate state in Phase 1', () => {
    // Direct stage invocation: pass Aurelia state in, assert reference
    // equality on the returned state. The current stub returns `state` as-is
    // (identity-equal). If Phase 3+ promotes this to a real producer, this
    // assertion is the canary that flags the change.
    const state = createAureliaState()
    const ctx: EngineContext = { emit: () => {}, rng: makeDummyRng() }
    const next = stage6_ai(state, ctx)
    expect(next).toBe(state)
  })
})
