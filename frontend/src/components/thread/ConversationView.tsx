import type { ReactElement } from 'react'
import type { RefObject } from 'react'

import type { PatchProposalMeta } from '../../lib/sectionPatchApply'
import type { PrivateThreadMessage } from '../../services/api'
import { AssistantProposalCard } from './AssistantProposalCard'

export function ConversationView(props: {
  messages: PrivateThreadMessage[]
  streaming: string
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
}): ReactElement {
  const {
    messages,
    streaming,
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
  } = props

  const lastMsg =
    messages.length > 0 ? messages[messages.length - 1] : undefined
  const attachCardToTailAssistant =
    !streaming &&
    lastMsg?.role === 'assistant' &&
    patchProposal != null

  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm">
      {threadPending && <p className="text-zinc-500">Loading thread…</p>}
      {messages.map((m: PrivateThreadMessage, i: number) => (
        <div key={m.id}>
          <div
            className={`rounded-lg px-2 py-1.5 ${
              m.role === 'user'
                ? 'ml-4 bg-violet-950/50 text-zinc-100'
                : 'mr-4 bg-zinc-800/80 text-zinc-200'
            }`}
          >
            <span className="text-[10px] uppercase text-zinc-500">{m.role}</span>
            <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
          </div>
          {attachCardToTailAssistant &&
            m.role === 'assistant' &&
            i === messages.length - 1 && (
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
            )}
        </div>
      ))}
      {streaming && (
        <div className="mr-4 rounded-lg bg-zinc-800/80 px-2 py-1.5 text-zinc-200">
          <span className="text-[10px] uppercase text-zinc-500">assistant</span>
          <p className="mt-0.5 whitespace-pre-wrap">{streaming}</p>
          {patchProposal != null && (
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
          )}
        </div>
      )}
      {!streaming &&
        patchProposal != null &&
        lastMsg?.role !== 'assistant' && (
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
