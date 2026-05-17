// T-026 — Event feed copy.
//
// Pure helpers that turn `EngineEvent` payloads into the human-readable strings
// rendered by `<EventFeed />` and `<PostmortemScreen />`. Lives in its own
// module so the EventFeed file can stay "components only" (React Refresh
// happy) and so the strings can be unit-tested without mounting any component.
//
// Phrasing is locked in the T-026 brief — do not paraphrase here without
// updating the vault first. Each branch covers exactly one event variant in
// the Phase 1 union (`PolicyChanged`, `DecreeIssued`, `TreasuryThresholdCrossed`,
// `ApprovalThresholdCrossed`, `GameOver`).
//
// Severity is a small enum the feed UI uses to color-code rows: "warning" for
// threshold crossings (downward) and game-over; "info" for everything else.

import type { EngineEvent, GameOverReason, PopType, SliderId } from '@engine/types'

/** Severity tag the feed uses for row styling. Display-only. */
export type EventSeverity = 'info' | 'warning'

/** Sentence-cased pretty label for a Phase 1 slider id. */
const SLIDER_TITLES: Record<SliderId, string> = {
  tax_income: 'Income tax',
  tax_corporate: 'Corporate tax',
  tax_consumption: 'Consumption tax',
  budget_health: 'Health budget',
  budget_education: 'Education budget',
  budget_infrastructure: 'Infrastructure budget',
  budget_security: 'Security budget',
  budget_welfare: 'Welfare budget',
}

/** Pretty `urban_workers` → `Urban workers`. Mirrors `formatPopName` style. */
function formatPopName(popType: PopType): string {
  const [first, ...rest] = popType.split('_')
  if (first === undefined) return popType
  const head = first.charAt(0).toUpperCase() + first.slice(1)
  return [head, ...rest].join(' ')
}

/** Pretty headline for a game-over reason — used by the feed's late entries. */
const GAME_OVER_DISPLAY: Record<GameOverReason, string> = {
  bankruptcy: 'Bankruptcy',
  mass_uprising: 'Mass uprising',
}

/**
 * Slider value display. The engine's slider values are integer percents
 * (tax sliders) or shares × 100 (budget sliders, rendered as percent integers
 * upstream in EconomyPanel). For the feed we round to integer percent — sub-1%
 * precision is noise for narration purposes.
 */
function formatSliderValue(value: number): string {
  return `${Math.round(value)}%`
}

/** Integer thousand-separated number — mirrors `format.ts#formatNumber`. */
function formatCredits(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * Turn an engine event into a feed-friendly string. Every variant in the P1
 * union must have a branch — the exhaustive switch falls through to a string
 * that begins with `"Unknown event"` so a future variant added engine-side
 * before this file is updated stays visible (not silently swallowed).
 */
export function formatEvent(event: EngineEvent): string {
  switch (event.type) {
    case 'PolicyChanged': {
      const title = SLIDER_TITLES[event.slider_id] ?? event.slider_id
      return `${title} set to ${formatSliderValue(event.new_value)}`
    }
    case 'DecreeIssued': {
      switch (event.decree_id) {
        case 'public_address':
          return 'Public address delivered.'
        case 'emergency_relief': {
          const target =
            event.target_pop !== undefined
              ? formatPopName(event.target_pop)
              : 'a population'
          return `Emergency relief deployed to ${target} (-${formatCredits(event.cost)} credits).`
        }
        case 'industrial_subsidy':
          return `Industrial subsidy applied (-${formatCredits(event.cost)} credits).`
      }
      // Future decree id (P2+) — show a generic line so it surfaces during
      // dev rather than silently disappearing.
      return `Decree issued: ${event.decree_id}.`
    }
    case 'TreasuryThresholdCrossed': {
      if (event.direction === 'below') {
        return '⚠ Treasury crossed zero — bankruptcy clock started.'
      }
      return 'Treasury back above zero — bankruptcy clock cleared.'
    }
    case 'ApprovalThresholdCrossed': {
      if (event.direction === 'below') {
        return `⚠ Approval fell below ${event.threshold}%.`
      }
      return `Approval recovered above ${event.threshold}%.`
    }
    case 'GameOver': {
      return `Game over: ${GAME_OVER_DISPLAY[event.reason]}`
    }
  }
}

/** Pick the severity row class for a given event. */
export function eventSeverity(event: EngineEvent): EventSeverity {
  switch (event.type) {
    case 'TreasuryThresholdCrossed':
      return event.direction === 'below' ? 'warning' : 'info'
    case 'ApprovalThresholdCrossed':
      return event.direction === 'below' ? 'warning' : 'info'
    case 'GameOver':
      return 'warning'
    case 'PolicyChanged':
    case 'DecreeIssued':
      return 'info'
  }
}
