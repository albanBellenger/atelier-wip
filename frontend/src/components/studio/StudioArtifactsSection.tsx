import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import { formatFileByteSize } from '../../lib/formatFileByteSize'
import { formatPersonShortLabel } from '../../lib/formatPersonShortLabel'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import type { StudioArtifactRow } from '../../services/api'
import { ArtifactQuickUpload } from '../software/ArtifactQuickUpload'
import { ArtifactScopeBadge } from '../software/ArtifactScopeBadge'

function artifactTypeBadgeClass(fileType: string): string {
  const ft = fileType.toLowerCase()
  if (ft === 'pdf') {
    return 'border border-red-500/40 bg-red-950/70 text-red-200'
  }
  return 'border border-teal-500/40 bg-teal-950/55 text-teal-200'
}

function rowProjectPlaceLabel(
  scope: string | undefined,
  projectName: string | null,
): string {
  const s = scope ?? 'project'
  if (s === 'studio') return 'Studio library'
  if (s === 'software') return 'Software library'
  return projectName ?? 'Project'
}

export function StudioArtifactsSection(props: {
  studioId: string
  defaultSoftwareId: string | null
  defaultProjectId: string | null
  canStudioEditor: boolean
  isMember: boolean
  isPending: boolean
  isError: boolean
  rows: StudioArtifactRow[] | undefined
  onDownload: (artifactId: string, filename: string) => void
}): ReactElement | null {
  const {
    studioId,
    defaultSoftwareId,
    defaultProjectId,
    canStudioEditor,
    isMember,
    isPending,
    isError,
    rows,
    onDownload,
  } = props

  if (!isMember) {
    return null
  }

  // Omit softwareId so the library page shows "All software" (not the quick-upload default).
  const libraryHref = `/studios/${studioId}/artifact-library`

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
          Studio artifacts
          {rows != null ? (
            <span className="ml-2 font-normal text-[13px] text-zinc-500">
              {rows.length} {rows.length === 1 ? 'file' : 'files'}
            </span>
          ) : null}
        </h2>
        <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:max-w-md sm:items-end">
          <Link
            to={libraryHref}
            className="self-end text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            Open library →
          </Link>
          {canStudioEditor && defaultSoftwareId && defaultProjectId ? (
            <ArtifactQuickUpload
              softwareId={defaultSoftwareId}
              projectId={defaultProjectId}
              canUpload
              variant="full"
              studioIdForListInvalidation={studioId}
            />
          ) : canStudioEditor ? (
            <p className="max-w-sm text-right text-[11px] text-zinc-500">
              Add a project under any software in this studio to upload files from
              this card, or use the artifact library page.
            </p>
          ) : null}
        </div>
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
                          {`${row.software_name ?? '—'} · ${rowProjectPlaceLabel(scopeLevel, row.project_name)} · ${uploader} · ${when}`}
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
