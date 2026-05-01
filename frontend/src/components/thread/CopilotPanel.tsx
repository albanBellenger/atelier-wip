import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EditorSelectionState } from '../editor/SplitEditor'
import { useStream } from '../../hooks/useStream'
import type { YjsCollab } from '../../hooks/useYjsCollab'
import {
  applyPatchToYtext,
  canApplyPatch,
  isPatchIntentProposal,
  normalizePatchProposal,
  type PatchAnchor,
  type PatchProposalMeta,
} from '../../lib/sectionPatchApply'
import {
  previewAfterAppend,
  previewAfterEdit,
  previewAfterReplace,
  summarizeTextChange,
} from '../../lib/sectionPatchPreview'
import {
  getPrivateThread,
  improveSection,
  resetPrivateThread,
  type PrivateThreadMessage,
} from '../../services/api'
import { parseThreadSlashInput } from '../../lib/threadSlashCommand'
import { ContextTab } from './ContextTab'
import { ContextTruncationBanner } from './ContextTruncationBanner'
import { CritiqueTab } from './CritiqueTab'
import { DiffTab } from './DiffTab'

type ThreadIntent = 'ask' | 'append' | 'replace_selection' | 'edit'

export function CopilotPanel(props: {
  projectId: string
  sectionId: string
  sectionTitle: string
  projectHref: string
  collab: YjsCollab | null
  editorSelection: EditorSelectionState | null
  onClearEditorSelection: () => void
}): ReactElement {
  const {
    projectId,
    sectionId,
    sectionTitle,
    projectHref,
    collab,
    editorSelection,
    onClearEditorSelection,
  } = props
  const { streamPrivateThread } = useStream()
  const qc = useQueryClient()
  const [sideTab, setSideTab] = useState<
    'chat' | 'context' | 'critique' | 'diff'
  >('chat')
  const [draft, setDraft] = useState('')
  const [proposedMarkdown, setProposedMarkdown] = useState('')
  const [streaming, setStreaming] = useState('')
  const [findings, setFindings] = useState<
    { finding_type: string; description: string }[]
  >([])
  const [contextTruncated, setContextTruncated] = useState(false)
  const [includeGitHistory, setIncludeGitHistory] = useState(false)
  const [includeSelectionInContext, setIncludeSelectionInContext] =
    useState(true)
  const [threadIntent, setThreadIntent] = useState<ThreadIntent>('ask')
  const [err, setErr] = useState<string | null>(null)
  const [patchProposal, setPatchProposal] = useState<PatchProposalMeta | null>(
    null,
  )
  const [patchPreviewLines, setPatchPreviewLines] = useState<string[]>([])
  const [applyErr, setApplyErr] = useState<string | null>(null)
  const anchorRef = useRef<PatchAnchor | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  /** Forces re-run of canApplyPatch when Yjs text changes while a proposal is open. */
  const [docBump, setDocBump] = useState(0)

  useLayoutEffect(() => {
    if (!collab?.ytext || patchProposal == null) {
      return
    }
    const onObs = (): void => {
      setDocBump((n) => n + 1)
    }
    collab.ytext.observe(onObs)
    return () => {
      collab.ytext.unobserve(onObs)
    }
  }, [collab?.ytext, patchProposal])

  const threadQ = useQuery({
    queryKey: ['privateThread', projectId, sectionId],
    queryFn: () => getPrivateThread(projectId, sectionId),
    enabled: Boolean(projectId && sectionId),
  })

  const resetMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: () => resetPrivateThread(projectId, sectionId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['privateThread', projectId, sectionId],
      })
    },
  })

  const improveMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: async () => {
      const snapshot = collab?.ytext?.toString() ?? ''
      const r = await improveSection(projectId, sectionId, {
        instruction: draft.trim() ? draft.trim() : null,
        current_section_plaintext:
          snapshot.length > 0 ? snapshot : undefined,
      })
      setProposedMarkdown(r.improved_markdown)
      setSideTab('diff')
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'detail' in e
          ? String((e as { detail: unknown }).detail)
          : 'Request failed'
      setErr(msg)
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadQ.data?.messages, streaming])

  const sendMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: async () => {
      const rawContent = draft.trim()
      if (!rawContent) {
        return
      }
      const parsed = parseThreadSlashInput(rawContent)
      const content = parsed.content
      const effectiveIntent: ThreadIntent =
        parsed.command !== 'none' ? 'ask' : threadIntent
      setErr(null)
      setApplyErr(null)
      setPatchProposal(null)
      setPatchPreviewLines([])
      anchorRef.current = null
      setDraft('')
      setStreaming('')
      setFindings([])
      setContextTruncated(false)
      const snapshot = collab?.ytext?.toString()
      const sel = editorSelection
      const hasNonEmptySelection =
        sel != null &&
        collab != null &&
        snapshot !== undefined &&
        sel.to > sel.from
      const sendSelectionBounds =
        hasNonEmptySelection &&
        (includeSelectionInContext || effectiveIntent === 'replace_selection')
      const payload = {
        content,
        command: parsed.command,
        ...(collab != null ? { current_section_plaintext: snapshot ?? '' } : {}),
        include_git_history: includeGitHistory,
        include_selection_in_context: includeSelectionInContext,
        thread_intent: effectiveIntent,
        ...(sendSelectionBounds && sel != null
          ? {
              selection_from: sel.from,
              selection_to: sel.to,
              selected_plaintext: sel.text,
            }
          : {}),
      }
      anchorRef.current =
        collab != null && snapshot !== undefined
          ? {
              snapshot,
              selectionFrom:
                hasNonEmptySelection && sel != null ? sel.from : undefined,
              selectionTo:
                hasNonEmptySelection && sel != null ? sel.to : undefined,
            }
          : null
      await streamPrivateThread(projectId, sectionId, payload, {
        onToken: (t: string) => {
          setStreaming((s) => s + t)
        },
        onMeta: (meta) => {
          setFindings(meta.findings ?? [])
          setContextTruncated(Boolean(meta.context_truncated))
          const raw = meta.patch_proposal
          const norm = normalizePatchProposal(raw ?? null)
          setPatchProposal(norm)
          if (norm && collab != null && snapshot !== undefined) {
            const after = previewFromProposal(snapshot, norm)
            setPatchPreviewLines(
              summarizeTextChange(snapshot, after, 12),
            )
          } else {
            setPatchPreviewLines([])
          }
        },
      })
    },
    onSuccess: () => {
      setStreaming('')
      void qc.invalidateQueries({
        queryKey: ['privateThread', projectId, sectionId],
      })
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'detail' in e
          ? String((e as { detail: unknown }).detail)
          : 'Request failed'
      setErr(msg)
    },
  })

  function previewFromProposal(
    snapshot: string,
    p: PatchProposalMeta,
  ): string {
    if ('error' in p && p.error) {
      return snapshot
    }
    if (!isPatchIntentProposal(p)) {
      return snapshot
    }
    if (p.intent === 'append') {
      return previewAfterAppend(snapshot, p.markdown_to_append)
    }
    if (p.intent === 'replace_selection') {
      return previewAfterReplace(
        snapshot,
        p.selection_from,
        p.selection_to,
        p.replacement_markdown,
      )
    }
    if (p.intent === 'edit') {
      return previewAfterEdit(snapshot, p.old_snippet, p.new_snippet)
    }
    return snapshot
  }

  function onApplyPatch(): void {
    setApplyErr(null)
    if (!collab?.ytext || !patchProposal || !anchorRef.current) {
      setApplyErr('Nothing to apply.')
      return
    }
    const anchor: PatchAnchor = {
      snapshot: anchorRef.current.snapshot,
      selectionFrom: anchorRef.current.selectionFrom,
      selectionTo: anchorRef.current.selectionTo,
    }
    const r = applyPatchToYtext(collab.ytext, patchProposal, anchor)
    if (!r.ok) {
      setApplyErr(r.reason)
      return
    }
    setPatchProposal(null)
    setPatchPreviewLines([])
    anchorRef.current = null
  }

  function onApplyProposedFull(): void {
    if (!collab?.ytext || !proposedMarkdown.trim()) {
      return
    }
    const t = collab.ytext
    t.delete(0, t.length)
    t.insert(0, proposedMarkdown)
    setProposedMarkdown('')
    setSideTab('chat')
  }

  const msgs = threadQ.data?.messages ?? []
  const slashPreview = useMemo(() => parseThreadSlashInput(draft), [draft])
  const selChars =
    editorSelection != null ? editorSelection.to - editorSelection.from : 0
  const replaceNeedsSelection =
    threadIntent === 'replace_selection' &&
    (editorSelection == null ||
      editorSelection.from >= editorSelection.to)

  void docBump
  let applyPatchBlocked: string | null = null
  if (
    patchProposal != null &&
    collab?.ytext != null &&
    anchorRef.current != null &&
    !('error' in patchProposal && patchProposal.error)
  ) {
    const gate = canApplyPatch(collab.ytext, patchProposal, anchorRef.current)
    if (!gate.ok) {
      applyPatchBlocked = gate.reason
    }
  }

  return (
    <aside className="flex h-[min(70vh,560px)] flex-col rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-200">Private thread</h2>
          <p className="truncate text-xs text-zinc-300" title={sectionTitle}>
            {sectionTitle}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Scoped to this section. Live editor text is sent with each message.
          </p>
          <Link
            to={projectHref}
            className="mt-1 inline-block text-xs text-violet-400 hover:underline"
          >
            Back to project outline
          </Link>
        </div>
        <button
          type="button"
          disabled={resetMut.isPending}
          className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
          onClick={() => resetMut.mutate()}
        >
          New thread
        </button>
      </div>
      <div className="border-b border-zinc-800/80 px-3 py-2 text-xs text-zinc-400">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={includeGitHistory}
            disabled={sendMut.isPending || improveMut.isPending}
            onChange={(e) => setIncludeGitHistory(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Include recent git history in context (GitLab) — chat send and preview
        </label>
      </div>
      <div
        className="flex gap-1 border-b border-zinc-800 px-2 py-1"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={sideTab === 'chat'}
          className={`rounded px-3 py-1 text-xs font-medium ${
            sideTab === 'chat'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => setSideTab('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sideTab === 'context'}
          className={`rounded px-3 py-1 text-xs font-medium ${
            sideTab === 'context'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => setSideTab('context')}
        >
          Context
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sideTab === 'critique'}
          className={`rounded px-3 py-1 text-xs font-medium ${
            sideTab === 'critique'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => setSideTab('critique')}
        >
          Critique
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sideTab === 'diff'}
          className={`rounded px-3 py-1 text-xs font-medium ${
            sideTab === 'diff'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => setSideTab('diff')}
        >
          Diff
        </button>
      </div>
      {sideTab === 'chat' ? (
        <>
      <ContextTruncationBanner visible={contextTruncated} />
      <div className="space-y-1 border-b border-zinc-800/80 px-3 py-2 text-xs text-zinc-400">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={includeSelectionInContext}
            disabled={sendMut.isPending}
            onChange={(e) => setIncludeSelectionInContext(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Include editor selection in LLM context
        </label>
        {editorSelection != null && selChars > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-200">
              Selection: {selChars} chars
            </span>
            <button
              type="button"
              className="text-violet-400 hover:underline"
              onClick={onClearEditorSelection}
            >
              Clear selection (editor)
            </button>
          </div>
        ) : (
          <p className="text-zinc-600">No selection — select text in the editor to narrow context.</p>
        )}
        <label className="mt-1 block text-zinc-500">
          Intent
          <select
            className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
            value={threadIntent}
            disabled={sendMut.isPending}
            onChange={(e) => setThreadIntent(e.target.value as ThreadIntent)}
          >
            <option value="ask">Ask (chat only)</option>
            <option value="append">Append — propose text to add at end</option>
            <option value="replace_selection">Replace selection — needs selection</option>
            <option value="edit">Edit — replace one unique snippet</option>
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {threadQ.isPending && (
          <p className="text-zinc-500">Loading thread…</p>
        )}
        {msgs.map((m: PrivateThreadMessage) => (
          <div
            key={m.id}
            className={`rounded-lg px-2 py-1.5 ${
              m.role === 'user'
                ? 'ml-4 bg-violet-950/50 text-zinc-100'
                : 'mr-4 bg-zinc-800/80 text-zinc-200'
            }`}
          >
            <span className="text-[10px] uppercase text-zinc-500">{m.role}</span>
            <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {streaming && (
          <div className="mr-4 rounded-lg bg-zinc-800/80 px-2 py-1.5 text-zinc-200">
            <span className="text-[10px] uppercase text-zinc-500">assistant</span>
            <p className="mt-0.5 whitespace-pre-wrap">{streaming}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {findings.length > 0 && (
        <div className="border-t border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          <p className="font-medium text-amber-200">Conflicts and gaps</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {findings.map((f, i) => (
              <li key={i}>
                <span className="font-medium text-amber-300">
                  {f.finding_type === 'gap' ? 'Gap' : 'Conflict'}
                </span>
                : {f.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      {patchProposal != null && (
        <div className="border-t border-violet-900/40 bg-violet-950/20 px-3 py-2 text-xs text-zinc-200">
          <p className="font-medium text-violet-200">Patch proposal</p>
          {'error' in patchProposal && patchProposal.error ? (
            <p className="mt-1 text-red-300">{patchProposal.error}</p>
          ) : (
            <>
              {patchPreviewLines.length > 0 && (
                <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950/80 p-2 text-[11px] text-zinc-400">
                  {patchPreviewLines.join('\n')}
                </pre>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={
                    !collab?.ytext ||
                    ('error' in patchProposal && Boolean(patchProposal.error)) ||
                    applyPatchBlocked != null
                  }
                  title={applyPatchBlocked ?? undefined}
                  className="rounded bg-violet-600 px-2 py-1 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                  onClick={() => onApplyPatch()}
                >
                  Apply to editor
                </button>
                <button
                  type="button"
                  className="rounded border border-zinc-600 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
                  onClick={() => {
                    setPatchProposal(null)
                    setPatchPreviewLines([])
                    anchorRef.current = null
                    setApplyErr(null)
                  }}
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
          {applyPatchBlocked != null && (
            <p className="mt-1 text-amber-200/90">{applyPatchBlocked}</p>
          )}
          {applyErr && <p className="mt-1 text-red-300">{applyErr}</p>}
        </div>
      )}
      {err && (
        <p className="border-t border-red-900/40 px-3 py-2 text-xs text-red-300">
          {err}
        </p>
      )}
      <div className="border-t border-zinc-800 p-2">
        {slashPreview.command !== 'none' ? (
          <p
            className="mb-2 text-xs text-violet-300"
            data-testid="slash-command-chip"
          >
            Uses{' '}
            <span className="font-mono">{slashPreview.command}</span> mode (intent
            forced to ask).
          </p>
        ) : null}
        <div className="mb-2">
          <button
            type="button"
            className="w-full rounded border border-zinc-600 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            disabled={!collab?.ytext || improveMut.isPending}
            onClick={() => improveMut.mutate()}
          >
            {improveMut.isPending ? 'Improving…' : 'Structured improve (API)'}
          </button>
        </div>
        <textarea
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          rows={3}
          placeholder="Ask about this section…"
          value={draft}
          disabled={sendMut.isPending}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          disabled={
            !draft.trim() || sendMut.isPending || replaceNeedsSelection
          }
          title={
            replaceNeedsSelection
              ? 'Replace selection requires a non-empty editor selection.'
              : undefined
          }
          className="w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          onClick={() => sendMut.mutate()}
        >
          {sendMut.isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
        </>
      ) : sideTab === 'context' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ContextTab
            projectId={projectId}
            sectionId={sectionId}
            ragQuery={draft}
            includeGitHistory={includeGitHistory}
          />
        </div>
      ) : sideTab === 'critique' ? (
        <CritiqueTab projectId={projectId} sectionId={sectionId} />
      ) : (
        <DiffTab
          original={collab?.ytext?.toString() ?? ''}
          proposed={proposedMarkdown}
          onApply={onApplyProposedFull}
        />
      )}
    </aside>
  )
}
