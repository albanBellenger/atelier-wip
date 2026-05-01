import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

import { getContextPreview } from '../../services/api'

/** Read-only RAG context blocks for the current section (Slice B). */
export function ContextTab(props: {
  projectId: string
  sectionId: string
  ragQuery: string
  includeGitHistory: boolean
}): ReactElement {
  const { projectId, sectionId, ragQuery, includeGitHistory } = props
  const [previewQ, setPreviewQ] = useState(ragQuery)

  useEffect(() => {
    setPreviewQ(ragQuery)
  }, [ragQuery])

  const q = useQuery({
    queryKey: [
      'contextPreview',
      projectId,
      sectionId,
      previewQ,
      includeGitHistory,
    ],
    queryFn: () =>
      getContextPreview(projectId, sectionId, {
        q: previewQ,
        includeGitHistory,
      }),
    enabled: Boolean(projectId && sectionId),
  })

  return (
    <div
      className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto px-3 py-2 text-sm"
      data-testid="context-tab"
    >
      <label className="block text-xs text-zinc-500">
        Search query (chunk retrieval)
        <input
          type="text"
          value={previewQ}
          onChange={(e) => setPreviewQ(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          placeholder="Matches private-thread RAG query…"
        />
      </label>
      <p className="text-xs text-zinc-500">
        Same assembly as the private thread LLM context. Refreshes when the
        query or git option changes.
      </p>
      {q.isPending && <p className="text-zinc-500">Loading context…</p>}
      {q.isError && (
        <p className="text-red-400">Could not load context preview.</p>
      )}
      {q.data && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span>
              ~{q.data.total_tokens} / {q.data.budget_tokens} tokens
            </span>
            {q.data.overflow_strategy_applied != null ? (
              <span className="rounded bg-amber-950/50 px-2 py-0.5 text-amber-200">
                Truncation: {q.data.overflow_strategy_applied}
              </span>
            ) : null}
          </div>
          <ul className="space-y-3">
            {q.data.blocks.map((b, i) => (
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
                    <span className="text-zinc-500">
                      d={b.relevance.toFixed(3)}
                    </span>
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
        </>
      )}
    </div>
  )
}
