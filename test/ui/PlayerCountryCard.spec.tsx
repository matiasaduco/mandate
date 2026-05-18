// T-035 — PlayerCountryCard component tests.
//
// One `describe` per AC item, plus a non-AC reusability check (synthetic
// non-Aurelia country) which is itself called out in the AC list. Each test
// either renders the card directly with a Country prop (the truly hermetic
// path — proves the component takes the Country shape verbatim) OR drives it
// from a `createGameStore({ seed: 1 })` to exercise the App.tsx wiring.

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createAureliaState } from '@engine/fixtures/aurelia'
import type { ActiveDecree, Country, EngineState, POP } from '@engine/types'
import {
  PlayerCountryCard,
  type PlayerCountryCardTrends,
} from '@ui/components/PlayerCountryCard'
import { createGameStore, type GameStore } from '@ui/stores/gameStore'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

/** Default test trends — Aurelia's starting approval/treasury seeded once. */
function trendsForAurelia(state: EngineState): PlayerCountryCardTrends {
  return {
    approval: [state.country.approval],
    treasury: [state.country.treasury],
  }
}

/**
 * Build a synthetic non-Aurelia country. Used by AC #4 to prove the card
 * doesn't hard-code `country.id === 'aurelia'` anywhere. Every field is set
 * to a value that is NOT in the Aurelia fixture.
 */
function syntheticCountry(): Country {
  const pop: POP = {
    pop_type: 'urban_workers',
    size: 1_000_000,
    avg_age: 30,
    education_level: 60,
    income: 8_000,
    income_clamped: false,
    employment_rate: 0.85,
    happiness: 40,
    radicalization: 25,
    institutional_trust: 50,
    // Strongly conservative-leaning so the ideology label diverges from
    // Aurelia's "slightly progressive".
    ideology: 0.6,
    religion: '',
    priorities: ['jobs'],
  }
  return {
    id: 'synthetica',
    name: 'Federation of Synthetica',
    analogue: 'fictional',
    area_km2: 100_000,
    terrain_profile: {
      coastline: 0.1,
      arable: 0.2,
      mountain: 0.3,
      forest: 0.3,
      desert: 0.1,
    },
    climate_zone: 'continental',
    neighbors: [],
    government_type: 'autocracy',
    head_of_state: {
      name: 'Marshal Vance',
      party: 'Unity Front',
      role: 'Chancellor',
    },
    banner_color: '#0099ff',
    population: 1_000_000,
    gdp: 50_000,
    treasury: 12_000,
    approval: 48,
    approval_by_pop: { urban_workers: 40 },
    legitimacy: 0,
    stability: 55,
    target_budget: 10_000,
    pops: [pop],
    sectors: [
      { sector_type: 'agriculture', output: 10_000, employment_share: 0.5, pollution_coefficient: 0.02 },
      { sector_type: 'industry', output: 25_000, employment_share: 0.3, pollution_coefficient: 0.1 },
      { sector_type: 'services', output: 15_000, employment_share: 0.2, pollution_coefficient: 0.01 },
    ],
    sliders: { tax_income: 30, tax_corporate: 35, tax_consumption: 20 },
    budget_shares: {
      health: 0.2,
      education: 0.15,
      infrastructure: 0.2,
      security: 0.3,
      welfare: 0.15,
    },
  }
}

// --- AC #1 — All five fields populate on cold load ------------------------

