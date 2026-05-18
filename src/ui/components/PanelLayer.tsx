// T-034 — Floating panel layer.
//
// Mounts the four player panels as draggable + resizable cards. Layout state
// (positions + sizes) is read from `mandate.layout.v1` during the initial
// render to avoid a flash-of-default-position; subsequent drags / resizes
// persist immediately on stop.
//
// This component owns:
//   - the per-panel layout map,
//   - the `subscribeLayoutReset` listener that snaps everything back to
//     defaults when `resetPanelLayout()` fires (from the keyboard shortcut OR
//     T-037's settings button),
//   - the reset-layout keyboard shortcut (Cmd/Ctrl + Shift + L).
//
// Composition:
//   <PanelLayer>
//     <PanelShell id="overview">    <OverviewPanel />  </PanelShell>
//     <PanelShell id="economy">     <EconomyPanel />   </PanelShell>
//     <PanelShell id="society">     <SocietyPanel />   </PanelShell>
//     <PanelShell id="politics">    <PoliticsPanel />  </PanelShell>
//   </PanelLayer>
//
// PanelShell is rendered as a DIRECT child of `.panel-layer` (no intermediate
// wrapper element). This is load-bearing: react-rnd's `bounds="parent"`
// resolves to the DOM `parentElement` via `getBoundingClientRect()`, and any
// wrapper with `display: contents` returns a zero-rect which clamps every
// drag to (0,0). Mount fade-in is a pure CSS animation on `.panel-shell`
// (App.css) so it doesn't need to live in the DOM tree above the Rnd.
//
// Reduced-motion for the mount animation is handled by App.css's
// `@media (prefers-reduced-motion: reduce)` rule. The per-panel motion-aware
// surfaces (KPI tweens, event-feed slide-in) still use framer-motion's
// `useReducedMotion()` directly inside their respective components.

import { useCallback, useEffect, useState } from 'react'

import { EconomyPanel } from '@ui/panels/EconomyPanel'
import { OverviewPanel } from '@ui/panels/OverviewPanel'
import { PoliticsPanel } from '@ui/panels/PoliticsPanel'
import { SocietyPanel } from '@ui/panels/SocietyPanel'
import { PanelShell } from '@ui/components/PanelShell'
import {
  defaultLayout,
  loadLayout,
  resetPanelLayout,
  saveLayout,
  subscribeLayoutReset,
  type LayoutState,
  type PanelId,
  type PanelLayout,
} from '@ui/theme/layout'
import { RESET_LAYOUT_KEYBIND } from '@ui/theme/tokens'

/**
 * Compare a keyboard event against the named keybinding spec. `metaKey ||
 * ctrlKey` so the same shortcut works on Mac (Cmd) and Linux/Windows (Ctrl).
 * Key comparison is case-insensitive because `event.key` returns `'L'` when
 * Shift is held and `'l'` otherwise — both should match.
 */
function matchesKeybind(
  event: KeyboardEvent,
  bind: typeof RESET_LAYOUT_KEYBIND,
): boolean {
  if (event.key.toUpperCase() !== bind.key.toUpperCase()) return false
  if (event.shiftKey !== bind.shift) return false
  const metaPressed = event.metaKey || event.ctrlKey
  if (metaPressed !== bind.meta) return false
  return true
}

/**
 * Render the four floating panels. The host element is positioned `relative`
 * so the inner `Rnd` instances (which are `position: absolute`) anchor to
 * this surface, not to the viewport.
 *
 * We pull the initial layout from `loadLayout()` during the lazy `useState`
 * initializer — synchronous, no `useEffect` — so the first frame already
 * reflects the persisted positions (AC: "no flash-of-unstyled-content on
 * cold load").
 */
export function PanelLayer() {
  // Synchronous load — `loadLayout()` falls back to token defaults on any
  // parse / version / missing-key issue.
  const [layout, setLayout] = useState<LayoutState>(() => loadLayout())

  // Persist layout updates. The handler is memoized so PanelShell sees a
  // stable callback reference (it doesn't matter functionally — PanelShell is
  // not memoized — but keeps re-render reasoning simple).
  const handleLayoutChange = useCallback(
    (id: PanelId, next: PanelLayout) => {
      setLayout((prev) => {
        const merged: LayoutState = {
          version: 1,
          panels: { ...prev.panels, [id]: next },
        }
        saveLayout(merged)
        return merged
      })
    },
    [],
  )

  // Listen for layout-reset notifications. The `resetPanelLayout()` function
  // clears the persisted entry; this listener re-applies the token defaults
  // locally so the on-screen panels snap back without a remount.
  useEffect(() => {
    const unsubscribe = subscribeLayoutReset(() => {
      setLayout(defaultLayout())
    })
    return unsubscribe
  }, [])

  // Cmd/Ctrl + Shift + L → reset layout. Bound on `window` so the shortcut
  // works no matter which surface has focus. Teardown on unmount keeps the
  // listener count bounded across hot reloads.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (matchesKeybind(event, RESET_LAYOUT_KEYBIND)) {
        event.preventDefault()
        resetPanelLayout()
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [])

  // Panel render order: matches `PANEL_IDS` (stable + alphabetic-ish). Each
  // entry maps to a panel component + display title for the drag handle.
  const PANELS: ReadonlyArray<{
    id: PanelId
    title: string
    Body: React.ComponentType
  }> = [
    { id: 'overview', title: 'Overview', Body: OverviewPanel },
    { id: 'economy', title: 'Economy', Body: EconomyPanel },
    { id: 'society', title: 'Society', Body: SocietyPanel },
    { id: 'politics', title: 'Politics', Body: PoliticsPanel },
  ]

  return (
    <div className="panel-layer" data-testid="panel-layer">
      {PANELS.map(({ id, title, Body }, idx) => (
        <PanelShell
          key={id}
          panelId={id}
          title={title}
          layout={layout.panels[id]}
          onLayoutChange={handleLayoutChange}
          mountIndex={idx}
        >
          <Body />
        </PanelShell>
      ))}
    </div>
  )
}
