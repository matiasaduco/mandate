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
//   - the reset-layout keyboard shortcut (Cmd/Ctrl + Shift + L),
//   - the panel mount stagger-fade animation.
//
// Composition:
//   <PanelLayer>
//     <PanelShell id="overview">    <OverviewPanel />  </PanelShell>
//     <PanelShell id="economy">     <EconomyPanel />   </PanelShell>
//     <PanelShell id="society">     <SocietyPanel />   </PanelShell>
//     <PanelShell id="politics">    <PoliticsPanel />  </PanelShell>
//   </PanelLayer>
//
// Reduced-motion: each panel's mount transition uses framer-motion's
// `useReducedMotion()` hook indirectly via the `transition` field, which
// framer-motion clamps to instant when the user's `prefers-reduced-motion`
// media query matches. The test `reducedMotion.spec.tsx` verifies the
// integration.

import { motion, useReducedMotion } from 'framer-motion'
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
import {
  EASE_OUT_CUBIC,
  MOTION_PANEL_MOUNT_MS,
  MOTION_PANEL_STAGGER_MS,
  RESET_LAYOUT_KEYBIND,
} from '@ui/theme/tokens'

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

  const reducedMotion = useReducedMotion()

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

  // Per-panel mount animation. Stagger via `delay = index * STAGGER_MS`. When
  // `reducedMotion` is true (matched media query), framer-motion treats the
  // transition as instant — we additionally zero the `duration` and `delay`
  // explicitly so the test can assert reduced-motion behaviour by inspecting
  // the transition object directly.
  const mountTransition = (index: number) => {
    if (reducedMotion === true) {
      return { duration: 0, delay: 0 }
    }
    return {
      duration: MOTION_PANEL_MOUNT_MS / 1000,
      delay: (index * MOTION_PANEL_STAGGER_MS) / 1000,
      ease: EASE_OUT_CUBIC,
    }
  }

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
        <motion.div
          key={id}
          // `position: absolute` on the wrapper keeps the layer's natural flow
          // intact while still letting framer-motion own the mount transform.
          // The Rnd inside positions itself absolutely as well — they nest.
          initial={reducedMotion === true ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={mountTransition(idx)}
          className="panel-layer__entry"
          data-testid={`panel-layer-entry-${id}`}
        >
          <PanelShell
            panelId={id}
            title={title}
            layout={layout.panels[id]}
            onLayoutChange={handleLayoutChange}
          >
            <Body />
          </PanelShell>
        </motion.div>
      ))}
    </div>
  )
}