describe('T-035 AC#1 — card renders five fields with Aurelia on initial load, no `undefined`', () => {
  it('shows country name + government, banner, leader (role + name + party), trend lines, ideology', () => {
    const state = createAureliaState()
    const { getByTestId } = render(
      <PlayerCountryCard
        country={state.country}
        trends={trendsForAurelia(state)}
        activeDecrees={state.active_decrees}
      />,
    )

    // 1. Name + government_type
    expect(getByTestId('player-country-card-name').textContent).toBe(
      'Republic of Aurelia',
    )
    expect(getByTestId('player-country-card-government').textContent).toBe(
      'Democracy',
    )

    // 2. Banner — colour string round-trips through the `data-banner-color`
    // attribute (JSDOM normalises CSS colours to `rgb(…)`, losing the hex).
    const banner = getByTestId('player-country-card-banner')
    expect(banner.getAttribute('data-banner-color')).toBe('#aa3bff')

    // 3. Leader — role + name on the first line, party on the second.
    const leaderName = getByTestId('player-country-card-leader-name')
    expect(leaderName.textContent).toContain('President')
    expect(leaderName.textContent).toContain('Elena Vorra')
    expect(
      getByTestId('player-country-card-leader-party').textContent,
    ).toBe('Center Coalition')

    // 4. Ideology summary — Aurelia weighted mean ≈ −0.076 → "Slightly progressive"
    expect(getByTestId('player-country-card-ideology').textContent).toBe(
      'Slightly progressive',
    )

    // 5. Trend lines render their headline values from the snapshot (not the
    // trend series — those are tested in AC #2).
    expect(
      getByTestId('player-country-card-approval-value').textContent,
    ).toBe('56')
    expect(
      getByTestId('player-country-card-treasury-value').textContent,
    ).toBe('50,000')

    // Cross-cut: nothing rendered the string "undefined".
    const root = getByTestId('player-country-card')
    expect(root.textContent ?? '').not.toContain('undefined')
  })
})

// --- AC #2 — Trend lines update tick-by-tick ------------------------------

describe('T-035 AC#2 — both micro-trend lines update tick-by-tick when the engine ticks', () => {
  it('the approval/treasury trend buffers extend with each advance(), and the headline values track snapshot changes', () => {
    store = createGameStore({ seed: 1 })

    // Sanity: on first paint, both trend arrays are length 1.
    expect(store.getState().trends.approval).toHaveLength(1)
    expect(store.getState().trends.treasury).toHaveLength(1)

    const initialApproval = store.getState().snapshot.country.approval
    const initialTreasury = store.getState().snapshot.country.treasury

    act(() => {
      store!.getState().advance()
      store!.getState().advance()
      store!.getState().advance()
    })

    // After three ticks, the buffers have grown.
    const trends = store.getState().trends
    expect(trends.approval).toHaveLength(4) // 1 seed + 3 advances
    expect(trends.treasury).toHaveLength(4)

    // The card renders the slice(-12) of those buffers. Render the card with
    // the live store-driven snapshot — the trend buffers we just observed are
    // what flows into the sparkline.
    const snapshot = store.getState().snapshot
    const { getByTestId } = render(
      <PlayerCountryCard
        country={snapshot.country}
        trends={{ approval: trends.approval, treasury: trends.treasury }}
        activeDecrees={snapshot.active_decrees}
      />,
    )

    // After ≥ 2 samples the TrendSparkline switches from empty placeholder
    // to a real SVG-bearing chart container — the testid changes accordingly.
    const approvalTrend = getByTestId('player-country-card-trend-approval')
    expect(
      approvalTrend.querySelector('[data-testid="trend-sparkline"]'),
    ).not.toBeNull()
    expect(
      approvalTrend.querySelector('[data-testid="trend-sparkline-empty"]'),
    ).toBeNull()

    // Headline values reflect the latest snapshot, not the seed (sanity:
    // engine ticks DID move the numbers — even at steady state, sub-tick
    // noise on sectors moves treasury and approval by a fraction).
    expect(snapshot.country.approval).not.toBe(initialApproval) // noise drift
    expect(snapshot.country.treasury).not.toBe(initialTreasury)
  })
})

// --- AC #3 — Status chips respond to state changes ------------------------

