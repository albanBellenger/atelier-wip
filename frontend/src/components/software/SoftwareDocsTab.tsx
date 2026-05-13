import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  createSoftwareDocsSection,
  listCodebaseSnapshots,
  listSoftwareDocsSections,
} from '../../services/api'
import { BackpropOutlineFromCodebaseModal } from './BackpropOutlineFromCodebaseModal'

export interface SoftwareDocsTabProps {
  studioId: string
  softwareId: string
  canManageOutline: boolean
}

export function SoftwareDocsTab(props: SoftwareDocsTabProps): ReactElement {
  const { studioId, softwareId, canManageOutline } = props
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showBackpropOutline, setShowBackpropOutline] = useState(false)

  const docsQ = useQuery({
    queryKey: ['softwareDocs', softwareId],
    queryFn: () => listSoftwareDocsSections(softwareId),
    enabled: Boolean(softwareId),
  })

  const snapshotsQ = useQuery({
    queryKey: ['codebaseSnapshots', softwareId],
    queryFn: () => listCodebaseSnapshots(softwareId),
    enabled: Boolean(softwareId && canManageOutline),
  })

  const hasReadyCodebase = Boolean(
    snapshotsQ.data?.some((s) => s.status === 'ready'),
  )

  const createMut = useMutation({
    mutationFn: () =>
      createSoftwareDocsSection(softwareId, {
        title: name.trim() || 'Untitled',
      }),
    onSuccess: (row) => {
      setName('')
      setShowCreate(false)
      void qc.invalidateQueries({ queryKey: ['softwareDocs', softwareId] })
      void qc.invalidateQueries({ queryKey: ['software', softwareId, 'activity'] })
      void navigate(
        `/studios/${studioId}/software/${softwareId}/docs/${row.id}`,
      )
    },
  })

  const startCreate = useCallback(() => setShowCreate(true), [])

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
          Software documentation
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {canManageOutline ? (
            <button
              type="button"
              title={hasReadyCodebase ? undefined : 'Index the codebase first'}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-[12px] text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasReadyCodebase}
              onClick={() => setShowBackpropOutline(true)}
            >
              Draft outline from codebase
            </button>
          ) : null}
          {canManageOutline ? (
            showCreate ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-600 px-3 py-2 text-[12px] text-zinc-300 hover:bg-zinc-800"
                  onClick={() => {
                    setShowCreate(false)
                    setName('')
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                  onClick={() => createMut.mutate()}
                  disabled={createMut.isPending}
                >
                  Create page
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-violet-500"
                onClick={() => startCreate()}
              >
                + New doc
              </button>
            )
          ) : null}
        </div>
      </div>
      {canManageOutline && showCreate ? (
        <div className="flex flex-wrap gap-2 border-b border-zinc-800 bg-zinc-900/40 px-5 py-3">
          <input
            className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600"
            placeholder="Page title"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createMut.mutate()
            }}
            autoFocus
          />
        </div>
      ) : null}
      {docsQ.isPending ? (
        <p className="px-5 py-6 text-[13px] text-zinc-500">Loading…</p>
      ) : null}
      {docsQ.data && docsQ.data.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-zinc-500">
          No software documentation pages yet.
          {canManageOutline
            ? ' Studio Owners can add shared Markdown docs; they publish once at the repo root under `docs/`.'
            : ''}
        </p>
      ) : null}
      {docsQ.data && docsQ.data.length > 0 ? (
        <ul className="divide-y divide-zinc-800">
          {docsQ.data.map((row) => (
            <li key={row.id}>
              <Link
                to={`/studios/${studioId}/software/${softwareId}/docs/${row.id}`}
                className="block px-5 py-4 hover:bg-zinc-800/40"
              >
                <span className="text-[15px] font-medium text-zinc-100">{row.title}</span>
                <p className="mt-1 font-mono text-[11px] text-zinc-500">{row.slug}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <BackpropOutlineFromCodebaseModal
        softwareId={softwareId}
        isOpen={showBackpropOutline}
        onClose={() => setShowBackpropOutline(false)}
        onSectionsCreated={() => {
          void qc.invalidateQueries({ queryKey: ['softwareDocs', softwareId] })
          void qc.invalidateQueries({ queryKey: ['software', softwareId, 'activity'] })
        }}
      />
    </section>
  )
}
