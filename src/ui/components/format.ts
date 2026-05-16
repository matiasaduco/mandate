// T-022 — Shared display formatters for the UI layer.
//
// The TopBar (T-021) inlined two tiny formatters; the OverviewPanel (T-022)
// reuses the same conventions for population / gdp / treasury / approval and
// adds two more for textual fields. We centralize here so the two surfaces
// stay in lockstep and any future tweak (e.g. localization) is a single edit.
//
// Pure functions only — no React imports.

/**
 * Integer formatter with US thousand separators. Negatives keep their leading
 * minus sign (used by the treasury card so a deficit reads as "-12,345").
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * Integer 0–100 formatter for approval / stability. Returns just the number;
 * callers add any unit suffix.
 */
export function formatPercent(value: number): string {
  return String(Math.round(value))
}

/**
 * Capitalize the first letter of a label for display (e.g. `democracy` →
 * `Democracy`). Empty strings pass through.
 */
export function formatTitle(value: string): string {
  if (value.length === 0) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}
