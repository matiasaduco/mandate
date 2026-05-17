// T-027 — Slider "predicted impact" preview.
//
// Pure presentational component: receives a `PreviewResult` (or null) and
// renders a small box with banded directional estimates for Δ approval, Δ
// treasury, and the top 1–3 POPs by |Δ happiness|. All math lives in the
// `dryTick` helper + `useSliderPreview` hook — this file only formats and
// colors the output.
//
// "Directional ranges" per Decision Mechanics open question (Phase 1 does NOT
// show exact numbers): a delta of -3 renders as "−2 to −4". A delta of <0.5
// in absolute value collapses to "~0" so the player isn't bombarded with
// noise on tiny changes.

import { formatTitle } from '@ui/components/format'
import type { PreviewResult } from '@ui/components/dryTick'
import { bandDelta } from '@ui/components/sliderPreviewBand'
import type { SliderId } from '@engine/types'

export type SliderPreviewProps = {
  /** The dry-tick result for the current candidate, or null to render nothing. */
  result: PreviewResult | null
  /**
   * The slider this preview belongs to. Used only to thread a stable
   * `data-testid` so tests can target a specific preview without ambiguity
   * when multiple sliders are on screen.
   */
  sliderId: SliderId
}

/**
 * Return a CSS class suffix that codes the sign of a delta for coloring.
 * "neutral" matches the "~0" band; "positive" / "negative" drive green / red.
 */
function signTone(d: number): 'positive' | 'negative' | 'neutral' {
  if (Math.abs(d) < 0.5) return 'neutral'
  return d < 0 ? 'negative' : 'positive'
}

export function SliderPreview({ result, sliderId }: SliderPreviewProps) {
  if (result === null) return null

  // Filter out POPs whose absolute delta rounds to 0 — those are noise and
  // would just say "~0" on a row by themselves. We keep the sort order from
  // the hook (by |dHappiness| desc) and slice to whichever non-noise rows
  // remain.
  const meaningfulPops = result.popDeltas.filter((p) => Math.round(Math.abs(p.dHappiness)) >= 1)

  return (
    <div
      className="slider-preview"
      data-testid={`slider-preview-${sliderId}`}
      role="status"
      aria-live="polite"
    >
      <div className="slider-preview__row">
        <span className="slider-preview__label">Δ Approval</span>
        <span
          className={`slider-preview__value slider-preview__value--${signTone(result.dApproval)}`}
          data-testid={`slider-preview-${sliderId}-approval`}
        >
          {bandDelta(result.dApproval)}
        </span>
      </div>
      <div className="slider-preview__row">
        <span className="slider-preview__label">Δ Treasury</span>
        <span
          className={`slider-preview__value slider-preview__value--${signTone(result.dTreasury)}`}
          data-testid={`slider-preview-${sliderId}-treasury`}
        >
          {bandDelta(result.dTreasury)}
        </span>
      </div>
      {meaningfulPops.length > 0 ? (
        <ul
          className="slider-preview__pops"
          data-testid={`slider-preview-${sliderId}-pops`}
        >
          {meaningfulPops.map((p) => (
            <li key={p.pop_type} className="slider-preview__pop">
              <span className="slider-preview__pop-name">
                {formatTitle(p.pop_type.replace(/_/g, ' '))}
              </span>
              <span
                className={`slider-preview__value slider-preview__value--${signTone(p.dHappiness)}`}
                data-testid={`slider-preview-${sliderId}-pop-${p.pop_type}`}
              >
                {bandDelta(p.dHappiness)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
