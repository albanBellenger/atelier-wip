import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  type AdminConfigPublic,
  type AdminConfigUpdateBody,
  type AuthErrorBody,
  getAdminConfig,
  me,
  postAdminTestEmbedding,
  postAdminTestLlm,
  putAdminConfig,
} from '../services/api'

function formatApiDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as AuthErrorBody).detail
    if (typeof d === 'string') return d
  }
  return 'Request failed.'
}

export function AdminSettingsPage(): ReactElement {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const profileQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileQ.isError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileQ.isError, navigate])

  const configQ = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: () => getAdminConfig(),
    enabled: Boolean(profileQ.data?.user.is_tool_admin),
  })

  const [llmProvider, setLlmProvider] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmApiBaseUrl, setLlmApiBaseUrl] = useState('')
  const [llmKey, setLlmKey] = useState('')
  const [clearLlmKey, setClearLlmKey] = useState(false)
  const [embedProvider, setEmbedProvider] = useState('')
  const [embedModel, setEmbedModel] = useState('')
  const [embedApiBaseUrl, setEmbedApiBaseUrl] = useState('')
  const [embedKey, setEmbedKey] = useState('')
  const [clearEmbedKey, setClearEmbedKey] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!configQ.data || hydrated) return
    const c = configQ.data
    setLlmProvider(c.llm_provider ?? '')
    setLlmModel(c.llm_model ?? '')
    setLlmApiBaseUrl(c.llm_api_base_url ?? '')
    setEmbedProvider(c.embedding_provider ?? '')
    setEmbedModel(c.embedding_model ?? '')
    setEmbedApiBaseUrl(c.embedding_api_base_url ?? '')
    setLlmKey('')
    setEmbedKey('')
    setClearLlmKey(false)
    setClearEmbedKey(false)
    setHydrated(true)
  }, [configQ.data, hydrated])

  const testLlmMut = useMutation({
    mutationFn: () => postAdminTestLlm({}),
  })

  const testEmbedMut = useMutation({
    mutationFn: () => postAdminTestEmbedding(),
  })

  const saveMut = useMutation({
    mutationFn: (body: AdminConfigUpdateBody) => putAdminConfig(body),
    onSuccess: (data: AdminConfigPublic) => {
      void qc.setQueryData(['admin', 'config'], data)
      void qc.invalidateQueries({ queryKey: ['admin', 'llm', 'deployment'] })
      setLlmKey('')
      setEmbedKey('')
      setClearLlmKey(false)
      setClearEmbedKey(false)
      setLlmProvider(data.llm_provider ?? '')
      setLlmModel(data.llm_model ?? '')
      setLlmApiBaseUrl(data.llm_api_base_url ?? '')
      setEmbedProvider(data.embedding_provider ?? '')
      setEmbedModel(data.embedding_model ?? '')
      setEmbedApiBaseUrl(data.embedding_api_base_url ?? '')
      setHydrated(true)
    },
  })

  function buildBody(): AdminConfigUpdateBody {
    const body: AdminConfigUpdateBody = {
      llm_provider: llmProvider.trim() || null,
      llm_model: llmModel.trim() || null,
      llm_api_base_url: llmApiBaseUrl.trim() || null,
      embedding_provider: embedProvider.trim() || null,
      embedding_model: embedModel.trim() || null,
      embedding_api_base_url: embedApiBaseUrl.trim() || null,
    }
    if (clearLlmKey) {
      body.llm_api_key = ''
    } else if (llmKey.trim()) {
      body.llm_api_key = llmKey.trim()
    }
    if (clearEmbedKey) {
      body.embedding_api_key = ''
    } else if (embedKey.trim()) {
      body.embedding_api_key = embedKey.trim()
    }
    return body
  }

  if (profileQ.isPending || !profileQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!profileQ.data.user.is_tool_admin) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <div className="mx-auto max-w-lg">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Tool administrator privileges are required for this page.
          </p>
          <Link to="/" className="mt-6 inline-block text-violet-400 hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  const llmKeySet = configQ.data?.llm_api_key_set ?? false
  const embedKeySet = configQ.data?.embedding_api_key_set ?? false

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex flex-wrap gap-4 text-sm">
          <Link to="/" className="text-violet-400 hover:underline">
            ← Home
          </Link>
          <Link to="/admin/console" className="text-zinc-400 hover:text-zinc-200">
            Admin console
          </Link>
          <Link to="/admin/cross-studio" className="text-zinc-400 hover:text-zinc-200">
            Cross-studio
          </Link>
          <Link to="/admin/token-usage" className="text-zinc-400 hover:text-zinc-200">
            Token usage
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Tool admin settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          OpenAI-compatible LLM and embedding configuration. Use provider{' '}
          <span className="font-mono text-zinc-300">openai</span> (or leave empty) and optional API
          base URLs for non-default hosts. API keys are never shown after save; leave blank to keep
          the stored key, or use &quot;Remove stored key&quot; to clear.
        </p>

        {configQ.isPending && (
          <p className="mt-6 text-zinc-500">Loading configuration…</p>
        )}
        {configQ.isError && (
          <p className="mt-6 text-sm text-red-400">
            Could not load settings. You may not be signed in as a tool admin.
          </p>
        )}

        {configQ.data && (
          <form
            className="mt-8 space-y-8"
            onSubmit={(e) => {
              e.preventDefault()
              saveMut.mutate(buildBody())
            }}
          >
            <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300">LLM</h2>
              <label className="block text-sm">
                <span className="text-zinc-400">Provider</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
                  placeholder="openai"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-400">Model</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-400">API base URL</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
                  value={llmApiBaseUrl}
                  onChange={(e) => setLlmApiBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1 (optional)"
                  autoComplete="off"
                />
              </label>
              <p className="text-xs text-zinc-500">
                Chat requests use <span className="font-mono">{`{base}/chat/completions`}</span>.
                Leave empty for OpenAI&apos;s default host.
              </p>
              <p className="text-xs text-zinc-500">
                API key:{' '}
                {llmKeySet ? (
                  <span className="text-zinc-400">A key is stored.</span>
                ) : (
                  <span className="text-zinc-500">Not set.</span>
                )}
              </p>
              <label className="block text-sm">
                <span className="text-zinc-400">New API key</span>
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                  value={llmKey}
                  onChange={(e) => setLlmKey(e.target.value)}
                  placeholder="Leave blank to keep current key"
                  autoComplete="new-password"
                  disabled={clearLlmKey}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={clearLlmKey}
                  onChange={(e) => {
                    setClearLlmKey(e.target.checked)
                    if (e.target.checked) setLlmKey('')
                  }}
                />
                Remove stored LLM API key
              </label>
              <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-500">
                  Sends a minimal chat completion using the saved model, key, and API base (OpenAI-compatible).
                </p>
                <button
                  type="button"
                  disabled={testLlmMut.isPending}
                  onClick={() => testLlmMut.mutate()}
                  className="self-start rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {testLlmMut.isPending ? 'Testing…' : 'Test LLM'}
                </button>
                {testLlmMut.data && (
                  <p
                    className={`text-sm ${testLlmMut.data.ok ? 'text-emerald-400' : 'text-amber-400'}`}
                  >
                    {testLlmMut.data.message}
                    {testLlmMut.data.detail ? (
                      <span className="block whitespace-pre-wrap text-zinc-400">
                        {testLlmMut.data.detail}
                      </span>
                    ) : null}
                  </p>
                )}
                {testLlmMut.isError && (
                  <p className="text-sm text-red-400">{formatApiDetail(testLlmMut.error)}</p>
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300">Embedding</h2>
              <label className="block text-sm">
                <span className="text-zinc-400">Provider</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                  value={embedProvider}
                  onChange={(e) => setEmbedProvider(e.target.value)}
                  placeholder="openai"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-400">Model</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                  value={embedModel}
                  onChange={(e) => setEmbedModel(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-400">API base URL</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
                  value={embedApiBaseUrl}
                  onChange={(e) => setEmbedApiBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1 (optional)"
                  autoComplete="off"
                />
              </label>
              <p className="text-xs text-zinc-500">
                Embeddings use <span className="font-mono">{`{base}/embeddings`}</span>. Leave empty for
                OpenAI&apos;s default host.
              </p>
              <p className="text-xs text-zinc-500">
                API key:{' '}
                {embedKeySet ? (
                  <span className="text-zinc-400">A key is stored.</span>
                ) : (
                  <span className="text-zinc-500">Not set.</span>
                )}
              </p>
              <label className="block text-sm">
                <span className="text-zinc-400">New API key</span>
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                  value={embedKey}
                  onChange={(e) => setEmbedKey(e.target.value)}
                  placeholder="Leave blank to keep current key"
                  autoComplete="new-password"
                  disabled={clearEmbedKey}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={clearEmbedKey}
                  onChange={(e) => {
                    setClearEmbedKey(e.target.checked)
                    if (e.target.checked) setEmbedKey('')
                  }}
                />
                Remove stored embedding API key
              </label>
              <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-500">
                  Embeds a short probe string using the saved embedding model, key, and API base.
                </p>
                <button
                  type="button"
                  disabled={testEmbedMut.isPending}
                  onClick={() => testEmbedMut.mutate()}
                  className="self-start rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {testEmbedMut.isPending ? 'Testing…' : 'Test embedding'}
                </button>
                {testEmbedMut.data && (
                  <p
                    className={`text-sm ${testEmbedMut.data.ok ? 'text-emerald-400' : 'text-amber-400'}`}
                  >
                    {testEmbedMut.data.message}
                    {testEmbedMut.data.detail ? (
                      <span className="block whitespace-pre-wrap text-zinc-400">
                        {testEmbedMut.data.detail}
                      </span>
                    ) : null}
                  </p>
                )}
                {testEmbedMut.isError && (
                  <p className="text-sm text-red-400">{formatApiDetail(testEmbedMut.error)}</p>
                )}
              </div>
            </section>

            {saveMut.isSuccess && (
              <p className="text-sm text-emerald-400">Settings saved.</p>
            )}
            {saveMut.isError && (
              <p className="whitespace-pre-wrap text-sm text-red-400">
                {formatApiDetail(saveMut.error)}
              </p>
            )}

            <button
              type="submit"
              disabled={saveMut.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
