// T-036 — Main menu screen.
//
// First thing the player sees when launching the game. Renders four primary
// actions:
//   - New game: country picker (Aurelia only in Phase 1) + seed input. The
//     seed field is optional; when the "Use seed" toggle is off, a random
//     32-bit unsigned int is drawn from `crypto.getRandomValues`.
//   - Continue: enabled when `localStorage.getItem(AUTOSAVE_KEY)`
//     deserializes successfully. Disabled (with explanatory text) otherwise.
//     Re-evaluated on every mount.
//   - Settings: stub modal — "Settings (T-037)". Dismissible via Esc or
//     close button. Wired here for keyboard reachability AC.
//   - Help: stub modal — "Help (T-037)". Same shape as Settings.
//
// No "Quit" button: the menu is the start of the in-browser app, and
// `beforeunload` is intentionally NOT wired (per the Phase 1.5 brief).
// Future desktop / Electron build can re-introduce a Quit action; comment
// flagged below.
//
// Engine ↔ UI: this component never touches the engine directly. It calls
// `store.getState().bootEngine({ seed })` (or `bootEngineFromSave`) to
// transition out of the menu route. The actual engine construction and event
// wiring live in `gameStore.ts`.

import { useState } from 'react'

import { deserialize, SaveLoadError } from '@engine'
import { MENU_COPY } from '@ui/copy/menu'
import { Glossary } from '@ui/screens/Glossary'
import { Settings } from '@ui/screens/Settings'
import {
  AUTOSAVE_KEY,
  getGameStore,
  pickRandomSeed,
  type GameStore,
} from '@ui/stores/gameStore'

/**
 * Lowest accepted seed value. The PRNG (`mulberry32`) is defined for any
 * 32-bit input; the brief locks the legal range to `[1, 4294967295]` so the
 * field rejects 0 and negatives.
 */
const SEED_MIN = 1
/** Highest accepted seed value — 32-bit unsigned max. */
const SEED_MAX = 4_294_967_295

type StubScreen = 'settings' | 'help' | null

export type MainMenuProps = {
  /** Optional store override for tests. App code resolves the singleton. */
  store?: GameStore
}

/**
 * Defensive: peek at `localStorage` for an autosave and try to deserialize.
 * Returns true only on success. Any failure (no key, parse error, version
 * mismatch) yields false — Continue is disabled.
 *
 * Re-evaluated every mount so a Quit-to-menu transition that wrote a fresh
 * save in between renders immediately enables Continue.
 */
function checkSaveAvailable(): boolean {
  if (typeof window === 'undefined') return false
  let raw: string | null
  try {
    raw = window.localStorage.getItem(AUTOSAVE_KEY)
  } catch {
    return false
  }
  if (raw === null) return false
  try {
    deserialize(raw)
    return true
  } catch {
    // Save corruption: pretend there's no save. Per Edge Cases in the brief:
    // a corrupted save must NOT crash the menu.
    return false
  }
}

