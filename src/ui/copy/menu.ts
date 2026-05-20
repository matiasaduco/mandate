// T-036 — Centralized menu copy.
//
// Single source of truth for every label, title, and prose line in the main
// menu and pause overlay surfaces. Mirrors the editorial conventions of
// `tooltips.ts`: satirical / Tropico-Suzerain register, no dry corporate copy.
//
// All in-menu text must route through this map. The lint check that flags
// inline strings in components (T-032 AC #2 spirit) applies here as well —
// adding a new menu surface means adding the key here first.

/**
 * Shape of one menu entry. `body` is optional — used by surfaces that benefit
 * from a one-line description under the heading (the country picker card,
 * the pause overlay actions).
 */
export type MenuEntry = {
  title: string
  body?: string
}

export type MenuKey = keyof typeof MENU_COPY

export const MENU_COPY = {
  // -----------------------------------------------------------------------
  // Main menu — overall framing.
  // -----------------------------------------------------------------------
  'menu.title': {
    title: 'Mandate',
    body: 'Single-player geopolitics, played one country at a time.',
  },
  'menu.subtitle': {
    title: 'Choose your government and try not to lose it.',
  },

  // -----------------------------------------------------------------------
  // Main menu — primary actions.
  // -----------------------------------------------------------------------
  'menu.action.newGame': {
    title: 'New game',
    body: 'Pick a country, pick a seed, see how long you last.',
  },
  'menu.action.continue': {
    title: 'Continue',
    body: 'Resume from the autosave. Picks up exactly where you left it.',
  },
  'menu.action.settings': {
    title: 'Settings',
    body: 'Audio, motion, accessibility — wired in T-037.',
  },
  'menu.action.help': {
    title: 'Help & glossary',
    body: 'What the words mean and where to read them — wired in T-037.',
  },

  // -----------------------------------------------------------------------
  // New game flow — country picker + seed input.
  // -----------------------------------------------------------------------
  'newGame.heading': {
    title: 'New game',
    body: 'A fresh constitution, a fresh treasury, a fresh set of problems.',
  },
  'newGame.country.heading': {
    title: 'Pick a country',
    body: 'Aurelia is the only entry on the roster for now. More follow in Phase 3.',
  },
  'newGame.seed.heading': {
    title: 'Seed',
    body: 'A fixed seed gives a reproducible run. Use it if you want to retry the exact same scenario, or share it with someone else.',
  },
  'newGame.seed.useToggle': {
    title: 'Use a specific seed',
  },
  'newGame.seed.field': {
    title: 'Seed value',
  },
  'newGame.seed.random': {
    title: 'Random seed',
    body: 'The next run gets a fresh number drawn from the operating system\'s entropy. Different every time.',
  },
  'newGame.start': {
    title: 'Start',
  },
  'newGame.back': {
    title: 'Back to menu',
  },

  // -----------------------------------------------------------------------
  // Pause overlay — opens via Esc or the Menu button while playing.
  // -----------------------------------------------------------------------
  'pause.heading': {
    title: 'Paused',
    body: 'The simulation has stopped. Decisions you queue here apply at the next tick after you resume.',
  },
  'pause.action.resume': {
    title: 'Resume',
    body: 'Return to the dashboard. The tick loop picks back up at the speed it had before you paused.',
  },
  'pause.action.restart': {
    title: 'Restart run',
    body: 'Throw away this run and start a fresh one with the same seed. Requires confirmation.',
  },
  'pause.action.quit': {
    title: 'Quit to main menu',
    body: 'Autosaves first, then drops you back at the front door. Continue will bring you straight back.',
  },

  // -----------------------------------------------------------------------
  // Restart confirmation modal.
  // -----------------------------------------------------------------------
  'restart.heading': {
    title: 'Restart this run?',
    body: 'The current treasury, the current approval, the current decree clock — gone. The seed stays, so the dice roll the same way again.',
  },
  'restart.confirm': {
    title: 'Yes, restart',
  },
  'restart.cancel': {
    title: 'Cancel',
  },

  // -----------------------------------------------------------------------
  // Stub screens (Settings / Help) — T-037 fills these in.
  // -----------------------------------------------------------------------
  'stub.settings': {
    title: 'Settings (T-037)',
    body: 'Volume, motion preferences, and accessibility options land in the next ticket. Close this dialog to return to the menu.',
  },
  'stub.help': {
    title: 'Help (T-037)',
    body: 'A glossary of every tunable, every event, and every decree lives here in the next ticket. Close this dialog to return to the menu.',
  },
  'stub.close': {
    title: 'Close',
  },

  // -----------------------------------------------------------------------
  // Settings screen — T-037.
  // -----------------------------------------------------------------------
  'settings.heading': {
    title: 'Settings',
  },
  'settings.section.speed': {
    title: 'Default tick speed',
    body: 'The speed the engine boots at when you start a new game.',
  },
  'settings.section.tutorial': {
    title: 'Tutorial',
    body: 'Reset the tutorial flag so the tour re-runs on your next session.',
  },
  'settings.section.layout': {
    title: 'Panel layout',
    body: 'Restore all four panels to their factory default positions.',
  },
  'settings.section.language': {
    title: 'Language',
    body: 'Interface language.',
  },
  'settings.replay.label': {
    title: 'Replay tutorial',
    body: 'Clears the completion flag. The tour re-runs the next time you start a session.',
  },
  'settings.replay.confirmation': {
    title: 'Tutorial reset.',
    body: 'It runs again on your next session — start a new game (or quit + continue) to see it.',
  },
  'settings.resetLayout.label': {
    title: 'Reset panel layout',
    body: 'Restores all panels to their default positions. Takes effect on the next reload.',
  },
  'settings.resetLayout.confirmation': {
    title: 'Layout reset.',
    body: 'Panels return to default positions on the next reload.',
  },
  'settings.language.en': {
    title: 'English',
  },
  'settings.language.es': {
    title: 'Español',
  },
  'settings.language.es.banner': {
    title: 'Spanish not yet available',
    body: 'Spanish is coming in Phase 5. The interface will display in English until then.',
  },
  'settings.speed.pause': {
    title: 'Pause',
    body: 'Start every new game paused.',
  },
  'settings.speed.1x': {
    title: '1×',
    body: 'Normal speed (default).',
  },
  'settings.speed.2x': {
    title: '2×',
    body: 'Double speed.',
  },
  'settings.speed.4x': {
    title: '4×',
    body: 'Maximum speed.',
  },

  // -----------------------------------------------------------------------
  // Glossary / help screen — T-037.
  // -----------------------------------------------------------------------
  'glossary.heading': {
    title: 'Help & glossary',
    body: 'Definitions for every simulation concept. Search by term or description.',
  },
  'glossary.search.placeholder': {
    title: 'Search…',
  },
  'glossary.empty': {
    title: 'No matches',
    body: 'Try a shorter or different search term.',
  },

  // -----------------------------------------------------------------------
  // Pause overlay Settings / Help entries (added by T-037).
  // -----------------------------------------------------------------------
  'pause.action.settings': {
    title: 'Settings',
    body: 'Default speed, tutorial, layout.',
  },
  'pause.action.help': {
    title: 'Help & glossary',
    body: 'Definitions and game concepts.',
  },

  // -----------------------------------------------------------------------
  // Autosave error indicator (non-blocking, shown after Quit to menu when
  // localStorage.setItem throws — usually quota exceeded).
  // -----------------------------------------------------------------------
  'autosave.failure': {
    title: 'Autosave failed',
    body: 'Quota exceeded or storage unavailable. The transition still happened — the previous save (if any) is unchanged.',
  },
} as const satisfies Record<string, MenuEntry>
