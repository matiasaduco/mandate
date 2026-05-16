// Stage 0 — Apply queued decisions.
//
// Drains `state.decision_queue` and applies each decision to the country.
//   - Slider decisions: clamp the value to its tunable range, overwrite the
//     canonical slider value on `country.sliders.*` or `country.budget_shares.*`,
//     and emit a `PolicyChanged` event. If multiple decisions in the queue
//     target the same slider, only the final clamped value persists and a
//     single `PolicyChanged` is emitted with `old_value` = the pre-stage value
//     and `new_value` = the final clamped value.
//   - Decree decisions (T-018): look up the catalog entry, check the cost
//     gate (`cost_treasury <= treasury`), silently reject if it fails (no
//     event), otherwise subtract the cost from treasury, push the resolved
//     `ActiveDecree` onto `state.active_decrees` (replace-on-reissue: any
//     existing entry with the same `decree_id` is dropped first), and emit
//     `DecreeIssued` with the real cost + effect. Effect application happens
//     at stage 2 (output_boost) and stage 3 (happiness_bump_*); stage 3 also
//     decrements `ticks_remaining` and prunes expired entries.
//
// Out-of-range slider values clamp silently to the range bounds with a
// `console.warn` (no throw) — engine-internal hygiene per
// [[Decision Mechanics]] § Edge Cases.
//
// Invariant #3 (CLAUDE.md): `applyDecisions` only pushes to the queue; the
// queue is drained here, at stage 0 of the *next* tick — never same-tick.
// The emitted `tick` is `state.tick` (pre-increment in `createEngine.tick()`).

import type { Country, BudgetShares, SlidersState } from '../entities/Country'
import type { SliderDecision, DecreeDecision, SliderId } from '../entities/Decision'
import type { ActiveDecree, DecreeEffect } from '../entities/Decree'
import { DECREE_CATALOG_P1 } from '../entities/Decree'
import type { EngineState } from '../types'
import type { EngineContext } from './context'
import {
  TAX_INCOME_RANGE,
  TAX_CORPORATE_RANGE,
  TAX_CONSUMPTION_RANGE,
} from '../tunables'

// Slider domain bounds. Budget shares clamp to [0, 1] (mathematical domain of
// a share — not a design constant, so no Tunable). Tax sliders use their
// vault-defined ranges.
const TAX_RANGES = {
  tax_income: TAX_INCOME_RANGE,
  tax_corporate: TAX_CORPORATE_RANGE,
  tax_consumption: TAX_CONSUMPTION_RANGE,
} as const

const BUDGET_SHARE_RANGE = [0, 1] as const

type TaxSliderId = keyof typeof TAX_RANGES

function isTaxSlider(id: SliderId): id is TaxSliderId {
  return id === 'tax_income' || id === 'tax_corporate' || id === 'tax_consumption'
}

function clamp(value: number, range: readonly [number, number]): number {
  const [min, max] = range
  if (value < min) return min
  if (value > max) return max
  return value
}

function readSlider(country: Country, id: SliderId): number {
  if (isTaxSlider(id)) {
    return country.sliders[id]
  }
  // Budget slider: strip the `budget_` prefix to index BudgetShares.
  const key = id.slice('budget_'.length) as keyof BudgetShares
  return country.budget_shares[key]
}

function writeSlider(country: Country, id: SliderId, value: number): Country {
  if (isTaxSlider(id)) {
    const sliders: SlidersState = { ...country.sliders, [id]: value }
    return { ...country, sliders }
  }
  const key = id.slice('budget_'.length) as keyof BudgetShares
  const budget_shares: BudgetShares = { ...country.budget_shares, [key]: value }
  return { ...country, budget_shares }
}

function rangeFor(id: SliderId): readonly [number, number] {
  if (isTaxSlider(id)) return TAX_RANGES[id]
  return BUDGET_SHARE_RANGE
}

function rangeNameFor(id: SliderId): string {
  switch (id) {
    case 'tax_income':
      return 'TAX_INCOME_RANGE'
    case 'tax_corporate':
      return 'TAX_CORPORATE_RANGE'
    case 'tax_consumption':
      return 'TAX_CONSUMPTION_RANGE'
    default:
      return 'BUDGET_SHARE_RANGE'
  }
}

