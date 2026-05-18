// T-032 — Project-wide tooltip primitive.
//
// Thin wrapper around `@radix-ui/react-tooltip` that:
//   - opens on hover AND keyboard focus (Radix default — kept explicit here so
//     a future regression is visible),
//   - dismisses on Escape and click-outside (Radix default),
//   - returns focus to the trigger on Escape (Radix default — verified by
//     `test/ui/Tooltip.spec.tsx`),
//   - exposes `aria-describedby` on the trigger (Radix wires this when the
//     content renders),
//   - reads its copy from `src/ui/copy/tooltips.ts` so canonical strings are
//     never duplicated inline in components,
//   - applies a 300 ms open delay (matches the Phase 1.5 brief — long enough
//     not to fire on incidental cursor passes, short enough not to feel
//     sluggish on intentional hovers).
//
// Motion: the brief calls for a CSS fade as a placeholder for T-032 with
// framer-motion installed alongside as scope-prep for T-034. We expose a
// `motionVariant` prop (`"fade"` default, `"scale-fade"`) and animate the
// content via `motion.div` so T-034 only has to extend the variant table.
//
// The component intentionally does NOT take a free-form `content` prop. The
// caller passes a `tooltipKey` whose value is looked up in `tooltips.ts`. This
// is the AC #2 enforcement point: literal strings cannot reach the rendered
// tooltip without first being entered into the copy source.

import {
  Provider as RadixTooltipProvider,
  Root as RadixTooltipRoot,
  Trigger as RadixTooltipTrigger,
  Portal as RadixTooltipPortal,
  Content as RadixTooltipContent,
  Arrow as RadixTooltipArrow,
} from '@radix-ui/react-tooltip'
import { motion, type Transition } from 'framer-motion'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

import {
  TOOLTIPS,
  type TooltipKey,
} from '@ui/copy/tooltips'

/** Animation hook. T-034 will add more variants here. */
export type TooltipMotionVariant = 'fade' | 'scale-fade'

type MotionPreset = {
  initial: Record<string, number>
  animate: Record<string, number>
  exit: Record<string, number>
  transition: Transition
}

const MOTION_VARIANTS: Record<TooltipMotionVariant, MotionPreset> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.12, ease: 'easeOut' },
  },
  'scale-fade': {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: { duration: 0.14, ease: 'easeOut' },
  },
}

/** Default open delay (ms). The Phase 1.5 brief locks this at 300 ms. */
export const TOOLTIP_OPEN_DELAY_MS = 300

export type TooltipProps = {
  /**
   * Key into `tooltips.ts`. Resolved verbatim at render. If the key is missing
   * we render the trigger with no tooltip surface (defensive — no inline
   * copy leaks to the DOM).
   */
  tooltipKey: TooltipKey
  /**
   * The trigger element. Must be a single React element (Radix uses
   * `asChild` to forward refs and aria attributes onto it). If you need to
   * wrap text, wrap it in a `<span>` at the call site.
   */
  children: ReactElement
  /** Animation hook. Defaults to `"fade"`. */
  motionVariant?: TooltipMotionVariant
  /**
   * Optional: where to anchor the popover relative to the trigger. Mirrors
   * Radix's `side` prop. Defaults to `"top"` per Radix.
   */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /**
   * Optional override for the open delay (ms). Tests pass `0` so the tooltip
   * appears synchronously after a hover event.
   */
  openDelayMs?: number
}

/**
 * Render the tooltip body. Split out so the motion wrapper can stay clean and
 * so tests can assert the structure of the surface without touching motion
 * internals.
 */
function TooltipBody({
  title,
  body,
  affects,
}: {
  title: string
  body: string
  affects?: readonly string[]
}) {
  return (
    <div className="tooltip__body" data-testid="tooltip-body">
      <div className="tooltip__title">{title}</div>
      <p className="tooltip__text">{body}</p>
      {affects !== undefined && affects.length > 0 ? (
        <ul className="tooltip__affects" data-testid="tooltip-affects">
          {affects.map((a) => (
            <li key={a} className="tooltip__affects-item">
              {a}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * Project-level tooltip. See file header for the contract. The single
 * `children` element is the trigger — it must be a focusable element so the
 * tooltip is keyboard-reachable (Radix annotates this on `asChild`).
 */
export function Tooltip({
  tooltipKey,
  children,
  motionVariant = 'fade',
  side = 'top',
  openDelayMs = TOOLTIP_OPEN_DELAY_MS,
}: TooltipProps) {
  // Cast through a single readonly entry shape — the `as const satisfies`
  // declaration in tooltips.ts gives each entry its own literal type, so
  // `affects` only narrows on the variant where it is present. The cast
  // collapses the union so the rest of the function can branch on the field
  // uniformly without disjunction noise.
  type RuntimeEntry = {
    readonly title: string
    readonly body: string
    readonly affects?: readonly string[]
  }
  const entry = (TOOLTIPS as unknown as Record<string, RuntimeEntry | undefined>)[
    tooltipKey
  ]
  // Defensive: if a caller passes a key that isn't in the map (should not be
  // possible under strict TS but still — the test suite checks for this), we
  // render the trigger naked rather than swallowing it.
  if (entry === undefined || !isValidElement(children)) {
    return children
  }

  const variant = MOTION_VARIANTS[motionVariant]

  return (
    <RadixTooltipProvider delayDuration={openDelayMs}>
      <RadixTooltipRoot>
        <RadixTooltipTrigger asChild>
          {/* Tag the trigger element for tests with a stable data-tooltip-key.
              We clone the child to add the attribute non-destructively — any
              data-* props on the original element survive. */}
          {cloneElement(
            children,
            // The trigger element receives its own existing props (Radix will
            // wire aria-describedby + ref via the asChild branch). We layer on
            // a stable test hook so tests can scope queries to a specific
            // tooltip surface without depending on visible text.
            { 'data-tooltip-key': tooltipKey } as Record<string, unknown>,
          ) as ReactNode}
        </RadixTooltipTrigger>
        <RadixTooltipPortal>
          <RadixTooltipContent
            side={side}
            sideOffset={6}
            className="tooltip"
            data-testid={`tooltip-${tooltipKey}`}
            data-tooltip-key={tooltipKey}
          >
            <motion.div
              initial={variant.initial}
              animate={variant.animate}
              exit={variant.exit}
              transition={variant.transition}
              className="tooltip__motion"
            >
              <TooltipBody
                title={entry.title}
                body={entry.body}
                affects={entry.affects}
              />
              <RadixTooltipArrow className="tooltip__arrow" />
            </motion.div>
          </RadixTooltipContent>
        </RadixTooltipPortal>
      </RadixTooltipRoot>
    </RadixTooltipProvider>
  )
}
