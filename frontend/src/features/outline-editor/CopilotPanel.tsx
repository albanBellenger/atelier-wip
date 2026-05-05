import type { ReactElement } from 'react'
import { useState } from 'react'

import { ChatStream } from './ChatStream'
import { Composer } from './Composer'
import { ContextTabPanel } from './ContextTabPanel'
import { CritiqueList } from './CritiqueList'
import { DiffList } from './DiffList'
import { SourcesList } from './SourcesList'
import type {
  OeContextGroup,
  OeCritique,
  OeModel,
  OePendingDiff,
  OeSlash,
  OeSource,
  OeThreadMsg,
} from './types'

type Tab = 'chat' | 'critique' | 'diff' | 'context' | 'sources'

export function CopilotPanel(props: {
  thread: OeThreadMsg[]
  onSend: (text: string) => void
  critique: OeCritique[]
  diffs: OePendingDiff[]
  onAcceptDiff: (d: OePendingDiff) => void
  onRejectDiff: (d: OePendingDiff) => void
  contextGroups: OeContextGroup[]
  contextTotal: number
  contextBudget: number
  contextIncluded: Record<string, boolean>
  onContextToggle: (id: string, pinned: boolean) => void
  sources: OeSource[]
  slash: OeSlash[]
  models: OeModel[]
  accent: string
}): ReactElement {
  const [tab, setTab] = useState<Tab>('chat')
  const chatCount = props.thread.length
  const critiqueCount = props.critique.length
  const diffCount = props.diffs.length

  const tabBtn = (t: Tab, label: ReactElement, extra?: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-xs font-medium ${
        tab === t
          ? 'border-violet-500 text-zinc-100'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      } ${extra ?? ''}`}
    >
      {label}
    </button>
  )

  return (
    <aside className="flex h-[min(80vh,720px)] min-h-0 w-[420px] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            Live · scoped to this section
          </p>
        </div>
      </div>
      <div className="flex min-h-0 shrink-0 overflow-x-auto border-b border-zinc-800">
        {tabBtn(
          'chat',
          <>
            Chat
            <span className="rounded-full bg-zinc-800 px-1.5 font-mono text-[9.5px] text-zinc-400">
              {chatCount}
            </span>
          </>,
        )}
        {tabBtn(
          'critique',
          <>
            Critique
            <span className="rounded-full bg-rose-500/20 px-1.5 font-mono text-[9.5px] text-rose-300">
              {critiqueCount}
            </span>
          </>,
        )}
        {tabBtn(
          'diff',
          <>
            Diff
            <span className="rounded-full bg-violet-500/20 px-1.5 font-mono text-[9.5px] text-violet-300">
              {diffCount}
            </span>
          </>,
        )}
        {tabBtn(
          'context',
          <>
            Context
            <span className="rounded-full bg-cyan-500/15 px-1.5 font-mono text-[9.5px] text-cyan-300">
              {props.contextGroups.reduce((n, g) => n + g.items.length, 0)}
            </span>
          </>,
        )}
        {tabBtn(
          'sources',
          <>
            Sources
            <span className="rounded-full bg-zinc-800 px-1.5 font-mono text-[9.5px] text-zinc-400">
              {props.sources.length}
            </span>
          </>,
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#0b0b0d]">
        {tab === 'chat' ? <ChatStream thread={props.thread} /> : null}
        {tab === 'critique' ? <CritiqueList items={props.critique} /> : null}
        {tab === 'diff' ? (
          <DiffList
            diffs={props.diffs}
            onAccept={props.onAcceptDiff}
            onReject={props.onRejectDiff}
          />
        ) : null}
        {tab === 'context' ? (
          <ContextTabPanel
            groups={props.contextGroups}
            totalTokens={props.contextTotal}
            budget={props.contextBudget}
            accent={props.accent}
            included={props.contextIncluded}
            onToggle={props.onContextToggle}
          />
        ) : null}
        {tab === 'sources' ? <SourcesList sources={props.sources} /> : null}
      </div>
      <Composer slashEntries={props.slash} models={props.models} onSend={props.onSend} />
    </aside>
  )
}
