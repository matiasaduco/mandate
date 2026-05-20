// T-037 — Settings screen.
//
// Replaces the T-036 stub with a full implementation. The stub from T-033
// carried a "Replay tutorial" button — that button is lifted here with the
// same `data-testid` and the same `clearOnboardingCompleted()` handler so
// the T-033 AC#4 test path continues to work unchanged.
//
// Four settings sections:
//   1. Default tick speed — Pause / 1× / 2× / 4× (SPEEDS from tunables).
//      Persisted to `mandate.settings.v1` on selection.
//   2. Replay tutorial — clears `mandate.onboarding.v1.completed`.
//   3. Reset panel layout — calls `resetPanelLayout()` from T-034.
//   4. Language — stub toggle en / es. Persists; renders an in-screen banner
//      when `language === 'es'` ("coming Phase 5").
//
// Dismissal contract (inherited from T-036 stub):
//   - Esc → onClose
//   - Backdrop click → onClose
//   - Close button → onClose
//
// Storage: `mandate.settings.v1` is independent of the save, layout, and
// onboarding keys — resetting a save does NOT reset settings.

import { useEffect, useRef, useState } from 'react'

import { SPEEDS } from '@engine/tunables'
import { MENU_COPY } from '@ui/copy/menu'
import { clearOnboardingCompleted } from '@ui/onboarding/tour'
import { resetPanelLayout } from '@ui/theme/layout'
import {
  loadSettings,
  saveSettings,
  type SettingsState,
} from '@ui/theme/settings'

export type SettingsProps = {
  /** Called when the player dismisses via Close button, Esc, or backdrop. */
  onClose: () => void
}

/**
 * Map from numeric speed value to the MENU_COPY label key.
 * Keeps the render loop declarative — one `SPEEDS.map(...)` generates all
 * four radio buttons without per-value branches.
 */
const SPEED_LABEL_KEYS: Record<number, keyof typeof MENU_COPY> = {
  0: 'settings.speed.pause',
  1: 'settings.speed.1x',
  2: 'settings.speed.2x',
  4: 'settings.speed.4x',
}

