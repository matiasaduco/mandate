// T-033 — Onboarding tour copy.
//
// Single source of truth for the prose shown by `react-joyride` in the
// first-run tutorial. Mirrors the editorial conventions of `tooltips.ts` and
// `menu.ts`: satirical / Tropico-Suzerain register, jokes that reinforce
// mechanics rather than obscure them.
//
// Each entry maps a stable step id (used by `tour.ts` to assemble the
// `Step[]`) to a `title` + a multi-line `body`. The text routes through this
// module so a future localization pass can pull translations without combing
// through the component layer.
//
// Step ids match the AC numbering from the brief (1..7). The `tourId` field
// echoes the `data-tour-id` attribute the matching DOM element carries — kept
// here as a constant so tests can iterate over the entries and assert each
// anchor resolves at the moment the step opens.

export type OnboardingStepId =
  | 'welcome'
  | 'speed'
  | 'tax-income'
  | 'event-feed'
  | 'society-pop'
  | 'politics-decree'
  | 'closing'

export type OnboardingStepCopy = {
  /** Stable id; matches `OnboardingStepId`. */
  id: OnboardingStepId
  /** `data-tour-id` attribute carried by the anchor element. */
  tourId: string
  /** Tooltip title — rendered as the joyride step's `title`. */
  title: string
  /** Tooltip body — rendered as the joyride step's `content`. */
  body: string
}

/**
 * The seven canonical tour steps. Order matters: joyride walks the array
 * front-to-back. Insert / reorder here, NOT in `tour.ts`, so the copy module
 * stays the editorial source of truth.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepCopy[] = [
  {
    id: 'welcome',
    tourId: 'player-country-card',
    title: 'Welcome to Aurelia',
    body:
      "This card is you. Government type, head of state, banner colour, " +
      "approval, treasury — everything that matters when the press calls. " +
      "Try not to embarrass it.",
  },
  {
    id: 'speed',
    tourId: 'speed-control',
    title: 'Time is a knob',
    body:
      "Pause, 1×, 2×, 4×. The simulation runs on monthly ticks; you can hold " +
      "it still while you make a mess of the policy sliders. We paused the " +
      "tutorial for you. You're welcome.",
  },
  {
    id: 'tax-income',
    tourId: 'tax-income-slider',
    title: 'Tax the people',
    body:
      "Drag the income tax slider. The little preview band tells you, roughly, " +
      "what the engine thinks will happen next tick. Sliders commit on release, " +
      "so drag away — only the final value reaches the treasury.",
  },
  {
    id: 'event-feed',
    tourId: 'event-feed',
    title: 'The press is watching',
    body:
      "When you apply a change, the engine ticks, the world reacts, and the " +
      "event feed turns your spreadsheet into a story. Threshold crossings, " +
      "policy commits, decrees — they all show up here, newest first.",
  },
  {
    id: 'society-pop',
    tourId: 'society-pop-row',
    title: 'Pop by pop',
    body:
      "Your population is a stack of POPs: workers, capitalists, intellectuals, " +
      "rural folk. Each has its own happiness, employment rate, and pet " +
      "priorities. Hover any column for the tooltip; the row will tell you why " +
      "it likes (or resents) you.",
  },
  {
    id: 'politics-decree',
    tourId: 'decree-button',
    title: 'Push the big red button',
    body:
      "Decrees are one-tick policies you fire when sliders aren't fast enough. " +
      "They cost treasury, they boost approval (or sectors), and they expire on " +
      "their own. The chip on the country card shows how long an active decree " +
      "still has to run.",
  },
  {
    id: 'closing',
    tourId: 'player-country-card',
    title: 'How you lose',
    body:
      "The run ends when approval crashes below 15 for too long, treasury goes " +
      "deeply red for too long, or both at once. Settings (with a 'Replay " +
      "tutorial' button) is in the pause menu — Esc to open it. Now go cause " +
      "an incident.",
  },
] as const

/**
 * localStorage key for the onboarding completion flag. Independent of
 * `save.v1`, `layout.v1`, and `settings.v1` per the brief: a player who wipes
 * their save should NOT have to sit through the tutorial again unless they
 * explicitly clear this slot. Versioned so a future T-NNN that rewrites the
 * tour copy can bump the version (and re-launch the tour) without churning
 * the unrelated save format.
 */
export const ONBOARDING_STORAGE_KEY = 'mandate.onboarding.v1'

/**
 * Shape of the persisted onboarding record. `version` is the storage-format
 * version (not the tour-content version) so we can evolve the record shape
 * without losing back-compat with v1 payloads.
 *
 * Semantics (per brief):
 *   - `completed: true, skipped: false` — player walked all 7 steps.
 *   - `completed: true, skipped: true`  — player hit "Skip" on any step.
 *   - `completed: false`                — replay was requested (or never ran).
 *
 * On a version-mismatch read, we treat the payload as "not completed" and
 * re-launch the tour — the safest default.
 */
export type OnboardingRecord = {
  version: 1
  completed: boolean
  skipped: boolean
}
