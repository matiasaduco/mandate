// T-024 — Single-axis ideology indicator.
//
// Renders a small horizontal track with a dot positioned by the POP's ideology
// scalar in [-1, 1]. Left end is labeled "Progressive", right end
// "Conservative", reflecting the Phase 1 single-axis stub described in the
// vault POP entity (see `src/engine/entities/POP.ts`). Phase 2+ promotes this
// to a vector — at that point this component becomes a 2D scatter and the
// callers swap it in; the props will need to change but no panel code will
// need to know about the axis shape change.
//
// Reusable: T-025 (Politics panel) is the next consumer, where each POP card
// shows the same indicator alongside the approval breakdown bar.
//
// Clamp: defensively clamp ideology into [-1, 1] before positioning. The
// engine writes within that range today, but a misconfigured fixture could
// silently push the dot off-track without the clamp.

export type IdeologyDotProps = {
  /** Single-axis ideology in [-1, 1]. -1 = fully progressive, +1 = fully conservative. */
  ideology: number
  /**
   * Optional test id suffix so multiple instances on a page (one per POP) can
   * be queried independently. The full test id becomes
   * `ideology-track-${suffix}`.
   */
  testIdSuffix?: string
}

/** Clamp a number into a closed range. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function IdeologyDot({ ideology, testIdSuffix }: IdeologyDotProps) {
  const clamped = clamp(ideology, -1, 1)
  // Map [-1, 1] → [0%, 100%] along the track width. CSS handles the dot's
  // pixel-level positioning relative to a fixed-width parent.
  const positionPct = ((clamped + 1) / 2) * 100
  const testId = testIdSuffix !== undefined ? `ideology-track-${testIdSuffix}` : 'ideology-track'

  return (
    <div
      className="ideology"
      data-testid={testId}
      aria-label={`Ideology: ${clamped.toFixed(2)}`}
    >
      <span className="ideology__label ideology__label--left" aria-hidden="true">
        Progressive
      </span>
      <div className="ideology__track" aria-hidden="true">
        <div className="ideology__dot" style={{ left: `${positionPct}%` }} />
      </div>
      <span className="ideology__label ideology__label--right" aria-hidden="true">
        Conservative
      </span>
    </div>
  )
}
