import type { ReactElement } from 'react'
import { useMemo } from 'react'

import {
  parseThreadComposerInput,
  type ParsedComposerInput,
} from '../../lib/threadSlashCommand'

function slashSummary(parsed: ParsedComposerInput): ReactElement | null {
  if (parsed.kind === 'improve_section') {
    return (
      <p
        className="mb-2 text-xs text-violet-300"
        data-testid="slash-command-chip"
      >
        Runs <span className="font-mono">structured improve</span> (API) — not
        the chat stream.
      </p>
    )
  }
  if (parsed.kind === 'stream' && parsed.command === 'critique') {
    return (
      <p
        className="mb-2 text-xs text-violet-300"
        data-testid="slash-command-chip"
      >
        Uses <span className="font-mono">critique</span> stream mode.
      </p>
    )
  }
  if (
    parsed.kind === 'stream' &&
    parsed.command === 'none' &&
    parsed.threadIntent !== 'ask'
  ) {
    return (
      <p
        className="mb-2 text-xs text-violet-300"
        data-testid="slash-command-chip"
      >
        Intent <span className="font-mono">{parsed.threadIntent}</span> (slash)
      </p>
    )
  }
  return null
}

export function CopilotComposer(props: {
  draft: string
  canSend: boolean
  sending: boolean
  improving: boolean
  replaceBlocked: boolean
  replaceBlockedReason?: string
  includeSelectionInContext: boolean
  includeGitHistory: boolean
  selectionChars: number
  hasSelection: boolean
  onDraftChange: (v: string) => void
  onSend: () => void
  onClearEditorSelection: () => void
  onToggleSelection: () => void
  onToggleGitHistory: () => void
  onInsertSlash: (prefix: string) => void
  /** Shown on the same row as the Send affordance (e.g. inline model line). */
  footerLeading?: ReactElement | null
}): ReactElement {
  const {
    draft,
    canSend,
    sending,
    improving,
    replaceBlocked,
    replaceBlockedReason,
    includeSelectionInContext,
    includeGitHistory,
    selectionChars,
    hasSelection,
    onDraftChange,
    onSend,
    onClearEditorSelection,
    onToggleSelection,
    onToggleGitHistory,
    onInsertSlash,
    footerLeading,
  } = props

  const parsed = useMemo(() => parseThreadComposerInput(draft), [draft])
  const chip = slashSummary(parsed)

  return (
    <div className="shrink-0 border-t border-zinc-800 p-2">
      <div className="mb-2 flex flex-wrap gap-1">
        {(['/improve', '/append', '/replace', '/edit'] as const).map((p) => (
          <button
            key={p}
            type="button"
            disabled={sending || improving}
            className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-violet-700 hover:text-violet-200 disabled:opacity-50"
            onClick={() => onInsertSlash(`${p} `)}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          title="Include current editor selection in LLM context for this send"
          disabled={sending || improving}
          className={`rounded border px-1.5 py-0.5 text-sm ${
            includeSelectionInContext
              ? 'border-violet-600 bg-violet-950/40 text-violet-200'
              : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
          }`}
          aria-pressed={includeSelectionInContext}
          onClick={() => onToggleSelection()}
        >
          📎
        </button>
        <button
          type="button"
          title="Include recent GitLab history in context for this send"
          disabled={sending || improving}
          className={`rounded border px-1.5 py-0.5 text-sm ${
            includeGitHistory
              ? 'border-violet-600 bg-violet-950/40 text-violet-200'
              : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
          }`}
          aria-pressed={includeGitHistory}
          onClick={() => onToggleGitHistory()}
        >
          🕓
        </button>
      </div>
      {chip}
      {hasSelection && selectionChars > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-200">
            Selection: {selectionChars} chars
          </span>
          <button
            type="button"
            className="text-violet-400 hover:underline"
            onClick={() => onClearEditorSelection()}
          >
            Clear selection (editor)
          </button>
        </div>
      ) : (
        <p className="mb-2 text-[11px] text-zinc-600">
          No selection — select text in the editor to narrow context or use{' '}
          <span className="font-mono">/replace</span>.
        </p>
      )}
      <textarea
        className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
        rows={3}
        placeholder="Ask the copilot to write…"
        value={draft}
        disabled={sending}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            if (
              !draft.trim() ||
              sending ||
              improving ||
              replaceBlocked ||
              !canSend
            ) {
              return
            }
            onSend()
          }
        }}
      />
      <div className="mt-1 flex min-h-[32px] flex-wrap items-center gap-2">
        {footerLeading ? (
          <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
            {footerLeading}
          </div>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-[10px] text-zinc-600">⌘↵ Send</span>
          <button
            type="button"
            disabled={
              !draft.trim() ||
              sending ||
              improving ||
              replaceBlocked ||
              !canSend
            }
            title={replaceBlocked ? replaceBlockedReason : undefined}
            className="min-w-[120px] rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            onClick={() => onSend()}
          >
            {sending ? 'Sending…' : improving ? 'Improving…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