describe('T-035 AC#3 — status chips appear/disappear as snapshot state changes', () => {
  it('no warning chips on a healthy Aurelia start; an approval-notice chip appears when approval drops to 25', () => {
    const state = createAureliaState()
    // Healthy start: approval=56, treasury=50_000, active_decrees=[].
    const { queryByTestId, rerender } = render(
      <PlayerCountryCard
        country={state.country}
        trends={trendsForAurelia(state)}
        activeDecrees={state.active_decrees}
      />,
    )
    expect(queryByTestId('player-country-card-chip-approval')).toBeNull()
    expect(queryByTestId('player-country-card-chip-treasury')).toBeNull()

    // Drop approval to 25 → "Approval slipping" notice (approval ≤ 30).
    const slipping: Country = { ...state.country, approval: 25 }
    rerender(
      <PlayerCountryCard
        country={slipping}
        trends={{ approval: [25], treasury: [state.country.treasury] }}
        activeDecrees={[]}
      />,
    )
    const noticeChip = queryByTestId('player-country-card-chip-approval')
    expect(noticeChip).not.toBeNull()
    expect(noticeChip!.textContent).toBe('Approval slipping')
    expect(noticeChip!.className).toContain('player-country-card__chip--notice')

    // Drop to 12 → "Approval crisis" critical.
    const crisis: Country = { ...state.country, approval: 12 }
    rerender(
      <PlayerCountryCard
        country={crisis}
        trends={{ approval: [12], treasury: [state.country.treasury] }}
        activeDecrees={[]}
      />,
    )
    const crisisChip = queryByTestId('player-country-card-chip-approval')
    expect(crisisChip).not.toBeNull()
    expect(crisisChip!.textContent).toBe('Approval crisis')
    expect(crisisChip!.className).toContain('player-country-card__chip--critical')

    // Drop treasury to 0 → bankruptcy-looming chip appears too.
    const bankrupt: Country = { ...state.country, approval: 12, treasury: 0 }
    rerender(
      <PlayerCountryCard
        country={bankrupt}
        trends={{ approval: [12], treasury: [0] }}
        activeDecrees={[]}
      />,
    )
    expect(
      queryByTestId('player-country-card-chip-treasury'),
    ).not.toBeNull()
  })

  it('decree chip appears when an active decree enters the snapshot, disappears when it expires', () => {
    const state = createAureliaState()
    const fakeDecree: ActiveDecree = {
      decree_id: 'industrial_subsidy',
      ticks_remaining: 3,
      effect: { type: 'output_boost', sector: 'industry', pct: 0.1 },
    }

    const { queryByTestId, rerender } = render(
      <PlayerCountryCard
        country={state.country}
        trends={trendsForAurelia(state)}
        activeDecrees={[]}
      />,
    )
    expect(
      queryByTestId('player-country-card-chip-decree-industrial_subsidy'),
    ).toBeNull()

    // Decree fires → chip appears.
    rerender(
      <PlayerCountryCard
        country={state.country}
        trends={trendsForAurelia(state)}
        activeDecrees={[fakeDecree]}
      />,
    )
    const chip = queryByTestId(
      'player-country-card-chip-decree-industrial_subsidy',
    )
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toBe('Industrial subsidy')

    // Decree expires → chip disappears.
    rerender(
      <PlayerCountryCard
        country={state.country}
        trends={trendsForAurelia(state)}
        activeDecrees={[]}
      />,
    )
    expect(
      queryByTestId('player-country-card-chip-decree-industrial_subsidy'),
    ).toBeNull()
  })

  it('end-to-end via store: setState mutating the snapshot in place updates chip visibility (event → snapshot → chip)', () => {
    // This test interprets the AC's "fires a mocked event" as the
    // post-event state pathway: an engine event would write to the snapshot,
    // the snapshot update fans out via Zustand, and the chip re-renders.
    // The card is a pure function of state, so we drive the state directly.
    store = createGameStore({ seed: 1 })
    const snapshot = store.getState().snapshot

    const { queryByTestId } = render(
      <PlayerCountryCard
        country={snapshot.country}
        trends={{
          approval: store.getState().trends.approval,
          treasury: store.getState().trends.treasury,
        }}
        activeDecrees={snapshot.active_decrees}
      />,
    )
    expect(queryByTestId('player-country-card-chip-approval')).toBeNull()

    // Push a new snapshot with low approval through the store. Tests across
    // the suite use this pattern (see WarningBanner.spec.tsx).
    act(() => {
      store!.setState((prev) => ({
        snapshot: {
          ...prev.snapshot,
          country: { ...prev.snapshot.country, approval: 18 },
        },
      }))
    })
    // Unmount the first card before rendering with the new snapshot so the
    // testid scope stays unambiguous.
    cleanup()
    // Re-render the card with the new snapshot (in app code this happens via
    // the selector; in this test we provide the props directly so the test
    // is hermetic to the App wiring).
    const next = store.getState().snapshot
    const { queryByTestId: queryAfter } = render(
      <PlayerCountryCard
        country={next.country}
        trends={{
          approval: store.getState().trends.approval,
          treasury: store.getState().trends.treasury,
        }}
        activeDecrees={next.active_decrees}
      />,
    )
    const chip = queryAfter('player-country-card-chip-approval')
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toBe('Approval low')
  })
})

