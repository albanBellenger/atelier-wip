import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  Dot,
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
import { Tooltip } from '../../components/ui/Tooltip'
import { InfoCircleHelpButton } from '../../components/ui/InfoCircleHelpButton'
import {
  type AdminLlmProbeBody,
  type LlmProviderRegistryRow,
  type LlmProviderUpsertBody,
  type LlmRegistryModelEntry,
  type LlmRoutingRuleRow,
  type StudioLlmPolicyRow,
  getAdminLlmDeployment,
  getAdminLlmRouting,
  getAdminStudioLlmPolicy,
  listStudios,
  modelIdsFromEntries,
  deleteAdminLlmProvider,
  postAdminTestLlm,
  putAdminLlmProvider,
  putAdminLlmRouting,
  putAdminStudioLlmPolicy,
} from '../../services/api'
import {
  ROUTING_AGENT_GROUP_OPTIONS,
  ROUTING_SORT_ORDER,
  routingBucketAgentsSummary,
  routingBucketTitle,
} from '../../lib/llmRoutingBuckets'

const EMPTY_LLM_PROVIDERS: LlmProviderRegistryRow[] = []

const LITELLM_PROVIDERS_DOCS = 'https://docs.litellm.ai/docs/providers' as const

const ADD_ROUTING_RULE_HELP =
  'Binds an agent group to registry models (primary + optional fallback). Suggestions list deployment models only and follow Registry scope below; typed ids must match a provider row.'

const ROUTING_REGISTRY_HELP = (
  <>
    Primary and fallback values must be model IDs configured on an LLM registry provider row above.
    Suggestions list those deployment models only (optional scope filter). Empty fallback means only
    the primary is considered for that agent group. Use{' '}
    <span className="font-mono text-zinc-400">provider/model</span> when LiteLLM cannot infer the
    host; otherwise configure a slug on the provider row for short ids.{' '}
    <a
      href={LITELLM_PROVIDERS_DOCS}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-violet-400 underline-offset-2 hover:underline"
    >
      LiteLLM providers
    </a>
  </>
)

const ADD_PROVIDER_MODEL_IDS_HELP = (
  <>
    Short ids are fine if LiteLLM can infer the provider; otherwise use{' '}
    <span className="font-mono text-zinc-400">provider/model</span> or set the slug below.{' '}
    <a
      href={LITELLM_PROVIDERS_DOCS}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-violet-400 underline-offset-2 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      LiteLLM providers
    </a>
  </>
)

const ADD_PROVIDER_CONTEXT_TOKENS_HELP =
  "Non-empty values mark that position as a manual override (skips LiteLLM lookup for that model's context size)."

const ADD_PROVIDER_LITELLM_SLUG_HELP = (
  <>
    If empty, the provider ID is used as the LiteLLM prefix. Must match a{' '}
    <a
      href={LITELLM_PROVIDERS_DOCS}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-violet-400 underline-offset-2 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      documented
    </a>{' '}
    slug when the ID is only a local label.
  </>
)

const MODEL_REGISTRY_HELP = (
  <>
    Registered providers and model IDs for routing and studio allow-lists. Keys are stored
    encrypted when configured. Mark one row as <span className="text-zinc-300">default</span> for
    fallbacks. For LiteLLM, inference uses{' '}
    <span className="font-mono text-zinc-400">slug/model</span> when the model id has no slash: the
    slug is the optional field below or else the provider ID.{' '}
    <a
      href={LITELLM_PROVIDERS_DOCS}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-violet-400 underline-offset-2 hover:underline"
    >
      Provider slugs
    </a>
  </>
)

function LlmFormFieldHint(props: { ariaLabel: string; content: ReactNode }): ReactElement {
  const { ariaLabel, content } = props
  return (
    <Tooltip
      className="shrink-0"
      side="bottom"
      interactive
      accessibleTrigger={false}
      content={content}
    >
      <InfoCircleHelpButton
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        ringOffsetClass="focus-visible:ring-offset-zinc-950"
      />
    </Tooltip>
  )
}

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

