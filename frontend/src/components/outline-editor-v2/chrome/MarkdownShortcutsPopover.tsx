import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'

import { Kbd } from '../atoms/Kbd'

export function MarkdownShortcutsPopover(props: {
  open: boolean
  onClose: () => void
}): ReactElement | null {
  const { open, onClose } = props
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
      id="markdown-shortcuts-popover-panel"
      data-testid="markdown-shortcuts-popover"
      className="absolute bottom-full right-0 z-50 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-300 shadow-xl"
      role="dialog"
      aria-label="Markdown shortcuts"
    >
      <p className="font-medium text-zinc-100">Markdown shortcuts</p>
      <p className="mt-1 leading-snug text-zinc-500">
        While typing, these patterns auto-format (Milkdown CommonMark input rules).
      </p>
      <ul className="mt-3 space-y-2.5">
        <li className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:pb-0">
          <span className="shrink-0 text-zinc-200">
            <Kbd>#</Kbd>
            <span className="mx-0.5 text-zinc-600">…</span>
            <Kbd>######</Kbd>
            <span className="mx-1 text-zinc-500">then</span>
            <Kbd>Space</Kbd>
            <span className="ml-1 text-zinc-500">at line start</span>
          </span>
          <span className="text-zinc-400">Heading (levels 1–6)</span>
        </li>
        <li className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:pb-0">
          <span className="shrink-0 font-mono text-zinc-200">
            <Kbd>**</Kbd>
            <span className="text-zinc-500">text</span>
            <Kbd>**</Kbd>
            <span className="mx-1.5 text-zinc-600">·</span>
            <Kbd>__</Kbd>
            <span className="text-zinc-500">text</span>
            <Kbd>__</Kbd>
          </span>
          <span className="text-zinc-400">Bold</span>
        </li>
        <li className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:pb-0">
          <span className="shrink-0 font-mono text-zinc-200">
            <Kbd>*</Kbd>
            <span className="text-zinc-500">text</span>
            <Kbd>*</Kbd>
            <span className="mx-1.5 text-zinc-600">·</span>
            <Kbd>_</Kbd>
            <span className="text-zinc-500">text</span>
            <Kbd>_</Kbd>
          </span>
          <span className="text-zinc-400">Italic</span>
        </li>
        <li className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:pb-0">
          <span className="shrink-0 font-mono text-zinc-200">
            <Kbd>`</Kbd>
            <span className="text-zinc-500">code</span>
            <Kbd>`</Kbd>
          </span>
          <span className="text-zinc-400">Inline code</span>
        </li>
        <li className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:pb-0">
          <span className="shrink-0 font-mono text-zinc-200">
            <Kbd>```</Kbd>
            <span className="text-zinc-500">lang</span>
            <span className="text-zinc-500"> then newline</span>
          </span>
          <span className="text-zinc-400">Fenced code block</span>
        </li>
        <li className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:pb-0">
          <span className="shrink-0 font-mono text-zinc-200">
            <Kbd>-</Kbd>
            <Kbd>Space</Kbd>
            <span className="mx-1 text-zinc-600">·</span>
            <Kbd>*</Kbd>
            <Kbd>Space</Kbd>
            <span className="mx-1 text-zinc-600">·</span>
            <Kbd>+</Kbd>
            <Kbd>Space</Kbd>
            <span className="ml-1 text-zinc-500">at line start</span>
          </span>
          <span className="text-zinc-400">Bullet list</span>
        </li>
        <li className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:pb-0">
          <span className="shrink-0 font-mono text-zinc-200">
            <Kbd>1.</Kbd>
            <Kbd>Space</Kbd>
            <span className="ml-1 text-zinc-500">at line start</span>
          </span>
          <span className="text-zinc-400">Numbered list</span>
        </li>
        <li className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:pb-0">
          <span className="shrink-0 font-mono text-zinc-200">
            <Kbd>{'>'}</Kbd>
            <Kbd>Space</Kbd>
            <span className="ml-1 text-zinc-500">at line start</span>
          </span>
          <span className="text-zinc-400">Blockquote</span>
        </li>
        <li className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <span className="shrink-0 font-mono text-zinc-200">
            <Kbd>---</Kbd>
            <span className="mx-1 text-zinc-600">·</span>
            <Kbd>___</Kbd>
            <Kbd>Space</Kbd>
            <span className="mx-1 text-zinc-600">·</span>
            <Kbd>***</Kbd>
            <Kbd>Space</Kbd>
          </span>
          <span className="text-zinc-400">Horizontal rule</span>
        </li>
      </ul>
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
