import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Table, THead, TRow } from '../../components/admin/adminPrimitives'
import type { AdminEmbeddingLibraryStudioRow } from '../../services/api'

const GRID =
  'grid-cols-[minmax(8rem,1.2fr)_minmax(4rem,0.55fr)_minmax(4rem,0.55fr)_minmax(4.5rem,0.6fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,0.7fr)]'

export function EmbeddingLibraryTable({
  rows,
  isPending,
  errorMessage,
}: {
  rows: AdminEmbeddingLibraryStudioRow[] | undefined
  isPending: boolean
  errorMessage: string | null
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
        Loading library aggregates…
      </p>
    )
  }

  const list = rows ?? []

  return (
    <Table>
      <THead
        cols={[
          'Studio',
          'Artifacts',
          'Embedded',
          'Artifact chunks',
          'Section chunks',
          '',
        ]}
        grid={GRID}
      />
      {list.length === 0 ? (
        <div className="border-b border-zinc-800/60 px-5 py-6 text-[13px] text-zinc-500">
          No studios yet — create a studio to populate the shared artifact library.
        </div>
      ) : (
        list.map((r) => (
          <TRow key={r.studio_id} grid={GRID}>
            <span className="truncate text-[13px] text-zinc-100">{r.studio_name}</span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">{r.artifact_count}</span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">
              {r.embedded_artifact_count}
            </span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">
              {r.artifact_vector_chunks.toLocaleString()}
            </span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">
              {r.section_vector_chunks.toLocaleString()}
            </span>
            <div className="flex justify-end">
              <Link
                to={`/studios/${encodeURIComponent(r.studio_id)}/artifact-library`}
                className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800"
              >
                Open library
              </Link>
            </div>
          </TRow>
        ))
      )}
    </Table>
  )
}
