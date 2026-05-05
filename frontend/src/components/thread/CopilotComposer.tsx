import type { KeyboardEvent, ReactElement } from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  parseThreadComposerInput,
  type ParsedComposerInput,
} from '../../lib/threadSlashCommand'

const SLASH_COMMANDS: { prefix: string; label: string; description: string }[] =
  [
    {
      prefix: '/ask ',
      label: '/ask',
      description: 'Ask a question about this section.',
    },
    {
      prefix: '/improve ',
      label: '/improve',
      description: 'Structured improve via API (not chat stream).',
    },
    {
      prefix: '/append ',
      label: '/append',
      description: 'Append content to the end of the section.',
    },
    {
      prefix: '/replace ',
      label: '/replace',
      description: 'Replace the current editor selection.',
    },
    {
      prefix: '/edit ',
      label: '/edit',
      description: 'Edit using a unique snippet replacement.',
    },
  ]

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

function shouldShowSlashPopover(draft: string): boolean {
  if (!draft.startsWith('/')) {
    return false
  }
  return !draft.includes(' ')
}

function filteredSlashCommands(draft: string): typeof SLASH_COMMANDS {
  const tail = draft.slice(1).toLowerCase()
  if (tail.length === 0) {
    return SLASH_COMMANDS
  }
  return SLASH_COMMANDS.filter((c) =>
    c.label.toLowerCase().startsWith(`/${tail}`),
  )
}

