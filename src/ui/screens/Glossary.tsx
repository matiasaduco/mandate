// T-036 — Help / glossary stub.
//
// Mirror of Settings.tsx — different copy, same dismissal contract (Esc /
// backdrop / Close button). T-037 fills in the real glossary content.

import { useEffect, useRef } from 'react'

import { MENU_COPY } from '@ui/copy/menu'

export type GlossaryProps = {
  /** Called when the player dismisses via Close button, Esc, or backdrop. */
  onClose: () => void
}

export function Glossary({ onClose }: GlossaryProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

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

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      className="menu-stub__backdrop"
      data-testid="glossary-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="menu-stub"
        role="dialog"
        aria-modal="true"
        aria-labelledby="glossary-heading"
        data-testid="glossary"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="glossary-heading" className="menu-stub__heading">
          {MENU_COPY['stub.help'].title}
        </h2>
        <p className="menu-stub__body">{MENU_COPY['stub.help'].body}</p>
        <button
          ref={closeRef}
          type="button"
          className="menu-stub__close"
          onClick={onClose}
          data-testid="glossary-close"
        >
          {MENU_COPY['stub.close'].title}
        </button>
      </div>
    </div>
  )
}
