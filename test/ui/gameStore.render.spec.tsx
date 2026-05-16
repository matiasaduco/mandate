// T-019 AC#4 — React components re-render only when their selected slice
// changes. Uses RTL + an onRender prop callback (driven by the caller, not by
// useRef inside render) to count renders. We construct two components against
// the SAME store: one selecting `snapshot.tick`, the other selecting
// `events.length`. Advancing the tick (with no decisions, on a fresh Aurelia
// state) should re-render the tick component but NOT the events component,
// since `events.length` stays at 0.

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createGameStore,
  type GameStore,
  type GameStoreState,
} from '@ui/stores/gameStore'
import { useStore } from 'zustand'

let store: GameStore | null = null

afterEach(() => {
  store?.destroy()
  store = null
})

function TickReader({ onRender }: { onRender: () => void }) {
  const tick = useStore(store as GameStore, (s: GameStoreState) => s.snapshot.tick)
  // Push render counts to a caller-supplied callback rather than mutating a
  // ref during render (forbidden by react-hooks/refs).
  onRender()
  return <span data-testid="tick">{tick}</span>
}

function EventsCountReader({ onRender }: { onRender: () => void }) {
  const len = useStore(store as GameStore, (s: GameStoreState) => s.events.length)
  onRender()
  return <span data-testid="events-len">{len}</span>
}

describe('T-019 AC#4 — selector-driven re-renders', () => {
  it('a component selecting snapshot.tick re-renders on advance(); a component selecting events.length does NOT', () => {
    store = createGameStore({ seed: 1 })

    let tickRenders = 0
    let eventsRenders = 0
    const onTickRender = () => {
      tickRenders += 1
    }
    const onEventsRender = () => {
      eventsRenders += 1
    }

    const { getByTestId } = render(
      <>
        <TickReader onRender={onTickRender} />
        <EventsCountReader onRender={onEventsRender} />
      </>,
    )

    // Baseline: each component rendered once on mount.
    const tickBaseline = tickRenders
    const eventsBaseline = eventsRenders
    expect(getByTestId('tick').textContent).toBe('0')
    expect(getByTestId('events-len').textContent).toBe('0')

    // Advance the tick with no decisions queued. Aurelia at tick 0 → 1 should
    // emit zero events (no threshold crossings on the starting state), so
    // `events.length` stays at 0 and the events reader must NOT re-render.
    act(() => {
      store!.getState().advance()
    })

    expect(getByTestId('tick').textContent).toBe('1')
    expect(getByTestId('events-len').textContent).toBe('0')

    expect(tickRenders).toBeGreaterThan(tickBaseline)
    expect(eventsRenders).toBe(eventsBaseline)
  })

  it('the events component DOES re-render when an actual event is appended', () => {
    store = createGameStore({ seed: 1 })

    let eventsRenders = 0
    const onEventsRender = () => {
      eventsRenders += 1
    }

    const { getByTestId } = render(<EventsCountReader onRender={onEventsRender} />)
    const eventsBaseline = eventsRenders
    expect(getByTestId('events-len').textContent).toBe('0')

    act(() => {
      store!.getState().enqueueDecision({ type: 'slider', slider_id: 'tax_income', value: 28 })
      store!.getState().advance()
    })

    // PolicyChanged should have arrived → events.length increased → re-render.
    expect(Number(getByTestId('events-len').textContent)).toBeGreaterThan(0)
    expect(eventsRenders).toBeGreaterThan(eventsBaseline)
  })
})
