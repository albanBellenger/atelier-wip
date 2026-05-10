import type { ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  KpiTile,
  PageTitle,
  PolicyTile,
} from '../../components/admin/adminPrimitives'
import { EmbeddingLibraryTable } from './EmbeddingLibraryTable'
import {
  getAdminConsoleOverview,
  getAdminEmbeddingLibrary,
  getAdminEmbeddingReindexPolicy,
  patchAdminEmbeddingReindexPolicy,
  postAdminTestEmbedding,
  type AdminConnectivityResult,
  type EmbeddingReindexPolicy,
} from '../../services/api'

function formatDebounce(seconds: number): string {
  if (seconds >= 3600) {
    return `Debounced ${(seconds / 3600).toFixed(1)} h`
  }
  if (seconds >= 60) {
    return `Debounced ${Math.round(seconds / 60)} min`
  }
  return `Debounced ${seconds}s`
}

function triggerLabel(trigger: string): string {
  if (trigger === 'on_document_change') return 'On document change'
  return trigger.replace(/_/g, ' ')
}

function formatApiErr(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as { detail: unknown }).detail
    if (typeof d === 'string') return d
    try {
      return JSON.stringify(d)
    } catch {
      return 'Request failed'
    }
  }
  return err instanceof Error ? err.message : 'Request failed'
}

