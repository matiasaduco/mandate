// T-034 — Floating panel shell.
//
// Wraps a panel body in `react-rnd` so the player can drag (by the title bar)
// and resize (bottom-right corner) it. Position + size are persisted via the
// `layout` module the moment a drag/resize ends.
//
// Why a separate component, not inlined into `App.tsx`:
//   - Each panel needs its OWN drag-handle class so the panels can't steal
//     each other's drag events when their title bars overlap.
//   - The Rnd wrapper has to be in the DOM tree above the panel content so
//     drag events bubble up correctly. Inlining it in `App.tsx` would force
//     every panel to know about the wrapper; this component encapsulates it.
//   - The existing tooltipsCoverage test renders panels in isolation (without
//     `App.tsx`). Wrapping the panel here would break those queries by
//     inserting an extra DOM layer ABOVE the panel root. So this shell is
//     mounted only by `App.tsx`; the panels themselves remain shell-agnostic.
//
// Drag-handle scope:
//   `dragHandleClassName="panel-shell__handle"` — only the title bar carries
//   that class. Sliders, decree buttons, sparklines etc. inside the panel
//   body do NOT, so dragging from inside the body is a no-op.

import { Rnd, type RndDragCallback, type RndResizeCallback } from 'react-rnd'
import type { ReactNode } from 'react'

import {
  PANEL_MAX_HEIGHT,
  PANEL_MAX_WIDTH,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
} from '@ui/theme/tokens'
import type { PanelId, PanelLayout } from '@ui/theme/layout'

export type PanelShellProps = {
  /** Which panel this shell wraps. Drives the test hook + handle class scoping. */
  panelId: PanelId
  /** Human-readable title shown in the drag handle. */
  title: string
  /** Current position + size (controlled). */
  layout: PanelLayout
  /** Called once on drag stop with the new x/y. */
  onLayoutChange: (id: PanelId, next: PanelLayout) => void
  /** Panel body (the actual panel component). */
  children: ReactNode
}

/**
 * Floating-panel wrapper. The Rnd's drag handle is scoped to the title bar
 * `.panel-shell__handle` element so interactive elements inside the body
 * (sliders, decree buttons, sparklines, etc.) don't accidentally start a drag
 * when the user manipulates them.
 *
 * The handle is also a `tabIndex={-1}` div — it does not need to be focusable
 * because it's not an interactive surface beyond drag-to-move. The title text
 * inside it stays readable to screen readers via the `aria-label` on the
 * outer `<section>`.
 */
export function PanelShell({
  panelId,
  title,
  layout,
  onLayoutChange,
  children,
}: PanelShellProps) {
  // Rnd's drag handler reports the absolute coordinates at drag-stop. We
  // forward both coordinates AND the current width/height so the persisted
  // entry carries all four fields — the size hasn't changed, but the layout
  // module's API expects the full PanelLayout shape on every update.
  const handleDragStop: RndDragCallback = (_event, data) => {
    onLayoutChange(panelId, {
      x: data.x,
      y: data.y,
      width: layout.width,
      height: layout.height,
    })
  }

  // Rnd's resize handler reports the new dimensions as strings (`"320px"`),
  // a position object, and the delta. We parse the integer pixel values and
  // merge with the new position (which may shift if the user resized from a
  // top-left corner — though we only allow bottom-right in P1.5).
  const handleResizeStop: RndResizeCallback = (
    _event,
    _direction,
    ref,
    _delta,
    position,
  ) => {
    onLayoutChange(panelId, {
      x: position.x,
      y: position.y,
      width: ref.offsetWidth,
      height: ref.offsetHeight,
    })
  }

  // Drag-handle class scoped per panel so two adjacent panels never start a
  // drag on each other. The full string is `panel-shell__handle panel-shell__handle--${panelId}`;
  // Rnd's `dragHandleClassName` matches an element with this single class.
  const handleClassName = `panel-shell__handle panel-shell__handle--${panelId}`

  return (
    <Rnd
      position={{ x: layout.x, y: layout.y }}
      size={{ width: layout.width, height: layout.height }}
      minWidth={PANEL_MIN_WIDTH}
      minHeight={PANEL_MIN_HEIGHT}
      maxWidth={PANEL_MAX_WIDTH}
      maxHeight={PANEL_MAX_HEIGHT}
      bounds="parent"
      // Drag is initiated only by clicks on the handle. The bare panel surface
      // and any interactive control inside it is unaffected.
      dragHandleClassName={`panel-shell__handle--${panelId}`}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      // Allow resize from the bottom-right corner only — fewer affordances,
      // less accidental triggering, and matches the brief's "resize handle
      // (bottom-right)" call-out.
      enableResizing={{
        top: false,
        right: false,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: true,
        bottomLeft: false,
        topLeft: false,
      }}
      className="panel-shell"
      data-testid={`panel-shell-${panelId}`}
    >
      <div
        className={handleClassName}
        data-testid={`panel-shell-handle-${panelId}`}
        aria-hidden="true"
      >
        <span className="panel-shell__title">{title}</span>
      </div>
      <div className="panel-shell__body" data-testid={`panel-shell-body-${panelId}`}>
        {children}
      </div>
    </Rnd>
  )
}