function normalizeProviderId(raw: string): string {
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

function formatContextTokensCsv(models: LlmRegistryModelEntry[]): string {
  return models.map((m) => (m.max_context_tokens != null ? String(m.max_context_tokens) : '')).join(', ')
}

/** Abbreviates token counts with K / M for the registry table (thousands / millions). */
function abbreviateMaxContextTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000) {
    const x = n / 1_000_000
    const rounded = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10
    const s =
      rounded === Math.floor(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.?0+$/, '')
    return `${s}M`
  }
  if (n >= 1_000) {
    const x = n / 1_000
    const rounded = x >= 100 ? Math.round(x) : Math.round(x * 10) / 10
    const s =
      rounded === Math.floor(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.?0+$/, '')
    return `${s}K`
  }
  return String(Math.round(n))
}

function formatRegistryMaxContextAbbrev(models: LlmRegistryModelEntry[]): string {
  if (!models.length) return '—'
  return models
    .map((m) =>
      m.max_context_tokens != null ? abbreviateMaxContextTokens(m.max_context_tokens) : '—',
    )
    .join(', ')
}

function registryMaxContextTitle(models: LlmRegistryModelEntry[]): string | undefined {
  const lines = models.flatMap((m) => {
    const t = m.max_context_tokens
    return t != null ? [`${m.id}: ${t.toLocaleString()}`] : []
  })
  return lines.length ? lines.join('\n') : undefined
}

function buildModelEntriesFromForm(
  modelsText: string,
  contextTokensText: string,
): LlmRegistryModelEntry[] {
  const ids = parseModelIds(modelsText)
  const tokenParts = contextTokensText.split(/[,\n]+/).map((s) => s.trim())
  while (tokenParts.length < ids.length) {
    tokenParts.push('')
  }
  return ids.map((id, i) => {
    const raw = tokenParts[i]
    if (!raw) {
      return { id, context_metadata_source: 'unknown' as const }
    }
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) {
      return { id, context_metadata_source: 'unknown' as const }
    }
    return { id, max_context_tokens: n, context_metadata_source: 'manual' as const }
  })
}

function formatModelSummary(m: LlmRegistryModelEntry): string {
  if (m.max_context_tokens != null) {
    return `${m.id} (${m.max_context_tokens.toLocaleString()} tok)`
  }
  return m.id
}

function appendUniqueModelId(currentText: string, id: string): string {
  const t = id.trim()
  if (!t) return currentText
  const existing = parseModelIds(currentText)
  if (existing.includes(t)) return currentText
  return [...existing, t].join(', ')
}

