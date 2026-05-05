import type { ReactElement } from 'react'

import { Dot } from './atoms'
import type { OeEditorMode } from './types'

export function ModeSwitch(props: {
  mode: OeEditorMode
  onChange: (m: OeEditorMode) => void
}): ReactElement {
  const opts: { key: OeEditorMode; label: string }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'split', label: 'Split' },
    { key: 'code', label: 'Markdown' },
    { key: 'context', label: 'Context' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950/80 p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            props.mode === o.key
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SectionHeader(props: {
  title: string
  slug: string
  collaboratorCount: number
  accent: string
  mode: OeEditorMode
  onModeChange: (m: OeEditorMode) => void
  focus: boolean
  onFocus: () => void
  onExitFocus: () => void
}): ReactElement {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#0a0a0b] px-6 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-normal tracking-tight text-zinc-100">
            {props.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 font-mono text-[10.5px] text-zinc-400">
              {props.slug}
            </span>
            <span className="text-xs text-zinc-500">
              Private · {props.collaboratorCount}{' '}
              {props.collaboratorCount === 1 ? 'collaborator' : 'collaborators'}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Dot tone="emerald" />
              Saved
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ModeSwitch mode={props.mode} onChange={props.onModeChange} />
        {props.focus ? (
          <button
            type="button"
            onClick={props.onExitFocus}
            className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Exit focus
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onFocus}
            className="rounded-md border px-3 py-1.5 text-xs text-zinc-100 hover:opacity-90"
            style={{
              borderColor: `${props.accent}66`,
              backgroundColor: `${props.accent}22`,
            }}
          >
            Focus
          </button>
        )}
      </div>
    </div>
  )
}