export function Settings({ onClose }: SettingsProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // Initialise from persisted settings — synchronous read.
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings())

  // One-shot confirmation messages.
  const [replayed, setReplayed] = useState<boolean>(false)
  const [layoutReset, setLayoutReset] = useState<boolean>(false)

  // Esc dismisses — document-level listener so focus position does not matter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus Close on mount for keyboard / screen-reader users.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // ---- handlers ------------------------------------------------------------

  const handleSpeedChange = (speed: 0 | 1 | 2 | 4) => {
    const next: SettingsState = { ...settings, defaultTickSpeed: speed }
    setSettings(next)
    saveSettings(next)
  }

  const handleReplayTutorial = () => {
    clearOnboardingCompleted()
    setReplayed(true)
  }

  const handleResetLayout = () => {
    resetPanelLayout()
    setLayoutReset(true)
  }

  const handleLanguageChange = (language: 'en' | 'es') => {
    const next: SettingsState = { ...settings, language }
    setSettings(next)
    saveSettings(next)
  }

  // ---- render --------------------------------------------------------------

  return (
    <div
      className="menu-stub__backdrop"
      data-testid="settings-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="menu-stub settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-heading"
        data-testid="settings"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-heading" className="menu-stub__heading">
          {MENU_COPY['settings.heading'].title}
        </h2>

        {/* ---- Default tick speed ---------------------------------------- */}
        <section
          className="settings__section"
          aria-labelledby="settings-speed-heading"
          data-testid="settings-speed-section"
        >
          <h3 id="settings-speed-heading" className="settings__section-heading">
            {MENU_COPY['settings.section.speed'].title}
          </h3>
          <p className="settings__section-body">
            {MENU_COPY['settings.section.speed'].body}
          </p>
          <div
            className="settings__speed-buttons"
            role="radiogroup"
            aria-label={MENU_COPY['settings.section.speed'].title}
          >
            {(SPEEDS as readonly (0 | 1 | 2 | 4)[]).map((speed) => {
              const labelKey = SPEED_LABEL_KEYS[speed]
              const entry = MENU_COPY[labelKey]
              return (
                <button
                  key={speed}
                  type="button"
                  role="radio"
                  aria-checked={settings.defaultTickSpeed === speed}
                  className={
                    settings.defaultTickSpeed === speed
                      ? 'settings__speed-btn settings__speed-btn--active'
                      : 'settings__speed-btn'
                  }
                  onClick={() => handleSpeedChange(speed)}
                  data-testid={`settings-speed-${speed}`}
                >
                  <span className="settings__speed-label">{entry.title}</span>
                  {'body' in entry && entry.body ? (
                    <span className="settings__speed-body">{entry.body}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>

        {/* ---- Language --------------------------------------------------- */}
        <section
          className="settings__section"
          aria-labelledby="settings-language-heading"
          data-testid="settings-language-section"
        >
          <h3 id="settings-language-heading" className="settings__section-heading">
            {MENU_COPY['settings.section.language'].title}
          </h3>
          <p className="settings__section-body">
            {MENU_COPY['settings.section.language'].body}
          </p>
          <div
            className="settings__language-buttons"
            role="radiogroup"
            aria-label={MENU_COPY['settings.section.language'].title}
          >
            {(['en', 'es'] as const).map((lang) => {
              const labelKey =
                lang === 'en' ? 'settings.language.en' : 'settings.language.es'
              return (
                <button
                  key={lang}
                  type="button"
                  role="radio"
                  aria-checked={settings.language === lang}
                  className={
                    settings.language === lang
                      ? 'settings__lang-btn settings__lang-btn--active'
                      : 'settings__lang-btn'
                  }
                  onClick={() => handleLanguageChange(lang)}
                  data-testid={`settings-language-${lang}`}
                >
                  {MENU_COPY[labelKey].title}
                </button>
              )
            })}
          </div>
          {settings.language === 'es' ? (
            <div
              className="settings__banner"
              role="status"
              data-testid="settings-language-es-banner"
            >
              <strong>{MENU_COPY['settings.language.es.banner'].title}</strong>
              {' — '}
              {MENU_COPY['settings.language.es.banner'].body}
            </div>
          ) : null}
        </section>

        {/* ---- Tutorial --------------------------------------------------- */}
        <section
          className="settings__section"
          aria-labelledby="settings-tutorial-heading"
          data-testid="settings-tutorial-section"
        >
          <h3 id="settings-tutorial-heading" className="settings__section-heading">
            {MENU_COPY['settings.section.tutorial'].title}
          </h3>
          <p className="settings__section-body">
            {MENU_COPY['settings.section.tutorial'].body}
          </p>
          <button
            type="button"
            className="settings__action-btn"
            onClick={handleReplayTutorial}
            data-testid="settings-replay-tutorial"
          >
            {MENU_COPY['settings.replay.label'].title}
          </button>
          {replayed ? (
            <p
              className="settings__confirmation"
              role="status"
              data-testid="settings-replay-confirmation"
            >
              <strong>{MENU_COPY['settings.replay.confirmation'].title}</strong>
              {' '}
              {MENU_COPY['settings.replay.confirmation'].body}
            </p>
          ) : null}
        </section>

        {/* ---- Panel layout ----------------------------------------------- */}
        <section
          className="settings__section"
          aria-labelledby="settings-layout-heading"
          data-testid="settings-layout-section"
        >
          <h3 id="settings-layout-heading" className="settings__section-heading">
            {MENU_COPY['settings.section.layout'].title}
          </h3>
          <p className="settings__section-body">
            {MENU_COPY['settings.section.layout'].body}
          </p>
          <button
            type="button"
            className="settings__action-btn"
            onClick={handleResetLayout}
            data-testid="settings-reset-layout"
          >
            {MENU_COPY['settings.resetLayout.label'].title}
          </button>
          {layoutReset ? (
            <p
              className="settings__confirmation"
              role="status"
              data-testid="settings-layout-reset-confirmation"
            >
              <strong>{MENU_COPY['settings.resetLayout.confirmation'].title}</strong>
              {' '}
              {MENU_COPY['settings.resetLayout.confirmation'].body}
            </p>
          ) : null}
        </section>

        {/* ---- Close ------------------------------------------------------- */}
        <button
          ref={closeRef}
          type="button"
          className="menu-stub__close"
          onClick={onClose}
          data-testid="settings-close"
        >
          {MENU_COPY['stub.close'].title}
        </button>
      </div>
    </div>
  )
}
