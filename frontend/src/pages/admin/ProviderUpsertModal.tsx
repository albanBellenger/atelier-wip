import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  StatLabel,
} from '../../components/admin/adminPrimitives'
import { LlmModelSuggestInput } from '../../components/admin/LlmModelSuggestInput'
import { InfoCircleHelpButton } from '../../components/ui/InfoCircleHelpButton'
import { Tooltip } from '../../components/ui/Tooltip'
import { adminConsolePath } from '../../lib/adminConsoleNav'
import type {
  LlmProviderRegistryRow,
  LlmProviderUpsertBody,
  LlmRegistryModelEntry,
} from '../../services/api'
import { modelIdsFromEntries } from '../../services/api'

/** Matches backend `openai_v1_base`: blank registry field → https://api.openai.com/v1 */
const API_BASE_URL_FIELD_TITLE =
  'Optional. When blank, the backend uses https://api.openai.com/v1 as the OpenAI-compatible API root. When set, LiteLLM uses this URL as api_base for this registry row.'

function FieldHint(props: { ariaLabel: string; content: ReactNode }): ReactElement {
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

function formatModelKindsCsv(models: LlmRegistryModelEntry[]): string {
  return models.map((m) => (m.kind === 'embedding' ? 'embedding' : 'chat')).join(', ')
}

function parseModelKindsCsv(text: string, n: number): ('chat' | 'embedding')[] {
  const parts = text.split(/[,\n]+/).map((s) => s.trim().toLowerCase())
  const out: ('chat' | 'embedding')[] = []
  for (let i = 0; i < n; i += 1) {
    const p = parts[i]
    out.push(p === 'embedding' ? 'embedding' : 'chat')
  }
  return out
}

function buildModelEntriesFromForm(
  modelsText: string,
  contextTokensText: string,
  kindsText: string,
): LlmRegistryModelEntry[] {
  const ids = parseModelIds(modelsText)
  const tokenParts = contextTokensText.split(/[,\n]+/).map((s) => s.trim())
  while (tokenParts.length < ids.length) {
    tokenParts.push('')
  }
  const kinds = parseModelKindsCsv(kindsText, ids.length)
  return ids.map((id, i) => {
    const kind = kinds[i] ?? 'chat'
    const raw = tokenParts[i]
    if (!raw) {
      return { id, kind, context_metadata_source: 'unknown' as const }
    }
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) {
      return { id, kind, context_metadata_source: 'unknown' as const }
    }
    return { id, kind, max_context_tokens: n, context_metadata_source: 'manual' as const }
  })
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

type ProviderUpsertModalProps =
  | {
      mode: 'create'
      open: boolean
      onClose: () => void
      isPending: boolean
      error?: unknown
      onRegister: (args: { providerId: string; body: LlmProviderUpsertBody }) => void
      modelIdsHelp: ReactNode
      contextTokensHelp: ReactNode
      litellmSlugHelp: ReactNode
    }
  | {
      mode: 'edit'
      provider: LlmProviderRegistryRow | null
      onClose: () => void
      isPending: boolean
      isDeletePending: boolean
      error?: unknown
      onSave: (args: { providerId: string; body: LlmProviderUpsertBody }) => void
      onDelete: (providerId: string) => void
      modelIdsHelp: ReactNode
      contextTokensHelp: ReactNode
      litellmSlugHelp: ReactNode
    }

export function ProviderUpsertModal(props: ProviderUpsertModalProps): ReactElement | null {
  const isCreate = props.mode === 'create'
  const idPrefix = isCreate ? 'llm-provider-modal-create' : 'llm-provider-modal-edit'
  const provider = isCreate ? null : props.provider
  const visible = isCreate ? props.open : Boolean(provider)

  const [providerId, setProviderId] = useState('')
  const [modelsText, setModelsText] = useState('')
  const [contextTokensText, setContextTokensText] = useState('')
  const [modelKindsText, setModelKindsText] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [litellmSlug, setLitellmSlug] = useState('')
  const [suggestAppend, setSuggestAppend] = useState('')
  const [liteCatalogMode, setLiteCatalogMode] = useState<'chat' | 'embedding'>('chat')
  const [clearLlmKey, setClearLlmKey] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    if (props.mode !== 'create' || !props.open) return
    setProviderId('')
    setModelsText('')
    setContextTokensText('')
    setModelKindsText('')
    setApiBaseUrl('')
    setLlmApiKey('')
    setLitellmSlug('')
    setSuggestAppend('')
    setLiteCatalogMode('chat')
  }, [props.mode, props.mode === 'create' ? props.open : false])

  useEffect(() => {
    if (props.mode !== 'edit' || !props.provider) return
    const p = props.provider
    setModelsText(modelIdsFromEntries(p.models).join(', '))
    setContextTokensText(formatContextTokensCsv(p.models))
    setModelKindsText(formatModelKindsCsv(p.models))
    setApiBaseUrl(p.api_base_url ?? '')
    setLlmApiKey('')
    setClearLlmKey(false)
    setLitellmSlug(p.litellm_provider_slug ?? '')
    setSuggestAppend('')
    setLiteCatalogMode('chat')
    setDisabled(p.status === 'disabled')
    setIsDefault(p.is_default)
  }, [props.mode, props.mode === 'edit' ? props.provider?.id : undefined])

  if (!visible || (!isCreate && !provider)) {
    return null
  }

  const submit = (): void => {
    const models = buildModelEntriesFromForm(modelsText, contextTokensText, modelKindsText)
    if (models.length === 0) {
      return
    }
    if (isCreate) {
      const pk = normalizeProviderId(providerId)
      if (!pk) return
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
      props.onRegister({ providerId: pk, body })
      return
    }
    if (!provider) return
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
    props.onSave({ providerId: provider.provider_id, body })
  }

  const handleDeleteClick = (): void => {
    if (props.mode !== 'edit' || !provider) return
    if (provider.status === 'connected') {
      const ok = window.confirm(
        'This provider is connected. Delete it from the registry? Studio LLM policy and routing may reference this row.',
      )
      if (!ok) return
    }
    props.onDelete(provider.provider_id)
  }

  const errText =
    props.error !== undefined && props.error !== null
      ? formatProviderMutationErr(props.error)
      : null

  const titleId = `${idPrefix}-title`
  const suggestProviderId =
    isCreate ? normalizeProviderId(providerId) || undefined : provider?.provider_id
  const suggestLitellm =
    isCreate
      ? litellmSlug.trim() || normalizeProviderId(providerId) || undefined
      : litellmSlug.trim() || provider?.provider_id || undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="flex max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
          <h2 id={titleId} className="text-[15px] font-medium text-zinc-100">
            {isCreate ? 'Register LLM provider' : 'Edit LLM provider'}
          </h2>
          {isCreate ? (
            <p className="mt-1 text-[12px] text-zinc-500">
              Adds a row to the routing registry (model allow-list for policy). Optional per-provider
              OpenAI-compatible API key (encrypted at rest when{' '}
              <span className="font-mono text-zinc-400">ENCRYPTION_KEY</span> is set). If omitted,
              requests that use this registry row fail with error code{' '}
              <span className="font-mono text-zinc-400">LLM_NOT_CONFIGURED</span> (HTTP 503).
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-zinc-500">
              Update registry metadata for{' '}
              <span className="font-mono text-zinc-400">{provider?.provider_id}</span>. Per-provider API
              keys live on this row; leave blank to keep the stored key, or remove to clear it.
              Clearing removes the key from this row—requests that resolve to it fail with error code{' '}
              <span className="font-mono text-zinc-400">LLM_NOT_CONFIGURED</span> (HTTP 503). Configure
              registry rows in{' '}
              <Link className="text-violet-400 hover:underline" to={adminConsolePath('llm')}>
                Admin Console → LLM
              </Link>
              .
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-3">
            <div>
              <StatLabel>
                <label htmlFor={`${idPrefix}-provider-id`}>Provider ID</label>
              </StatLabel>
              {isCreate ? (
                <input
                  id={`${idPrefix}-provider-id`}
                  value={providerId}
                  onChange={(e) => setProviderId(normalizeProviderId(e.target.value))}
                  autoComplete="off"
                  placeholder="e.g. anthropic_eu"
                  className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
                />
              ) : (
                <input
                  id={`${idPrefix}-provider-id`}
                  readOnly
                  value={provider?.provider_id ?? ''}
                  className="mt-1.5 w-full cursor-not-allowed rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-[12px] text-zinc-400 outline-none"
                />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <StatLabel>
                    <label htmlFor={`${idPrefix}-provider-models`}>Model IDs</label>
                  </StatLabel>
                </div>
                <FieldHint ariaLabel="Model ID format and LiteLLM catalog" content={props.modelIdsHelp} />
              </div>
              <textarea
                id={`${idPrefix}-provider-models`}
                value={modelsText}
                onChange={(e) => setModelsText(e.target.value)}
                rows={2}
                spellCheck={isCreate ? undefined : false}
                placeholder={
                  isCreate
                    ? 'Comma-separated, e.g. claude-sonnet-4.5, claude-haiku-4.5'
                    : undefined
                }
                className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
              />
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatLabel>
                      <label htmlFor={`${idPrefix}-suggest-append`}>Add from LiteLLM catalog</label>
                    </StatLabel>
                    <label className="sr-only" htmlFor={`${idPrefix}-catalog-mode`}>
                      LiteLLM catalog scope
                    </label>
                    <select
                      id={`${idPrefix}-catalog-mode`}
                      value={liteCatalogMode}
                      onChange={(e) =>
                        setLiteCatalogMode(e.target.value as 'chat' | 'embedding')
                      }
                      className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-[11px] text-zinc-200 outline-none focus:border-zinc-600"
                    >
                      <option value="chat">Chat models</option>
                      <option value="embedding">Embedding models</option>
                    </select>
                  </div>
                  <LlmModelSuggestInput
                    id={`${idPrefix}-suggest-append`}
                    listId={`${idPrefix}-suggest-append-dl`}
                    value={suggestAppend}
                    onChange={setSuggestAppend}
                    providerId={suggestProviderId}
                    litellmProvider={suggestLitellm}
                    mode={liteCatalogMode}
                    prefetch={visible}
                    minChars={0}
                    placeholder="Search models, then append"
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
                  />
                </div>
                <Btn
                  type="button"
                  className="mb-0.5 shrink-0"
                  onClick={() => {
                    const id = suggestAppend.trim()
                    if (!id) return
                    setModelsText((t) => appendUniqueModelId(t, id))
                    setModelKindsText((k) => {
                      const nextModels = appendUniqueModelId(modelsText, id)
                      const modelCount = parseModelIds(nextModels).length
                      const parts = k.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
                      while (parts.length < modelCount - 1) {
                        parts.push('chat')
                      }
                      parts.push(liteCatalogMode === 'embedding' ? 'embedding' : 'chat')
                      return parts.join(', ')
                    })
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
                    <label htmlFor={`${idPrefix}-context-tokens`}>Max context tokens (optional)</label>
                  </StatLabel>
                </div>
                <FieldHint
                  ariaLabel="Max context tokens manual override"
                  content={props.contextTokensHelp}
                />
              </div>
              <textarea
                id={`${idPrefix}-context-tokens`}
                value={contextTokensText}
                onChange={(e) => setContextTokensText(e.target.value)}
                rows={2}
                spellCheck={false}
                placeholder="Comma-aligned with model list; leave blank to let LiteLLM fill on save"
                className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <StatLabel>
                <label htmlFor={`${idPrefix}-model-kinds`}>Model kinds (optional)</label>
              </StatLabel>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {isCreate ? (
                  <>
                    Comma-aligned with model list: <span className="font-mono text-zinc-400">chat</span> or{' '}
                    <span className="font-mono text-zinc-400">embedding</span>. Leave empty for all chat.
                  </>
                ) : (
                  <>
                    Comma-aligned: <span className="font-mono text-zinc-400">chat</span> or{' '}
                    <span className="font-mono text-zinc-400">embedding</span>. Leave empty for all chat.
                  </>
                )}
              </p>
              <textarea
                id={`${idPrefix}-model-kinds`}
                value={modelKindsText}
                onChange={(e) => setModelKindsText(e.target.value)}
                rows={2}
                spellCheck={false}
                placeholder={isCreate ? 'e.g. chat, chat, embedding' : 'e.g. chat, embedding'}
                className="mt-1.5 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <StatLabel>
                    <label htmlFor={`${idPrefix}-provider-litellm-slug`}>
                      LiteLLM provider slug (optional)
                    </label>
                  </StatLabel>
                </div>
                <FieldHint ariaLabel="LiteLLM provider slug and prefix" content={props.litellmSlugHelp} />
              </div>
              <input
                id={`${idPrefix}-provider-litellm-slug`}
                value={litellmSlug}
                onChange={(e) => setLitellmSlug(e.target.value)}
                autoComplete="off"
                placeholder={isCreate ? 'e.g. moonshot (when model list uses short ids)' : 'e.g. moonshot'}
                className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <StatLabel>
                <label htmlFor={`${idPrefix}-provider-api-base`}>API base URL (optional)</label>
              </StatLabel>
              <input
                id={`${idPrefix}-provider-api-base`}
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                autoComplete="off"
                placeholder="https://api.example.com/v1"
                title={API_BASE_URL_FIELD_TITLE}
                className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
              />
            </div>
            {isCreate ? (
              <div>
                <StatLabel>
                  <label htmlFor={`${idPrefix}-provider-llm-key`}>API key (optional)</label>
                </StatLabel>
                <input
                  id={`${idPrefix}-provider-llm-key`}
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  autoComplete="off"
                  placeholder="Per-provider OpenAI-compatible secret"
                  className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>
            ) : (
              <div>
                <StatLabel>Stored API key</StatLabel>
                <p className="mt-1 text-[12px] text-zinc-400">
                  {provider?.llm_api_key_set ? (
                    <>
                      <span className="text-emerald-400/90">Stored</span>
                      {provider.llm_api_key_hint ? (
                        <span className="ml-1 font-mono text-zinc-300">{provider.llm_api_key_hint}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-zinc-500">
                      None — requests that use this row fail with{' '}
                      <span className="font-mono text-zinc-400">LLM_NOT_CONFIGURED</span> (HTTP 503)
                    </span>
                  )}
                </p>
                <div className="mt-3">
                  <StatLabel>
                    <label htmlFor={`${idPrefix}-provider-llm-key`}>New API key (optional)</label>
                  </StatLabel>
                </div>
                <input
                  id={`${idPrefix}-provider-llm-key`}
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
            )}
            {isCreate ? (
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
            ) : (
              <>
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
                    provider?.status === 'connected' ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                  }`}
                  title={
                    provider?.status === 'connected'
                      ? undefined
                      : 'Only a connected provider can be the platform default. Run Test until status is connected.'
                  }
                >
                  <input
                    type="checkbox"
                    checked={isDefault}
                    disabled={provider?.status !== 'connected'}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-950 disabled:opacity-60"
                  />
                  Mark as default provider for routing hints
                </label>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-zinc-800/80 px-5 pb-5 pt-4">
          {errText ? (
            <p className="mb-3 text-[12px] text-rose-300" role="alert">
              {errText}
            </p>
          ) : null}
          {isCreate ? (
            <div className="flex justify-end gap-2">
              <Btn type="button" onClick={props.onClose} disabled={props.isPending}>
                Cancel
              </Btn>
              <Btn
                type="button"
                tone="primary"
                style={{ background: ADMIN_CONSOLE_ACCENT }}
                disabled={
                  props.isPending ||
                  !normalizeProviderId(providerId) ||
                  parseModelIds(modelsText).length === 0
                }
                onClick={submit}
              >
                {props.isPending ? 'Saving…' : 'Register provider'}
              </Btn>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Btn
                type="button"
                tone="danger"
                disabled={props.isPending || props.isDeletePending}
                onClick={handleDeleteClick}
              >
                {props.isDeletePending ? 'Deleting…' : 'Delete provider'}
              </Btn>
              <div className="flex flex-wrap justify-end gap-2">
                <Btn type="button" onClick={props.onClose} disabled={props.isPending || props.isDeletePending}>
                  Cancel
                </Btn>
                <Btn
                  type="button"
                  tone="primary"
                  style={{ background: ADMIN_CONSOLE_ACCENT }}
                  disabled={
                    props.isPending ||
                    props.isDeletePending ||
                    parseModelIds(modelsText).length === 0
                  }
                  onClick={submit}
                >
                  {props.isPending ? 'Saving…' : 'Save changes'}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
