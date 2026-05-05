import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Kbd } from './atoms'
import type { OeModel, OeSlash } from './types'

function ModelMenu(props: {
  open: boolean
  models: OeModel[]
  selectedIdx: number
  onSelect: (idx: number) => void
}): ReactElement | null {
  if (!props.open) return null
  return (
    <div className="absolute bottom-[calc(100%+4px)] left-0 right-0 z-20 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
      {props.models.map((m, i) => (
        <button
          key={m.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => props.onSelect(i)}
          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-900 ${
            i === props.selectedIdx ? 'bg-zinc-900/80 text-zinc-100' : 'text-zinc-400'
          }`}
        >
          <span className="font-mono">{m.short}</span>
          {m.tag ? (
            <span className="rounded border border-zinc-700 px-1 font-mono text-[9px] text-zinc-500">
              {m.tag}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function Composer(props: {
  slashEntries: OeSlash[]
  models: OeModel[]
  onSend: (text: string) => void
}): ReactElement {
  const [text, setText] = useState('')
  const [slashIdx, setSlashIdx] = useState(0)
  const [modelIdx, setModelIdx] = useState(2)
  const [modelOpen, setModelOpen] = useState(false)
  const [toolMode, setToolMode] = useState(false)
  const blurCloseRef = useRef<number | null>(null)

  const query = text.startsWith('/') ? text.slice(1) : ''
  const slashFiltered =
    text.startsWith('/') && query.length >= 0
      ? props.slashEntries.filter((e) => e.cmd.startsWith(query))
      : []
  const showSlash = text.startsWith('/') && slashFiltered.length > 0

  useEffect(() => {
    if (slashIdx >= slashFiltered.length) setSlashIdx(0)
  }, [slashFiltered.length, slashIdx])

  const send = useCallback(() => {
    const t = text.trim()
    if (!t) return
    props.onSend(t)
    setText('')
  }, [props, text])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlash) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIdx((i) => Math.min(slashFiltered.length - 1, i + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIdx((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const pick = slashFiltered[slashIdx]
        if (pick) setText(`/${pick.cmd} `)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      send()
    }
  }

  const closeModelLater = () => {
    if (blurCloseRef.current) window.clearTimeout(blurCloseRef.current)
    blurCloseRef.current = window.setTimeout(() => setModelOpen(false), 140)
  }

  return (
    <div className="shrink-0 border-t border-zinc-800/80 bg-[#0b0b0d] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/50 px-2 py-1.5">
        <p className="text-[11px] text-zinc-500">
          No selection — copilot will operate on the whole section.
        </p>
        <button
          type="button"
          className="shrink-0 font-mono text-[10px] text-violet-300 hover:text-violet-200"
        >
          Choose scope →
        </button>
      </div>
      <div className="relative">
        {showSlash ? (
          <div className="absolute bottom-full left-0 right-0 z-10 mb-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-lg">
            {slashFiltered.map((s, i) => (
              <button
                key={s.cmd}
                type="button"
                className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-900 ${
                  i === slashIdx ? 'bg-zinc-900' : ''
                }`}
                onMouseEnter={() => setSlashIdx(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setText(`/${s.cmd} `)}
              >
                <span className="font-mono text-xs text-violet-300">/{s.cmd}</span>
                <span className="text-xs text-zinc-500">{s.desc}</span>
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={closeModelLater}
          rows={3}
          placeholder="Ask the copilot, or type / for commands…"
          className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {props.slashEntries.slice(0, 4).map((s) => (
          <button
            key={s.cmd}
            type="button"
            onClick={() => setText(`/${s.cmd} `)}
            className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[9.5px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          >
            /{s.cmd}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900"
          >
            Attach
          </button>
          <button
            type="button"
            onClick={() => setToolMode((t) => !t)}
            className={`rounded-md border px-2 py-1 text-xs ${
              toolMode
                ? 'border-violet-500/50 bg-violet-500/10 text-violet-200'
                : 'border-zinc-800 text-zinc-400 hover:bg-zinc-900'
            }`}
          >
            Tool
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                if (blurCloseRef.current) window.clearTimeout(blurCloseRef.current)
                setModelOpen((o) => !o)
              }}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-300 hover:bg-zinc-900"
            >
              {props.models[modelIdx]?.short ?? 'model'}
            </button>
            <ModelMenu
              open={modelOpen}
              models={props.models}
              selectedIdx={modelIdx}
              onSelect={(i) => {
                setModelIdx(i)
                setModelOpen(false)
              }}
            />
          </div>
          <button
            type="button"
            onClick={send}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
          >
            Send
          </button>
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            <span className="text-[10px] text-zinc-500">Send</span>
          </span>
        </div>
      </div>
    </div>
  )
}
