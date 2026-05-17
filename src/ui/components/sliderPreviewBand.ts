// T-027 — Banding formula for the slider "predicted impact" preview.
//
// Pure helper kept in its own file so the SliderPreview component file stays
// component-only (react-refresh requires this for HMR). All the directional
// formatting lives here; the SliderPreview just calls `bandDelta(d)` and
// renders the string into a span.
//
// Formula (locked in the T-027 brief):
//   - |d| < 0.5            → "~0"
//   - low  = max(1, floor(|d| * 0.8))
//   - high = ceil(|d| * 1.2)
//   - if low === high      → "±low"
//   - else                 → "±low to ±high"
//
// Negative values use the Unicode minus sign (U+2212) so they line up visually
// with the positive "+" sign — the ASCII hyphen "-" is narrower and tends to
// look like a dash in a tabular column.

/**
 * Format a numeric delta as a directional range string. See module-level
 * comment for the formula.
 */
export function bandDelta(d: number): string {
  if (Math.abs(d) < 0.5) return '~0'
  const sign = d < 0 ? '−' : '+'
  const abs = Math.abs(d)
  const low = Math.max(1, Math.floor(abs * 0.8))
  const high = Math.ceil(abs * 1.2)
  return low === high ? `${sign}${low}` : `${sign}${low} to ${sign}${high}`
}
