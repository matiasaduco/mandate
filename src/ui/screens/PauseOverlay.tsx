// T-036 — Pause overlay.
//
// Mounted by App.tsx when `route.kind === 'paused-menu'`. The route
// transition itself pauses the engine (`setSpeed(0)`); this component owns
// the visual + the three actions: Resume, Restart, Quit to menu.
//
// Dismissal contract:
//   - Esc → resumeFromPause
//   - Backdrop click → resumeFromPause (same as Esc; matches the modal
//     conventions used by Settings / Glossary)
//   - Resume button → resumeFromPause
//   - Restart button → opens a confirmation modal; confirming calls
//     restartGame (dispose + boot fresh engine with same seed). Cancel
//     closes the modal but leaves the overlay open.
//   - Quit button → quitToMenu (autosaves before tearing down)
//
// Focus trap is minimal — first focusable element (Resume) is focused on
// mount; Tab cycles through the three primary actions. The Restart
// confirmation modal owns its own focus when open.

import { useEffect, useRef, useState } from 'react'

import { MENU_COPY } from '@ui/copy/menu'
import {
  getGameStore,
  type GameStore,
} from '@ui/stores/gameStore'

export type PauseOverlayProps = {
  /** Optional store override for tests. App code resolves the singleton. */
  store?: GameStore
}

export function PauseOverlay({ store }: PauseOverlayProps) {
  const resolved: GameStore = store ?? getGameStore()
  const resumeRef = useRef<HTMLButtonElement | null>(null)
  const [confirmRestart, setConfirmRestart] = useState<boolean>(false)

  const onResume = () => resolved.getState().resumeFromPause()
  const onRestart = () => setConfirmRestart(true)
  const onConfirmRestart = () => {
    resolved.getState().restartGame()
    setConfirmRestart(false)
  }
  const onCancelRestart = () => setConfirmRestart(false)
  const onQuit = () => resolved.getState().quitToMenu()

  // Esc dismisses the overlay (returns to playing). When the restart
  // confirmation is open, Esc closes the confirmation first — one Esc per
  // layer, matches the user's mental model.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (confirmRestart) {
        onCancelRestart()
      } else {
        onResume()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // onResume / onCancelRestart capture nothing mutable beyond the route
    // transition; safe to declare static deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmRestart])

  // Focus Resume on mount so keyboard users can dismiss with a single
  // Enter / Space after Esc.
  useEffect(() => {
    resumeRef.current?.focus()
  }, [])

  return (
    <div
      className="pause-overlay__backdrop"
      data-testid="pause-overlay-backdrop"
      onClick={onResume}
      role="presentation"
    >
      <div
        className="pause-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-heading"
        data-testid="pause-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pause-overlay__header">
          <h2 id="pause-heading" className="pause-overlay__heading">
            {MENU_COPY['pause.heading'].title}
          </h2>
          <p className="pause-overlay__body">{MENU_COPY['pause.heading'].body}</p>
        </header>

        <div className="pause-overlay__actions">
          <button
            ref={resumeRef}
            type="button"
            className="pause-overlay__btn pause-overlay__btn--primary"
            onClick={onResume}
            data-testid="pause-resume"
          >
            <span className="pause-overlay__btn-title">
              {MENU_COPY['pause.action.resume'].title}
            </span>
            <span className="pause-overlay__btn-body">
              {MENU_COPY['pause.action.resume'].body}
            </span>
          </button>

          <button
            type="button"
            className="pause-overlay__btn"
            onClick={onRestart}
            data-testid="pause-restart"
          >
            <span className="pause-overlay__btn-title">
              {MENU_COPY['pause.action.restart'].title}
            </span>
            <span className="pause-overlay__btn-body">
              {MENU_COPY['pause.action.restart'].body}
            </span>
          </button>

          <button
            type="button"
            className="pause-overlay__btn"
            onClick={onQuit}
            data-testid="pause-quit"
          >
            <span className="pause-overlay__btn-title">
              {MENU_COPY['pause.action.quit'].title}
            </span>
            <span className="pause-overlay__btn-body">
              {MENU_COPY['pause.action.quit'].body}
            </span>
          </button>
        </div>
      </div>

      {confirmRestart && (
        <div
          className="pause-overlay__confirm-backdrop"
          data-testid="restart-confirm-backdrop"
          onClick={onCancelRestart}
          role="presentation"
        >
          <div
            className="pause-overlay__confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="restart-confirm-heading"
            data-testid="restart-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="restart-confirm-heading"
              className="pause-overlay__confirm-heading"
            >
              {MENU_COPY['restart.heading'].title}
            </h3>
            <p className="pause-overlay__confirm-body">
              {MENU_COPY['restart.heading'].body}
            </p>
            <div className="pause-overlay__confirm-actions">
              <button
                type="button"
                className="pause-overlay__btn pause-overlay__btn--secondary"
                onClick={onCancelRestart}
                data-testid="restart-cancel"
              >
                {MENU_COPY['restart.cancel'].title}
              </button>
              <button
                type="button"
                className="pause-overlay__btn pause-overlay__btn--primary"
                onClick={onConfirmRestart}
                data-testid="restart-confirm-button"
              >
                {MENU_COPY['restart.confirm'].title}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
