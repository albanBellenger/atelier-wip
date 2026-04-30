import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  listAdminCrossStudio,
  me,
  putAdminCrossStudioResolve,
  type CrossStudioAdminRow,
} from '../services/api'

export function AdminCrossStudioPage(): ReactElement {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('pending')

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

  const listQ = useQuery({
    queryKey: ['admin', 'cross-studio', statusFilter],
    queryFn: () =>
      listAdminCrossStudio({
        status: statusFilter || undefined,
        limit: 200,
      }),
    enabled: Boolean(profileQ.data?.user.is_tool_admin),
  })

  const resolveMut = useMutation({
    mutationFn: (vars: {
      id: string
      decision: 'approve' | 'reject' | 'revoke'
      access_level?: 'viewer' | 'external_editor'
    }) =>
      putAdminCrossStudioResolve(vars.id, {
        decision: vars.decision,
        access_level: vars.access_level ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'cross-studio'] })
    },
  })

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
        <p>Tool admin only.</p>
        <Link to="/" className="mt-4 inline-block text-violet-400">
          Home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="text-sm">
          <Link to="/admin/settings" className="text-violet-400 hover:underline">
            ← Tool admin settings
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Cross-studio access</h1>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Status</span>
          <select
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="revoked">revoked</option>
          </select>
        </label>

        {listQ.isPending && <p className="text-zinc-500">Loading…</p>}
        {listQ.isError && (
          <p className="text-red-400">Could not load requests.</p>
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase text-zinc-500">
              <tr>
                <th className="p-2">From studio</th>
                <th className="p-2">Target software</th>
                <th className="p-2">Owner studio</th>
                <th className="p-2">Requester</th>
                <th className="p-2">Level</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(listQ.data ?? []).map((row: CrossStudioAdminRow) => (
                <tr key={row.id} className="border-b border-zinc-800/80">
                  <td className="p-2">{row.requesting_studio_name}</td>
                  <td className="p-2">{row.target_software_name}</td>
                  <td className="p-2">{row.owner_studio_name}</td>
                  <td className="p-2">{row.requester_email}</td>
                  <td className="p-2">{row.access_level}</td>
                  <td className="p-2">{row.status}</td>
                  <td className="space-x-1 p-2">
                    {row.status === 'pending' ? (
                      <>
                        <ResolveButtons
                          row={row}
                          resolveMut={resolveMut}
                          approvedLevel="viewer"
                          label="Approve viewer"
                        />
                        <ResolveButtons
                          row={row}
                          resolveMut={resolveMut}
                          approvedLevel="external_editor"
                          label="Approve editor"
                        />
                        <button
                          type="button"
                          className="rounded bg-zinc-700 px-2 py-1 text-[10px] text-white hover:bg-zinc-600 disabled:opacity-50"
                          disabled={resolveMut.isPending}
                          onClick={() =>
                            resolveMut.mutate({
                              id: row.id,
                              decision: 'reject',
                            })
                          }
                        >
                          Reject
                        </button>
                      </>
                    ) : row.status === 'approved' ? (
                      <button
                        type="button"
                        className="rounded bg-amber-900/50 px-2 py-1 text-[10px] text-amber-100 hover:bg-amber-900 disabled:opacity-50"
                        disabled={resolveMut.isPending}
                        onClick={() =>
                          resolveMut.mutate({
                            id: row.id,
                            decision: 'revoke',
                          })
                        }
                      >
                        Revoke
                      </button>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ResolveButtons(props: {
  row: CrossStudioAdminRow
  resolveMut: {
    mutate: (vars: {
      id: string
      decision: 'approve' | 'reject' | 'revoke'
      access_level?: 'viewer' | 'external_editor'
    }) => void
    isPending: boolean
  }
  approvedLevel: 'viewer' | 'external_editor'
  label: string
}): ReactElement {
  const { row, resolveMut, approvedLevel, label } = props
  return (
    <button
      type="button"
      className="rounded bg-violet-700 px-2 py-1 text-[10px] text-white hover:bg-violet-600 disabled:opacity-50"
      disabled={resolveMut.isPending}
      onClick={() =>
        resolveMut.mutate({
          id: row.id,
          decision: 'approve',
          access_level: approvedLevel,
        })
      }
    >
      {label}
    </button>
  )
}
