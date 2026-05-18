// T-023 — Generic debounce-on-release slider control.
//
// Reusable range input shared by the EconomyPanel's 3 tax sliders and 5 budget
// share sliders. The contract — committed on release, not on drag — is what
// makes "multiple drags during pause keep only the latest value" trivially
// true: only the final value reaches the engine queue. See vault `Decision
// Mechanics` AC: "Slider changes commit on release, not on drag."
//
// Commit events:
//   - mouseUp        — primary mouse release
//   - touchEnd       — touch release
//   - keyUp          — keyboard interaction (arrow keys, etc.)
//   - blur           — focus leaves the input (covers pointer drift, tab away)
//
// We track the last committed value as part of the slider's state object so
// duplicate commits (e.g., mouseUp followed by blur with no further change)
// collapse to a single `onCommit` call.
//
// When the controlled `value` prop changes from the outside (e.g., the next
// tick's snapshot reflects the commit, or another panel mutates state), we
// reset the local thumb state to the new prop value so external changes stay
// visible. We also reset the committed baseline so the next divergence we
// measure is against the new starting point.

import { useState, type ReactNode } from 'react'

import { Tooltip } from '@ui/components/Tooltip'
import type { TooltipKey } from '@ui/copy/tooltips'

export type SliderProps = {
  /** DOM id for the input — also the test hook. */
  id: string
  /** Human-readable label rendered inside the wrapping `<label>`. */
  label: string
  /** Min / max / step bounds. Step defaults to 1. */
  min: number
  max: number
  step?: number
  /** Controlled value driven by the parent (engine snapshot field). */
  value: number
  /**
   * Called ONLY on commit (release / blur / keyup). Never on drag. The new
   * value is the value showing on the thumb at the moment of release.
   */
  onCommit: (value: number) => void
  /** Optional formatter for the value chip next to the slider. */
  formatDisplay?: (value: number) => string
  /**
   * If true, render the "recently changed" indicator (small dot + class). The
   * parent computes this from the engine event stream.
   */
  recentlyChanged?: boolean
  /** Override for aria-label on the input. Defaults to `label`. */
  ariaLabel?: string
  /**
   * T-027 — Fires on every `onChange` (i.e. while dragging) with the current
   * thumb value. Optional; used by the EconomyPanel to drive the "predicted
   * impact" preview without entangling this Slider with the preview logic
   * itself. The Slider remains commit-on-release for the engine queue (see
   * `onCommit`) — `onCandidateChange` is purely a passive readout for the
   * parent to render whatever side-UI it wants.
   */
  onCandidateChange?: (value: number) => void
  /**
   * T-027 — Optional content rendered below the slider row. The EconomyPanel
   * passes a `<SliderPreview>` element here while the player is dragging; the
   * Slider just decides where it goes layout-wise. Anything renderable is
   * allowed — Slider does NOT inspect this content.
   */
  preview?: ReactNode
  /**
   * T-032 — Optional tooltip copy key. When set, wraps the slider's label
   * region in a Radix-backed Tooltip whose body is sourced from
   * `src/ui/copy/tooltips.ts`. The trigger is a focusable span containing the
   * label text so the tooltip opens on hover OR keyboard focus.
   */
  tooltipKey?: TooltipKey
}

export function Slider({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  onCommit,
  formatDisplay,
  recentlyChanged = false,
  ariaLabel,
  onCandidateChange,
  preview,
  tooltipKey,
}: SliderProps) {
  // Local thumb position + last-committed baseline + last-seen prop value all
  // live in a single state object. This is the React 19 idiom for "reset
  // state when a prop changes" without an effect: compare during render,
  // setState if the prop differs from what we last observed, and React will
  // re-run the component with the fresh state. Bundling the three together
  // keeps the three updates in a single setState call (no torn intermediate
  // state during render). See React docs § "Adjusting some state when a prop
  // changes" — they specifically recommend this pattern over useEffect.
  const [s, setS] = useState({
    local: value,
    lastCommitted: value,
    seenValue: value,
  })
  if (s.seenValue !== value) {
    setS({ local: value, lastCommitted: value, seenValue: value })
  }

  const setLocal = (next: number) => {
    setS((prev) => ({ ...prev, local: next }))
    // T-027: surface the in-progress candidate to the parent so it can drive
    // a preview without owning the input. Fires on every drag change — the
    // parent decides whether to memoize / debounce. We keep the call outside
    // the setState batch because React 19 batches both updates anyway and
    // the parent's render is what consumes this value.
    onCandidateChange?.(next)
  }

  const commitIfChanged = () => {
    if (s.local !== s.lastCommitted) {
      setS((prev) => ({ ...prev, lastCommitted: prev.local }))
      onCommit(s.local)
    }
  }

  const display = formatDisplay ? formatDisplay(s.local) : String(s.local)

  // The wrapping label gives screen readers a name without a separate <label
  // for>. Marking the value chip aria-hidden avoids it being read twice.
  return (
    <label
      htmlFor={id}
      className={`slider${recentlyChanged ? ' is-recently-changed' : ''}`}
      data-testid={`slider-${id}`}
    >
      {tooltipKey !== undefined ? (
        <Tooltip tooltipKey={tooltipKey}>
          <span className="slider__label" tabIndex={0}>
            {label}
          </span>
        </Tooltip>
      ) : (
        <span className="slider__label">{label}</span>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={s.local}
        aria-label={ariaLabel ?? label}
        // Drag updates local state ONLY. Never call onCommit here.
        onChange={(e) => setLocal(Number(e.currentTarget.value))}
        // All commit pathways funnel through commitIfChanged so duplicate
        // commits (mouseUp → blur with no change between) collapse to one
        // onCommit call.
        onMouseUp={commitIfChanged}
        onTouchEnd={commitIfChanged}
        onKeyUp={commitIfChanged}
        onBlur={commitIfChanged}
      />
      <span className="slider__value" aria-hidden="true" data-testid={`slider-${id}-value`}>
        {display}
      </span>
      {recentlyChanged ? (
        <span className="slider__recent-dot" data-testid={`slider-${id}-recent`} aria-hidden="true" />
      ) : null}
      {/* T-027: optional preview slot. Rendered as a sibling row inside the
          label so it inherits the slider's `htmlFor` association for screen
          readers, but lives in its own grid cell (spanning the full row via
          CSS) so it doesn't compete with the label/track/value/dot columns. */}
      {preview !== undefined ? (
        <div className="slider__preview-slot" data-testid={`slider-${id}-preview-slot`}>
          {preview}
        </div>
      ) : null}
    </label>
  )
}
