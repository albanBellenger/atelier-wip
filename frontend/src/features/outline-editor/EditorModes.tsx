import type { ReactElement, ReactNode } from 'react'

import { Pill, StatLabel } from './atoms'
import type { OeBlock, OeContextGroup } from './types'
import { ContextItemRow } from './ContextItemRow'

function renderBoldSegments(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <strong key={`s-${k++}`} className="text-zinc-100">
        {m[1]}
      </strong>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : [text]
}

export function SuggestionBlock(props: {
  block: Extract<OeBlock, { type: 'ai-suggest' }>
  accent: string
  onAccept: () => void
  onReject: () => void
}): ReactElement {
  const b = props.block
  return (
    <div
      className="my-6 rounded-lg border p-4"
      style={{
        borderColor: `${props.accent}44`,
        backgroundColor: `${props.accent}12`,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Pill tone="violet" mono>
            AI
          </Pill>
          <span className="font-medium text-zinc-100">{b.title}</span>
          <span className="font-mono text-[10.5px] text-zinc-500">{b.originCmd}</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={props.onReject}
            className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={props.onAccept}
            className="rounded-md border border-emerald-600/50 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20"
          >
            Accept
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-1 font-mono text-[10.5px] leading-relaxed text-emerald-400">
        {b.additions.map((line) => (
          <div key={line}>{renderBoldSegments(line)}</div>
        ))}
      </div>
      <p className="mt-3 border-t border-zinc-800/60 pt-3 text-xs text-zinc-500">
        {b.rationale}
      </p>
    </div>
  )
}

function blocksToLines(blocks: OeBlock[]): { text: string; tone: 'h2' | 'h3' | 'body' }[] {
  const out: { text: string; tone: 'h2' | 'h3' | 'body' }[] = []
  for (const b of blocks) {
    if (b.type === 'h2') out.push({ text: `## ${b.text}`, tone: 'h2' })
    else if (b.type === 'h3') out.push({ text: `### ${b.text}`, tone: 'h3' })
    else if (b.type === 'p') out.push({ text: b.text, tone: 'body' })
    else if (b.type === 'ul') {
      for (const item of b.items) out.push({ text: `- ${item}`, tone: 'body' })
    } else if (b.type === 'ai-suggest') {
      out.push({ text: `<!-- ai-suggest: ${b.title} -->`, tone: 'body' })
    }
  }
  return out
}

export function CodeView(props: { blocks: OeBlock[] }): ReactElement {
  const lines = blocksToLines(props.blocks)
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[#0a0a0b]">
      <div className="w-10 shrink-0 overflow-hidden bg-[#08080a] py-4 text-right font-mono text-[10.5px] leading-6 text-zinc-600">
        {lines.map((_, i) => (
          <div key={i} className="pr-2">
            {i + 1}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto py-4 pr-4 font-mono text-[10.5px] leading-6">
        {lines.map((ln, i) => (
          <div
            key={i}
            className={
              ln.tone === 'h2'
                ? 'text-violet-400'
                : ln.tone === 'h3'
                  ? 'text-zinc-100'
                  : 'text-zinc-300'
            }
          >
            {ln.text}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Preview(props: {
  blocks: OeBlock[]
  accent: string
  onAcceptSuggestion: (id: string) => void
  onRejectSuggestion: (id: string) => void
}): ReactElement {
  return (
    <article className="w-full px-6 py-10">
      {props.blocks.map((b) => {
        if (b.type === 'h2') {
          return (
            <h2
              key={b.id}
              className="font-display text-[34px] font-normal leading-tight tracking-tight text-zinc-100"
            >
              {b.text}
            </h2>
          )
        }
        if (b.type === 'h3') {
          return (
            <h3
              key={b.id}
              className="mt-8 text-base font-semibold leading-snug text-zinc-100 first:mt-0"
            >
              {b.text}
            </h3>
          )
        }
        if (b.type === 'p') {
          return (
            <p
              key={b.id}
              className="mt-3 text-[14.5px] leading-relaxed text-zinc-300 first:mt-0"
            >
              {renderBoldSegments(b.text)}
            </p>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul key={b.id} className="mt-3 list-none space-y-1.5 pl-0 text-[14.5px] text-zinc-300">
              {b.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span
                    className="mt-2 h-1 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: props.accent }}
                  />
                  <span>{renderBoldSegments(item)}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <SuggestionBlock
            key={b.id}
            block={b}
            accent={props.accent}
            onAccept={() => props.onAcceptSuggestion(b.id)}
            onReject={() => props.onRejectSuggestion(b.id)}
          />
        )
      })}
    </article>
  )
}

export function Split(props: {
  blocks: OeBlock[]
  accent: string
  onAcceptSuggestion: (id: string) => void
  onRejectSuggestion: (id: string) => void
}): ReactElement {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-zinc-800/80 overflow-hidden">
      <div className="min-h-0 overflow-hidden">
        <CodeView blocks={props.blocks} />
      </div>
      <div className="flex min-h-0 flex-col overflow-y-auto">
        <Preview
          blocks={props.blocks}
          accent={props.accent}
          onAcceptSuggestion={props.onAcceptSuggestion}
          onRejectSuggestion={props.onRejectSuggestion}
        />
      </div>
    </div>
  )
}

export function ContextView(props: {
  groups: OeContextGroup[]
  totalTokens: number
  budget: number
  accent: string
  included: Record<string, boolean>
  onToggle: (id: string, pinned: boolean) => void
}): ReactElement {
  const pct = Math.min(100, Math.round((props.totalTokens / props.budget) * 100))
  return (
    <div className="w-full px-6 py-8">
      <h2 className="font-display text-2xl font-normal text-zinc-100">
        What the copilot sees
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Everything below is assembled into the prompt for this section, in this order. Toggle
        items off to free up budget. Pinned items are always included.
      </p>
      <div className="mt-6 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <StatLabel>Tokens</StatLabel>
          <span className="font-mono text-xs text-zinc-300">
            {props.totalTokens.toLocaleString()} / {props.budget.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: props.accent }}
          />
        </div>
      </div>
      <div className="mt-8 space-y-8">
        {props.groups.map((g) => (
          <section key={g.id}>
            <h3 className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
              {g.title}
            </h3>
            <div className="mt-3 space-y-2">
              {g.items.map((it) => (
                <ContextItemRow
                  key={it.id}
                  item={it}
                  accent={props.accent}
                  included={props.included[it.id] ?? true}
                  onToggle={() => props.onToggle(it.id, Boolean(it.pinned))}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-10 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 p-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
          Add to context
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Bring in another spec section, work order, or artifact for this section&apos;s working
          window.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            + Spec section
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            + Work order
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            + Artifact
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            + URL
          </button>
        </div>
      </div>
    </div>
  )
}
