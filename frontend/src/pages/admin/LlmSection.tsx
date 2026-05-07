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
  StatLabel,
  Table,
  THead,
  Toggle,
  TRow,
} from '../../components/admin/adminPrimitives'
import { LlmModelSuggestInput } from '../../components/admin/LlmModelSuggestInput'
import {
  type AdminLlmProbeBody,
  type LlmProviderRegistryRow,
  type LlmProviderUpsertBody,
  type LlmRoutingRuleRow,
  type StudioLlmPolicyRow,
  getAdminLlmDeployment,
  getAdminLlmRouting,
  getAdminStudioLlmPolicy,
  listStudios,
  postAdminTestLlm,
  putAdminLlmProvider,
  putAdminLlmRouting,
  putAdminStudioLlmPolicy,
} from '../../services/api'

const EMPTY_LLM_PROVIDERS: LlmProviderRegistryRow[] = []

const LITELLM_PROVIDERS_DOCS = 'https://docs.litellm.ai/docs/providers' as const

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

function appendUniqueModelId(currentText: string, id: string): string {
  const t = id.trim()
  if (!t) return currentText
  const existing = parseModelIds(currentText)
  if (existing.includes(t)) return currentText
  return [...existing, t].join(', ')
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

const ROUTING_USE_CASE_OPTIONS: { value: string; label: string }[] = [
  { value: 'chat', label: 'Chat' },
  { value: 'code_gen', label: 'Code / work order generation' },
  { value: 'classification', label: 'Classification / drift' },
  { value: 'embeddings', label: 'Embeddings' },
]

function sortRoutingRules(rules: LlmRoutingRuleRow[]): LlmRoutingRuleRow[] {
  const order = ['chat', 'code_gen', 'classification', 'embeddings']
  return [...rules].sort((a, b) => {
    const ia = order.indexOf(a.use_case)
    const ib = order.indexOf(b.use_case)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.use_case.localeCompare(b.use_case)
  })
}

function routingUseCaseLabel(useCase: string): string {
  return ROUTING_USE_CASE_OPTIONS.find((o) => o.value === useCase)?.label ?? useCase
}

function AddRoutingModal({
  open,
  onClose,
  blockedUseCasesCsv,
  catalogSlug,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  blockedUseCasesCsv: string
  /** LiteLLM catalog provider filter for suggestions (registry slug or provider key). */
  catalogSlug: string
  onAdd: (row: LlmRoutingRuleRow) => void
}): ReactElement | null {
  const existingKeys = blockedUseCasesCsv
    ? blockedUseCasesCsv.split(',').filter((s) => s.length > 0)
    : []
  const options = ROUTING_USE_CASE_OPTIONS.filter((o) => !existingKeys.includes(o.value))
  const [useCase, setUseCase] = useState('')
  const [primary, setPrimary] = useState('')
  const [fallback, setFallback] = useState('')

  useEffect(() => {
    if (!open) return
    const keys = blockedUseCasesCsv
      ? blockedUseCasesCsv.split(',').filter((s) => s.length > 0)
      : []
    const opts = ROUTING_USE_CASE_OPTIONS.filter((o) => !keys.includes(o.value))
    setUseCase(opts[0]?.value ?? '')
    setPrimary('')
    setFallback('')
  }, [open, blockedUseCasesCsv])

  if (!open) {
    return null
  }

  const catalogMode = useCase === 'embeddings' ? 'embedding' : 'chat'

  const submit = (): void => {
    const pk = primary.trim()
    if (!useCase || !pk) return
    onAdd({
      use_case: useCase,
      primary_model: pk,
      fallback_model: fallback.trim() || null,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="llm-add-routing-title"
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="llm-add-routing-title" className="text-[15px] font-medium text-zinc-100">
          Add routing rule
        </h2>
        <p className="mt-1 text-[12px] text-zinc-500">
          Maps a call type to a primary model and optional fallback. Models must appear on a
          connected registry provider to take effect for studios with policy configured. For LiteLLM,
          use short ids in lists when the provider row has a{' '}
          <span className="font-mono text-zinc-400">LiteLLM provider slug</span>, or enter{' '}
          <span className="font-mono text-zinc-400">provider/model</span> here.{' '}
          <a
            href={LITELLM_PROVIDERS_DOCS}
            target="_blank"
            rel="noreferrer"
            className="text-violet-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Provider slugs (docs)
          </a>
        </p>
        <div className="mt-4 space-y-3">
          {options.length === 0 ? (
            <p className="text-[13px] text-amber-300/90">
              All built-in use cases already have a row. Remove a row below, save, then add again.
            </p>
          ) : (
            <>
              <div>
                <StatLabel>
                  <label htmlFor="llm-add-routing-use-case">Use case</label>
                </StatLabel>
                <select
                  id="llm-add-routing-use-case"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-zinc-600"
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <StatLabel>
                  <label htmlFor="llm-add-routing-primary">Primary model ID</label>
                </StatLabel>
                <LlmModelSuggestInput
                  id="llm-add-routing-primary"
                  listId="llm-add-routing-primary-dl"
                  value={primary}
                  onChange={setPrimary}
                  litellmProvider={catalogSlug.trim() || undefined}
                  mode={catalogMode}
                  placeholder="Catalog suggestions (opens with modal)"
                  minChars={0}
                  prefetch={open}
                  className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <StatLabel>
                  <label htmlFor="llm-add-routing-fallback">Fallback model ID (optional)</label>
                </StatLabel>
                <LlmModelSuggestInput
                  id="llm-add-routing-fallback"
                  listId="llm-add-routing-fallback-dl"
                  value={fallback}
                  onChange={setFallback}
                  litellmProvider={catalogSlug.trim() || undefined}
                  mode={catalogMode}
                  placeholder="Optional fallback"
                  minChars={0}
                  prefetch={open}
                  className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn type="button" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            type="button"
            tone="primary"
            style={{ background: ADMIN_CONSOLE_ACCENT }}
            disabled={options.length === 0 || !useCase || !primary.trim()}
            onClick={submit}
          >
            Add rule
          </Btn>
        </div>
      </div>
    </div>
  )
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
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [status, setStatus] = useState<'connected' | 'disabled' | 'needs-key'>('needs-key')
  const [isDefault, setIsDefault] = useState(false)
  const [litellmSlug, setLitellmSlug] = useState('')
  const [suggestAppend, setSuggestAppend] = useState('')

  useEffect(() => {
    if (!open) return
    setProviderKey('')
    setDisplayName('')
    setModelsText('')
    setApiBaseUrl('')
    setLlmApiKey('')
    setStatus('needs-key')
    setIsDefault(false)
    setLitellmSlug('')
    setSuggestAppend('')
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
      api_base_url: apiBaseUrl.trim() || null,
      status,
      is_default: isDefault,
      sort_order: 0,
      litellm_provider_slug: litellmSlug.trim() || null,
    }
    if (llmApiKey.trim()) {
      body.llm_api_key = llmApiKey.trim()
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
          Adds a row to the routing registry (model allow-list for policy). Optional per-provider
          OpenAI-compatible API key (encrypted at rest when{' '}
          <span className="font-mono text-zinc-400">ENCRYPTION_KEY</span> is set). If omitted,
          inference falls back to the key from{' '}
          <Link className="text-violet-400 hover:underline" to="/admin/settings">
            Platform settings · LLM keys
          </Link>
          .
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
            <p className="mt-1 text-[11px] text-zinc-600">
              Short ids are fine if LiteLLM can infer the provider; otherwise use{' '}
              <span className="font-mono text-zinc-500">provider/model</span> or set the slug below.{' '}
              <a
                href={LITELLM_PROVIDERS_DOCS}
                target="_blank"
                rel="noreferrer"
                className="text-violet-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                LiteLLM providers
              </a>
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <StatLabel>
                  <label htmlFor="llm-add-suggest-append">Add from LiteLLM catalog</label>
                </StatLabel>
                <LlmModelSuggestInput
                  id="llm-add-suggest-append"
                  listId="llm-add-suggest-append-dl"
                  value={suggestAppend}
                  onChange={setSuggestAppend}
                  providerKey={normalizeProviderKey(providerKey) || undefined}
                  litellmProvider={litellmSlug.trim() || undefined}
                  prefetch={open}
                  minChars={0}
                  placeholder="Search models, then append"
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>
              <Btn
                type="button"
                className="mb-0.5 shrink-0"
                onClick={() => {
                  setModelsText((t) => appendUniqueModelId(t, suggestAppend))
                  setSuggestAppend('')
                }}
              >
                Append
              </Btn>
            </div>
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-litellm-slug">LiteLLM provider slug (optional)</label>
            </StatLabel>
            <input
              id="llm-add-provider-litellm-slug"
              value={litellmSlug}
              onChange={(e) => setLitellmSlug(e.target.value)}
              autoComplete="off"
              placeholder="e.g. moonshot (when model list uses short ids)"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              If empty, the provider key is used as the LiteLLM prefix. Must match a{' '}
              <a
                href={LITELLM_PROVIDERS_DOCS}
                target="_blank"
                rel="noreferrer"
                className="text-violet-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                documented
              </a>{' '}
              slug when the key is only a local label.
            </p>
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
              title="Optional. When set, chat completions use this host for this provider when a per-provider key is configured; otherwise falls back to Tool settings."
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-llm-key">API key (optional)</label>
            </StatLabel>
            <input
              id="llm-add-provider-llm-key"
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              autoComplete="off"
              placeholder="Per-provider OpenAI-compatible secret"
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

function EditProviderModal({
  provider,
  onClose,
  isPending,
  error,
  onSave,
}: {
  provider: LlmProviderRegistryRow | null
  onClose: () => void
  isPending: boolean
  error?: unknown
  onSave: (args: { providerKey: string; body: LlmProviderUpsertBody }) => void
}): ReactElement | null {
  const [displayName, setDisplayName] = useState('')
  const [modelsText, setModelsText] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [clearLlmKey, setClearLlmKey] = useState(false)
  const [status, setStatus] = useState<'connected' | 'disabled' | 'needs-key'>('needs-key')
  const [isDefault, setIsDefault] = useState(false)
  const [litellmSlug, setLitellmSlug] = useState('')
  const [suggestAppend, setSuggestAppend] = useState('')

  useEffect(() => {
    if (!provider) return
    setDisplayName(provider.display_name)
    setModelsText(provider.models.join(', '))
    setApiBaseUrl(provider.api_base_url ?? '')
    setLlmApiKey('')
    setClearLlmKey(false)
    setLitellmSlug(provider.litellm_provider_slug ?? '')
    setSuggestAppend('')
    setStatus(
      provider.status === 'connected' || provider.status === 'disabled' || provider.status === 'needs-key'
        ? provider.status
        : 'needs-key',
    )
    setIsDefault(provider.is_default)
  }, [provider])

  if (!provider) {
    return null
  }

  const submit = (): void => {
    const models = parseModelIds(modelsText)
    const name = displayName.trim()
    if (!name || models.length === 0) {
      return
    }
    const body: LlmProviderUpsertBody = {
      display_name: name,
      models,
      api_base_url: apiBaseUrl.trim() || null,
      status,
      is_default: isDefault,
      sort_order: provider.sort_order,
      litellm_provider_slug: litellmSlug.trim() || null,
    }
    if (clearLlmKey) {
      body.llm_api_key = ''
    } else if (llmApiKey.trim()) {
      body.llm_api_key = llmApiKey.trim()
    }
    onSave({ providerKey: provider.provider_key, body })
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
        aria-labelledby="llm-edit-provider-title"
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="llm-edit-provider-title" className="text-[15px] font-medium text-zinc-100">
          Edit LLM provider
        </h2>
        <p className="mt-1 text-[12px] text-zinc-500">
          Update registry metadata for{' '}
          <span className="font-mono text-zinc-400">{provider.provider_key}</span>. Per-provider API
          keys are optional; leave blank to keep the stored key, or use remove to fall back to{' '}
          <Link className="text-violet-400 hover:underline" to="/admin/settings">
            Platform settings · LLM keys
          </Link>
          .
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <StatLabel>Provider key</StatLabel>
            <input
              readOnly
              value={provider.provider_key}
              className="mt-1.5 w-full cursor-not-allowed rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-[12px] text-zinc-400 outline-none"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-edit-provider-name">Display name</label>
            </StatLabel>
            <input
              id="llm-edit-provider-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-edit-provider-models">Model IDs</label>
            </StatLabel>
            <textarea
              id="llm-edit-provider-models"
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              rows={2}
              spellCheck={false}
              className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              Use <span className="font-mono text-zinc-500">provider/model</span> in the list when
              needed, or set a LiteLLM slug below.{' '}
              <a
                href={LITELLM_PROVIDERS_DOCS}
                target="_blank"
                rel="noreferrer"
                className="text-violet-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                LiteLLM providers
              </a>
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <StatLabel>
                  <label htmlFor="llm-edit-suggest-append">Add from LiteLLM catalog</label>
                </StatLabel>
                <LlmModelSuggestInput
                  id="llm-edit-suggest-append"
                  listId="llm-edit-suggest-append-dl"
                  value={suggestAppend}
                  onChange={setSuggestAppend}
                  providerKey={provider.provider_key}
                  litellmProvider={litellmSlug.trim() || undefined}
                  prefetch
                  minChars={0}
                  placeholder="Search models, then append"
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>
              <Btn
                type="button"
                className="mb-0.5 shrink-0"
                onClick={() => {
                  setModelsText((t) => appendUniqueModelId(t, suggestAppend))
                  setSuggestAppend('')
                }}
              >
                Append
              </Btn>
            </div>
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-edit-provider-litellm-slug">LiteLLM provider slug (optional)</label>
            </StatLabel>
            <input
              id="llm-edit-provider-litellm-slug"
              value={litellmSlug}
              onChange={(e) => setLitellmSlug(e.target.value)}
              autoComplete="off"
              placeholder="e.g. moonshot"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-edit-provider-api-base">API base URL (optional)</label>
            </StatLabel>
            <input
              id="llm-edit-provider-api-base"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              autoComplete="off"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <StatLabel>Stored API key</StatLabel>
            <p className="mt-1 text-[12px] text-zinc-400">
              {provider.llm_api_key_set ? (
                <>
                  <span className="text-emerald-400/90">Stored</span>
                  {provider.llm_api_key_hint ? (
                    <span className="ml-1 font-mono text-zinc-300">{provider.llm_api_key_hint}</span>
                  ) : null}
                </>
              ) : (
                <span className="text-zinc-500">None — uses Tool settings fallback</span>
              )}
            </p>
            <div className="mt-3">
              <StatLabel>
                <label htmlFor="llm-edit-provider-llm-key">New API key (optional)</label>
              </StatLabel>
            </div>
            <input
              id="llm-edit-provider-llm-key"
              type="password"
              value={llmApiKey}
              onChange={(e) => {
                setLlmApiKey(e.target.value)
                setClearLlmKey(false)
              }}
              autoComplete="off"
              placeholder="Leave blank to keep current key"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
              <input
                type="checkbox"
                checked={clearLlmKey}
                onChange={(e) => {
                  setClearLlmKey(e.target.checked)
                  if (e.target.checked) setLlmApiKey('')
                }}
                className="rounded border-zinc-600 bg-zinc-950"
              />
              Remove stored API key for this provider
            </label>
          </div>
          <div>
            <StatLabel>
              <label htmlFor="llm-edit-provider-status">Status</label>
            </StatLabel>
            <select
              id="llm-edit-provider-status"
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
              !displayName.trim() ||
              parseModelIds(modelsText).length === 0
            }
            onClick={submit}
          >
            {isPending ? 'Saving…' : 'Save changes'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

export function LlmSection(): ReactElement {
  const qc = useQueryClient()
  const [studioId, setStudioId] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<LlmProviderRegistryRow | null>(null)

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

  const [routingDraft, setRoutingDraft] = useState<LlmRoutingRuleRow[]>([])
  const [routingModalOpen, setRoutingModalOpen] = useState(false)
  const [routingSuggestSlug, setRoutingSuggestSlug] = useState('')

  useEffect(() => {
    if (routingQ.isSuccess && routingQ.data) {
      setRoutingDraft(routingQ.data.map((r) => ({ ...r })))
    }
  }, [routingQ.isSuccess, routingQ.data])

  const blockedRoutingUseCasesCsv = useMemo(
    () => [...new Set(routingDraft.map((r) => r.use_case))].sort().join(','),
    [routingDraft],
  )

  const routingCatalogSlugOptions = useMemo(() => {
    const list = deploymentQ.data?.providers ?? EMPTY_LLM_PROVIDERS
    const s = new Set<string>()
    for (const p of list) {
      const slug = (p.litellm_provider_slug ?? p.provider_key).trim().toLowerCase()
      if (slug) s.add(slug)
    }
    return [...s].sort()
  }, [deploymentQ.data?.providers])

  const saveRouting = useMutation({
    mutationFn: (rules: LlmRoutingRuleRow[]) =>
      putAdminLlmRouting({
        rules: rules.map((r) => ({
          use_case: r.use_case.trim().slice(0, 32),
          primary_model: r.primary_model.trim(),
          fallback_model: r.fallback_model?.trim() ? r.fallback_model.trim() : null,
        })),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'routing'] })
    },
  })

  const updateRoutingRow = useCallback(
    (useCase: string, patch: Partial<Pick<LlmRoutingRuleRow, 'primary_model' | 'fallback_model'>>) => {
      setRoutingDraft((prev) =>
        prev.map((r) => (r.use_case === useCase ? { ...r, ...patch } : r)),
      )
    },
    [],
  )

  const removeRoutingRow = useCallback((useCase: string) => {
    setRoutingDraft((prev) => prev.filter((r) => r.use_case !== useCase))
  }, [])

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

  const updateRegistry = useMutation({
    mutationFn: ({ key, body }: { key: string; body: LlmProviderUpsertBody }) =>
      putAdminLlmProvider(key, body),
    onSuccess: async () => {
      setEditingProvider(null)
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
        subtitle="Provider registry, routing rules, and per-studio policy. API keys and base URLs live on each registry row; the default row supplies credentials when routing does not pick a specific provider."
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
              Embedding settings
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
        {deploymentQ.data && !deploymentQ.isError ? (
          <>
            <div className="px-5 py-4">
              <StatLabel>Model registry</StatLabel>
              <p className="mt-2 text-[12px] text-zinc-500">
                Registered providers and model IDs for routing and studio allow-lists. Keys are
                stored encrypted when configured. Mark one row as{' '}
                <span className="text-zinc-400">default</span> for fallbacks. For LiteLLM, inference
                uses <span className="font-mono text-zinc-400">slug/model</span> when the model id has
                no slash: the slug is the optional field below or else the provider key.{' '}
                <a
                  href={LITELLM_PROVIDERS_DOCS}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-400 hover:underline"
                >
                  Provider slugs
                </a>
              </p>
              {!deploymentQ.data.has_providers ? (
                <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-200/90">
                  No providers yet. Add a provider below, set models and API key, and mark one row
                  as default so chat and probes can resolve credentials.
                </p>
              ) : null}
              <div className="mt-3 border-t border-zinc-800/60 pt-3">
                <p className="text-[11px] text-zinc-500">
                  Sends a minimal chat completion using the default registry row (or pass a
                  provider from a row&apos;s <span className="text-zinc-400">Test</span> button).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Btn
                    type="button"
                    size="sm"
                    disabled={testLlmMut.isPending}
                    onClick={() => testLlmMut.mutate({})}
                  >
                    {testLlmMut.isPending ? 'Testing…' : 'Test LLM (default)'}
                  </Btn>
                </div>
              </div>
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
                        'API base',
                        'API key',
                        'Status',
                        'Actions',
                      ]}
                      grid="grid-cols-[1.05fr_1.5fr_1fr_0.55fr_0.65fr_0.9fr]"
                    />
                    {providers.map((p) => {
                      const savingThis =
                        updateRegistry.isPending && updateRegistry.variables?.key === p.provider_key
                      return (
                        <TRow
                          key={p.id}
                          grid="grid-cols-[1.05fr_1.5fr_1fr_0.55fr_0.65fr_0.9fr]"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <ProviderGlyph name={p.display_name} logoUrl={p.logo_url} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-[13px] text-zinc-100">
                                  {p.display_name}
                                </span>
                                {p.is_default ? <Pill tone="violet">default</Pill> : null}
                              </div>
                              <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                                LiteLLM prefix:{' '}
                                <span className="text-zinc-400">
                                  {(p.litellm_provider_slug ?? p.provider_key).trim() || '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p
                              className="font-mono text-[10.5px] leading-snug text-zinc-300 line-clamp-3 break-words"
                              title={p.models.join(', ')}
                            >
                              {p.models.length ? p.models.join(', ') : '—'}
                            </p>
                          </div>
                          <span
                            className="truncate font-mono text-[10px] text-zinc-400"
                            title={p.api_base_url ?? undefined}
                          >
                            {p.api_base_url ?? '—'}
                          </span>
                          <span
                            className="truncate font-mono text-[10px] text-zinc-400"
                            title={p.llm_api_key_hint ?? undefined}
                          >
                            {p.llm_api_key_set && p.llm_api_key_hint
                              ? p.llm_api_key_hint
                              : p.llm_api_key_set
                                ? 'stored'
                                : '—'}
                          </span>
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
                              onClick={() => setEditingProvider(p)}
                            >
                              Edit
                            </Btn>
                            <Btn
                              type="button"
                              size="sm"
                              disabled={testLlmMut.isPending || savingThis}
                              onClick={() => {
                                const model = p.models[0]
                                const trimmedBase = p.api_base_url?.trim()
                                const body: AdminLlmProbeBody = {
                                  provider_key: p.provider_key,
                                }
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
                  <ProviderGlyph name={p.display_name} logoUrl={p.logo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-zinc-100">{p.display_name}</span>
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

      <Card
        title="Routing & fallback policy"
        right={
          <Btn
            type="button"
            tone="primary"
            aria-label="Add routing rule"
            style={{ background: ADMIN_CONSOLE_ACCENT }}
            onClick={() => setRoutingModalOpen(true)}
          >
            + Add routing
          </Btn>
        }
      >
        <div className="space-y-4 px-5 py-4">
          <p className="text-[12px] leading-relaxed text-zinc-500">
            Primary and fallback model IDs are resolved against the routing registry and studio
            policy. Empty fallback means only the primary is considered for that use case. Use{' '}
            <span className="font-mono text-zinc-400">provider/model</span> when LiteLLM cannot infer
            the host; otherwise configure a slug on the provider row for short ids.{' '}
            <a
              href={LITELLM_PROVIDERS_DOCS}
              target="_blank"
              rel="noreferrer"
              className="text-violet-400 hover:underline"
            >
              LiteLLM providers
            </a>
          </p>
          <label className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-400">
            <span className="shrink-0">Catalog suggestions filter</span>
            <select
              value={routingSuggestSlug}
              onChange={(e) => setRoutingSuggestSlug(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[11px] text-zinc-200"
            >
              <option value="">Default (Tool settings provider)</option>
              {routingCatalogSlugOptions.map((slug) => (
                <option key={slug} value={slug}>
                  {slug}
                </option>
              ))}
            </select>
          </label>
          {routingQ.isLoading ? (
            <p className="text-[13px] text-zinc-500">Loading routing…</p>
          ) : (
            <>
              {sortRoutingRules(routingDraft).map((r) => {
                const rowCatalogMode = r.use_case === 'embeddings' ? 'embedding' : 'chat'
                return (
                <div
                  key={r.use_case}
                  className="grid grid-cols-1 gap-3 rounded-md border border-zinc-800 bg-zinc-950/40 p-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                >
                  <div>
                    <StatLabel>Use case</StatLabel>
                    <div className="mt-1.5 text-[13px] text-zinc-200">{routingUseCaseLabel(r.use_case)}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-zinc-500">{r.use_case}</div>
                  </div>
                  <div>
                    <StatLabel>
                      <label htmlFor={`llm-routing-primary-${r.use_case}`}>Primary model</label>
                    </StatLabel>
                    <LlmModelSuggestInput
                      id={`llm-routing-primary-${r.use_case}`}
                      listId={`llm-routing-primary-dl-${r.use_case}`}
                      value={r.primary_model}
                      onChange={(v) =>
                        updateRoutingRow(r.use_case, { primary_model: v })
                      }
                      litellmProvider={routingSuggestSlug.trim() || undefined}
                      mode={rowCatalogMode}
                      minChars={2}
                      placeholder="Type 2+ chars for suggestions"
                      className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
                    />
                  </div>
                  <div>
                    <StatLabel>
                      <label htmlFor={`llm-routing-fallback-${r.use_case}`}>Fallback model</label>
                    </StatLabel>
                    <LlmModelSuggestInput
                      id={`llm-routing-fallback-${r.use_case}`}
                      listId={`llm-routing-fallback-dl-${r.use_case}`}
                      value={r.fallback_model ?? ''}
                      onChange={(v) =>
                        updateRoutingRow(r.use_case, {
                          fallback_model: v.trim() ? v.trim() : null,
                        })
                      }
                      litellmProvider={routingSuggestSlug.trim() || undefined}
                      mode={rowCatalogMode}
                      minChars={2}
                      placeholder="Optional"
                      className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
                    />
                  </div>
                  <div className="flex sm:justify-end">
                    <Btn
                      type="button"
                      size="sm"
                      disabled={saveRouting.isPending}
                      onClick={() => removeRoutingRow(r.use_case)}
                    >
                      Remove
                    </Btn>
                  </div>
                </div>
                )
              })}
              {routingDraft.length === 0 ? (
                <p className="text-[13px] text-zinc-500">
                  No routing rules yet. Use <span className="font-medium text-zinc-400">+ Add routing</span>{' '}
                  to map a use case to a primary model (and optional fallback), then save.
                </p>
              ) : null}
              {saveRouting.isError ? (
                <p className="text-[12px] text-rose-300" role="alert">
                  {formatProviderMutationErr(saveRouting.error)}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800/60 pt-4">
                <Btn
                  type="button"
                  tone="primary"
                  style={{ background: ADMIN_CONSOLE_ACCENT }}
                  disabled={
                    saveRouting.isPending ||
                    routingDraft.some((row) => !row.primary_model.trim())
                  }
                  onClick={() => saveRouting.mutate(routingDraft)}
                >
                  {saveRouting.isPending ? 'Saving…' : 'Save routing'}
                </Btn>
              </div>
            </>
          )}
        </div>
      </Card>
      <AddRoutingModal
        open={routingModalOpen}
        onClose={() => setRoutingModalOpen(false)}
        blockedUseCasesCsv={blockedRoutingUseCasesCsv}
        catalogSlug={routingSuggestSlug}
        onAdd={(row) => {
          setRoutingDraft((prev) =>
            sortRoutingRules([...prev.filter((x) => x.use_case !== row.use_case), row]),
          )
        }}
      />
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
      <EditProviderModal
        provider={editingProvider}
        onClose={() => {
          setEditingProvider(null)
          updateRegistry.reset()
        }}
        isPending={
          updateRegistry.isPending &&
          updateRegistry.variables?.key === editingProvider?.provider_key
        }
        error={
          updateRegistry.isError &&
          updateRegistry.variables?.key === editingProvider?.provider_key
            ? updateRegistry.error
            : undefined
        }
        onSave={({ providerKey, body }) =>
          updateRegistry.mutate({ key: providerKey, body })
        }
      />
    </div>
  )
}
