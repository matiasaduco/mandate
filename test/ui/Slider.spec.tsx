// T-023 — Slider component unit tests.
//
// The Slider's contract is *commit on release, not on drag*. These tests pin
// that contract independently of the EconomyPanel so a future panel reusing
// the Slider can rely on it. The EconomyPanel spec exercises the end-to-end
// "release → enqueueDecision → next tick reflects the change" loop.

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Slider } from '@ui/components/Slider'

describe('T-023 — Slider commits only on release / blur / keyup', () => {
  it('dragging (change events without release) does NOT call onCommit', () => {
    const onCommit = vi.fn()
    const { getByLabelText } = render(
      <Slider id="t" label="t" min={0} max={100} value={10} onCommit={onCommit} />,
    )
    const input = getByLabelText('t') as HTMLInputElement

    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.change(input, { target: { value: '30' } })
    fireEvent.change(input, { target: { value: '40' } })

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('change-then-mouseUp calls onCommit exactly once with the latest value', () => {
    const onCommit = vi.fn()
    const { getByLabelText } = render(
      <Slider id="t" label="t" min={0} max={100} value={10} onCommit={onCommit} />,
    )
    const input = getByLabelText('t') as HTMLInputElement

    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.change(input, { target: { value: '30' } })
    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.mouseUp(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(42)
  })

  it('touchEnd also commits', () => {
    const onCommit = vi.fn()
    const { getByLabelText } = render(
      <Slider id="t" label="t" min={0} max={100} value={10} onCommit={onCommit} />,
    )
    const input = getByLabelText('t') as HTMLInputElement

    fireEvent.change(input, { target: { value: '55' } })
    fireEvent.touchEnd(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(55)
  })

  it('keyUp commits (keyboard interaction)', () => {
    const onCommit = vi.fn()
    const { getByLabelText } = render(
      <Slider id="t" label="t" min={0} max={100} value={10} onCommit={onCommit} />,
    )
    const input = getByLabelText('t') as HTMLInputElement

    fireEvent.change(input, { target: { value: '11' } })
    fireEvent.keyUp(input, { key: 'ArrowRight' })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(11)
  })

  it('blur with no change does NOT commit (no-op)', () => {
    const onCommit = vi.fn()
    const { getByLabelText } = render(
      <Slider id="t" label="t" min={0} max={100} value={10} onCommit={onCommit} />,
    )
    const input = getByLabelText('t') as HTMLInputElement

    fireEvent.focus(input)
    fireEvent.blur(input)

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('mouseUp followed by blur with no change between fires onCommit ONCE', () => {
    const onCommit = vi.fn()
    const { getByLabelText } = render(
      <Slider id="t" label="t" min={0} max={100} value={10} onCommit={onCommit} />,
    )
    const input = getByLabelText('t') as HTMLInputElement

    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.mouseUp(input)
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(25)
  })

  it('controlled-value prop changes from outside reset the local thumb', () => {
    const onCommit = vi.fn()
    const { getByLabelText, rerender } = render(
      <Slider id="t" label="t" min={0} max={100} value={10} onCommit={onCommit} />,
    )
    const input = getByLabelText('t') as HTMLInputElement
    expect(input.value).toBe('10')

    rerender(<Slider id="t" label="t" min={0} max={100} value={77} onCommit={onCommit} />)
    expect(input.value).toBe('77')

    // And a subsequent mouseUp with no drag should NOT commit (lastCommitted
    // is now 77, local is 77).
    fireEvent.mouseUp(input)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('renders the recently-changed indicator only when the prop is true', () => {
    const { queryByTestId, rerender } = render(
      <Slider
        id="t"
        label="t"
        min={0}
        max={100}
        value={10}
        onCommit={() => {}}
        recentlyChanged={false}
      />,
    )
    expect(queryByTestId('slider-t-recent')).toBeNull()

    rerender(
      <Slider
        id="t"
        label="t"
        min={0}
        max={100}
        value={10}
        onCommit={() => {}}
        recentlyChanged
      />,
    )
    expect(queryByTestId('slider-t-recent')).not.toBeNull()
  })

  it('exposes min/max on the underlying input', () => {
    const { getByLabelText } = render(
      <Slider id="t" label="t" min={5} max={42} value={10} onCommit={() => {}} />,
    )
    const input = getByLabelText('t') as HTMLInputElement
    expect(input.min).toBe('5')
    expect(input.max).toBe('42')
  })
})