export function stage0_decisions(state: EngineState, ctx: EngineContext): EngineState {
  const queue = state.decision_queue
  if (queue.length === 0) {
    return state
  }

  // Partition decisions by kind, preserving FIFO order within each kind.
  const sliderDecisions: SliderDecision[] = []
  const decreeDecisions: DecreeDecision[] = []
  for (const decision of queue) {
    if (decision.type === 'slider') sliderDecisions.push(decision)
    else decreeDecisions.push(decision)
  }

  // Capture pre-stage slider values so collapsed `PolicyChanged` events report
  // `old_value` = the value at the start of this stage (i.e., the value before
  // any decision in the queue touched it).
  const preStageValues = new Map<SliderId, number>()

  // Track the final clamped value to write per slider, in FIFO order of first
  // appearance (so emitted events follow the order of the first decision per
  // slider — stable and intuitive).
  const finalBySlider = new Map<SliderId, number>()
  const firstSeenOrder: SliderId[] = []

  let nextCountry: Country = state.country

  for (const decision of sliderDecisions) {
    const id = decision.slider_id
    if (!preStageValues.has(id)) {
      preStageValues.set(id, readSlider(state.country, id))
      firstSeenOrder.push(id)
    }
    const range = rangeFor(id)
    const requested = decision.value
    const clamped = clamp(requested, range)
    if (clamped !== requested) {
      // Out-of-range: clamp silently with a warning, never throw.
      console.warn(
        `[stage0] Slider "${id}" value ${requested} out of ${rangeNameFor(id)} ` +
          `[${range[0]}, ${range[1]}]; clamped to ${clamped}.`,
      )
    }
    finalBySlider.set(id, clamped)
    nextCountry = writeSlider(nextCountry, id, clamped)
  }

  // Emit one collapsed `PolicyChanged` per touched slider. Skip emission when
  // the final value equals the pre-stage value (no observable change).
  for (const id of firstSeenOrder) {
    const oldValue = preStageValues.get(id)!
    const newValue = finalBySlider.get(id)!
    if (oldValue === newValue) continue
    ctx.emit({
      type: 'PolicyChanged',
      slider_id: id,
      old_value: oldValue,
      new_value: newValue,
      tick: state.tick,
    })
  }

  // Decrees (T-018): cost gate → treasury subtract → replace-on-reissue push
  // to active_decrees → emit DecreeIssued with the resolved cost + effect.
  // Silent reject when the cost gate fails — no event, no warn (the UI
  // pre-gates the decree button per Decision Mechanics AC; this is the
  // engine's defensive backstop).
  let activeDecrees: ActiveDecree[] = state.active_decrees
  for (const decision of decreeDecisions) {
    const entry = DECREE_CATALOG_P1[decision.decree_id]

    // Cost gate: silent reject. Compare against the *running* treasury so a
    // prior decree in the same drain that already spent the treasury doesn't
    // get bypassed by a later one in the same queue.
    if (entry.cost_treasury > nextCountry.treasury) {
      continue
    }

    // Subtract the cost immediately.
    nextCountry = {
      ...nextCountry,
      treasury: nextCountry.treasury - entry.cost_treasury,
    }

    // Resolve the effect: for happiness_bump_target, override the catalog's
    // placeholder `target_pop` with the player-supplied value when present.
    const effect: DecreeEffect =
      entry.effect.type === 'happiness_bump_target' && decision.target_pop !== undefined
        ? { ...entry.effect, target_pop: decision.target_pop }
        : entry.effect

    // Replace-on-reissue: drop any prior active entry with the same id, then
    // append the new one with a fresh ticks_remaining.
    const filtered = activeDecrees.filter((d) => d.decree_id !== decision.decree_id)
    const fresh: ActiveDecree = {
      decree_id: decision.decree_id,
      ticks_remaining: entry.duration_ticks,
      effect,
    }
    activeDecrees = [...filtered, fresh]

    ctx.emit({
      type: 'DecreeIssued',
      decree_id: decision.decree_id,
      ...(decision.target_pop !== undefined ? { target_pop: decision.target_pop } : {}),
      cost: entry.cost_treasury,
      effect,
      tick: state.tick,
    })
  }

  return {
    ...state,
    country: nextCountry,
    decision_queue: [],
    active_decrees: activeDecrees,
  }
}

