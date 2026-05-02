import type { ReactElement } from 'react'

import { formatFileByteSize } from '../../lib/formatFileByteSize'
import { formatPersonShortLabel } from '../../lib/formatPersonShortLabel'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import type { StudioArtifactRow } from '../../services/api'
import { ArtifactScopeBadge } from '../software/ArtifactScopeBadge'

function artifactTypeBadgeClass(fileType: string): string {
  const ft = fileType.toLowerCase()
  if (ft === 'pdf') {
    return 'border border-red-500/40 bg-red-950/70 text-red-200'
  }
  return 'border border-teal-500/40 bg-teal-950/55 text-teal-200'
}

export function StudioArtifactsSection(props: {
  isMember: boolean
  isPending: boolean
  isError: boolean
  rows: StudioArtifactRow[] | undefined
  onDownload: (projectId: string, artifactId: string, filename: string) => void
}): ReactElement | null {
  const { isMember, isPending, isError, rows, onDownload } = props

  if (!isMember) {
    return null
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
          Studio artifacts
          {rows != null ? (
            <span className="ml-2 font-normal text-[13px] text-zinc-500">
              {rows.length} {rows.length === 1 ? 'file' : 'files'}
            </span>
          ) : null}
        </h2>
      </div>
      <div className="px-5 pb-5 pt-1">
        {isPending && (
          <p className="mt-3 text-[13px] text-zinc-500">Loading artifacts…</p>
        )}
        {isError && (
          <p className="mt-3 text-[13px] text-zinc-500">Could not load artifacts.</p>
        )}
        {rows && rows.length === 0 ? (
          <p className="mt-3 text-[13px] text-zinc-500">No files uploaded yet.</p>
        ) : null}
        {rows && rows.length > 0 ? (
          <ul className="divide-y divide-zinc-800/90">
            {rows.map((row) => {
              const when =
                formatRelativeTimeUtc(row.created_at) ||
                new Date(row.created_at).toLocaleDateString()
              const uploader = formatPersonShortLabel(row.uploaded_by_display)
              const scopeLevel = row.scope_level ?? 'project'
              const excludedHint =
                row.excluded_at_software != null || row.excluded_at_project != null
              return (
                <li key={`${row.software_id}-${row.id}`} className="py-4 first:pt-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                        <ArtifactScopeBadge level={scopeLevel} />
                        <span
                          className={`inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${artifactTypeBadgeClass(row.file_type)}`}
                        >
                          {row.file_type.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span className="truncate text-[14px] font-medium text-zinc-100">
                            {row.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-[12px] text-zinc-500">
                            {formatFileByteSize(row.size_bytes ?? 0)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {row.software_name} · {row.project_name} · {uploader} · {when}
                          {excludedHint ? (
                            <span className="text-zinc-600">
                              {' '}
                              ·{' '}
                              {row.excluded_at_software != null ? 'Excluded (software)' : null}
                              {row.excluded_at_software != null &&
                              row.excluded_at_project != null
                                ? ', '
                                : null}
                              {row.excluded_at_project != null ? 'Excluded (project)' : null}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 self-start text-[12px] font-medium text-zinc-500 hover:text-zinc-300 sm:self-center"
                      onClick={() =>
                        void onDownload(row.project_id, row.id, row.name)
                      }
                    >
                      Download
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
