// T-033 — Onboarding tour definitions for react-joyride.
//
// Pure-data module: maps `ONBOARDING_STEPS` (editorial copy in
// `src/ui/copy/onboarding.ts`) onto the `Step[]` shape react-joyride consumes,
// applies the global joyride options (styling tokens, z-index, locale), and
// exposes helpers for persisting the completion flag.
//
// No React, no DOM access — this module is import-safe from any environment
// (e.g. a future server-side render path). The actual `<Joyride>` mount lives
// in `useOnboarding.ts`.
//
// Resolved decisions encoded here (see brief, "Resolved decisions"):
//   - Skip button uses joyride's "Skip All" via the per-step `buttons` array;
//     no per-step skip variant.
//   - Z-index pulled from `Z_INDEX_TOUR` in tokens (NOT a magic literal).
//   - Spotlight clicks: react-joyride 3.x replaced 2.x's `spotlightClicks`
//     with `blockTargetInteraction`. We leave the engine default
//     (false → target IS interactive) for every step so the player can drag
//     the tax slider on step 3 without leaving the tour.
//   - Styling: minimal pass — primaryColor + background + radius. Typography
//     and motion are joyride's defaults (the defaults already respect
//     `prefers-reduced-motion` natively).

import type { Locale, Step, Styles } from 'react-joyride'

import {
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  type OnboardingRecord,
  type OnboardingStepCopy,
} from '@ui/copy/onboarding'
import {
  COLOR_ACCENT,
  COLOR_PANEL_BG,
  COLOR_TEXT_H,
  RADIUS_CARD,
  Z_INDEX_TOUR,
} from '@ui/theme/tokens'

/**
 * Joyride locale overrides. Keeps the satirical register consistent with the
 * rest of the menu copy. Kept here rather than in `onboarding.ts` because the
 * `Locale` shape comes from joyride and we want the editorial module to stay
 * library-agnostic.
 */
const TOUR_LOCALE: Locale = {
  back: 'Back',
  close: 'Got it',
  last: 'Finish',
  next: 'Next',
  skip: 'Skip tutorial',
}

/**
 * Joyride styles. Minimal pass per the brief — colours + radius from the
 * design tokens, everything else inherited from joyride's defaults. The
 * `options.zIndex` lives next to the styles object because the v3 API expects
 * style+behavior on the same step root.
 */
const TOUR_STYLES: Partial<Styles> = {
  tooltip: {
    backgroundColor: COLOR_PANEL_BG,
    borderRadius: RADIUS_CARD,
    color: COLOR_TEXT_H,
  },
  tooltipContainer: {
    textAlign: 'left',
  },
  buttonPrimary: {
    backgroundColor: COLOR_ACCENT,
    borderRadius: RADIUS_CARD,
  },
}

/**
 * Build a single joyride `Step` from a copy entry. The CSS selector is the
 * canonical anchor — joyride's `target` accepts a string, an HTMLElement, or
 * a ref; we use a string so the value travels intact across re-renders.
 */
function toJoyrideStep(copy: OnboardingStepCopy): Step {
  return {
    target: `[data-tour-id="${copy.tourId}"]`,
    title: copy.title,
    content: copy.body,
    placement: 'auto',
    // Buttons: skip + close + primary on every step. Joyride's v3 default is
    // ['back', 'close', 'primary']; we add 'skip' so "Skip tutorial" is
    // available on every step (AC #3).
    buttons: ['skip', 'back', 'close', 'primary'],
    // Skip the beacon — the tour is auto-launched, so the player should land
    // directly on the tooltip rather than wait for an explicit beacon click.
    skipBeacon: true,
  }
}

/**
 * The fully-built joyride `Step[]` driven by the editorial copy module.
 * Module-level constant so the array reference is stable across renders —
 * joyride uses referential equality on `steps` to decide when to rebuild its
 * internal state.
 */
export const TOUR_STEPS: readonly Step[] = ONBOARDING_STEPS.map(toJoyrideStep)

/**
 * Joyride `<Joyride>` props common to every mount. The hook spreads this onto
 * the component and overlays the per-mount fields (`run`, `stepIndex`, etc.).
 */
export const TOUR_OPTIONS = {
  continuous: true,
  showProgress: true,
  styles: TOUR_STYLES,
  locale: TOUR_LOCALE,
  /**
   * z-index for the overlay portal. Pulled from the tokens module so a
   * future layout pass that promotes `Z_INDEX_WARNING_BANNER` above 100 is
   * a one-place change.
   */
  options: {
    zIndex: Z_INDEX_TOUR,
    primaryColor: COLOR_ACCENT,
  },
} as const

// --- Persistence helpers --------------------------------------------------
//
// Direct localStorage I/O on the well-known key. Wrapped in helpers so the
// callers never spell the key as a string literal — adding a new caller is
// "import the helpers, call the function".

/**
 * Parse a raw JSON string from localStorage into an `OnboardingRecord`.
 * Returns `null` if the payload is missing, malformed, or carries a version
 * we do not understand. Version-mismatch is treated as "not completed" by
 * the call-sites — the safest default per the brief.
 */
function parseRecord(raw: string | null): OnboardingRecord | null {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('completed' in parsed) ||
    !('skipped' in parsed)
  ) {
    return null
  }
  const candidate = parsed as Partial<OnboardingRecord>
  if (
    candidate.version !== 1 ||
    typeof candidate.completed !== 'boolean' ||
    typeof candidate.skipped !== 'boolean'
  ) {
    return null
  }
  return {
    version: 1,
    completed: candidate.completed,
    skipped: candidate.skipped,
  }
}

/**
 * Read the persisted onboarding record. Returns `null` if no record exists,
 * if storage is unavailable, or if the payload is corrupt / wrong version.
 * Callers should treat `null` and `{ completed: false }` the same: launch the
 * tour.
 */
export function readOnboardingRecord(): OnboardingRecord | null {
  if (typeof window === 'undefined') return null
  let raw: string | null
  try {
    raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
  } catch {
    return null
  }
  return parseRecord(raw)
}

/** True iff the player has finished (or skipped) the tour. */
export function isOnboardingCompleted(): boolean {
  const record = readOnboardingRecord()
  return record !== null && record.completed === true
}

/**
 * Persist completion. Best-effort: swallows quota exceptions so a full disk
 * doesn't crash the dashboard. The brief flags this as non-blocking —
 * worst case the player sees the tour again on the next launch.
 */
export function markOnboardingCompleted(skipped: boolean): void {
  if (typeof window === 'undefined') return
  const record: OnboardingRecord = {
    version: 1,
    completed: true,
    skipped,
  }
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Swallow — best-effort persistence.
  }
}

/**
 * Reset the completion flag. Called by the Settings "Replay tutorial" button.
 * Preserves the `skipped` value so a player who skipped originally and then
 * replays still has that history in their record. After replay completes,
 * the new record overwrites this anyway.
 */
export function clearOnboardingCompleted(): void {
  if (typeof window === 'undefined') return
  const existing = readOnboardingRecord()
  const record: OnboardingRecord = {
    version: 1,
    completed: false,
    skipped: existing?.skipped ?? false,
  }
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Swallow — best-effort persistence.
  }
}
