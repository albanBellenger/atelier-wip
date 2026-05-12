import type { ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Card, KpiTile, PageTitle } from '../../components/admin/adminPrimitives'
import {
  getAdminCodebaseOverview,
  postAdminCodebaseReindex,
  type AdminCodebaseStudioRow,
} from '../../services/api'
import { CodebaseStudioSoftwareTable } from './CodebaseStudioSoftwareTable'

function formatApiErr(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as { detail: unknown }).detail
    if (typeof d === 'string') return d
    try {
      return JSON.stringify(d)
    } catch {
      return 'Request failed'
    }
  }
  return err instanceof Error ? err.message : 'Request failed'
}

export function CodebaseSection(): ReactElement {
  const qc = useQueryClient()

  const overviewQ = useQuery({
    queryKey: ['admin', 'codebase', 'overview'],
    queryFn: () => getAdminCodebaseOverview(),
    retry: false,
  })

  const reindexMut = useMutation({
    mutationFn: (softwareId: string) => postAdminCodebaseReindex(softwareId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'codebase', 'overview'] })
    },
  })

  const sums = useMemo(() => {
    const list: AdminCodebaseStudioRow[] = overviewQ.data ?? []
    let gitOk = 0
    let files = 0
    let chunks = 0
    let symbols = 0
    let softwareRows = 0
    for (const st of list) {
      for (const s of st.software) {
        softwareRows += 1
        if (s.git_configured) gitOk += 1
        files += s.ready_file_count
        chunks += s.ready_chunk_count
        symbols += s.ready_symbol_count
      }
    }
    return { gitOk, files, chunks, symbols, softwareRows }
  }, [overviewQ.data])

  const overviewErr = overviewQ.isError ? formatApiErr(overviewQ.error) : null
  const reindexErr = reindexMut.isError ? formatApiErr(reindexMut.error) : null

  return (
    <div className="space-y-6">
      <PageTitle
        title="Codebase"
        subtitle="Git-linked repository index per software (vector chunks for RAG). Reindex runs for the selected software only. Configure Git credentials on each software’s settings."
      />

      {reindexErr ? <p className="text-[12px] text-rose-300">{reindexErr}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          label="Software (total)"
          value={overviewQ.isSuccess ? sums.softwareRows : '—'}
          sub="rows across all studios"
        />
        <KpiTile
          label="Git configured"
          value={overviewQ.isSuccess ? sums.gitOk : '—'}
          sub="repo URL, branch, token set"
        />
        <KpiTile
          label="Indexed files (ready)"
          value={overviewQ.isSuccess ? sums.files.toLocaleString() : '—'}
          sub="latest ready snapshot per software"
        />
        <KpiTile
          label="Vector chunks (ready)"
          value={overviewQ.isSuccess ? sums.chunks.toLocaleString() : '—'}
          sub="codebase_chunks"
        />
        <KpiTile
          label="Symbols (ready)"
          value={overviewQ.isSuccess ? sums.symbols.toLocaleString() : '—'}
          sub="codebase_symbols"
        />
      </div>

      {overviewQ.isSuccess && overviewQ.data.length === 0 ? (
        <p className="text-[13px] text-zinc-500">No studios yet.</p>
      ) : null}

      {overviewQ.isSuccess
        ? overviewQ.data.map((st) => (
            <Card key={st.studio_id} title={st.studio_name}>
              <CodebaseStudioSoftwareTable
                studioId={st.studio_id}
                rows={st.software}
                isPending={false}
                errorMessage={null}
                reindexActionsEnabled
                mutatingSoftwareId={reindexMut.isPending ? reindexMut.variables ?? null : null}
                onReindex={(id) => reindexMut.mutate(id)}
              />
            </Card>
          ))
        : null}

      {!overviewQ.isSuccess ? (
        <Card title="Indexed codebases">
          <CodebaseStudioSoftwareTable
            studioId=""
            rows={undefined}
            isPending={overviewQ.isPending}
            errorMessage={overviewErr}
            reindexActionsEnabled={false}
            mutatingSoftwareId={null}
            onReindex={() => {}}
          />
        </Card>
      ) : null}
    </div>
  )
}