export function MainMenu({ store }: MainMenuProps) {
  // Resolve the store ONCE per render — same pattern as TopBar (T-021).
  const resolved: GameStore = store ?? getGameStore()

  // --- Continue button state ---------------------------------------------
  // Re-evaluated on mount via lazy initializer (the AC #2 path: play → quit
  // → continue triggers a re-mount of MainMenu when the App routes back to
  // `menu`, so the lazy init is what re-checks). The setter is also used by
  // the Continue handler when a load attempt fails (corrupt save).
  const [continueAvailable, setContinueAvailable] = useState<boolean>(() =>
    checkSaveAvailable(),
  )

  // --- New-game form state -----------------------------------------------
  // The "Use seed" toggle reveals a numeric input; default off → random seed
  // each time the player clicks Start. When ON, the field's value drives the
  // boot. Random preview text shows the seed the player would actually get
  // (refreshed on every render — purely informational).
  const [view, setView] = useState<'root' | 'new-game'>('root')
  const [useSeed, setUseSeed] = useState<boolean>(false)
  const [seedInput, setSeedInput] = useState<string>('')
  const [seedError, setSeedError] = useState<string | null>(null)
  const [continueError, setContinueError] = useState<string | null>(null)

  // Re-randomize the preview seed each time MainMenu mounts. We keep it in
  // state with a lazy initializer so subsequent re-renders (e.g. typing in
  // the seed field) don't churn the preview. The handler that flips to the
  // new-game view doesn't reset this — the player sees the same preview
  // number across the form lifetime.
  const [previewRandomSeed] = useState<number>(() => pickRandomSeed())

  // --- Stub modals (Settings / Help) -------------------------------------
  const [stub, setStub] = useState<StubScreen>(null)
  // Esc closes whichever stub is open. App-level Esc handling lives in
  // App.tsx for the pause overlay; the stubs each take responsibility for
  // themselves so the menu screen alone is enough to dismiss them.

  // --- Handlers ----------------------------------------------------------

  const handleStart = () => {
    setSeedError(null)
    let seed: number
    if (useSeed) {
      const parsed = Number(seedInput.trim())
      if (
        !Number.isFinite(parsed) ||
        !Number.isInteger(parsed) ||
        parsed < SEED_MIN ||
        parsed > SEED_MAX
      ) {
        setSeedError(
          `Seed must be an integer between ${SEED_MIN} and ${SEED_MAX}.`,
        )
        return
      }
      seed = parsed
    } else {
      seed = pickRandomSeed()
    }
    resolved.getState().bootEngine({ seed })
  }

  const handleContinue = () => {
    setContinueError(null)
    if (typeof window === 'undefined') return
    let raw: string | null
    try {
      raw = window.localStorage.getItem(AUTOSAVE_KEY)
    } catch {
      setContinueError('Storage unavailable. Continue is disabled.')
      return
    }
    if (raw === null) {
      setContinueError('No autosave found.')
      setContinueAvailable(false)
      return
    }
    try {
      resolved.getState().bootEngineFromSave(raw)
    } catch (cause) {
      if (cause instanceof SaveLoadError) {
        setContinueError(`Continue failed: ${cause.message}`)
      } else {
        const message = cause instanceof Error ? cause.message : String(cause)
        setContinueError(`Continue failed: ${message}`)
      }
      // The save is unloadable → disable Continue so the player isn't
      // trapped clicking a broken button.
      setContinueAvailable(false)
    }
  }

  // --- Render ------------------------------------------------------------

  if (view === 'new-game') {
    return (
      <main className="menu" data-testid="main-menu" aria-label="New game">
        <div className="menu__inner">
          <header className="menu__header">
            <h1 className="menu__heading" data-testid="menu-heading">
              {MENU_COPY['newGame.heading'].title}
            </h1>
            <p className="menu__subheading">
              {MENU_COPY['newGame.heading'].body}
            </p>
          </header>

          <section className="menu__form" aria-labelledby="country-heading">
            <h2 id="country-heading" className="menu__form-heading">
              {MENU_COPY['newGame.country.heading'].title}
            </h2>
            <p className="menu__form-body">
              {MENU_COPY['newGame.country.heading'].body}
            </p>
            <div className="menu__country-card" data-testid="country-aurelia">
              <span className="menu__country-name">Aurelia</span>
              <span className="menu__country-analogue">Argentina-analogue</span>
            </div>
          </section>

          <section className="menu__form" aria-labelledby="seed-heading">
            <h2 id="seed-heading" className="menu__form-heading">
              {MENU_COPY['newGame.seed.heading'].title}
            </h2>
            <p className="menu__form-body">
              {MENU_COPY['newGame.seed.heading'].body}
            </p>

            <label className="menu__seed-toggle">
              <input
                type="checkbox"
                checked={useSeed}
                onChange={(e) => {
                  setUseSeed(e.target.checked)
                  setSeedError(null)
                }}
                data-testid="seed-toggle"
              />
              <span>{MENU_COPY['newGame.seed.useToggle'].title}</span>
            </label>

            {useSeed ? (
              <div className="menu__seed-field">
                <label htmlFor="seed-input" className="menu__seed-label">
                  {MENU_COPY['newGame.seed.field'].title}
                </label>
                <input
                  id="seed-input"
                  type="number"
                  inputMode="numeric"
                  min={SEED_MIN}
                  max={SEED_MAX}
                  step={1}
                  value={seedInput}
                  onChange={(e) => {
                    setSeedInput(e.target.value)
                    setSeedError(null)
                  }}
                  data-testid="seed-input"
                  placeholder={String(previewRandomSeed)}
                />
                {seedError !== null && (
                  <span
                    className="menu__seed-error"
                    role="alert"
                    data-testid="seed-error"
                  >
                    {seedError}
                  </span>
                )}
              </div>
            ) : (
              <p className="menu__seed-random" data-testid="seed-random-note">
                {MENU_COPY['newGame.seed.random'].body}
              </p>
            )}
          </section>

          <div className="menu__actions">
            <button
              type="button"
              className="menu__btn menu__btn--secondary"
              onClick={() => setView('root')}
              data-testid="back-button"
            >
              {MENU_COPY['newGame.back'].title}
            </button>
            <button
              type="button"
              className="menu__btn menu__btn--primary"
              onClick={handleStart}
              data-testid="start-button"
            >
              {MENU_COPY['newGame.start'].title}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="menu" data-testid="main-menu" aria-label="Main menu">
      <div className="menu__inner">
        <header className="menu__header">
          <h1 className="menu__heading" data-testid="menu-heading">
            {MENU_COPY['menu.title'].title}
          </h1>
          <p className="menu__subheading">{MENU_COPY['menu.title'].body}</p>
          <p className="menu__tagline">{MENU_COPY['menu.subtitle'].title}</p>
        </header>

        <nav className="menu__actions-stack" aria-label="Main menu actions">
          <button
            type="button"
            className="menu__action"
            onClick={() => setView('new-game')}
            data-testid="new-game-button"
          >
            <span className="menu__action-title">
              {MENU_COPY['menu.action.newGame'].title}
            </span>
            <span className="menu__action-body">
              {MENU_COPY['menu.action.newGame'].body}
            </span>
          </button>

          <button
            type="button"
            className="menu__action"
            onClick={handleContinue}
            disabled={!continueAvailable}
            data-testid="continue-button"
            title={
              continueAvailable
                ? undefined
                : 'No autosave found. Start a new game to create one.'
            }
          >
            <span className="menu__action-title">
              {MENU_COPY['menu.action.continue'].title}
            </span>
            <span className="menu__action-body">
              {continueAvailable
                ? MENU_COPY['menu.action.continue'].body
                : 'No autosave found. Start a new game to create one.'}
            </span>
          </button>

          {continueError !== null && (
            <span
              className="menu__error"
              role="alert"
              data-testid="continue-error"
            >
              {continueError}
            </span>
          )}

          <button
            type="button"
            className="menu__action"
            onClick={() => setStub('settings')}
            data-testid="settings-button"
          >
            <span className="menu__action-title">
              {MENU_COPY['menu.action.settings'].title}
            </span>
            <span className="menu__action-body">
              {MENU_COPY['menu.action.settings'].body}
            </span>
          </button>

          <button
            type="button"
            className="menu__action"
            onClick={() => setStub('help')}
            data-testid="help-button"
          >
            <span className="menu__action-title">
              {MENU_COPY['menu.action.help'].title}
            </span>
            <span className="menu__action-body">
              {MENU_COPY['menu.action.help'].body}
            </span>
          </button>

          {/* No "Quit" button in the browser build — the menu is the front
              door of the in-browser app and `beforeunload` is deliberately
              not wired. A future desktop / Electron build can re-introduce
              a Quit action here. */}
        </nav>
      </div>

      {stub === 'settings' && (
        <Settings onClose={() => setStub(null)} />
      )}
      {stub === 'help' && <Glossary onClose={() => setStub(null)} />}
    </main>
  )
}
