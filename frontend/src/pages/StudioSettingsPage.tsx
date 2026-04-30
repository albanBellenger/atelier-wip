import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  me,
  postStudioCrossStudioRequest,
  type AuthErrorBody,
} from '../services/api'

function formatApiDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as AuthErrorBody).detail
    if (typeof d === 'string') return d
  }
  return 'Request failed.'
}

export function StudioSettingsPage(): ReactElement {
  const { studioId } = useParams<{ studioId: string }>()
  const navigate = useNavigate()
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

  const qc = useQueryClient()
  const [targetSoftwareId, setTargetSoftwareId] = useState('')
  const [requestedLevel, setRequestedLevel] = useState<'viewer' | 'external_editor'>(
    'viewer',
  )
  const [crossMsg, setCrossMsg] = useState<string | null>(null)

  const crossMut = useMutation({
    mutationFn: () =>
      postStudioCrossStudioRequest(sid, {
        target_software_id: targetSoftwareId.trim(),
        requested_access_level: requestedLevel,
      }),
    onSuccess: () => {
      setCrossMsg('Request submitted.')
      setTargetSoftwareId('')
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (e: unknown) => {
      setCrossMsg(formatApiDetail(e))
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
        <Link
          to={`/studios/${sid}/settings/mcp`}
          className="block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-700"
        >
          <h2 className="text-sm font-medium text-zinc-200">MCP server</h2>
          <p className="mt-1 text-xs text-zinc-500">
            API base URL, endpoints, and keys for coding-agent integrations.
          </p>
          <span className="mt-3 inline-block text-sm text-violet-400">Open →</span>
        </Link>

        <Link
          to={`/studios/${sid}/token-usage`}
          className="block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-700"
        >
          <h2 className="text-sm font-medium text-zinc-200">Token usage</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Usage across members and projects in this studio (aggregated rows).
          </p>
          <span className="mt-3 inline-block text-sm text-violet-400">Open →</span>
        </Link>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-medium text-zinc-200">
            Request cross-studio access
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Ask Tool Admin for read or edit access to software owned by another studio.
            Paste the target software UUID (owner validates on approval).
          </p>
          {crossMsg && (
            <p
              className={`mt-3 text-sm ${crossMut.isError ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {crossMsg}
            </p>
          )}
          <label className="mt-4 block text-xs text-zinc-500">
            Target software ID
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm"
              value={targetSoftwareId}
              onChange={(e) => {
                setTargetSoftwareId(e.target.value)
                setCrossMsg(null)
              }}
              placeholder="UUID"
            />
          </label>
          <label className="mt-3 block text-xs text-zinc-500">
            Requested access
            <select
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={requestedLevel}
              onChange={(e) =>
                setRequestedLevel(e.target.value as 'viewer' | 'external_editor')
              }
            >
              <option value="viewer">Viewer</option>
              <option value="external_editor">External editor</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!targetSoftwareId.trim() || crossMut.isPending}
            className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            onClick={() => {
              setCrossMsg(null)
              crossMut.mutate()
            }}
          >
            {crossMut.isPending ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}
