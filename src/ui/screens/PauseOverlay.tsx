// T-036 — Pause overlay.
// T-037 — Added Settings / Help local modal entries.
//
// Mounted by App.tsx when `route.kind === 'paused-menu'`. The route
// transition itself pauses the engine (`setSpeed(0)`); this component owns
// the visual + the five actions: Resume, Restart, Quit, Settings, Help.
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
//   - Settings button → opens Settings component overlaid on the overlay;
//     Esc returns to the overlay (not all the way to playing).
//   - Help button → opens Glossary component overlaid on the overlay;
//     Esc returns to the overlay.
//
// Focus trap is minimal — first focusable element (Resume) is focused on
// mount; Tab cycles through the primary actions. The Restart confirmation
// modal and Settings / Help modals own their own focus when open.
//
// T-037 — local stub state is 'settings' | 'help' | null, mirroring the
// MainMenu.tsx pattern. The nested Settings / Glossary components receive
// an onClose that returns to the overlay (stub = null), NOT all the way to
// the playing route. Their internal Esc handlers still call onClose so the
// layer stack clears properly.

import { useEffect, useRef, useState } from 'react'

import { MENU_COPY } from '@ui/copy/menu'
import { Glossary } from '@ui/screens/Glossary'
import { Settings } from '@ui/screens/Settings'
import {
  getGameStore,
  type GameStore,
} from '@ui/stores/gameStore'

type StubScreen = 'settings' | 'help' | null

export type PauseOverlayProps = {
  /** Optional store override for tests. App code resolves the singleton. */
  store?: GameStore
}

export function PauseOverlay({ store }: PauseOverlayProps) {
  const resolved: GameStore = store ?? getGameStore()
  const resumeRef = useRef<HTMLButtonElement | null>(null)
  const [confirmRestart, setConfirmRestart] = useState<boolean>(false)
  // T-037 — local modal state for Settings / Help, mirroring MainMenu.tsx.
  const [stub, setStub] = useState<StubScreen>(null)

  const onResume = () => resolved.getState().resumeFromPause()
  const onRestart = () => setConfirmRestart(true)
  const onConfirmRestart = () => {
    resolved.getState().restartGame()
    setConfirmRestart(false)
  }
  const onCancelRestart = () => setConfirmRestart(false)
  const onQuit = () => resolved.getState().quitToMenu()

  // Esc dismisses the overlay (returns to playing) unless a sub-modal is
  // open. When the restart confirmation or Settings/Help modal is open,
  // Esc closes the inner layer first — one Esc per layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (stub !== null) {
        // Settings / Help handle their own Esc via their internal listeners;
        // they call onClose which sets stub back to null. This handler is a
        // fallback — the component's listener fires first because it was
        // added later (LIFO for same-phase listeners). Leave this here as a
        // belt-and-suspenders but do not expect it to fire in practice.
        setStub(null)
      } else if (confirmRestart) {
        onCancelRestart()
      } else {
        onResume()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmRestart, stub])

  // Focus Resume on mount so keyboard users can dismiss with a single
  // Enter / Space after Esc.
  useEffect(() => {
    resumeRef.current?.focus()
  }, [])

  // When Settings or Help is open, render them overlaid on top of the
  // pause overlay. They receive an onClose that returns to the overlay
  // (stub = null), NOT to the playing route.
  if (stub === 'settings') {
    return <Settings onClose={() => setStub(null)} />
  }
  if (stub === 'help') {
    return <Glossary onClose={() => setStub(null)} />
  }

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

          {/* T-037 — Settings and Help buttons mirroring MainMenu.tsx */}
          <button
            type="button"
            className="pause-overlay__btn"
            onClick={() => setStub('settings')}
            data-testid="pause-settings"
          >
            <span className="pause-overlay__btn-title">
              {MENU_COPY['pause.action.settings'].title}
            </span>
            <span className="pause-overlay__btn-body">
              {MENU_COPY['pause.action.settings'].body}
            </span>
          </button>

          <button
            type="button"
            className="pause-overlay__btn"
            onClick={() => setStub('help')}
            data-testid="pause-help"
          >
            <span className="pause-overlay__btn-title">
              {MENU_COPY['pause.action.help'].title}
            </span>
            <span className="pause-overlay__btn-body">
              {MENU_COPY['pause.action.help'].body}
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
