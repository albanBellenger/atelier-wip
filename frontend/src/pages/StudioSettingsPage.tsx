import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  createMcpKey,
  listMcpKeys,
  me,
  revokeMcpKey,
} from '../services/api'

export function StudioSettingsPage(): ReactElement {
  const { studioId } = useParams<{ studioId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''

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

  const keysQ = useQuery({
    queryKey: ['mcpKeys', sid],
    queryFn: () => listMcpKeys(sid),
    enabled: Boolean(sid && access.isStudioAdmin),
  })

  const [label, setLabel] = useState('')
  const [secretOnce, setSecretOnce] = useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: () =>
      createMcpKey(sid, {
        label: label.trim() || 'key',
        access_level: 'editor',
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

  if (!access.isStudioAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>Studio admin only.</p>
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-lg space-y-6">
        <Link to={`/studios/${sid}`} className="text-sm text-violet-400 hover:underline">
          ← Studio
        </Link>
        <h1 className="text-2xl font-semibold">Studio settings</h1>
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-sm font-medium text-zinc-300">MCP API keys</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Use with Authorization: Bearer &lt;secret&gt; on /mcp/v1/…
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
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <button
              type="button"
              disabled={createMut.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              onClick={() => createMut.mutate()}
            >
              Create
            </button>
          </div>
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
    </div>
  )
}
