import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { APP_VERSION } from '../version'
import {
  createMcpKey,
  listMcpKeys,
  logout as logoutApi,
  me,
  revokeMcpKey,
} from '../services/api'

function apiOrigin(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined
  const trimmed = env?.trim()
  if (!trimmed) {
    return typeof window !== 'undefined' ? window.location.origin : ''
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).origin
    } catch {
      return trimmed.replace(/\/$/, '')
    }
  }
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    return new URL(trimmed, base).origin
  } catch {
    return typeof window !== 'undefined' ? window.location.origin : ''
  }
}

const MCP_ENDPOINTS: { method: string; path: string; note: string }[] = [
  { method: 'GET', path: '/mcp/v1/work-orders', note: 'List work orders (?project_id= optional)' },
  { method: 'GET', path: '/mcp/v1/work-orders/{id}', note: 'Pull full work order context' },
  { method: 'PATCH', path: '/mcp/v1/work-orders/{id}', note: 'Update status (editor keys)' },
  { method: 'POST', path: '/mcp/v1/work-orders/{id}/notes', note: 'Post note (editor keys)' },
]

export function McpServerSettingsPage(): ReactElement {
  const { studioId } = useParams<{ studioId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''
  const hostedEnv = getHostedEnvironment()
  const hostedEnvLabel = hostedEnvironmentLabel(hostedEnv)

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

  const access = useStudioAccess(profileQ.data, sid)

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      /* still leave */
    }
    void navigate('/auth', { replace: true })
  }, [navigate])

  const handleStudioChange = useCallback(
    (nextStudioId: string) => {
      void navigate(`/studios/${nextStudioId}/settings/mcp`)
    },
    [navigate],
  )

  const keysQ = useQuery({
    queryKey: ['mcpKeys', sid],
    queryFn: () => listMcpKeys(sid),
    enabled: Boolean(sid && access.isStudioAdmin),
  })

  const [label, setLabel] = useState('')
  const [accessLevel, setAccessLevel] = useState<'viewer' | 'editor'>('editor')
  const [secretOnce, setSecretOnce] = useState<string | null>(null)

  const baseUrl = useMemo(() => apiOrigin(), [])

  const exampleCurl = useMemo(() => {
    return `curl -s -H "Authorization: Bearer YOUR_SECRET" "${baseUrl}/mcp/v1/work-orders"`
  }, [baseUrl])

  const createMut = useMutation({
    mutationFn: () =>
      createMcpKey(sid, {
        label: label.trim() || 'key',
        access_level: accessLevel,
      }),
    onSuccess: (data) => {
      setSecretOnce(data.secret)
      setLabel('')
      void qc.invalidateQueries({ queryKey: ['mcpKeys', sid] })
    },
  })

  const revokeMut = useMutation({
    mutationFn: (keyId: string) => revokeMcpKey(sid, keyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mcpKeys', sid] })
    },
  })

  if (!sid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileQ.isPending || !profileQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>No access.</p>
        <Link to="/studios" className="mt-4 inline-block text-violet-400">
          Back to studios
        </Link>
      </div>
    )
  }

  if (!access.isStudioAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>Studio Owner only.</p>
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  const profile = profileQ.data

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={sid}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={{ projectLabel: 'MCP server' }}
        />

        <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">MCP server</h1>
          <p className="mt-2 text-sm text-zinc-400">
            REST bridge for coding agents (Cursor, Claude Code, and other MCP-compatible tools).
            Authenticate with{' '}
            <code className="rounded bg-zinc-900 px-1 py-0.5 text-xs text-zinc-300">
              Authorization: Bearer &lt;secret&gt;
            </code>
            .
          </p>
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-medium text-zinc-300">API base URL</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Use this host when configuring your IDE or scripts (same server as the Atelier API).
          </p>
          <code className="mt-3 block break-all rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-emerald-300/90">
            {baseUrl}
          </code>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-medium text-zinc-300">Endpoints</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {MCP_ENDPOINTS.map((row) => (
              <li
                key={`${row.method}:${row.path}`}
                className="flex flex-col gap-0.5 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="font-mono text-xs text-zinc-300">
                  <span className="text-violet-400">{row.method}</span> {row.path}
                </span>
                <span className="text-xs text-zinc-500">{row.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-zinc-500">Example:</p>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
            {exampleCurl}
          </pre>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-medium text-zinc-300">API keys</h2>
          <p className="mt-1 text-xs text-zinc-500">
            One key per developer is recommended. Viewer keys cannot change work orders or post
            notes.
          </p>
          {secretOnce && (
            <div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">
              <p className="font-medium">Copy now — shown once:</p>
              <code className="mt-1 block break-all font-mono">{secretOnce}</code>
              <button
                type="button"
                className="mt-2 text-violet-400 hover:underline"
                onClick={() => setSecretOnce(null)}
              >
                Dismiss
              </button>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <select
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value as 'viewer' | 'editor')}
            >
              <option value="editor">Editor — list, pull, update status, notes</option>
              <option value="viewer">Viewer — list and pull only</option>
            </select>
            <button
              type="button"
              disabled={createMut.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              onClick={() => createMut.mutate()}
            >
              Create key
            </button>
          </div>
          {keysQ.isError && (
            <p className="mt-3 text-sm text-red-400">Could not load keys.</p>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {(keysQ.data ?? []).map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2"
              >
                <span>
                  {k.label}{' '}
                  <span className="text-zinc-500">
                    ({k.access_level}
                    {k.revoked_at ? ', revoked' : ''})
                  </span>
                </span>
                {!k.revoked_at ? (
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:underline"
                    onClick={() => revokeMut.mutate(k.id)}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/60 pt-6 text-[11px] text-zinc-600">
          <span>Atelier · Builder workspace</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
            <Link
              to="/changelog"
              className="text-zinc-500 hover:text-zinc-300 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              v{APP_VERSION}
            </Link>
            <span className="select-none font-sans text-zinc-700" aria-hidden>
              ·
            </span>
            <span
              className="rounded border border-zinc-700/70 px-1.5 py-px text-[10px] font-sans font-normal uppercase tracking-wider text-zinc-500"
              title={`Hosted environment: ${hostedEnvLabel}`}
            >
              {hostedEnvLabel}
            </span>
          </span>
        </footer>
      </div>
    </div>
  )
}
