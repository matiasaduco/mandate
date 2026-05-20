// T-037 — Help / glossary screen.
//
// Replaces the T-036 stub with a scrollable, searchable index of every
// `Glossary.md` term. Content comes from `src/ui/copy/glossary.ts` — the
// canonical typed map that mirrors the vault. Drift between the vault and
// glossary.ts is caught by `test/ui/glossary.drift.spec.ts`.
//
// Features:
//   - Alphabetically sorted list of all glossary entries.
//   - Search box: substring match on term name OR body text (case-insensitive).
//   - Empty query → full list.
//   - No results → "no matches" message.
//
// Dismissal contract (same as T-036 stub):
//   - Esc → onClose
//   - Backdrop click → onClose
//   - Close button → onClose

import { useEffect, useRef, useState } from 'react'

import { MENU_COPY } from '@ui/copy/menu'
import { GLOSSARY } from '@ui/copy/glossary'

export type GlossaryProps = {
  /** Called when the player dismisses via Close button, Esc, or backdrop. */
  onClose: () => void
}

/** Sorted entry list derived once at module load — stable across renders. */
const SORTED_ENTRIES = Object.entries(GLOSSARY).sort(([, a], [, b]) =>
  a.term.localeCompare(b.term),
)

export function Glossary({ onClose }: GlossaryProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const [query, setQuery] = useState<string>('')

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

  // Filter: case-insensitive substring on term name OR body.
  const needle = query.trim().toLowerCase()
  const visibleEntries =
    needle === ''
      ? SORTED_ENTRIES
      : SORTED_ENTRIES.filter(
          ([, entry]) =>
            entry.term.toLowerCase().includes(needle) ||
            entry.body.toLowerCase().includes(needle),
        )

  return (
    <div
      className="menu-stub__backdrop"
      data-testid="glossary-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="menu-stub glossary"
        role="dialog"
        aria-modal="true"
        aria-labelledby="glossary-heading"
        data-testid="glossary"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="glossary__header">
          <h2 id="glossary-heading" className="menu-stub__heading">
            {MENU_COPY['glossary.heading'].title}
          </h2>
          <p className="glossary__subheading">
            {MENU_COPY['glossary.heading'].body}
          </p>
        </header>

        {/* Search box */}
        <div className="glossary__search-row">
          <label htmlFor="glossary-search" className="visually-hidden">
            {MENU_COPY['glossary.search.placeholder'].title}
          </label>
          <input
            id="glossary-search"
            type="search"
            className="glossary__search"
            placeholder={MENU_COPY['glossary.search.placeholder'].title}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="glossary-search"
            aria-label={MENU_COPY['glossary.search.placeholder'].title}
          />
        </div>

        {/* Entry list */}
        <div
          className="glossary__list"
          role="list"
          aria-live="polite"
          aria-label="Glossary entries"
          data-testid="glossary-list"
        >
          {visibleEntries.length === 0 ? (
            <p className="glossary__empty" data-testid="glossary-empty">
              <strong>{MENU_COPY['glossary.empty'].title}</strong>
              {' — '}
              {MENU_COPY['glossary.empty'].body}
            </p>
          ) : (
            visibleEntries.map(([key, entry]) => (
              <div
                key={key}
                className="glossary__entry"
                role="listitem"
                data-testid={`glossary-entry-${key}`}
              >
                <dt className="glossary__term">{entry.term}</dt>
                <dd className="glossary__body">{entry.body}</dd>
              </div>
            ))
          )}
        </div>

        {/* Close */}
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
