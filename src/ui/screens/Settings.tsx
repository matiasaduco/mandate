// T-036 — Settings stub.
//
// T-037 fills this in with volume, motion preferences, accessibility, etc.
// For now it's a keyboard-reachable modal that renders the placeholder copy
// from `MENU_COPY['stub.settings']` and a Close button. Esc dismisses.

import { useEffect, useRef } from 'react'

import { MENU_COPY } from '@ui/copy/menu'

export type SettingsProps = {
  /** Called when the player dismisses via Close button, Esc, or backdrop. */
  onClose: () => void
}

export function Settings({ onClose }: SettingsProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

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
