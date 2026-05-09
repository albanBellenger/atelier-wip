import type { ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  Dot,
  KpiTile,
  PageTitle,
  Pill,
  PolicyTile,
  Table,
  THead,
  TRow,
} from '../../components/admin/adminPrimitives'
import { EmbeddingLibraryTable } from './EmbeddingLibraryTable'
import {
  deleteAdminEmbeddingModel,
  getAdminConsoleOverview,
  getAdminEmbeddingLibrary,
  getAdminEmbeddingModels,
  getAdminEmbeddingReindexPolicy,
  patchAdminEmbeddingReindexPolicy,
  postAdminTestEmbedding,
  putAdminEmbeddingModel,
  type AdminConnectivityResult,
  type EmbeddingModelUpsertBody,
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

function defaultRolePill(role: string | null): ReactElement {
  if (role === 'default') {
    return (
      <Pill tone="violet">
        <Dot tone="violet" />
        deployment default
      </Pill>
    )
  }
  if (role === 'multimodal') {
    return <Pill tone="zinc">multimodal default</Pill>
  }
  if (role) {
    return <span className="text-[11px] text-zinc-400">{role}</span>
  }
  return <span className="text-[11px] text-zinc-500">—</span>
}

export function EmbeddingsSection(): ReactElement {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [modelForm, setModelForm] = useState<EmbeddingModelUpsertBody>({
    model_id: '',
    provider_name: '',
    dim: 1536,
    cost_per_million_usd: null,
    region: null,
    default_role: null,
    litellm_provider_slug: null,
  })

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

  const modelsQ = useQuery({
    queryKey: ['admin', 'embeddings', 'models'],
    queryFn: () => getAdminEmbeddingModels(),
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

  const upsertModelMut = useMutation({
    mutationFn: (body: EmbeddingModelUpsertBody) =>
      putAdminEmbeddingModel(body.model_id.trim(), body),
    onSuccess: async () => {
      setAddOpen(false)
      setModelForm({
        model_id: '',
        provider_name: '',
        dim: 1536,
        cost_per_million_usd: null,
        region: null,
        default_role: null,
        litellm_provider_slug: null,
      })
      await qc.invalidateQueries({ queryKey: ['admin', 'embeddings', 'models'] })
    },
  })

  const deleteModelMut = useMutation({
    mutationFn: (modelId: string) => deleteAdminEmbeddingModel(modelId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'embeddings', 'models'] })
    },
  })

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

  const models = modelsQ.data ?? []
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
        subtitle="Vector indexes for artifact libraries and spec sections. Live embedding calls use Admin Console → LLM (provider keys plus the embeddings routing rule). Here: optional model catalog metadata, library coverage per studio, reindex policy, and connectivity probe."
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

      {modelsQ.isError ? (
        <p className="text-[12px] text-rose-300">Could not load embedding model registry.</p>
      ) : null}
      {policyQ.isError ? (
        <p className="text-[12px] text-rose-300">Could not load reindex policy.</p>
      ) : null}
      {upsertModelMut.isError ? (
        <p className="text-[12px] text-rose-300">{formatApiErr(upsertModelMut.error)}</p>
      ) : null}
      {deleteModelMut.isError ? (
        <p className="text-[12px] text-rose-300">{formatApiErr(deleteModelMut.error)}</p>
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

      <Card
        title="Embedding models"
        right={
          <Btn
            type="button"
            tone="primary"
            style={{ background: ADMIN_CONSOLE_ACCENT }}
            onClick={() => setAddOpen(true)}
          >
            + Add model
          </Btn>
        }
      >
        <Table>
          <THead
            cols={['Model', 'Provider', 'Dim', 'Cost / 1M tokens', 'Region', 'Default for', '']}
            grid="grid-cols-[1.4fr_0.8fr_0.45fr_1fr_0.65fr_1fr_minmax(7rem,auto)]"
          />
          {models.map((m) => (
            <TRow
              key={m.id}
              grid="grid-cols-[1.4fr_0.8fr_0.45fr_1fr_0.65fr_1fr_minmax(7rem,auto)]"
            >
              <div className="min-w-0">
                <span className="block truncate font-mono text-[12px] text-zinc-100">{m.model_id}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                  LiteLLM: {(m.litellm_provider_slug ?? m.provider_name).toLowerCase()}
                </span>
              </div>
              <span className="text-[12px] text-zinc-300">{m.provider_name}</span>
              <span className="font-mono text-[12px] tabular-nums text-zinc-300">{m.dim}</span>
              <span className="font-mono text-[12px] tabular-nums text-zinc-300">
                {m.cost_per_million_usd != null
                  ? `$${Number.parseFloat(m.cost_per_million_usd).toFixed(4)}`
                  : '—'}
              </span>
              <span className="text-[12px] text-zinc-300">{m.region ?? '—'}</span>
              <span>{defaultRolePill(m.default_role)}</span>
              <div className="flex justify-end gap-1.5">
                <Btn
                  type="button"
                  size="sm"
                  disabled={deleteModelMut.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove model ${m.model_id} from the registry?`)) {
                      deleteModelMut.mutate(m.model_id)
                    }
                  }}
                >
                  Remove
                </Btn>
              </div>
            </TRow>
          ))}
        </Table>
        {models.length === 0 && !modelsQ.isPending ? (
          <p className="border-t border-zinc-800/60 px-5 py-3 text-[11px] text-zinc-500">
            No models registered. Add one or use{' '}
            <span className="font-mono">PUT /admin/embeddings/models/{"{id}"}</span>.
          </p>
        ) : null}
      </Card>

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

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          role="presentation"
          onClick={() => !upsertModelMut.isPending && setAddOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="embed-model-title"
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="embed-model-title" className="text-[15px] font-medium text-zinc-100">
              Add embedding model
            </h2>
            <p className="mt-1 text-[12px] text-zinc-500">
              Registers a model ID for routing; runtime still uses Tool settings API keys until
              configured.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-[12px] text-zinc-400">
                Model ID
                <input
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
                  value={modelForm.model_id}
                  onChange={(e) => setModelForm((f) => ({ ...f, model_id: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="block text-[12px] text-zinc-400">
                Provider
                <input
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-[12px] text-zinc-200"
                  value={modelForm.provider_name}
                  onChange={(e) =>
                    setModelForm((f) => ({ ...f, provider_name: e.target.value }))
                  }
                />
              </label>
              <label className="block text-[12px] text-zinc-400">
                LiteLLM provider slug (optional)
                <input
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
                  value={modelForm.litellm_provider_slug ?? ''}
                  placeholder="e.g. openai — overrides prefix for short model ids"
                  onChange={(e) =>
                    setModelForm((f) => ({
                      ...f,
                      litellm_provider_slug: e.target.value.trim() || null,
                    }))
                  }
                  autoComplete="off"
                />
              </label>
              <p className="text-[11px] text-zinc-600">
                When the model id has no slash, LiteLLM uses this slug (if set) or the provider name
                as prefix. See{' '}
                <a
                  href="https://docs.litellm.ai/docs/providers"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-400 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  LiteLLM providers
                </a>
                .
              </p>
              <label className="block text-[12px] text-zinc-400">
                Dimensions
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
                  value={modelForm.dim}
                  onChange={(e) =>
                    setModelForm((f) => ({
                      ...f,
                      dim: Number.parseInt(e.target.value, 10) || 1,
                    }))
                  }
                />
              </label>
              <label className="block text-[12px] text-zinc-400">
                Cost / 1M tokens (USD, optional)
                <input
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
                  value={modelForm.cost_per_million_usd ?? ''}
                  placeholder="0.02"
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    setModelForm((f) => ({
                      ...f,
                      cost_per_million_usd: v === '' ? null : v,
                    }))
                  }}
                />
              </label>
              <label className="block text-[12px] text-zinc-400">
                Region (optional)
                <input
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-[12px] text-zinc-200"
                  value={modelForm.region ?? ''}
                  onChange={(e) =>
                    setModelForm((f) => ({
                      ...f,
                      region: e.target.value.trim() || null,
                    }))
                  }
                />
              </label>
              <label className="block text-[12px] text-zinc-400">
                Default role (optional)
                <select
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-[12px] text-zinc-200"
                  value={modelForm.default_role ?? ''}
                  onChange={(e) =>
                    setModelForm((f) => ({
                      ...f,
                      default_role: e.target.value === '' ? null : e.target.value,
                    }))
                  }
                >
                  <option value="">—</option>
                  <option value="default">default</option>
                  <option value="multimodal">multimodal</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn
                type="button"
                disabled={upsertModelMut.isPending}
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Btn>
              <Btn
                type="button"
                tone="primary"
                style={{ background: ADMIN_CONSOLE_ACCENT }}
                disabled={
                  upsertModelMut.isPending ||
                  !modelForm.model_id.trim() ||
                  !modelForm.provider_name.trim()
                }
                onClick={() => {
                  const mid = modelForm.model_id.trim()
                  upsertModelMut.mutate({
                    ...modelForm,
                    model_id: mid,
                    provider_name: modelForm.provider_name.trim(),
                  })
                }}
              >
                {upsertModelMut.isPending ? 'Saving…' : 'Save model'}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