function SlashCommandPopover(props: {
  draft: string
  activeIndex: number
  onPick: (prefix: string) => void
  onClose: () => void
}): ReactElement {
  const { draft, activeIndex, onPick, onClose } = props
  const items = filteredSlashCommands(draft)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (items.length === 0) {
    return (
      <div
        className="absolute bottom-full left-0 right-0 z-30 mb-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500 shadow-lg"
        role="listbox"
      >
        No matching commands
      </div>
    )
  }

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-lg"
      role="listbox"
      aria-label="Slash commands"
    >
      {items.map((c, idx) => (
        <button
          key={c.label}
          type="button"
          role="option"
          aria-selected={idx === activeIndex}
          className={`flex w-full flex-col items-start px-3 py-2 text-left text-xs ${
            idx === activeIndex
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-300 hover:bg-zinc-900'
          }`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(c.prefix)
          }}
        >
          <span className="font-mono text-[11px] text-violet-300">{c.label}</span>
          <span className="mt-0.5 text-[11px] text-zinc-500">{c.description}</span>
        </button>
      ))}
    </div>
  )
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
  /** When set with ``onScopeSelection``, shows the compact “Choose scope” row. */
  onScopeSection?: () => void
  onScopeSelection?: () => void
  /** Shown on the same row as the Send affordance (e.g. inline model line). */
  footerLeading?: ReactElement | null
  variant?: 'compact' | 'focus'
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
    onScopeSection,
    onScopeSelection,
    footerLeading,
    variant = 'compact',
  } = props

  const parsed = useMemo(() => parseThreadComposerInput(draft), [draft])
  const chip = slashSummary(parsed)
  const isFocus = variant === 'focus'
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const [scopeChooserOpen, setScopeChooserOpen] = useState(false)

  useEffect(() => {
    if (!shouldShowSlashPopover(draft) || draft.includes(' ')) {
      setSlashDismissed(false)
    }
  }, [draft])

  const showSlashPopover =
    isFocus &&
    shouldShowSlashPopover(draft) &&
    !sending &&
    !slashDismissed

  const resizeTextarea = useCallback((): void => {
    const el = textareaRef.current
    if (!el || !isFocus) {
      return
    }
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, 180)
    el.style.height = `${Math.max(44, next)}px`
  }, [isFocus])

  useLayoutEffect(() => {
    resizeTextarea()
  }, [draft, isFocus, resizeTextarea])

  useEffect(() => {
    if (!showSlashPopover) {
      setSlashIndex(0)
      return
    }
    const n = filteredSlashCommands(draft).length
    setSlashIndex((i) => (n > 0 ? Math.min(i, n - 1) : 0))
  }, [draft, showSlashPopover])

  const showNoSelectionHint =
    !isFocus && !(hasSelection && selectionChars > 0)

  const showLegacyNoSelectionHint =
    showNoSelectionHint &&
    (onScopeSection == null || onScopeSelection == null)

  const outerClass = 'relative shrink-0 px-0 py-0'

  const innerComposerClass =
    'mx-auto w-full max-w-[760px] rounded-2xl border border-zinc-800/80 bg-zinc-900/95 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur focus-within:ring-1 focus-within:ring-violet-500/40'

  const onTextAreaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showSlashPopover) {
        const items = filteredSlashCommands(draft)
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashIndex((i) =>
            Math.min(i + 1, Math.max(0, items.length - 1)),
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashIndex((i) => Math.max(0, i - 1))
          return
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          const pick = items[slashIndex]
          if (pick) {
            onInsertSlash(pick.prefix)
            setSlashDismissed(true)
          }
          return
        }
      }
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
    },
    [
      showSlashPopover,
      draft,
      slashIndex,
      sending,
      improving,
      replaceBlocked,
      canSend,
      onSend,
      onInsertSlash,
    ],
  )

  const chipPillClass =
    'rounded-full border border-zinc-700/90 bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-200 hover:border-indigo-500/50 hover:text-zinc-50 disabled:opacity-50'

  const focusComposerContent = (
    <>
      {onScopeSection != null && onScopeSelection != null ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/40 pb-2">
          <span className="text-[10px] uppercase tracking-wide text-zinc-600">
            Choose scope
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={sending || improving}
              className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                !includeSelectionInContext
                  ? 'border-violet-600 bg-violet-950/40 text-violet-200'
                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
              aria-pressed={!includeSelectionInContext}
              onClick={() => onScopeSection()}
            >
              Section
            </button>
            <button
              type="button"
              disabled={sending || improving || !hasSelection}
              className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                includeSelectionInContext && hasSelection
                  ? 'border-violet-600 bg-violet-950/40 text-violet-200'
                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
              aria-pressed={Boolean(
                includeSelectionInContext && hasSelection,
              )}
              onClick={() => onScopeSelection()}
            >
              Selection
            </button>
          </div>
        </div>
      ) : null}
      <div
        className="mb-2 flex flex-wrap justify-center gap-1"
        data-testid="copilot-slash-chips"
      >
        {(
          [
            '/ask ',
            '/improve ',
            '/append ',
            '/replace ',
            '/edit ',
            '/critique ',
          ] as const
        ).map((p) => (
          <button
            key={p.trim()}
            type="button"
            disabled={sending || improving}
            className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-violet-700 hover:text-violet-200 disabled:opacity-50"
            onClick={() => onInsertSlash(p)}
          >
            {p.trim()}
          </button>
        ))}
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
      ) : null}
      {replaceBlocked && replaceBlockedReason ? (
        <p className="mb-2 text-[11px] text-amber-300/90">{replaceBlockedReason}</p>
      ) : null}
      {showNoSelectionHint ? (
        <p className="mb-2 text-[11px] text-zinc-600">
          No selection — select text in the editor to narrow context or use{' '}
          <span className="font-mono">/replace</span>.
        </p>
      ) : null}
      <div className="relative">
        {showSlashPopover ? (
          <SlashCommandPopover
            draft={draft}
            activeIndex={slashIndex}
            onClose={() => setSlashDismissed(true)}
            onPick={(prefix) => {
              onInsertSlash(prefix)
              setSlashDismissed(true)
            }}
          />
        ) : null}
        <textarea
          ref={textareaRef}
          data-testid="copilot-composer-textarea"
          className="mb-2 min-h-[44px] max-h-[180px] w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          rows={1}
          placeholder="Ask the copilot to write…"
          value={draft}
          disabled={sending}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onTextAreaKeyDown}
        />
      </div>
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
            className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            onClick={() => onSend()}
          >
            {sending ? 'Sending…' : improving ? 'Improving…' : 'Send'}
          </button>
        </div>
      </div>
    </>
  )

  const compactComposerContent = (
    <>
      {onScopeSection != null && onScopeSelection != null ? (
        <div className="border-b border-zinc-800/80 pb-2.5 pt-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs leading-snug text-zinc-500">
              {includeSelectionInContext && hasSelection
                ? `Selection context (${selectionChars} chars) — copilot uses the highlighted range.`
                : 'No selection — copilot operates on the whole section.'}
            </p>
            <button
              type="button"
              aria-expanded={scopeChooserOpen}
              className="shrink-0 text-xs text-zinc-400 transition hover:text-zinc-200"
              onClick={() => setScopeChooserOpen((v) => !v)}
            >
              Choose scope →
            </button>
          </div>
          {scopeChooserOpen ? (
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                disabled={sending || improving}
                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                  !includeSelectionInContext
                    ? 'border-violet-600 bg-violet-950/40 text-violet-200'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
                aria-pressed={!includeSelectionInContext}
                onClick={() => onScopeSection()}
              >
                Section
              </button>
              <button
                type="button"
                disabled={sending || improving || !hasSelection}
                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                  includeSelectionInContext && hasSelection
                    ? 'border-violet-600 bg-violet-950/40 text-violet-200'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
                aria-pressed={Boolean(
                  includeSelectionInContext && hasSelection,
                )}
                onClick={() => onScopeSelection()}
              >
                Selection
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative mt-3">
        <textarea
          data-testid="copilot-composer-textarea"
          className="mb-3 min-h-[88px] w-full resize-y rounded-lg border border-indigo-500/55 bg-[#121214] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/35"
          rows={4}
          placeholder="Ask the copilot, or type / for commands…"
          value={draft}
          disabled={sending}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onTextAreaKeyDown}
        />
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
      ) : null}
      {replaceBlocked && replaceBlockedReason ? (
        <p className="mb-2 text-[11px] text-amber-300/90">{replaceBlockedReason}</p>
      ) : null}
      {showLegacyNoSelectionHint ? (
        <p className="mb-2 text-[11px] text-zinc-600">
          No selection — select text in the editor to narrow context or use{' '}
          <span className="font-mono">/replace</span>.
        </p>
      ) : null}

      <div className="flex flex-col gap-2" data-testid="copilot-slash-chips">
        <div className="flex flex-wrap gap-1.5">
          {(['/improve ', '/append ', '/replace ', '/edit '] as const).map(
            (p) => (
              <button
                key={p.trim()}
                type="button"
                disabled={sending || improving}
                className={chipPillClass}
                onClick={() => onInsertSlash(p)}
              >
                {p.trim()}
              </button>
            ),
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['/ask ', '/critique '] as const).map((p) => (
            <button
              key={p.trim()}
              type="button"
              disabled={sending || improving}
              className={chipPillClass}
              onClick={() => onInsertSlash(p)}
            >
              {p.trim()}
            </button>
          ))}
          <button
            type="button"
            title="Include current editor selection in LLM context for this send"
            disabled={sending || improving}
            className={`rounded-full border px-2 py-1 text-xs ${
              includeSelectionInContext
                ? 'border-violet-600 bg-violet-950/40 text-violet-200'
                : 'border-zinc-700 bg-zinc-950 text-zinc-500 hover:text-zinc-300'
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
            className={`rounded-full border px-2 py-1 text-xs ${
              includeGitHistory
                ? 'border-violet-600 bg-violet-950/40 text-violet-200'
                : 'border-zinc-700 bg-zinc-950 text-zinc-500 hover:text-zinc-300'
            }`}
            aria-pressed={includeGitHistory}
            onClick={() => onToggleGitHistory()}
          >
            🕓
          </button>
        </div>
      </div>

      <div className="mt-3 flex min-h-[40px] w-full flex-wrap items-center justify-between gap-3 border-t border-zinc-800/60 pt-3">
        {footerLeading ? (
          <div className="min-w-0 flex-1">{footerLeading}</div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="flex items-center gap-1"
            aria-label="Keyboard shortcut: Ctrl or Command plus Enter to send"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded border border-zinc-700 bg-zinc-950 text-[11px] text-zinc-500">
              ⌘
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded border border-zinc-700 bg-zinc-950 text-[11px] text-zinc-500">
              ↵
            </span>
          </div>
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
            className="min-w-[96px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            onClick={() => onSend()}
          >
            {sending ? 'Sending…' : improving ? 'Improving…' : 'Send'}
          </button>
        </div>
      </div>
    </>
  )

  if (isFocus) {
    return (
      <div className={outerClass} data-testid="copilot-composer-focus">
        <div className={innerComposerClass}>{focusComposerContent}</div>
      </div>
    )
  }

  return (
    <div
      className="shrink-0 w-full px-3 pb-3 pt-2"
      data-testid="copilot-composer-compact"
    >
      {compactComposerContent}
    </div>
  )
}
