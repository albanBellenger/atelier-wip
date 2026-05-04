import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  Dot,
  Hairline,
  PageTitle,
  Pill,
  ProviderGlyph,
  RouteRule,
  StatLabel,
  Table,
  THead,
  Toggle,
  TRow,
} from '../../components/admin/adminPrimitives'
import {
  type AdminLlmProbeBody,
  type LlmProviderRegistryRow,
  type LlmProviderUpsertBody,
  type StudioLlmPolicyRow,
  getAdminLlmDeployment,
  getAdminLlmRouting,
  getAdminStudioLlmPolicy,
  listStudios,
  postAdminTestLlm,
  putAdminLlmProvider,
  putAdminStudioLlmPolicy,
} from '../../services/api'

const EMPTY_LLM_PROVIDERS: LlmProviderRegistryRow[] = []

function StudioSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (id: string) => void
  options: { id: string; name: string }[]
}): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-[12px] text-zinc-200"
    >
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

function normalizeProviderKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 64)
}

function parseModelIds(text: string): string[] {
  return text
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatProviderMutationErr(err: unknown): string {
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

function AddProviderModal({
  open,
  onClose,
  isPending,
  error,
  onRegister,
}: {
  open: boolean
  onClose: () => void
  isPending: boolean
  error?: unknown
  onRegister: (args: { providerKey: string; body: LlmProviderUpsertBody }) => void
}): ReactElement | null {
  const [providerKey, setProviderKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [modelsText, setModelsText] = useState('')
  const [region, setRegion] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [status, setStatus] = useState<'connected' | 'disabled' | 'needs-key'>('needs-key')
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    if (!open) return
    setProviderKey('')
    setDisplayName('')
    setModelsText('')
    setRegion('')
    setApiBaseUrl('')
    setStatus('needs-key')
    setIsDefault(false)
  }, [open])

  if (!open) {
    return null
  }

  const submit = (): void => {
    const pk = normalizeProviderKey(providerKey)
    const models = parseModelIds(modelsText)
    const name = displayName.trim()
    if (!pk || !name || models.length === 0) {
      return
    }
    const body: LlmProviderUpsertBody = {
      display_name: name,
      models,
      region: region.trim() || null,
      api_base_url: apiBaseUrl.trim() || null,
      status,
      is_default: isDefault,
      sort_order: 0,
    }
    onRegister({ providerKey: pk, body })
  }

  const errText =
    error !== undefined && error !== null ? formatProviderMutationErr(error) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="llm-add-provider-title"
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="llm-add-provider-title" className="text-[15px] font-medium text-zinc-100">
          Register LLM provider
        </h2>
        <p className="mt-1 text-[12px] text-zinc-500">
          Adds a row to the routing registry (model allow-list for policy). Inference still uses the
          OpenAI-compatible API key and base URL from{' '}
          <Link className="text-violet-400 hover:underline" to="/admin/settings">
            Tool admin settings
          </Link>
          ; Phase 3 may add per-provider encrypted keys.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-key">Provider key</label>
            </StatLabel>
            <input
              id="llm-add-provider-key"
              value={providerKey}
              onChange={(e) => setProviderKey(normalizeProviderKey(e.target.value))}
              autoComplete="off"
              placeholder="e.g. anthropic_eu"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-name">Display name</label>
            </StatLabel>
            <input
              id="llm-add-provider-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Shown in admin UI"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-models">Model IDs</label>
            </StatLabel>
            <textarea
              id="llm-add-provider-models"
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              rows={2}
              placeholder="Comma-separated, e.g. claude-sonnet-4.5, claude-haiku-4.5"
              className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-region">Region (optional)</label>
            </StatLabel>
            <input
              id="llm-add-provider-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. EU"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-api-base">API base URL (optional)</label>
            </StatLabel>
            <input
              id="llm-add-provider-api-base"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              autoComplete="off"
              placeholder="https://api.example.com/v1"
              title="Optional. Saved on this registry row. Live LLM calls still use the base URL from Tool admin settings until per-provider routing uses this field."
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-status">Status</label>
            </StatLabel>
            <select
              id="llm-add-provider-status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as 'connected' | 'disabled' | 'needs-key')
              }
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-zinc-600"
            >
              <option value="needs-key">Needs key</option>
              <option value="connected">Connected</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-300">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-950"
            />
            Mark as default provider for routing hints
          </label>
        </div>
        {errText ? (
          <p className="mt-3 text-[12px] text-rose-300" role="alert">
            {errText}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Btn type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Btn>
          <Btn
            type="button"
            tone="primary"
            style={{ background: ADMIN_CONSOLE_ACCENT }}
            disabled={
              isPending ||
              !normalizeProviderKey(providerKey) ||
              !displayName.trim() ||
              parseModelIds(modelsText).length === 0
            }
            onClick={submit}
          >
            {isPending ? 'Saving…' : 'Register provider'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

function buildPolicyRows(
  providers: LlmProviderRegistryRow[],
  existing: StudioLlmPolicyRow[] | undefined,
): StudioLlmPolicyRow[] {
  const map = new Map(existing?.map((r) => [r.provider_key, r]) ?? [])
  return providers.map((p) => {
    const prev = map.get(p.provider_key)
    const defaultModel = p.models[0] ?? null
    return {
      provider_key: p.provider_key,
      enabled: prev?.enabled ?? false,
      selected_model: prev?.selected_model && p.models.includes(prev.selected_model)
        ? prev.selected_model
        : defaultModel,
    }
  })
}

export function LlmSection(): ReactElement {
  const qc = useQueryClient()
  const [studioId, setStudioId] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({})

  const studiosQ = useQuery({
    queryKey: ['studios'],
    queryFn: () => listStudios(),
  })

  const deploymentQ = useQuery({
    queryKey: ['admin', 'llm', 'deployment'],
    queryFn: () => getAdminLlmDeployment(),
  })

  const routingQ = useQuery({
    queryKey: ['admin', 'llm', 'routing'],
    queryFn: () => getAdminLlmRouting(),
  })

  const testLlmMut = useMutation({
    mutationFn: (body: AdminLlmProbeBody = {}) => postAdminTestLlm(body),
  })

  const policyQ = useQuery({
    queryKey: ['admin', 'llm', 'policy', studioId],
    queryFn: () => getAdminStudioLlmPolicy(studioId),
    enabled: Boolean(studioId),
  })

  useEffect(() => {
    const list = studiosQ.data
    if (!list?.length) return
    setStudioId((prev) => {
      if (prev && list.some((s) => s.id === prev)) return prev
      return list[0].id
    })
  }, [studiosQ.data])

  const savePolicy = useMutation({
    mutationFn: ({ sid, rows }: { sid: string; rows: StudioLlmPolicyRow[] }) =>
      putAdminStudioLlmPolicy(sid, { rows }),
    onSuccess: async (_, { sid }) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'policy', sid] })
    },
  })

  const addProvider = useMutation({
    mutationFn: (args: { providerKey: string; body: LlmProviderUpsertBody }) =>
      putAdminLlmProvider(args.providerKey, args.body),
    onSuccess: async () => {
      setAddOpen(false)
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'deployment'] })
    },
  })

  const providers = deploymentQ.data?.providers ?? EMPTY_LLM_PROVIDERS
  const credentials = deploymentQ.data?.credentials

  useEffect(() => {
    const m: Record<string, string> = {}
    for (const pr of providers) {
      m[pr.provider_key] = pr.models.join(', ')
    }
    setModelDrafts(m)
  }, [providers])

  const updateRegistry = useMutation({
    mutationFn: ({ key, body }: { key: string; body: LlmProviderUpsertBody }) =>
      putAdminLlmProvider(key, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'deployment'] })
    },
  })

  const rowsForStudio = useMemo(
    () => buildPolicyRows(providers, policyQ.data),
    [providers, policyQ.data],
  )

  const persistRows = useCallback(
    (next: StudioLlmPolicyRow[]) => {
      if (!studioId) return
      savePolicy.mutate({ sid: studioId, rows: next })
    },
    [studioId, savePolicy],
  )

  const updateRow = useCallback(
    (providerKey: string, patch: Partial<Pick<StudioLlmPolicyRow, 'enabled' | 'selected_model'>>) => {
      const next = rowsForStudio.map((r) =>
        r.provider_key === providerKey ? { ...r, ...patch } : r,
      )
      persistRows(next)
    },
    [persistRows, rowsForStudio],
  )

  const studioName =
    studiosQ.data?.find((s) => s.id === studioId)?.name ?? 'This studio'

  return (
    <div className="space-y-6">
      <PageTitle
        title="LLM connectivity"
        subtitle="One deployment: Tool admin credentials for live inference, plus a routing registry and per-studio policy when configured."
      />

      {policyQ.isError ? (
        <p className="text-[12px] text-rose-300">Could not load studio LLM policy.</p>
      ) : null}

      <Card
        title="LLM deployment"
        right={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="text-[12px] font-medium text-violet-400 hover:underline"
              to="/admin/settings"
            >
              Tool settings
            </Link>
            <Btn
              type="button"
              tone="primary"
              aria-label="Add provider"
              style={{ background: ADMIN_CONSOLE_ACCENT }}
              onClick={() => setAddOpen(true)}
            >
              + Add provider
            </Btn>
          </div>
        }
      >
        {deploymentQ.isPending ? (
          <p className="px-5 py-6 text-[13px] text-zinc-500">Loading LLM deployment…</p>
        ) : null}
        {deploymentQ.isError ? (
          <p className="px-5 py-6 text-[13px] text-rose-300">Could not load deployment data.</p>
        ) : null}
        {credentials ? (
          <>
            <div className="space-y-4 px-5 py-4">
              <StatLabel>Live inference credentials</StatLabel>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                All LLM calls use the{' '}
                <span className="text-zinc-200">OpenAI-compatible</span> endpoint, API key, and
                fallback model from{' '}
                <Link className="text-violet-400 hover:underline" to="/admin/settings">
                  /admin/settings
                </Link>
                . When the registry and routing rules below are configured, the effective model
                can override the fallback per studio and call type.
              </p>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-[10.5px] uppercase tracking-wide text-zinc-500">Provider</dt>
                  <dd className="mt-0.5 font-mono text-[13px] text-zinc-200">
                    {(credentials.llm_provider ?? '').trim() || 'openai (default)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10.5px] uppercase tracking-wide text-zinc-500">
                    Fallback model
                  </dt>
                  <dd className="mt-0.5 font-mono text-[13px] text-zinc-200">
                    {(credentials.llm_model ?? '').trim() || '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10.5px] uppercase tracking-wide text-zinc-500">API base URL</dt>
                  <dd className="mt-0.5 break-all font-mono text-[12px] text-zinc-300">
                    {(credentials.llm_api_base_url ?? '').trim() || 'Default host'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10.5px] uppercase tracking-wide text-zinc-500">API key</dt>
                  <dd className="mt-0.5 text-[13px] text-zinc-200">
                    {credentials.llm_api_key_set ? (
                      <span className="text-emerald-400/90">Stored</span>
                    ) : (
                      <span className="text-amber-400/90">Not set — configure in Tool settings</span>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="border-t border-zinc-800/60 pt-3">
                <p className="text-[11px] text-zinc-500">
                  Sends a minimal chat completion probe using the saved credentials (same as Tool
                  settings).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Btn
                    type="button"
                    size="sm"
                    disabled={testLlmMut.isPending}
                    onClick={() => testLlmMut.mutate({})}
                  >
                    {testLlmMut.isPending ? 'Testing…' : 'Test LLM'}
                  </Btn>
                </div>
              </div>
            </div>
            <Hairline className="mx-5" />
            <div className="px-5 py-4">
              <StatLabel>Routing registry</StatLabel>
              <p className="mt-2 text-[12px] text-zinc-500">
                Registered providers and model IDs for routing and studio allow-lists. Keys remain in
                Tool settings.
              </p>
              {providers.length === 0 ? (
                <p className="mt-4 px-0 py-2 text-[13px] text-zinc-500">
                  No rows yet. Use <span className="font-medium text-zinc-300">Add provider</span> or
                  seed via API.
                </p>
              ) : (
                <div className="mt-4">
                  <Table>
                    <THead
                      cols={[
                        'Provider',
                        'Models',
                        'Region',
                        'API base',
                        'API key',
                        'Last used',
                        'Status',
                        'Actions',
                      ]}
                      grid="grid-cols-[1.05fr_1.5fr_0.45fr_1fr_0.75fr_0.45fr_0.65fr_0.9fr]"
                    />
                    {providers.map((p) => {
                      const savingThis =
                        updateRegistry.isPending && updateRegistry.variables?.key === p.provider_key
                      const draft = modelDrafts[p.provider_key] ?? p.models.join(', ')
                      return (
                        <TRow
                          key={p.id}
                          grid="grid-cols-[1.05fr_1.5fr_0.45fr_1fr_0.75fr_0.45fr_0.65fr_0.9fr]"
                        >
                          <div className="flex items-center gap-2">
                            <ProviderGlyph name={p.display_name} />
                            <span className="truncate text-[13px] text-zinc-100">{p.display_name}</span>
                            {p.is_default ? <Pill tone="violet">default</Pill> : null}
                          </div>
                          <div className="min-w-0">
                            <label className="sr-only" htmlFor={`model-draft-${p.provider_key}`}>
                              Model IDs for {p.display_name}
                            </label>
                            <textarea
                              id={`model-draft-${p.provider_key}`}
                              className="w-full min-h-[52px] resize-y rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-[10.5px] leading-snug text-zinc-300 placeholder:text-zinc-600"
                              value={draft}
                              onChange={(e) =>
                                setModelDrafts((prev) => ({
                                  ...prev,
                                  [p.provider_key]: e.target.value,
                                }))
                              }
                              spellCheck={false}
                              rows={2}
                            />
                            <p className="mt-1 text-[10px] text-zinc-600">
                              Comma or newline separated.
                            </p>
                          </div>
                          <span className="text-[12px] text-zinc-300">{p.region ?? '—'}</span>
                          <span
                            className="truncate font-mono text-[10px] text-zinc-400"
                            title={p.api_base_url ?? undefined}
                          >
                            {p.api_base_url ?? '—'}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-400">
                            {p.key_preview ?? '—'}
                          </span>
                          <span className="text-[11px] text-zinc-500">—</span>
                          <span>
                            {p.status === 'connected' ? (
                              <Pill tone="emerald">
                                <Dot tone="emerald" />
                                connected
                              </Pill>
                            ) : null}
                            {p.status === 'disabled' ? <Pill tone="zinc">disabled</Pill> : null}
                            {p.status === 'needs-key' ? (
                              <Pill tone="amber">needs key</Pill>
                            ) : null}
                          </span>
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                            <Btn
                              type="button"
                              size="sm"
                              disabled={savingThis || testLlmMut.isPending}
                              onClick={() => {
                                const models = parseModelIds(
                                  modelDrafts[p.provider_key] ?? '',
                                )
                                updateRegistry.mutate({
                                  key: p.provider_key,
                                  body: {
                                    display_name: p.display_name,
                                    models,
                                    region: p.region,
                                    api_base_url: p.api_base_url,
                                    status: p.status,
                                    is_default: p.is_default,
                                    key_preview: p.key_preview,
                                    sort_order: p.sort_order,
                                  },
                                })
                              }}
                            >
                              {savingThis ? 'Saving…' : 'Save'}
                            </Btn>
                            <Btn
                              type="button"
                              size="sm"
                              disabled={testLlmMut.isPending || savingThis}
                              onClick={() => {
                                const parsed = parseModelIds(
                                  modelDrafts[p.provider_key] ?? '',
                                )
                                const model = parsed[0] ?? p.models[0]
                                const trimmedBase = p.api_base_url?.trim()
                                const body: AdminLlmProbeBody = {}
                                if (model) body.model = model
                                if (trimmedBase) body.api_base_url = trimmedBase
                                testLlmMut.mutate(body)
                              }}
                            >
                              {testLlmMut.isPending ? 'Testing…' : 'Test'}
                            </Btn>
                          </div>
                        </TRow>
                      )
                    })}
                  </Table>
                </div>
              )}
              {updateRegistry.isError ? (
                <p className="mt-3 text-[12px] text-rose-300">
                  {formatProviderMutationErr(updateRegistry.error)}
                </p>
              ) : null}
            </div>
            <div className="border-t border-zinc-800/60 px-5 py-4">
              <StatLabel>LLM probe result</StatLabel>
              <p className="mt-1 text-[11px] text-zinc-500">
                Shown for <span className="text-zinc-400">Test LLM</span> and per-row{' '}
                <span className="text-zinc-400">Test</span> in the registry.
              </p>
              {testLlmMut.data ? (
                <p
                  className={`mt-2 text-[12px] ${testLlmMut.data.ok ? 'text-emerald-400' : 'text-amber-400'}`}
                >
                  {testLlmMut.data.message}
                  {testLlmMut.data.detail ? (
                    <span className="mt-1 block whitespace-pre-wrap text-zinc-500">
                      {testLlmMut.data.detail}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {testLlmMut.isError ? (
                <p className="mt-2 text-[12px] text-rose-300">
                  {formatProviderMutationErr(testLlmMut.error)}
                </p>
              ) : null}
              {!testLlmMut.data && !testLlmMut.isError ? (
                <p className="mt-2 text-[12px] text-zinc-600">No probe run yet.</p>
              ) : null}
            </div>
          </>
        ) : null}
      </Card>

      <Card
        title="Per-studio enablement"
        right={
          studiosQ.data?.length ? (
            <StudioSelect
              value={studioId}
              onChange={setStudioId}
              options={studiosQ.data.map((s) => ({ id: s.id, name: s.name }))}
            />
          ) : (
            <span className="text-[12px] text-zinc-500">No studios</span>
          )
        }
      >
        <div className="border-b border-zinc-800/60 px-5 py-3 text-[12px] text-zinc-400">
          <span className="font-medium text-zinc-200">{studioName}</span>
          <span className="text-zinc-500">
            {' '}
            — toggle providers and pick the model ID used when this provider is selected.
          </span>
        </div>
        {!studioId || !providers.length ? (
          <p className="px-5 py-6 text-[13px] text-zinc-500">
            Select a studio and configure deployment providers first.
          </p>
        ) : (
          <ul>
            {providers.map((p, i) => {
              const row = rowsForStudio.find((r) => r.provider_key === p.provider_key)
              const enabled = Boolean(row?.enabled)
              const blocked = p.status !== 'connected'
              const modelVal =
                row?.selected_model && p.models.includes(row.selected_model)
                  ? row.selected_model
                  : (p.models[0] ?? '')
              return (
                <li
                  key={p.provider_key}
                  className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? 'border-t border-zinc-800/60' : ''}`}
                >
                  <ProviderGlyph name={p.display_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-zinc-100">{p.display_name}</span>
                      <span className="text-[11px] text-zinc-500">
                        · {p.region ?? '—'}
                      </span>
                      {blocked ? <Pill tone="amber">{p.status}</Pill> : null}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                      {p.models.join(' · ')}
                    </div>
                  </div>
                  <select
                    className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-[11.5px] text-zinc-300 disabled:opacity-50"
                    disabled={!enabled || blocked || savePolicy.isPending}
                    value={modelVal}
                    onChange={(e) =>
                      updateRow(p.provider_key, { selected_model: e.target.value })
                    }
                  >
                    {p.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <Toggle
                    checked={enabled}
                    disabled={blocked || savePolicy.isPending}
                    onChange={(v) => updateRow(p.provider_key, { enabled: v })}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Routing & fallback policy">
        <div className="space-y-3 px-5 py-4 text-[13px] text-zinc-300">
          {routingQ.isLoading ? (
            <p className="text-zinc-500">Loading routing…</p>
          ) : routingQ.data?.length ? (
            routingQ.data.map((r) => (
              <RouteRule
                key={r.use_case}
                label={r.use_case.replace(/_/g, ' ')}
                model={r.primary_model}
                fallback={r.fallback_model ?? '—'}
              />
            ))
          ) : (
            <p className="text-zinc-500">
              No routing rules configured. Add rows via{' '}
              <span className="font-mono text-zinc-400">PUT /admin/llm/routing</span>.
            </p>
          )}
        </div>
      </Card>
      <AddProviderModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          addProvider.reset()
        }}
        isPending={addProvider.isPending}
        error={addProvider.isError ? addProvider.error : undefined}
        onRegister={(args) => addProvider.mutate(args)}
      />
    </div>
  )
}
