import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Btn, Table, THead, TRow } from '../../components/admin/adminPrimitives'
import type { AdminCodebaseSoftwareRow } from '../../services/api'

const GRID =
  'grid-cols-[minmax(6rem,1fr)_minmax(3rem,0.35fr)_minmax(4rem,0.45fr)_minmax(3rem,0.35fr)_minmax(3rem,0.35fr)_minmax(3rem,0.35fr)_minmax(5rem,0.55fr)_minmax(3rem,0.4fr)_minmax(6.5rem,0.75fr)]'

export function CodebaseStudioSoftwareTable({
  studioId,
  rows,
  isPending,
  errorMessage,
  reindexActionsEnabled,
  mutatingSoftwareId,
  onReindex,
}: {
  studioId: string
  rows: AdminCodebaseSoftwareRow[] | undefined
  isPending: boolean
  errorMessage: string | null
  reindexActionsEnabled: boolean
  mutatingSoftwareId: string | null
  onReindex: (softwareId: string) => void
}): ReactElement {
  if (errorMessage) {
    return (
      <p className="border-t border-zinc-800/60 px-5 py-4 text-[13px] text-rose-300">
        {errorMessage}
      </p>
    )
  }

  if (isPending) {
    return (
      <p className="border-t border-zinc-800/60 px-5 py-6 text-[13px] text-zinc-500">
        Loading codebase index…
      </p>
    )
  }

  const list = rows ?? []

  return (
    <Table>
      <THead
        cols={[
          'Software',
          'Git',
          'Status',
          'Files',
          'Chunks',
          'Symbols',
          'Commit',
          'Branch',
          '',
        ]}
        grid={GRID}
      />
      {list.length === 0 ? (
        <div className="border-b border-zinc-800/60 px-5 py-6 text-[13px] text-zinc-500">
          No software in this studio.
        </div>
      ) : (
        list.map((r) => (
          <TRow key={r.software_id} grid={GRID}>
            <span className="truncate text-[13px] text-zinc-100">{r.software_name}</span>
            <span className="font-mono text-[12px] text-zinc-400">
              {r.git_configured ? 'yes' : 'no'}
            </span>
            <span className="truncate font-mono text-[11px] text-zinc-400">{r.newest_snapshot_status}</span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">{r.ready_file_count}</span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">
              {r.ready_chunk_count.toLocaleString()}
            </span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">
              {r.ready_symbol_count.toLocaleString()}
            </span>
            <span className="truncate font-mono text-[11px] text-zinc-500" title={r.commit_sha ?? ''}>
              {r.commit_sha ? `${r.commit_sha.slice(0, 7)}…` : '—'}
            </span>
            <span className="truncate font-mono text-[11px] text-zinc-500">{r.branch ?? '—'}</span>
            <div className="flex flex-wrap justify-end gap-1.5">
              {reindexActionsEnabled ? (
                <Btn
                  type="button"
                  size="sm"
                  disabled={!r.git_configured || mutatingSoftwareId === r.software_id}
                  onClick={() => onReindex(r.software_id)}
                >
                  {mutatingSoftwareId === r.software_id ? '…' : 'Reindex'}
                </Btn>
              ) : null}
              <Link
                to={`/studios/${encodeURIComponent(studioId)}/software/${encodeURIComponent(r.software_id)}`}
                className="inline-flex items-center rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800"
              >
                Open
              </Link>
            </div>
          </TRow>
        ))
      )}
    </Table>
  )
}
