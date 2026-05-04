import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'

import {
  getContextPreview,
  getSectionContextPreferences,
  patchSectionContextPreferences,
  type SectionContextPreferencesPatch,
} from '../../services/api'

/** RAG context blocks for the current section (Slice B); optional prefs toggles for editors. */
export function ContextTab(props: {
  projectId: string
  sectionId: string
  ragQuery: string
  includeGitHistory: boolean
  canEditContext?: boolean
  /** When set, search box changes are propagated (e.g. section workspace sync with copilot Context tab). */
  onRagQueryChange?: (q: string) => void
}): ReactElement {
  const {
    projectId,
    sectionId,
    ragQuery,
    includeGitHistory,
    canEditContext = false,
    onRagQueryChange,
  } = props
  const qc = useQueryClient()
  const [previewQ, setPreviewQ] = useState(ragQuery)
  const [showDebugRawRag, setShowDebugRawRag] = useState(false)

  useEffect(() => {
    setPreviewQ(ragQuery)
  }, [ragQuery])

  const prefsQ = useQuery({
    queryKey: ['sectionContextPreferences', projectId, sectionId],
    queryFn: () => getSectionContextPreferences(projectId, sectionId),
    enabled: Boolean(projectId && sectionId),
  })

  const patchPrefsMut = useMutation({
    mutationFn: (body: SectionContextPreferencesPatch) =>
      patchSectionContextPreferences(projectId, sectionId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ['sectionContextPreferences', projectId, sectionId],
      })
      await qc.invalidateQueries({
        queryKey: ['contextPreview', projectId, sectionId],
      })
    },
  })

  const q = useQuery({
    queryKey: [
      'contextPreview',
      projectId,
      sectionId,
      previewQ,
      includeGitHistory,
      showDebugRawRag,
    ],
    queryFn: () =>
      getContextPreview(projectId, sectionId, {
        q: previewQ,
        includeGitHistory,
        debugRawRag: showDebugRawRag,
      }),
    enabled: Boolean(projectId && sectionId),
  })

  const uniqueKinds = useMemo(() => {
    const blocks = q.data?.blocks
    if (!Array.isArray(blocks)) {
      return []
    }
    const s = new Set<string>()
    for (const b of blocks) {
      if (b != null && typeof b === 'object' && typeof b.kind === 'string') {
        s.add(b.kind)
      }
    }
    return [...s].sort()
  }, [q.data?.blocks])

  const excludedSet = useMemo(() => {
    return new Set(prefsQ.data?.excluded_kinds ?? [])
  }, [prefsQ.data?.excluded_kinds])

  const toggleKindExcluded = (kind: string): void => {
    if (!prefsQ.data || !canEditContext) {
      return
    }
    const next = new Set(prefsQ.data.excluded_kinds)
    if (next.has(kind)) {
      next.delete(kind)
    } else {
      next.add(kind)
    }
    patchPrefsMut.mutate({ excluded_kinds: [...next] })
  }

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
          onChange={(e) => {
            const v = e.target.value
            setPreviewQ(v)
            onRagQueryChange?.(v)
          }}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          placeholder="Matches private-thread RAG query…"
        />
      </label>
      <p className="text-xs text-zinc-500">
        Same assembly as the private thread LLM context. Refreshes when the
        query or git option changes. If the search box is empty, chunk retrieval
        uses the current section title and body as the implicit query (so
        artifacts still match on the Context tab).
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={showDebugRawRag}
          onChange={(e) => setShowDebugRawRag(e.target.checked)}
          className="rounded border-zinc-600"
        />
        Include raw RAG string (debug, non-production API only)
      </label>
      {canEditContext && uniqueKinds.length > 0 ? (
        <div
          className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2"
          data-testid="context-kind-prefs"
        >
          <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">
            Include block kinds in LLM context
          </div>
          <ul className="flex flex-col gap-1.5">
            {uniqueKinds.map((kind) => {
              const included = !excludedSet.has(kind)
              return (
                <li key={kind} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-violet-200">
                    {kind}
                  </span>
                  <button
                    type="button"
                    disabled={patchPrefsMut.isPending || prefsQ.isPending}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                      included
                        ? 'bg-emerald-950/60 text-emerald-200'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}
                    aria-pressed={included}
                    onClick={() => toggleKindExcluded(kind)}
                  >
                    {included ? 'On' : 'Off'}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
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
            {(Array.isArray(q.data.blocks) ? q.data.blocks : []).map(
              (b, i) => (
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
              ),
            )}
          </ul>
          {showDebugRawRag ? (
            q.data.debug_raw_rag_text != null &&
            q.data.debug_raw_rag_text !== '' ? (
              <details className="rounded-lg border border-zinc-800 bg-zinc-950/40">
                <summary className="cursor-pointer px-2 py-1.5 text-xs text-zinc-400">
                  Raw RAG text (same string as{' '}
                  <code className="text-zinc-500">build_context</code> for the
                  thread)
                </summary>
                <pre
                  className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-800/80 p-2 font-mono text-[11px] text-zinc-300"
                  data-testid="context-debug-raw-rag"
                >
                  {q.data.debug_raw_rag_text}
                </pre>
              </details>
            ) : (
              <p
                className="text-xs text-zinc-600"
                data-testid="context-debug-unavailable"
              >
                Raw RAG debug not returned — use a non-production API (
                <code className="text-zinc-500">ENV≠production</code>) and
                enable the checkbox.
              </p>
            )
          ) : null}
        </>
      )}
    </div>
  )
}
