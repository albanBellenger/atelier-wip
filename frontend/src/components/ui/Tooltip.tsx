import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type TooltipSide = 'top' | 'bottom'

const FLOAT_GAP = 6
const VIEWPORT_PAD = 8
const TOOLTIP_MAX_W = 320
const INTERACTIVE_CLOSE_MS = 160

function computeFloatStyle(anchor: DOMRect, side: TooltipSide): CSSProperties {
  let left = anchor.left
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, window.innerWidth - TOOLTIP_MAX_W - VIEWPORT_PAD),
  )
  const base: CSSProperties = {
    position: 'fixed',
    left,
    zIndex: 10_000,
    minWidth: '12rem',
    maxWidth: 'min(20rem, calc(100vw - 16px))',
  }
  if (side === 'bottom') {
    return { ...base, top: anchor.bottom + FLOAT_GAP }
  }
  return {
    ...base,
    bottom: window.innerHeight - anchor.top + FLOAT_GAP,
  }
}

export function Tooltip(props: {
  content: ReactNode
  children: ReactNode
  className?: string
  side?: TooltipSide
  /** When true, renders children only (no hover tooltip). */
  disabled?: boolean
  /**
   * When false, the wrapper is not added to the tab order (use around buttons/links).
   * Keyboard focus on a descendant still opens the tooltip via focus capture.
   */
  accessibleTrigger?: boolean
  /**
   * When true, the floating panel receives pointer events (e.g. links) and stays open briefly
   * when moving the pointer from the trigger into the panel.
   */
  interactive?: boolean
}): ReactElement {
  const {
    content,
    children,
    className = '',
    side = 'bottom',
    disabled = false,
    accessibleTrigger = true,
    interactive = false,
  } = props
  const reactId = useId()
  const tooltipId = `tooltip-${reactId.replace(/:/g, '')}`
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [floatStyle, setFloatStyle] = useState<CSSProperties | undefined>(undefined)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = useCallback((): void => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback((): void => {
    clearCloseTimer()
    if (interactive) {
      closeTimerRef.current = setTimeout(() => setOpen(false), INTERACTIVE_CLOSE_MS)
    } else {
      setOpen(false)
    }
  }, [clearCloseTimer, interactive])

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  const syncPosition = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    setFloatStyle(computeFloatStyle(el.getBoundingClientRect(), side))
  }, [side])

  useLayoutEffect(() => {
    if (!open) {
      setFloatStyle(undefined)
      return
    }
    syncPosition()
    window.addEventListener('scroll', syncPosition, true)
    window.addEventListener('resize', syncPosition)
    return () => {
      window.removeEventListener('scroll', syncPosition, true)
      window.removeEventListener('resize', syncPosition)
    }
  }, [open, syncPosition])

  if (disabled) {
    return <span className={className}>{children}</span>
  }

  const describedBy = open ? tooltipId : undefined
  const triggerChild =
    accessibleTrigger || !isValidElement(children)
      ? children
      : cloneElement(children, {
          'aria-describedby': [describedBy, getAriaDescribedBy(children)]
            .filter(Boolean)
            .join(' ') || undefined,
        } as { 'aria-describedby'?: string })

  const pointerEventsClass = interactive ? 'pointer-events-auto' : 'pointer-events-none'

  const tooltipPanel =
    open && floatStyle ? (
      <span
        id={tooltipId}
        role="tooltip"
        style={floatStyle}
        className={`${pointerEventsClass} rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-left text-[11px] leading-snug text-zinc-200 shadow-lg`}
        onPointerEnter={
          interactive
            ? () => {
                clearCloseTimer()
                setOpen(true)
              }
            : undefined
        }
        onPointerLeave={interactive ? () => scheduleClose() : undefined}
      >
        {content}
      </span>
    ) : null

  return (
    <span
      ref={anchorRef}
      className={`relative inline-block max-w-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b] ${className}`}
      tabIndex={accessibleTrigger ? 0 : undefined}
      aria-describedby={accessibleTrigger ? describedBy : undefined}
      onPointerEnter={() => {
        clearCloseTimer()
        setOpen(true)
      }}
      onPointerLeave={() => {
        if (interactive) {
          scheduleClose()
        } else {
          setOpen(false)
        }
      }}
      onFocusCapture={() => {
        clearCloseTimer()
        setOpen(true)
      }}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null
        if (!next || !e.currentTarget.contains(next)) {
          clearCloseTimer()
          setOpen(false)
        }
      }}
    >
      {triggerChild}
      {typeof document !== 'undefined' && tooltipPanel
        ? createPortal(tooltipPanel, document.body)
        : null}
    </span>
  )
}

function getAriaDescribedBy(el: ReactElement): string | undefined {
  const p = el.props as { 'aria-describedby'?: string }
  return p['aria-describedby']
}
