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
  const [llmKey, setLlmKey] = useState('')
  const [clearLlmKey, setClearLlmKey] = useState(false)
  const [embedProvider, setEmbedProvider] = useState('')
  const [embedModel, setEmbedModel] = useState('')
  const [embedKey, setEmbedKey] = useState('')
  const [clearEmbedKey, setClearEmbedKey] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!configQ.data || hydrated) return
    const c = configQ.data
    setLlmProvider(c.llm_provider ?? '')
    setLlmModel(c.llm_model ?? '')
    setEmbedProvider(c.embedding_provider ?? '')
    setEmbedModel(c.embedding_model ?? '')
    setLlmKey('')
    setEmbedKey('')
    setClearLlmKey(false)
    setClearEmbedKey(false)
    setHydrated(true)
  }, [configQ.data, hydrated])

  const saveMut = useMutation({
    mutationFn: (body: AdminConfigUpdateBody) => putAdminConfig(body),
    onSuccess: (data: AdminConfigPublic) => {
      void qc.setQueryData(['admin', 'config'], data)
      setLlmKey('')
      setEmbedKey('')
      setClearLlmKey(false)
      setClearEmbedKey(false)
      setLlmProvider(data.llm_provider ?? '')
      setLlmModel(data.llm_model ?? '')
      setEmbedProvider(data.embedding_provider ?? '')
      setEmbedModel(data.embedding_model ?? '')
      setHydrated(true)
    },
  })

  function buildBody(): AdminConfigUpdateBody {
    const body: AdminConfigUpdateBody = {
      llm_provider: llmProvider.trim() || null,
      llm_model: llmModel.trim() || null,
      embedding_provider: embedProvider.trim() || null,
      embedding_model: embedModel.trim() || null,
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
        <div className="mb-6 text-sm">
          <Link to="/" className="text-violet-400 hover:underline">
            ← Home
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Tool admin settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          LLM and embedding provider configuration. API keys are never shown after save; leave
          blank to keep the stored key, or use &quot;Remove stored key&quot; to clear.
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
            </section>

            <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300">Embedding</h2>
              <label className="block text-sm">
                <span className="text-zinc-400">Provider</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                  value={embedProvider}
                  onChange={(e) => setEmbedProvider(e.target.value)}
                  placeholder="e.g. openai"
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
