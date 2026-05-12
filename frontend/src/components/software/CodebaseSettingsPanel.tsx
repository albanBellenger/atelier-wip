import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import {
  listCodebaseSnapshots,
  requestCodebaseReindex,
  type CodebaseSnapshot,
} from '../../services/api'

export interface CodebaseSettingsPanelProps {
  softwareId: string
  canRequestReindex: boolean
}

export function CodebaseSettingsPanel(
  props: CodebaseSettingsPanelProps,
): ReactElement {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['codebaseSnapshots', props.softwareId],
    queryFn: () => listCodebaseSnapshots(props.softwareId),
  })

  const reindexMut = useMutation({
    mutationFn: () => requestCodebaseReindex(props.softwareId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['codebaseSnapshots', props.softwareId],
      })
    },
  })

  const rows = q.data ?? []

  return (
    <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-sm font-medium text-zinc-300">Codebase index</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Snapshots of the linked GitLab repository are embedded for retrieval (see docs §9b).
        Re-indexing runs in the background after you request it.
      </p>
      {props.canRequestReindex ? (
        <button
          type="button"
          disabled={reindexMut.isPending}
          className="mt-4 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
          onClick={() => reindexMut.mutate()}
        >
          {reindexMut.isPending ? 'Queueing…' : 'Re-index codebase'}
        </button>
      ) : null}
      <div className="mt-4">
        {q.isPending ? (
          <p className="text-sm text-zinc-500">Loading snapshots…</p>
        ) : null}
        {q.isError ? (
          <p className="text-sm text-red-400">Could not load codebase snapshots.</p>
        ) : null}
        {!q.isPending && !q.isError && rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No snapshots yet.</p>
        ) : null}
        {rows.length > 0 ? (
          <ul className="mt-2 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {rows.map((s: CodebaseSnapshot) => (
              <li key={s.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-mono text-xs text-zinc-400">
                    {s.commit_sha.slice(0, 12)}
                  </span>
                  <span
                    className={
                      s.status === 'ready'
                        ? 'text-emerald-400'
                        : s.status === 'failed'
                          ? 'text-red-400'
                          : s.status === 'superseded'
                            ? 'text-zinc-500'
                            : 'text-amber-400'
                    }
                  >
                    {s.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  branch {s.branch} · {s.file_count} files · {s.chunk_count} chunks
                </p>
                {s.error_message ? (
                  <p className="mt-1 text-xs text-red-400">{s.error_message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
