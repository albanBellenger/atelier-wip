import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

import { getProjectChatRagPreview } from '../../services/api'
import { ContextTruncationBanner } from '../thread/ContextTruncationBanner'

/** Preview of RAG blocks injected into project chat (same assembly as WebSocket chat; no section prefs). */
export function ProjectChatRagPreview(props: { projectId: string }): ReactElement {
  const { projectId } = props
  const [previewQ, setPreviewQ] = useState('')
  const [includeGitHistory, setIncludeGitHistory] = useState(false)
  const [showDebugRawRag, setShowDebugRawRag] = useState(false)
  const [overflowBannerDismissed, setOverflowBannerDismissed] = useState(false)

  useEffect(() => {
    setOverflowBannerDismissed(false)
  }, [previewQ, includeGitHistory, showDebugRawRag])

  const q = useQuery({
    queryKey: [
      'projectChatRagPreview',
      projectId,
      previewQ,
      includeGitHistory,
      showDebugRawRag,
    ],
    queryFn: () =>
      getProjectChatRagPreview(projectId, {
        q: previewQ,
        includeGitHistory,
        debugRawRag: showDebugRawRag,
      }),
    enabled: Boolean(projectId),
  })

  return (
    <div
      className="flex min-h-0 flex-col space-y-3 text-sm"
      data-testid="project-chat-rag-preview"
    >
      <label className="block text-xs text-zinc-500">
        Search query (chunk retrieval)
        <input
          type="text"
          value={previewQ}
          onChange={(e) => {
            setPreviewQ(e.target.value)
          }}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          placeholder="Same text you would send in project chat…"
        />
      </label>
      <p className="text-xs text-zinc-500">
        This preview uses the same RAG assembly as project chat (project-wide retrieval, no
        outline-editor section preferences). Chunk labels in retrieved blocks show source
        (section vs artifact).
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={includeGitHistory}
          onChange={(e) => {
            setIncludeGitHistory(e.target.checked)
          }}
          className="rounded border-zinc-600"
        />
        Include recent git history block
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={showDebugRawRag}
          onChange={(e) => {
            setShowDebugRawRag(e.target.checked)
          }}
          className="rounded border-zinc-600"
        />
        Include raw RAG string (debug, non-production API only)
      </label>
      {q.isPending && <p className="text-zinc-500">Loading context…</p>}
      {q.isError && (
        <p className="text-red-400" data-testid="project-chat-rag-error">
          Could not load project RAG preview.
        </p>
      )}
      {q.data && (
        <>
          <ContextTruncationBanner
            visible={
              q.data.overflow_strategy_applied != null && !overflowBannerDismissed
            }
            onDismiss={() => {
              setOverflowBannerDismissed(true)
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span>
              ~{q.data.total_tokens} / {q.data.budget_tokens} tokens
            </span>
          </div>
          <ul className="space-y-3">
            {(Array.isArray(q.data.blocks) ? q.data.blocks : []).map((b, i) => (
              <li
                key={`${b.kind}-${i}`}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-2 py-1.5 text-xs">
                  <span
                    className="font-medium text-violet-300"
                    data-testid={`context-block-kind-${b.kind}`}
                  >
                    {b.kind}
                  </span>
                  <span className="truncate text-zinc-400" title={b.label}>
                    {b.label}
                  </span>
                  <span className="text-zinc-500">{b.tokens} tok</span>
                  {b.relevance != null ? (
                    <span className="text-zinc-500">d={b.relevance.toFixed(3)}</span>
                  ) : null}
                  {b.truncated ? (
                    <span className="text-amber-400">truncated</span>
                  ) : null}
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px] leading-relaxed text-zinc-300">
                  {b.body}
                </pre>
              </li>
            ))}
          </ul>
          {showDebugRawRag ? (
            q.data.debug_raw_rag_text != null && q.data.debug_raw_rag_text !== '' ? (
              <details className="rounded-lg border border-zinc-800 bg-zinc-950/40">
                <summary className="cursor-pointer px-2 py-1.5 text-xs text-zinc-400">
                  Raw RAG text (same string as <code className="text-zinc-500">build_context</code>{' '}
                  for project chat)
                </summary>
                <pre
                  className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-800/80 p-2 font-mono text-[11px] text-zinc-300"
                  data-testid="project-chat-rag-debug-raw"
                >
                  {q.data.debug_raw_rag_text}
                </pre>
              </details>
            ) : (
              <p className="text-xs text-zinc-600" data-testid="project-chat-rag-debug-unavailable">
                Raw RAG debug not returned — use a non-production API (
                <code className="text-zinc-500">ENV≠production</code>) and enable the checkbox.
              </p>
            )
          ) : null}
        </>
      )}
    </div>
  )
}
