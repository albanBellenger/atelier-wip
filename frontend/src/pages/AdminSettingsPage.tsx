import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminConsolePath } from '../lib/adminConsoleNav'
import { type AuthErrorBody, me, postAdminTestEmbedding } from '../services/api'

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

  const testEmbedMut = useMutation({
    mutationFn: () => postAdminTestEmbedding(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'llm', 'deployment'] })
    },
  })

  if (profileQ.isPending || !profileQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!profileQ.data.user.is_platform_admin) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <div className="mx-auto max-w-lg">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Platform administrator privileges are required for this page.
          </p>
          <Link to="/" className="mt-6 inline-block text-violet-400 hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

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
        <h1 className="text-2xl font-semibold">Platform admin shortcuts</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Embedding models, API keys, and routing live in the Admin Console. Register embedding
          models on a provider row, add an <span className="font-mono text-zinc-300">embeddings</span>{' '}
          routing rule, then use the connectivity check below.
        </p>

        <div className="mt-6 space-y-3 rounded-lg border border-violet-500/40 bg-violet-950/30 px-4 py-3 text-sm text-zinc-200">
          <p className="font-medium text-violet-200">LLM provider registry</p>
          <Link
            to={adminConsolePath('llm')}
            className="inline-block font-medium text-violet-400 hover:underline"
          >
            Open Admin Console — LLM
          </Link>
          <p className="text-zinc-400">
            Embeddings routing bucket and provider keys are configured here (including the{' '}
            <span className="font-mono text-zinc-300">embeddings</span> agent group).
          </p>
        </div>

        <div className="mt-4 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm">
          <p className="font-medium text-zinc-300">Embeddings console</p>
          <Link
            to={adminConsolePath('embeddings')}
            className="inline-block font-medium text-violet-400 hover:underline"
          >
            Open Admin Console — Embeddings
          </Link>
          <p className="text-zinc-500">
            Library coverage, embedding model catalog metadata, reindex policy, and probe.
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-sm font-medium text-zinc-300">Test embedding API</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Calls the platform embedding route (LLM registry + embeddings routing rule).
          </p>
          <button
            type="button"
            disabled={testEmbedMut.isPending}
            onClick={() => testEmbedMut.mutate()}
            className="mt-3 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {testEmbedMut.isPending ? 'Testing…' : 'Test embedding'}
          </button>
          {testEmbedMut.data && (
            <p
              className={`mt-2 text-sm ${testEmbedMut.data.ok ? 'text-emerald-400' : 'text-amber-400'}`}
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
            <p className="mt-2 text-sm text-red-400">{formatApiDetail(testEmbedMut.error)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