// --- AC #4 — Synthetic non-Aurelia country renders cleanly ----------------

describe('T-035 AC#4 — accepts arbitrary Country, no Aurelia-specific assumptions', () => {
  it('renders a synthetic country with different id/name/color/leader/POP distribution', () => {
    const country = syntheticCountry()
    const { getByTestId } = render(
      <PlayerCountryCard
        country={country}
        trends={{ approval: [country.approval], treasury: [country.treasury] }}
        activeDecrees={[]}
      />,
    )

    // Identity fields reflect the synthetic country, not Aurelia.
    expect(getByTestId('player-country-card-name').textContent).toBe(
      'Federation of Synthetica',
    )
    expect(getByTestId('player-country-card-government').textContent).toBe(
      'Autocracy',
    )
    const banner = getByTestId('player-country-card-banner')
    expect(banner.getAttribute('data-banner-color')).toBe('#0099ff')

    // Leader uses the synthetic role + party.
    const leaderName = getByTestId('player-country-card-leader-name')
    expect(leaderName.textContent).toContain('Chancellor')
    expect(leaderName.textContent).toContain('Marshal Vance')
    expect(
      getByTestId('player-country-card-leader-party').textContent,
    ).toBe('Unity Front')

    // Ideology mean = 0.6 (single POP, ideology 0.6) → "Strongly conservative".
    expect(getByTestId('player-country-card-ideology').textContent).toBe(
      'Strongly conservative',
    )

    // No `undefined` leaked into the DOM.
    expect(
      getByTestId('player-country-card').textContent ?? '',
    ).not.toContain('undefined')
  })

  it('handles edge cases: zero-POP-size and zero-ideology countries render "Centrist" not NaN', () => {
    const country = syntheticCountry()
    // Override the POP distribution to a single zero-ideology POP.
    const centristCountry: Country = {
      ...country,
      pops: [{ ...country.pops[0], ideology: 0 }],
    }
    const { getByTestId } = render(
      <PlayerCountryCard
        country={centristCountry}
        trends={{ approval: [50], treasury: [10_000] }}
        activeDecrees={[]}
      />,
    )
    expect(getByTestId('player-country-card-ideology').textContent).toBe(
      'Centrist',
    )
    // Unmount the first instance before rendering the second so the testid
    // doesn't collide in `document.body`.
    cleanup()

    // Truly empty POP list (synthetic edge case — no division by zero).
    const emptyPopCountry: Country = { ...country, pops: [] }
    const { getByTestId: get2 } = render(
      <PlayerCountryCard
        country={emptyPopCountry}
        trends={{ approval: [50], treasury: [10_000] }}
        activeDecrees={[]}
      />,
    )
    expect(get2('player-country-card-ideology').textContent).toBe('Centrist')
  })
})

// --- AC #5 — Cold load renders complete (no flash of default) -------------

describe('T-035 — cold-load rendering is complete from frame 0', () => {
  it('with a length-1 trend buffer, sparklines render their empty placeholder (no crash)', () => {
    const state = createAureliaState()
    const { getByTestId } = render(
      <PlayerCountryCard
        country={state.country}
        trends={{
          approval: [state.country.approval],
          treasury: [state.country.treasury],
        }}
        activeDecrees={state.active_decrees}
      />,
    )

    // Length-1 buffer → empty placeholder inside both trend rows. This is the
    // contract from TrendSparkline (< 2 points = placeholder div); we assert
    // the absence of a "real" chart wrapper.
    const approvalTrend = getByTestId('player-country-card-trend-approval')
    expect(
      approvalTrend.querySelector('[data-testid="trend-sparkline-empty"]'),
    ).not.toBeNull()
    const treasuryTrend = getByTestId('player-country-card-trend-treasury')
    expect(
      treasuryTrend.querySelector('[data-testid="trend-sparkline-empty"]'),
    ).not.toBeNull()
  })
})
