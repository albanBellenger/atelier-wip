import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { formatFileByteSize } from '../../lib/formatFileByteSize'
import { formatPersonShortLabel } from '../../lib/formatPersonShortLabel'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import type { SoftwareArtifactRow } from '../../services/api'
import { ArtifactQuickUpload } from './ArtifactQuickUpload'
import { ArtifactScopeBadge } from './ArtifactScopeBadge'

function artifactTypeBadgeClass(fileType: string): string {
  const ft = fileType.toLowerCase()
  if (ft === 'pdf') {
    return 'border border-red-500/40 bg-red-950/70 text-red-200'
  }
  return 'border border-teal-500/40 bg-teal-950/55 text-teal-200'
}

function rowOriginLabel(
  scope: string | undefined,
  projectName: string | null,
): string {
  const s = scope ?? 'project'
  if (s === 'studio') return 'Studio library'
  if (s === 'software') return 'Software library'
  return projectName ?? 'Project'
}

export function ProjectAggregatedArtifactsSection(props: {
  studioId: string
  softwareId: string
  projectId: string
  isMember: boolean
  canStudioEditor: boolean
  isPending: boolean
  isError: boolean
  rows: SoftwareArtifactRow[] | undefined
  onDownload: (artifactId: string, filename: string) => void
}): ReactElement | null {
  const {
    studioId,
    softwareId,
    projectId,
    isMember,
    canStudioEditor,
    isPending,
    isError,
    rows,
    onDownload,
  } = props

  const visibleRows = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          r.excluded_at_software == null && r.excluded_at_project == null,
      ),
    [rows],
  )

  if (!isMember) {
    return null
  }

  const libraryPath = `/studios/${studioId}/artifact-library?softwareId=${encodeURIComponent(softwareId)}`

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-3">
          <h3 className="text-[13px] font-semibold text-zinc-100">Artifacts</h3>
          <span className="text-[11px] text-zinc-600">
            {rows != null
              ? `${visibleRows.length} file${visibleRows.length === 1 ? '' : 's'}`
              : null}
            {rows != null ? (
              <span className="text-zinc-700"> · </span>
            ) : null}
            <span className="text-zinc-600">
              Studio, software & project (not excluded)
            </span>
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          <Link
            to={libraryPath}
            className="text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            Open library →
          </Link>
          <ArtifactQuickUpload
            softwareId={softwareId}
            projectId={projectId}
            canUpload={canStudioEditor}
            variant="full"
            studioIdForListInvalidation={studioId}
          />
        </div>
      </div>

      <div className="px-5 pb-5 pt-1">
        {isPending && (
          <p className="mt-3 text-[13px] text-zinc-500">Loading artifacts…</p>
        )}
        {isError && (
          <p className="mt-3 text-[13px] text-zinc-500">
            Could not load artifacts.
          </p>
        )}
        {!isPending && !isError && visibleRows.length === 0 ? (
          <p className="mt-3 text-[13px] text-zinc-500">
            No files in scope for this project yet.
          </p>
        ) : null}
        {visibleRows.length > 0 ? (
          <ul className="divide-y divide-zinc-800/90">
            {visibleRows.map((row) => {
              const when =
                formatRelativeTimeUtc(row.created_at) ||
                new Date(row.created_at).toLocaleDateString()
              const uploader = formatPersonShortLabel(row.uploaded_by_display)
              const scopeLevel = row.scope_level ?? 'project'
              return (
                <li key={row.id} className="py-4 first:pt-3">
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
                          {`${rowOriginLabel(scopeLevel, row.project_name)} · ${uploader} · ${when}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 self-start text-[12px] font-medium text-zinc-500 hover:text-zinc-300 sm:self-center"
                      onClick={() => void onDownload(row.id, row.name)}
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
