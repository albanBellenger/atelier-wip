import type { ReactElement } from 'react'
import type { RefObject } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'

import type { PatchProposalMeta } from '../../lib/sectionPatchApply'
import type { PrivateThreadMessage } from '../../services/api'
import { AssistantProposalCard } from './AssistantProposalCard'

async function copyMarkdownToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Markdown copied')
  } catch {
    toast.error('Could not copy')
  }
}

function CopyMarkdownButton(props: { markdown: string }): ReactElement | null {
  const raw = props.markdown.trim()
  if (!raw) return null
  return (
    <button
      type="button"
      onClick={() => void copyMarkdownToClipboard(raw)}
      className="shrink-0 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:border-zinc-700 hover:bg-zinc-900/80 hover:text-zinc-300"
      aria-label="Copy markdown"
    >
      Copy
    </button>
  )
}

export type ConversationDensity = 'compact' | 'focus'

const mdProseClass =
  '[&_a]:text-violet-400 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-900'

export function ConversationView(props: {
  messages: PrivateThreadMessage[]
  streaming: string
  liveTrimNotice?: string | null
  threadPending: boolean
  patchProposal: PatchProposalMeta | null
  patchPreviewLines: string[]
  applyPatchBlocked: string | null
  applyErr: string | null
  applyPatchEnabled: boolean
  findings: { finding_type: string; description: string }[]
  err: string | null
  bottomRef: RefObject<HTMLDivElement | null>
  onApplyPatch: () => void
  onDismissPatch: () => void
  onViewPatchDiff: () => void
  density?: ConversationDensity
  onInsertSlash?: (prefix: string) => void
}): ReactElement {
  const {
    messages,
    streaming,
    liveTrimNotice = null,
    threadPending,
    patchProposal,
    patchPreviewLines,
    applyPatchBlocked,
    applyErr,
    applyPatchEnabled,
    findings,
    err,
    bottomRef,
    onApplyPatch,
    onDismissPatch,
    onViewPatchDiff,
    density = 'compact',
    onInsertSlash,
  } = props

  const isFocus = density === 'focus'
  const assistantLabel = isFocus ? 'Atelier Copilot' : 'Copilot'

  const lastMsg =
    messages.length > 0 ? messages[messages.length - 1] : undefined
  const attachCardToTailAssistant =
    !streaming &&
    lastMsg?.role === 'assistant' &&
    patchProposal != null

  const showEmptyHint =
    messages.length === 0 && !streaming && !threadPending

  const outerGap = isFocus
    ? 'flex flex-col gap-8 text-[15px] leading-7'
    : 'flex min-h-0 min-w-0 flex-1 flex-col gap-5 text-sm leading-relaxed'

  function renderAssistantBody(text: string): ReactElement {
    return (
      <div className={`whitespace-pre-wrap break-words ${mdProseClass}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div className={outerGap}>
      {threadPending && (
        <div className="flex flex-col items-start">
          <div
            className={
              isFocus
                ? 'self-start max-w-[100%] rounded-2xl rounded-bl-md bg-zinc-800/60 px-5 py-3.5 text-zinc-100 ring-1 ring-zinc-800/80'
                : 'self-start max-w-[92%] rounded-2xl rounded-bl-md bg-zinc-800/70 px-4 py-2.5 text-zinc-100 shadow-sm'
            }
          >
            <p
              className={
                isFocus
                  ? 'mb-1.5 text-xs font-medium text-zinc-500'
                  : 'mb-1 text-xs font-medium text-zinc-400'
              }
            >
              {assistantLabel}
            </p>
            <p className="whitespace-pre-wrap break-words text-zinc-300">
              Loading thread…
            </p>
          </div>
        </div>
      )}
      {showEmptyHint && isFocus && onInsertSlash ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 text-3xl">✦</div>
          <h2 className="text-lg font-medium text-zinc-200">
            Talk to the section copilot
          </h2>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Ask a question, request changes, or use a slash command. Your live
            editor text travels with every message.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs">
            {['/ask', '/improve', '/append', '/replace', '/edit'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onInsertSlash(`${c} `)}
                className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-zinc-400 hover:border-violet-700/60 hover:text-violet-200"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showEmptyHint && !isFocus ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-xs text-zinc-500">
          Start a conversation with the copilot — ask a question, /improve,
          /append, /replace, or /edit.
        </div>
      ) : null}
      {messages.map((m: PrivateThreadMessage, i: number) => (
        <div
          key={m.id}
          className={`flex w-full min-w-0 flex-col ${
            m.role === 'user' ? 'items-end' : 'items-start'
          }`}
        >
          {m.role === 'user' ? (
            <div className="flex flex-col items-end">
              <p
                className={
                  isFocus
                    ? 'mb-1.5 text-xs font-medium text-zinc-500'
                    : 'mb-1 text-xs font-medium text-zinc-400'
                }
              >
                You
              </p>
              <div
                className={
                  isFocus
                    ? 'self-end max-w-[78%] rounded-2xl rounded-br-md bg-violet-600 px-5 py-3 text-zinc-50 shadow-md shadow-violet-950/40'
                    : 'self-end max-w-[85%] rounded-2xl rounded-br-md bg-violet-600/90 px-4 py-2.5 text-zinc-50 shadow-sm'
                }
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col self-start">
              <div
                className={
                  isFocus
                    ? 'mb-1.5 flex w-full max-w-full items-center justify-between gap-2'
                    : 'mb-1 flex w-full max-w-[92%] items-center justify-between gap-2'
                }
              >
                <p
                  className={
                    isFocus
                      ? 'text-xs font-medium text-zinc-500'
                      : 'text-xs font-medium text-zinc-400'
                  }
                >
                  {assistantLabel}
                </p>
                <CopyMarkdownButton markdown={m.content} />
              </div>
              <div
                className={
                  isFocus
                    ? 'w-full max-w-full rounded-2xl rounded-bl-md bg-zinc-800/60 px-5 py-3.5 text-zinc-100 ring-1 ring-zinc-800/80'
                    : 'w-full max-w-[92%] rounded-2xl rounded-bl-md bg-zinc-800/70 px-4 py-2.5 text-zinc-100 shadow-sm'
                }
              >
                {renderAssistantBody(m.content)}
              </div>
            </div>
          )}
          {attachCardToTailAssistant &&
            m.role === 'assistant' &&
            i === messages.length - 1 && (
              <div className={`w-full ${isFocus ? 'mt-3' : 'mt-2'}`}>
                <AssistantProposalCard
                  patchProposal={patchProposal}
                  patchPreviewLines={patchPreviewLines}
                  applyPatchBlocked={applyPatchBlocked}
                  applyErr={applyErr}
                  applyPatchEnabled={applyPatchEnabled}
                  onApplyPatch={onApplyPatch}
                  onDismissPatch={onDismissPatch}
                  onViewPatchDiff={onViewPatchDiff}
                />
              </div>
            )}
        </div>
      ))}
      {liveTrimNotice ? (
        <div className="flex min-w-0 flex-col items-start">
          <p className="mb-1 text-xs font-medium text-zinc-500">{assistantLabel}</p>
          <div
            className={
              isFocus
                ? 'w-full max-w-full rounded-2xl rounded-bl-md border border-amber-900/40 bg-amber-950/25 px-5 py-3 text-amber-100/95 ring-1 ring-amber-900/30'
                : 'w-full max-w-[92%] rounded-2xl rounded-bl-md border border-amber-900/40 bg-amber-950/25 px-4 py-2 text-xs text-amber-100/95'
            }
          >
            <p className="whitespace-pre-wrap">{liveTrimNotice}</p>
          </div>
        </div>
      ) : null}
      {streaming && (
        <div className="flex min-w-0 flex-col items-start">
          <div
            className={
              isFocus
                ? 'mb-1.5 flex w-full max-w-full items-center justify-between gap-2'
                : 'mb-1 flex w-full max-w-[92%] items-center justify-between gap-2'
            }
          >
            <p
              className={
                isFocus
                  ? 'text-xs font-medium text-zinc-500'
                  : 'text-xs font-medium text-zinc-400'
              }
            >
              {assistantLabel}
            </p>
            <CopyMarkdownButton markdown={streaming} />
          </div>
          <div
            className={
              isFocus
                ? 'w-full max-w-full rounded-2xl rounded-bl-md bg-zinc-800/60 px-5 py-3.5 text-zinc-100 ring-1 ring-zinc-800/80'
                : 'w-full max-w-[92%] rounded-2xl rounded-bl-md bg-zinc-800/70 px-4 py-2.5 text-zinc-100 shadow-sm'
            }
          >
            {renderAssistantBody(streaming)}
          </div>
          {patchProposal != null && (
            <div className={`w-full ${isFocus ? 'mt-3' : 'mt-2'}`}>
              <AssistantProposalCard
                patchProposal={patchProposal}
                patchPreviewLines={patchPreviewLines}
                applyPatchBlocked={applyPatchBlocked}
                applyErr={applyErr}
                applyPatchEnabled={applyPatchEnabled}
                onApplyPatch={onApplyPatch}
                onDismissPatch={onDismissPatch}
                onViewPatchDiff={onViewPatchDiff}
              />
            </div>
          )}
        </div>
      )}
      {!streaming &&
        patchProposal != null &&
        lastMsg?.role !== 'assistant' && (
          <div className="w-full">
            <AssistantProposalCard
              patchProposal={patchProposal}
              patchPreviewLines={patchPreviewLines}
              applyPatchBlocked={applyPatchBlocked}
              applyErr={applyErr}
              applyPatchEnabled={applyPatchEnabled}
              onApplyPatch={onApplyPatch}
              onDismissPatch={onDismissPatch}
              onViewPatchDiff={onViewPatchDiff}
            />
          </div>
        )}
      {findings.length > 0 && (
        <div className="rounded border border-amber-900/40 bg-amber-950/30 px-2 py-2 text-xs text-amber-100">
          <p className="font-medium text-amber-200">Conflicts and gaps</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {findings.map((f, idx) => (
              <li key={idx}>
                <span className="font-medium text-amber-300">
                  {f.finding_type === 'gap' ? 'Gap' : 'Conflict'}
                </span>
                : {f.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && (
        <p className="rounded border border-red-900/40 px-2 py-2 text-xs text-red-300">
          {err}
        </p>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
