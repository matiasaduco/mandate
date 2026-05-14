// Republic of Aurelia — canonical Phase 1 starting state.
// All values mirror ~/Documents/Tycoon/07 - Examples/Sample Country - Aurelia.md.
// If the vault changes, update this file (and adjust dependent tests) — never
// invent fixture data here.

import type { EngineState } from '../types'
import type { Country } from '../entities/Country'
import type { POP } from '../entities/POP'
import type { Sector } from '../entities/Sector'

// Currency unit: abstract "credits". All monetary values in millions of credits.

const aureliaSectors: Sector[] = [
  { sector_type: 'agriculture', output: 48_000, employment_share: 0.18, pollution_coefficient: 0.02 },
  { sector_type: 'industry', output: 120_000, employment_share: 0.25, pollution_coefficient: 0.1 },
  { sector_type: 'services', output: 232_000, employment_share: 0.57, pollution_coefficient: 0.01 },
]

const aureliaPops: POP[] = [
  {
    pop_type: 'urban_workers',
    size: 12_000_000,
    avg_age: 38,
    education_level: 50,
    income: 11_000,
    income_clamped: false,
    employment_rate: 0.92,
    happiness: 55,
    radicalization: 12,
    institutional_trust: 55,
    ideology: -0.2,
    religion: '',
    priorities: ['jobs', 'healthcare', 'low_consumption_tax'],
  },
  {
    pop_type: 'rural_workers',
    size: 6_000_000,
    avg_age: 45,
    education_level: 40,
    income: 7_000,
    income_clamped: false,
    employment_rate: 0.88,
    happiness: 50,
    radicalization: 18,
    institutional_trust: 45,
    ideology: 0.3,
    religion: '',
    priorities: ['agriculture_support', 'security', 'food_prices'],
  },
  {
    pop_type: 'middle_class',
    size: 8_000_000,
    avg_age: 42,
    education_level: 70,
    income: 25_000,
    income_clamped: false,
    employment_rate: 0.95,
    happiness: 60,
    radicalization: 8,
    institutional_trust: 65,
    ideology: 0,
    religion: '',
    priorities: ['education', 'low_income_tax', 'services'],
  },
  {
    pop_type: 'capitalists',
    size: 600_000,
    avg_age: 50,
    education_level: 80,
    income: 200_000,
    income_clamped: false,
    employment_rate: 1.0,
    happiness: 70,
    radicalization: 5,
    institutional_trust: 70,
    ideology: 0.2,
    religion: '',
    priorities: ['low_corporate_tax', 'business_friendly', 'stability'],
  },
  {
    pop_type: 'intelligentsia',
    size: 3_400_000,
    avg_age: 35,
    education_level: 85,
    income: 30_000,
    income_clamped: false,
    employment_rate: 0.93,
    happiness: 58,
    radicalization: 14,
    institutional_trust: 60,
    ideology: -0.5,
    religion: '',
    priorities: ['education', 'civil_liberties', 'environment'],
  },
]

const aureliaCountry: Country = {
  id: 'aurelia',
  name: 'Republic of Aurelia',
  analogue: 'argentina-like',
  area_km2: 350_000,
  terrain_profile: { coastline: 0.08, arable: 0.35, mountain: 0.18, forest: 0.22, desert: 0.17 },
  climate_zone: 'temperate',
  neighbors: [],
  government_type: 'democracy',
  head_of_state: { name: 'Elena Vorra', party: 'Center Coalition' },
  population: 30_000_000,
  gdp: 400_000,
  treasury: 50_000,
  approval: 56,
  legitimacy: 0,
  stability: 65,
  // P1: pinned to the steady-state tax_income flow (100k credits/tick).
  target_budget: 100_000,
  pops: aureliaPops,
  sectors: aureliaSectors,
  sliders: { tax_income: 25, tax_corporate: 30, tax_consumption: 15 },
  budget_shares: {
    health: 0.22,
    education: 0.2,
    infrastructure: 0.18,
    security: 0.15,
    welfare: 0.25,
  },
}

export function createAureliaState(): EngineState {
  return {
    tick: 0,
    game_speed: 0,
    game_over: false,
    game_over_reason: null,
    country: structuredClone(aureliaCountry),
    decision_queue: [],
    loss_counters: {
      bankruptcy_negative_balance_ticks: 0,
      approval_below_crisis_ticks: 0,
    },
    rng_state: 0,
    flows: { tax_income: 100_000, budget_spend: 100_000, balance: 0 },
    approval_prev: 56,
  }
}
