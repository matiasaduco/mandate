// T-036 — Settings stub.
//
// T-037 fills this in with volume, motion preferences, accessibility, etc.
// For now it's a keyboard-reachable modal that renders the placeholder copy
// from `MENU_COPY['stub.settings']` and a Close button. Esc dismisses.
//
// T-033 — Stub now also carries a "Replay tutorial" button. Clicking it
// clears `mandate.onboarding.v1.completed` so the next mount of the playing
// dashboard re-launches the tour from step 1. The Settings host (MainMenu
// or the pause overlay) closes itself after the click so the player can
// quit-to-menu + new-game to see the tour, or — when the pause overlay
// hosts Settings later — resume into a fresh tour.

import { useEffect, useRef, useState } from 'react'

import { MENU_COPY } from '@ui/copy/menu'
import { clearOnboardingCompleted } from '@ui/onboarding/tour'

export type SettingsProps = {
  /** Called when the player dismisses via Close button, Esc, or backdrop. */
  onClose: () => void
}

export function Settings({ onClose }: SettingsProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  // T-033 — Replay confirmation flash. The button writes to localStorage
  // synchronously, but the host (MainMenu / pause overlay) only re-checks
  // on its next mount. We surface a one-line confirmation so the click
  // doesn't feel inert.
  const [replayed, setReplayed] = useState<boolean>(false)

  // Esc dismisses. Document-level listener so the modal catches the key even
  // if focus is elsewhere (defensive — focus normally lands on Close on
  // mount via the autoFocus below).
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

  // Move focus to Close on mount so screen readers announce the modal and
  // keyboard users can dismiss without hunting.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const handleReplayTutorial = () => {
    clearOnboardingCompleted()
    setReplayed(true)
  }

  return (
    <div
      className="menu-stub__backdrop"
      data-testid="settings-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="menu-stub"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-heading"
        data-testid="settings"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-heading" className="menu-stub__heading">
          {MENU_COPY['stub.settings'].title}
        </h2>
        <p className="menu-stub__body">{MENU_COPY['stub.settings'].body}</p>
        {/* T-033 — Replay tutorial stub. T-037 will fold this into the full
            settings panel; for now it lives next to the placeholder copy
            so the AC#4 path (Settings → Replay → tour relaunches) is
            reachable through the menu. */}
        <button
          type="button"
          className="menu-stub__close"
          onClick={handleReplayTutorial}
          data-testid="settings-replay-tutorial"
        >
          Replay tutorial
        </button>
        {replayed ? (
          <p
            className="menu-stub__body"
            data-testid="settings-replay-confirmation"
            role="status"
          >
            Tutorial reset. It runs again on your next session — start a new
            game (or quit + continue) to see it.
          </p>
        ) : null}
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