/** Which LLM probe is in flight: default registry probe vs a specific provider row. */
function probePendingTarget(vars: {
  isPending: boolean
  variables: AdminLlmProbeBody | undefined
}): 'default' | string | null {
  if (!vars.isPending || vars.variables === undefined) return null
  const pid = vars.variables.provider_id
  return pid != null && pid !== '' ? pid : 'default'
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

function sortRoutingRules(rules: LlmRoutingRuleRow[]): LlmRoutingRuleRow[] {
  const order = [...ROUTING_SORT_ORDER]
  return [...rules].sort((a, b) => {
    const ia = order.indexOf(a.use_case as (typeof ROUTING_SORT_ORDER)[number])
    const ib = order.indexOf(b.use_case as (typeof ROUTING_SORT_ORDER)[number])
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.use_case.localeCompare(b.use_case)
  })
}

function AddRoutingModal({
  open,
  onClose,
  blockedUseCasesCsv,
  registryScopeSlug,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  blockedUseCasesCsv: string
  /** Registry row scope: match ``litellm_provider_slug`` or ``provider_id`` (lowercase). */
  registryScopeSlug: string
  onAdd: (row: LlmRoutingRuleRow) => void
}): ReactElement | null {
  const existingKeys = blockedUseCasesCsv
    ? blockedUseCasesCsv.split(',').filter((s) => s.length > 0)
    : []
  const options = ROUTING_AGENT_GROUP_OPTIONS.filter((o) => !existingKeys.includes(o.value))
  const [useCase, setUseCase] = useState('')
  const [primary, setPrimary] = useState('')
  const [fallback, setFallback] = useState('')

  useEffect(() => {
    if (!open) return
    const keys = blockedUseCasesCsv
      ? blockedUseCasesCsv.split(',').filter((s) => s.length > 0)
      : []
    const opts = ROUTING_AGENT_GROUP_OPTIONS.filter((o) => !keys.includes(o.value))
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
        <div className="flex items-start gap-2">
          <h2 id="llm-add-routing-title" className="min-w-0 flex-1 text-[15px] font-medium text-zinc-100">
            Add routing rule
          </h2>
          <Tooltip side="bottom" interactive accessibleTrigger={false} content={ADD_ROUTING_RULE_HELP}>
            <button
              type="button"
              className="inline-flex shrink-0 cursor-help text-zinc-500 outline-none transition hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-full"
              aria-label="About add routing rule"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1" />
                <circle cx="7" cy="4.35" r="0.55" fill="currentColor" />
                <path
                  d="M7 6.1v4.15"
                  stroke="currentColor"
                  strokeWidth="1.05"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </Tooltip>
        </div>
        <div className="mt-4 space-y-3">
          {options.length === 0 ? (
            <p className="text-[13px] text-amber-300/90">
              All agent groups already have a row. Remove a row below, save, then add again.
            </p>
          ) : (
            <>
              <div>
                <StatLabel>
                  <label htmlFor="llm-add-routing-agent">Agent group</label>
                </StatLabel>
                <select
                  id="llm-add-routing-agent"
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
                {useCase ? (
                  <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                    Includes: {routingBucketAgentsSummary(useCase)}
                  </p>
                ) : null}
              </div>
              <div>
                <StatLabel>
                  <label htmlFor="llm-add-routing-primary">Primary model</label>
                </StatLabel>
                <LlmModelSuggestInput
                  id="llm-add-routing-primary"
                  listId="llm-add-routing-primary-dl"
                  value={primary}
                  onChange={setPrimary}
                  litellmProvider={registryScopeSlug.trim() || undefined}
                  mode={catalogMode}
                  source="registry"
                  placeholder="Deployment models"
                  minChars={0}
                  prefetch={open}
                  className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <StatLabel>
                  <label htmlFor="llm-add-routing-fallback">Fallback model (optional)</label>
                </StatLabel>
                <LlmModelSuggestInput
                  id="llm-add-routing-fallback"
                  listId="llm-add-routing-fallback-dl"
                  value={fallback}
                  onChange={setFallback}
                  litellmProvider={registryScopeSlug.trim() || undefined}
                  mode={catalogMode}
                  source="registry"
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
  onRegister: (args: { providerId: string; body: LlmProviderUpsertBody }) => void
}): ReactElement | null {
  const [providerId, setProviderId] = useState('')
  const [modelsText, setModelsText] = useState('')
  const [contextTokensText, setContextTokensText] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [litellmSlug, setLitellmSlug] = useState('')
  const [suggestAppend, setSuggestAppend] = useState('')

  useEffect(() => {
    if (!open) return
    setProviderId('')
    setModelsText('')
    setContextTokensText('')
    setApiBaseUrl('')
    setLlmApiKey('')
    setLitellmSlug('')
    setSuggestAppend('')
  }, [open])

  if (!open) {
    return null
  }

  const submit = (): void => {
    const pk = normalizeProviderId(providerId)
    const models = buildModelEntriesFromForm(modelsText, contextTokensText)
    if (!pk || models.length === 0) {
      return
    }
    const body: LlmProviderUpsertBody = {
      models,
      api_base_url: apiBaseUrl.trim() || null,
      is_default: false,
      sort_order: 0,
      litellm_provider_slug: litellmSlug.trim() || null,
    }
    if (llmApiKey.trim()) {
      body.llm_api_key = llmApiKey.trim()
    }
    onRegister({ providerId: pk, body })
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
        className="flex max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
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
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-3">
          <div>
            <StatLabel>
              <label htmlFor="llm-add-provider-id">Provider ID</label>
            </StatLabel>
            <input
              id="llm-add-provider-id"
              value={providerId}
              onChange={(e) => setProviderId(normalizeProviderId(e.target.value))}
              autoComplete="off"
              placeholder="e.g. anthropic_eu"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <StatLabel>
                  <label htmlFor="llm-add-provider-models">Model IDs</label>
                </StatLabel>
              </div>
              <LlmFormFieldHint
                ariaLabel="Model ID format and LiteLLM catalog"
                content={ADD_PROVIDER_MODEL_IDS_HELP}
              />
            </div>
            <textarea
              id="llm-add-provider-models"
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              rows={2}
              placeholder="Comma-separated, e.g. claude-sonnet-4.5, claude-haiku-4.5"
              className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
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
                  providerId={normalizeProviderId(providerId) || undefined}
                  litellmProvider={
                    litellmSlug.trim() || normalizeProviderId(providerId) || undefined
                  }
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
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <StatLabel>
                  <label htmlFor="llm-add-context-tokens">Max context tokens (optional)</label>
                </StatLabel>
              </div>
              <LlmFormFieldHint
                ariaLabel="Max context tokens manual override"
                content={ADD_PROVIDER_CONTEXT_TOKENS_HELP}
              />
            </div>
            <textarea
              id="llm-add-context-tokens"
              value={contextTokensText}
              onChange={(e) => setContextTokensText(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="Comma-aligned with model list; leave blank to let LiteLLM fill on save"
              className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <StatLabel>
                  <label htmlFor="llm-add-provider-litellm-slug">LiteLLM provider slug (optional)</label>
                </StatLabel>
              </div>
              <LlmFormFieldHint
                ariaLabel="LiteLLM provider slug and prefix"
                content={ADD_PROVIDER_LITELLM_SLUG_HELP}
              />
            </div>
            <input
              id="llm-add-provider-litellm-slug"
              value={litellmSlug}
              onChange={(e) => setLitellmSlug(e.target.value)}
              autoComplete="off"
              placeholder="e.g. moonshot (when model list uses short ids)"
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
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
          <label
            className="flex items-center gap-2 text-[12px] text-zinc-400"
            title="After registering, run Test on this row until it shows connected; then edit to mark as default."
          >
            <input
              type="checkbox"
              checked={false}
              disabled
              aria-disabled="true"
              className="rounded border-zinc-600 bg-zinc-950 opacity-60"
            />
            Mark as default provider for routing hints
          </label>
          </div>
        </div>
        <div className="shrink-0 border-t border-zinc-800/80 px-5 pb-5 pt-4">
          {errText ? (
            <p className="mb-3 text-[12px] text-rose-300" role="alert">
              {errText}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Btn type="button" onClick={onClose} disabled={isPending}>
              Cancel
            </Btn>
            <Btn
              type="button"
              tone="primary"
              style={{ background: ADMIN_CONSOLE_ACCENT }}
              disabled={
                isPending ||
                !normalizeProviderId(providerId) ||
                parseModelIds(modelsText).length === 0
              }
              onClick={submit}
            >
              {isPending ? 'Saving…' : 'Register provider'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildPolicyRows(
  providers: LlmProviderRegistryRow[],
  existing: StudioLlmPolicyRow[] | undefined,
): StudioLlmPolicyRow[] {
  const map = new Map(existing?.map((r) => [r.provider_id, r]) ?? [])
  return providers.map((p) => {
    const prev = map.get(p.provider_id)
    const ids = modelIdsFromEntries(p.models)
    const defaultModel = ids[0] ?? null
    return {
      provider_id: p.provider_id,
      enabled: prev?.enabled ?? false,
      selected_model:
        prev?.selected_model && ids.includes(prev.selected_model)
          ? prev.selected_model
          : defaultModel,
    }
  })
}

function buildStudioPolicyRows(
  connectedProviders: LlmProviderRegistryRow[],
  existing: StudioLlmPolicyRow[] | undefined,
): StudioLlmPolicyRow[] {
  const built = buildPolicyRows(connectedProviders, existing)
  const connIds = new Set(connectedProviders.map((p) => p.provider_id))
  const preserved = (existing ?? []).filter((r) => !connIds.has(r.provider_id))
  return [...built, ...preserved]
}

function EditProviderModal({
  provider,
  onClose,
  isPending,
  isDeletePending,
  error,
  onSave,
  onDelete,
}: {
  provider: LlmProviderRegistryRow | null
  onClose: () => void
  isPending: boolean
  isDeletePending: boolean
  error?: unknown
  onSave: (args: { providerId: string; body: LlmProviderUpsertBody }) => void
  onDelete: (providerId: string) => void
}): ReactElement | null {
  const [modelsText, setModelsText] = useState('')
  const [contextTokensText, setContextTokensText] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [clearLlmKey, setClearLlmKey] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [isDefault, setIsDefault] = useState(false)
  const [litellmSlug, setLitellmSlug] = useState('')
  const [suggestAppend, setSuggestAppend] = useState('')

  useEffect(() => {
    if (!provider) return
    setModelsText(modelIdsFromEntries(provider.models).join(', '))
    setContextTokensText(formatContextTokensCsv(provider.models))
    setApiBaseUrl(provider.api_base_url ?? '')
    setLlmApiKey('')
    setClearLlmKey(false)
    setLitellmSlug(provider.litellm_provider_slug ?? '')
    setSuggestAppend('')
    setDisabled(provider.status === 'disabled')
    setIsDefault(provider.is_default)
  }, [provider])

  if (!provider) {
    return null
  }

  const submit = (): void => {
    const models = buildModelEntriesFromForm(modelsText, contextTokensText)
    if (models.length === 0) {
      return
    }
    const body: LlmProviderUpsertBody = {
      models,
      api_base_url: apiBaseUrl.trim() || null,
      is_default: isDefault,
      sort_order: provider.sort_order,
      litellm_provider_slug: litellmSlug.trim() || null,
      disabled,
    }
    if (clearLlmKey) {
      body.llm_api_key = ''
    } else if (llmApiKey.trim()) {
      body.llm_api_key = llmApiKey.trim()
    }
    onSave({ providerId: provider.provider_id, body })
  }

  const handleDeleteClick = (): void => {
    if (provider.status === 'connected') {
      const ok = window.confirm(
        'This provider is connected. Delete it from the registry? Studio LLM policy and routing may reference this row.',
      )
      if (!ok) return
    }
    onDelete(provider.provider_id)
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
        className="flex max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
          <h2 id="llm-edit-provider-title" className="text-[15px] font-medium text-zinc-100">
            Edit LLM provider
          </h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            Update registry metadata for{' '}
            <span className="font-mono text-zinc-400">{provider.provider_id}</span>. Per-provider API
            keys are optional; leave blank to keep the stored key, or use remove to fall back to{' '}
            <Link className="text-violet-400 hover:underline" to="/admin/settings">
              Platform settings · LLM keys
            </Link>
            .
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-3">
          <div>
            <StatLabel>Provider ID</StatLabel>
            <input
              readOnly
              value={provider.provider_id}
              className="mt-1.5 w-full cursor-not-allowed rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-[12px] text-zinc-400 outline-none"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <StatLabel>
                  <label htmlFor="llm-edit-provider-models">Model IDs</label>
                </StatLabel>
              </div>
              <LlmFormFieldHint
                ariaLabel="Model ID format and LiteLLM catalog"
                content={ADD_PROVIDER_MODEL_IDS_HELP}
              />
            </div>
            <textarea
              id="llm-edit-provider-models"
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              rows={2}
              spellCheck={false}
              className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
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
                  providerId={provider.provider_id}
                  litellmProvider={
                    litellmSlug.trim() || provider.provider_id || undefined
                  }
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
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <StatLabel>
                  <label htmlFor="llm-edit-context-tokens">Max context tokens (optional)</label>
                </StatLabel>
              </div>
              <LlmFormFieldHint
                ariaLabel="Max context tokens manual override"
                content={ADD_PROVIDER_CONTEXT_TOKENS_HELP}
              />
            </div>
            <textarea
              id="llm-edit-context-tokens"
              value={contextTokensText}
              onChange={(e) => setContextTokensText(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="Comma-aligned with model list; leave blank to let LiteLLM fill on save"
              className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <StatLabel>
                  <label htmlFor="llm-edit-provider-litellm-slug">LiteLLM provider slug (optional)</label>
                </StatLabel>
              </div>
              <LlmFormFieldHint
                ariaLabel="LiteLLM provider slug and prefix"
                content={ADD_PROVIDER_LITELLM_SLUG_HELP}
              />
            </div>
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
              title="Optional. When set, chat completions use this host for this provider when a per-provider key is configured; otherwise falls back to Tool settings."
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
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-300">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-950"
            />
            Disable this provider (excluded from studio policy and routing until re-enabled)
          </label>
          <label
            className={`flex items-center gap-2 text-[12px] text-zinc-300 ${
              provider.status === 'connected' ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
            }`}
            title={
              provider.status === 'connected'
                ? undefined
                : 'Only a connected provider can be the platform default. Run Test until status is connected.'
            }
          >
            <input
              type="checkbox"
              checked={isDefault}
              disabled={provider.status !== 'connected'}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-950 disabled:opacity-60"
            />
            Mark as default provider for routing hints
          </label>
          </div>
        </div>
        <div className="shrink-0 border-t border-zinc-800/80 px-5 pb-5 pt-4">
          {errText ? (
            <p className="mb-3 text-[12px] text-rose-300" role="alert">
              {errText}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Btn
              type="button"
              tone="danger"
              disabled={isPending || isDeletePending}
              onClick={handleDeleteClick}
            >
              {isDeletePending ? 'Deleting…' : 'Delete provider'}
            </Btn>
            <div className="flex flex-wrap justify-end gap-2">
              <Btn type="button" onClick={onClose} disabled={isPending || isDeletePending}>
                Cancel
              </Btn>
              <Btn
                type="button"
                tone="primary"
                style={{ background: ADMIN_CONSOLE_ACCENT }}
                disabled={
                  isPending ||
                  isDeletePending ||
                  parseModelIds(modelsText).length === 0
                }
                onClick={submit}
              >
                {isPending ? 'Saving…' : 'Save changes'}
              </Btn>
            </div>
          </div>
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
  const [registrySaveWarnings, setRegistrySaveWarnings] = useState<string | null>(null)

  const studiosQ = useQuery({
    queryKey: ['studios'],
    queryFn: () => listStudios(),
  })

  const deploymentQ = useQuery({
    queryKey: ['admin', 'llm', 'deployment'],
    queryFn: () => getAdminLlmDeployment(),
  })

  const providers = deploymentQ.data?.providers ?? EMPTY_LLM_PROVIDERS
  const connectedProviders = useMemo(
    () => providers.filter((p) => p.status === 'connected'),
    [providers],
  )

  const routingQ = useQuery({
    queryKey: ['admin', 'llm', 'routing'],
    queryFn: () => getAdminLlmRouting(),
  })

  const [routingDraft, setRoutingDraft] = useState<LlmRoutingRuleRow[]>([])
  const [routingModalOpen, setRoutingModalOpen] = useState(false)
  const [routingRegistryScope, setRoutingRegistryScope] = useState('')

  useEffect(() => {
    if (routingQ.isSuccess && routingQ.data) {
      setRoutingDraft(routingQ.data.map((r) => ({ ...r })))
    }
  }, [routingQ.isSuccess, routingQ.data])

  const blockedRoutingUseCasesCsv = useMemo(
    () => [...new Set(routingDraft.map((r) => r.use_case))].sort().join(','),
    [routingDraft],
  )

  const routingRegistryScopeOptions = useMemo(() => {
    const s = new Set<string>()
    for (const p of connectedProviders) {
      const slug = (p.litellm_provider_slug ?? p.provider_id).trim().toLowerCase()
      if (slug) s.add(slug)
    }
    return [...s].sort()
  }, [connectedProviders])

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
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'deployment'] })
    },
  })

  const llmProbeTarget = probePendingTarget({
    isPending: testLlmMut.isPending,
    variables: testLlmMut.variables,
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
    mutationFn: (args: { providerId: string; body: LlmProviderUpsertBody }) =>
      putAdminLlmProvider(args.providerId, args.body),
    onSuccess: async (data) => {
      setAddOpen(false)
      setRegistrySaveWarnings(
        data.save_warnings?.length ? data.save_warnings.join(' ') : null,
      )
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'deployment'] })
    },
  })

  const updateRegistry = useMutation({
    mutationFn: ({ key, body }: { key: string; body: LlmProviderUpsertBody }) =>
      putAdminLlmProvider(key, body),
    onSuccess: async (data) => {
      setEditingProvider(null)
      setRegistrySaveWarnings(
        data.save_warnings?.length ? data.save_warnings.join(' ') : null,
      )
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'deployment'] })
    },
  })

  const deleteRegistry = useMutation({
    mutationFn: (key: string) => deleteAdminLlmProvider(key),
    onSuccess: async () => {
      setEditingProvider(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'deployment'] })
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'routing'] })
    },
  })

  const rowsForStudio = useMemo(
    () => buildStudioPolicyRows(connectedProviders, policyQ.data),
    [connectedProviders, policyQ.data],
  )

  const persistRows = useCallback(
    (next: StudioLlmPolicyRow[]) => {
      if (!studioId) return
      savePolicy.mutate({ sid: studioId, rows: next })
    },
    [studioId, savePolicy],
  )

  const updateRow = useCallback(
    (providerId: string, patch: Partial<Pick<StudioLlmPolicyRow, 'enabled' | 'selected_model'>>) => {
      const next = rowsForStudio.map((r) =>
        r.provider_id === providerId ? { ...r, ...patch } : r,
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

      {registrySaveWarnings ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-200/90">
          {registrySaveWarnings}
        </p>
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
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <StatLabel>Model registry</StatLabel>
                </div>
                <LlmFormFieldHint
                  ariaLabel="Model registry overview"
                  content={MODEL_REGISTRY_HELP}
                />
              </div>
              {!deploymentQ.data.has_providers ? (
                <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-200/90">
                  No providers yet. Add a provider below, set models and API key, and mark one row
                  as default so chat and probes can resolve credentials.
                </p>
              ) : null}
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
                        'Max context',
                        'API base',
                        'Status',
                        'Actions',
                      ]}
                      grid="grid-cols-[1.05fr_1.35fr_0.55fr_1fr_0.65fr_0.9fr]"
                    />
                    {providers.map((p) => {
                      const savingThis =
                        updateRegistry.isPending && updateRegistry.variables?.key === p.provider_id
                      return (
                        <TRow
                          key={p.id}
                          grid="grid-cols-[1.05fr_1.35fr_0.55fr_1fr_0.65fr_0.9fr]"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <ProviderGlyph name={p.provider_id} logoUrl={p.logo_url} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-[13px] text-zinc-100">
                                  {p.provider_id}
                                </span>
                                {p.is_default ? <Pill tone="violet">default</Pill> : null}
                              </div>
                              {p.litellm_provider_slug?.trim() ? (
                                <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                                  LiteLLM prefix:{' '}
                                  <span className="text-zinc-400">
                                    {p.litellm_provider_slug.trim()}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p
                              className="font-mono text-[10.5px] leading-snug text-zinc-300 line-clamp-3 break-words"
                              title={p.models.map((m) => m.id).join(', ')}
                            >
                              {p.models.length ? p.models.map((m) => m.id).join(', ') : '—'}
                            </p>
                          </div>
                          <p
                            className="font-mono text-[10.5px] leading-snug text-zinc-400 line-clamp-3 break-words"
                            title={registryMaxContextTitle(p.models)}
                          >
                            {formatRegistryMaxContextAbbrev(p.models)}
                          </p>
                          <span
                            className="truncate font-mono text-[10px] text-zinc-400"
                            title={p.api_base_url ?? undefined}
                          >
                            {p.api_base_url ?? '—'}
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
                                const model = p.models[0]?.id
                                const trimmedBase = p.api_base_url?.trim()
                                const body: AdminLlmProbeBody = {
                                  provider_id: p.provider_id,
                                }
                                if (model) body.model = model
                                if (trimmedBase) body.api_base_url = trimmedBase
                                testLlmMut.mutate(body)
                              }}
                            >
                              {llmProbeTarget === p.provider_id ? 'Testing…' : 'Test'}
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
            <div className="border-t border-zinc-800/60 px-5 py-4">
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
                  {llmProbeTarget === 'default' ? 'Testing…' : 'Test LLM (default)'}
                </Btn>
              </div>
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
        {!studioId || !connectedProviders.length ? (
          <p className="px-5 py-6 text-[13px] text-zinc-500">
            Select a studio with at least one connected LLM provider (run Test on a registry row).
          </p>
        ) : (
          <ul>
            {connectedProviders.map((p, i) => {
              const row = rowsForStudio.find((r) => r.provider_id === p.provider_id)
              const enabled = Boolean(row?.enabled)
              const modelIds = modelIdsFromEntries(p.models)
              const modelVal =
                row?.selected_model && modelIds.includes(row.selected_model)
                  ? row.selected_model
                  : (modelIds[0] ?? '')
              return (
                <li
                  key={p.provider_id}
                  className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? 'border-t border-zinc-800/60' : ''}`}
                >
                  <ProviderGlyph name={p.provider_id} logoUrl={p.logo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-zinc-100">{p.provider_id}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                      {p.models.map(formatModelSummary).join(' · ')}
                    </div>
                  </div>
                  <select
                    className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-[11.5px] text-zinc-300 disabled:opacity-50"
                    disabled={!enabled || savePolicy.isPending}
                    value={modelVal}
                    onChange={(e) =>
                      updateRow(p.provider_id, { selected_model: e.target.value })
                    }
                  >
                    {p.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatModelSummary(m)}
                      </option>
                    ))}
                  </select>
                  <Toggle
                    checked={enabled}
                    disabled={savePolicy.isPending}
                    onChange={(v) => updateRow(p.provider_id, { enabled: v })}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Routing & fallback policy"
        titleHint={
          <Tooltip
            className="shrink-0"
            side="bottom"
            interactive
            accessibleTrigger={false}
            content={ROUTING_REGISTRY_HELP}
          >
            <button
              type="button"
              className="inline-flex cursor-help text-zinc-500 outline-none transition hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900/40 rounded-full"
              aria-label="Routing and fallback policy details"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1" />
                <circle cx="7" cy="4.35" r="0.55" fill="currentColor" />
                <path
                  d="M7 6.1v4.15"
                  stroke="currentColor"
                  strokeWidth="1.05"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </Tooltip>
        }
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
          <label className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-400">
            <span className="shrink-0">Registry scope</span>
            <select
              value={routingRegistryScope}
              onChange={(e) => setRoutingRegistryScope(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[11px] text-zinc-200"
            >
              <option value="">All providers</option>
              {routingRegistryScopeOptions.map((slug) => (
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
                    <StatLabel>Agent group</StatLabel>
                    <div className="mt-1.5 text-[13px] text-zinc-200">
                      {routingBucketTitle(r.use_case)}
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                      {routingBucketAgentsSummary(r.use_case)}
                    </p>
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
                      litellmProvider={routingRegistryScope.trim() || undefined}
                      mode={rowCatalogMode}
                      source="registry"
                      minChars={0}
                      prefetch
                      placeholder="Deployment models"
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
                      litellmProvider={routingRegistryScope.trim() || undefined}
                      mode={rowCatalogMode}
                      source="registry"
                      minChars={0}
                      prefetch
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
                  to map an agent group to a primary model (and optional fallback), then save.
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
        registryScopeSlug={routingRegistryScope}
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
          deleteRegistry.reset()
        }}
        isPending={
          updateRegistry.isPending &&
          updateRegistry.variables?.key === editingProvider?.provider_id
        }
        isDeletePending={
          deleteRegistry.isPending &&
          deleteRegistry.variables === editingProvider?.provider_id
        }
        error={
          updateRegistry.isError &&
          updateRegistry.variables?.key === editingProvider?.provider_id
            ? updateRegistry.error
            : deleteRegistry.isError &&
                deleteRegistry.variables === editingProvider?.provider_id
              ? deleteRegistry.error
              : undefined
        }
        onSave={({ providerId, body }) =>
          updateRegistry.mutate({ key: providerId, body })
        }
        onDelete={(id) => deleteRegistry.mutate(id)}
      />
    </div>
  )
}
