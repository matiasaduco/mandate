// T-034 — Design tokens for the Phase 1.5 game-style skin.
//
// Single source of truth for every visual / motion / layout constant the UI
// uses. The engine never reads from this file (lint enforces the headless
// rule); only UI surfaces consume it. Per the Phase 1.5 brief these constants
// are NOT gameplay tunables — they do not move the simulation. They live here
// (and not in `src/engine/tunables.ts`) because changing the panel min size or
// a motion duration must NOT trigger a vault `Tunables.md` edit / determinism
// re-lock.
//
// Decisions encoded here:
//   - One accent palette only — no light/dark variants in Phase 1.5. Honor
//     `prefers-color-scheme` is a Phase 2 concern.
//   - Motion durations are short (≤ 250 ms for KPI tweens, ≤ 200 ms for panel
//     fades, ≤ 120 ms for tooltips) so the UI feels responsive even at 4×
//     simulation speed. Spring tweens are clamped to the same upper bound.
//   - `PLAYER_CARD_ZONE` reserves layout space for T-035's PlayerCountryCard.
//     T-034 does NOT render the card — it just promises that the default panel
//     positions stay clear of the zone. If you change the zone, also update
//     `DEFAULT_PANEL_POSITIONS` so the four panels still spawn outside it.

// --- Accent palette -------------------------------------------------------
//
// Colors as CSS strings. The existing `--accent` token in `index.css` is the
// global brand color; the tokens here repeat it as constants so motion code
// (which can't read CSS variables synchronously) can use the same value.

export const COLOR_ACCENT = '#aa3bff'
export const COLOR_ACCENT_BG = 'rgba(170, 59, 255, 0.10)'
export const COLOR_ACCENT_BORDER = 'rgba(170, 59, 255, 0.50)'
export const COLOR_DANGER = '#d6336c'
export const COLOR_WARN = '#f59e0b'
export const COLOR_TEXT = '#6b6375'
export const COLOR_TEXT_H = '#08060d'
export const COLOR_PANEL_BG = '#fafafa'
export const COLOR_BORDER = '#e5e4e7'

// --- Radii / spacing ------------------------------------------------------

export const RADIUS_CARD = 10
export const RADIUS_PILL = 999
export const SPACE_HUD_PAD_X = 24
export const SPACE_HUD_PAD_Y = 12
export const SPACE_PANEL_GAP = 16

// --- Motion ---------------------------------------------------------------
//
// Durations in milliseconds. Framer-motion expects seconds; conversions live
// inline at each call site so the constants here stay legible. Easing curves
// are documented as named tokens so they can be re-used across surfaces.

export const MOTION_PANEL_MOUNT_MS = 180
export const MOTION_PANEL_STAGGER_MS = 60
export const MOTION_KPI_TWEEN_MS = 240
export const MOTION_EVENT_SLIDE_IN_MS = 180
export const MOTION_TOOLTIP_HUD_MS = 110
export const MOTION_PULSE_MS = 1400

/** Standard ease-out cubic for short surfaces. */
export const EASE_OUT_CUBIC = [0.22, 0.61, 0.36, 1] as const
/** Subtle spring config for KPI value tweens — fast, lightly damped. */
export const SPRING_KPI = { stiffness: 220, damping: 28, mass: 0.6 } as const

// --- Panel layout ---------------------------------------------------------
//
// Min / max sizes per panel. Same for all four panels in Phase 1.5; a future
// ticket can specialize per panel if needed. The min sizes are wide enough
// that the inner grids don't collapse below their `auto-fit` minmax breakpoint
// (320–360 px depending on the panel — see App.css). Max sizes cap the panel
// at roughly 2x the default so a player who drags a corner aggressively
// doesn't end up with a panel that owns the whole viewport.

export const PANEL_MIN_WIDTH = 360
export const PANEL_MIN_HEIGHT = 220
export const PANEL_MAX_WIDTH = 1100
export const PANEL_MAX_HEIGHT = 900

/**
 * Reserved layout zone for T-035's PlayerCountryCard. T-034 does NOT render
 * the card; it just keeps the default panel positions clear of this rectangle
 * so when T-035 mounts the card it doesn't collide with a panel on cold load.
 * Coordinates are relative to the panel surface (`<main>` content box).
 */
export const PLAYER_CARD_ZONE = {
  x: 16,
  y: 16,
  width: 280,
  height: 360,
} as const

/**
 * Default positions / sizes for the four floating panels. Layout reasoning:
 *   - The PLAYER_CARD_ZONE sits in the top-left corner (x: 16, y: 16,
 *     width: 280, height: 360). Panels avoid the rectangle `[16..296] × [16..376]`.
 *   - Overview spawns immediately to the right of the card.
 *   - Economy below it.
 *   - Society to the right of Overview / Economy.
 *   - Politics to the right of Society.
 * Numbers are tuned so a 1440×900 viewport shows all four panels without
 * overlap and without scrolling.
 */
export const DEFAULT_PANEL_POSITIONS = {
  overview: { x: 312, y: 16, width: 520, height: 340 },
  economy: { x: 312, y: 372, width: 520, height: 480 },
  society: { x: 848, y: 16, width: 520, height: 420 },
  politics: { x: 848, y: 452, width: 520, height: 400 },
} as const

// --- Keybindings ----------------------------------------------------------
//
// Named exports so T-037's settings UI can import and display the same
// shortcut. The keybinding spec is normalized: `meta` matches `Cmd` on Mac
// AND `Ctrl` on Linux/Windows (handler logic checks `metaKey || ctrlKey`).

export type Keybind = {
  /** Single-character key in upper case (`'L'`). Matched case-insensitively. */
  key: string
  /** Shift required (`true`) or forbidden (`false`). */
  shift: boolean
  /** Cmd (Mac) / Ctrl (Linux/Windows) required. */
  meta: boolean
}

/** Cmd/Ctrl + Shift + L → reset panel layout. */
export const RESET_LAYOUT_KEYBIND: Keybind = {
  key: 'L',
  shift: true,
  meta: true,
}