export function EmbeddingsSection(): ReactElement {
  const qc = useQueryClient()

  const overviewQ = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => getAdminConsoleOverview(),
    retry: false,
  })

  const libraryQ = useQuery({
    queryKey: ['admin', 'embeddings', 'library'],
    queryFn: () => getAdminEmbeddingLibrary(),
    retry: false,
  })

  const policyQ = useQuery({
    queryKey: ['admin', 'embeddings', 'reindex-policy'],
    queryFn: () => getAdminEmbeddingReindexPolicy(),
  })

  const [policyDraft, setPolicyDraft] = useState<Partial<EmbeddingReindexPolicy> | null>(null)

  useEffect(() => {
    if (policyQ.data) {
      setPolicyDraft(policyQ.data)
    }
  }, [policyQ.data])

  const patchPolicyMut = useMutation({
    mutationFn: (body: Parameters<typeof patchAdminEmbeddingReindexPolicy>[0]) =>
      patchAdminEmbeddingReindexPolicy(body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'embeddings', 'reindex-policy'] })
    },
  })

  const testEmbedMut = useMutation({
    mutationFn: () => postAdminTestEmbedding(),
  })

  const liveOverview = overviewQ.isSuccess ? overviewQ.data : undefined
  const chunkTotal = liveOverview?.embedding_collection_count ?? null

  const librarySums = useMemo(() => {
    const list = libraryQ.data ?? []
    return {
      artifacts: list.reduce((s, r) => s + r.artifact_count, 0),
      embedded: list.reduce((s, r) => s + r.embedded_artifact_count, 0),
      artChunks: list.reduce((s, r) => s + r.artifact_vector_chunks, 0),
      secChunks: list.reduce((s, r) => s + r.section_vector_chunks, 0),
    }
  }, [libraryQ.data])

  const policy = policyQ.data
  const policyErr = patchPolicyMut.isError ? formatApiErr(patchPolicyMut.error) : null

  const submitPolicy = (): void => {
    if (!policyDraft) return
    const body: Parameters<typeof patchAdminEmbeddingReindexPolicy>[0] = {}
    if (policy) {
      if (policyDraft.auto_reindex_trigger !== policy.auto_reindex_trigger) {
        body.auto_reindex_trigger = policyDraft.auto_reindex_trigger ?? undefined
      }
      if (policyDraft.debounce_seconds !== policy.debounce_seconds) {
        body.debounce_seconds = policyDraft.debounce_seconds
      }
      if (policyDraft.drift_threshold_pct !== policy.drift_threshold_pct) {
        body.drift_threshold_pct = policyDraft.drift_threshold_pct ?? undefined
      }
      if (policyDraft.retention_days !== policy.retention_days) {
        body.retention_days = policyDraft.retention_days
      }
    }
    if (Object.keys(body).length === 0) return
    patchPolicyMut.mutate(body)
  }

  const testResult: AdminConnectivityResult | undefined = testEmbedMut.data
  const testErr = testEmbedMut.isError ? formatApiErr(testEmbedMut.error) : null

  return (
    <div className="space-y-6">
      <PageTitle
        title="Embeddings"
        subtitle="Vector indexes for artifact libraries and spec sections. Configure embedding model IDs and keys under Admin Console → LLM (provider registry and embeddings routing rule). Here: library coverage per studio, reindex policy, and connectivity probe."
        actions={
          <Btn
            type="button"
            size="sm"
            disabled={testEmbedMut.isPending}
            onClick={() => testEmbedMut.mutate()}
          >
            {testEmbedMut.isPending ? 'Testing…' : 'Test embedding API'}
          </Btn>
        }
      />

      {testResult ? (
        <p
          className={`text-[12px] ${testResult.ok ? 'text-emerald-400' : 'text-amber-400'}`}
        >
          {testResult.message}
          {testResult.detail ? (
            <span className="mt-1 block whitespace-pre-wrap text-zinc-500">{testResult.detail}</span>
          ) : null}
        </p>
      ) : null}
      {testErr ? <p className="text-[12px] text-rose-300">{testErr}</p> : null}

      {policyQ.isError ? (
        <p className="text-[12px] text-rose-300">Could not load reindex policy.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Library artifacts"
          value={libraryQ.isSuccess ? librarySums.artifacts : '—'}
          sub={
            libraryQ.isSuccess
              ? 'studio + software + project docs in scope'
              : 'load directory for totals'
          }
        />
        <KpiTile
          label="Embedded (artifacts)"
          value={libraryQ.isSuccess ? librarySums.embedded : '—'}
          sub="embedding_status = embedded"
        />
        <KpiTile
          label="Artifact vector chunks"
          value={libraryQ.isSuccess ? librarySums.artChunks.toLocaleString() : '—'}
          sub={libraryQ.isSuccess ? 'rows in artifact_chunks' : 'load library to see split'}
        />
        <KpiTile
          label="Section vector chunks"
          value={libraryQ.isSuccess ? librarySums.secChunks.toLocaleString() : '—'}
          sub={
            libraryQ.isSuccess
              ? 'rows in section_chunks'
              : overviewQ.isSuccess && chunkTotal != null
                ? `overview total indexed rows: ${chunkTotal} (combined)`
                : '—'
          }
        />
      </div>

      <Card title="Artifact library (by studio)">
        <p className="px-5 pt-3 text-[12px] leading-relaxed text-zinc-500">
          Same scope as the studio artifact library: studio-wide uploads, each software&apos;s
          software-library and project artifacts. Open a studio to upload or manage files.
        </p>
        <EmbeddingLibraryTable
          rows={libraryQ.data}
          isPending={libraryQ.isPending}
          errorMessage={libraryQ.isError ? formatApiErr(libraryQ.error) : null}
        />
      </Card>

      <Card title="Reindex policy">
        {policyErr ? (
          <p className="px-5 pt-3 text-[12px] text-rose-300">{policyErr}</p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3">
          {policy && policyDraft ? (
            <>
              <PolicyTile
                title="Auto-reindex"
                value={triggerLabel(policyDraft.auto_reindex_trigger ?? policy.auto_reindex_trigger)}
                sub={formatDebounce(policyDraft.debounce_seconds ?? policy.debounce_seconds)}
              />
              <PolicyTile
                title="Drift threshold"
                value={`${policyDraft.drift_threshold_pct ?? policy.drift_threshold_pct}%`}
                sub="Mark stale above this"
              />
              <PolicyTile
                title="Retention"
                value={`${policyDraft.retention_days ?? policy.retention_days} days`}
                sub="Older versions purged"
              />
            </>
          ) : policyQ.isPending ? (
            <p className="col-span-full text-[13px] text-zinc-500">Loading policy…</p>
          ) : (
            <p className="col-span-full text-[13px] text-zinc-500">No policy loaded.</p>
          )}
        </div>

        {policy && policyDraft ? (
          <div className="space-y-3 border-t border-zinc-800/60 px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Edit policy
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-[12px] text-zinc-400">
                Trigger
                <input
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
                  value={policyDraft.auto_reindex_trigger ?? ''}
                  onChange={(e) =>
                    setPolicyDraft((d) =>
                      d ? { ...d, auto_reindex_trigger: e.target.value } : d,
                    )
                  }
                />
              </label>
              <label className="block text-[12px] text-zinc-400">
                Debounce (seconds)
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
                  value={policyDraft.debounce_seconds ?? ''}
                  onChange={(e) =>
                    setPolicyDraft((d) =>
                      d ? { ...d, debounce_seconds: Number.parseInt(e.target.value, 10) || 0 } : d,
                    )
                  }
                />
              </label>
              <label className="block text-[12px] text-zinc-400">
                Drift threshold (%)
                <input
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
                  value={policyDraft.drift_threshold_pct ?? ''}
                  onChange={(e) =>
                    setPolicyDraft((d) =>
                      d ? { ...d, drift_threshold_pct: e.target.value } : d,
                    )
                  }
                />
              </label>
              <label className="block text-[12px] text-zinc-400">
                Retention (days)
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
                  value={policyDraft.retention_days ?? ''}
                  onChange={(e) =>
                    setPolicyDraft((d) =>
                      d ? { ...d, retention_days: Number.parseInt(e.target.value, 10) || 1 } : d,
                    )
                  }
                />
              </label>
            </div>
            <Btn
              type="button"
              tone="primary"
              style={{ background: ADMIN_CONSOLE_ACCENT }}
              disabled={patchPolicyMut.isPending}
              onClick={submitPolicy}
            >
              {patchPolicyMut.isPending ? 'Saving…' : 'Save policy'}
            </Btn>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
