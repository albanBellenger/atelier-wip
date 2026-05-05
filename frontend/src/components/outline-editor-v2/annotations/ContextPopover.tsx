import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'

export function ContextPopover(props: {
  open: boolean
  onClose: () => void
  tokenUsed: number
  tokenBudget: number
}): ReactElement | null {
  const { open, onClose, tokenUsed, tokenBudget } = props
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div
      ref={ref}
      data-testid="context-popover"
      className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-300 shadow-xl"
      role="dialog"
      aria-label="Context budget"
    >
      <p className="font-medium text-zinc-100">Thread context budget</p>
      <p className="mt-2 text-zinc-400">
        Using {tokenUsed.toLocaleString()} of {tokenBudget.toLocaleString()} tokens
        in the default RAG preview for this section (same as Context tab preview).
      </p>
      <button
        type="button"
        className="mt-3 text-violet-400 hover:underline"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  )
}
