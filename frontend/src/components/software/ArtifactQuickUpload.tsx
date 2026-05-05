import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useRef, useState } from 'react'

import {
  type AuthErrorBody,
  createMarkdownArtifact,
  createSoftwareMarkdownArtifact,
  uploadArtifact,
  uploadSoftwareArtifact,
} from '../../services/api'

function formatApiDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as AuthErrorBody).detail
    if (typeof d === 'string') return d
  }
  return 'Request failed.'
}

export type ArtifactQuickUploadVariant = 'header' | 'full'

export function ArtifactQuickUpload(props: {
  softwareId: string
  projectId: string
  /** Where new files are stored: project library vs software-wide library. */
  uploadTarget?: 'project' | 'software'
  canUpload: boolean
  variant: ArtifactQuickUploadVariant
  /** When set, invalidates the studio-wide artifact list after upload. */
  studioIdForListInvalidation?: string
}): ReactElement | null {
  const {
    softwareId,
    projectId,
    uploadTarget = 'project',
    canUpload,
    variant,
    studioIdForListInvalidation,
  } = props
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [showMd, setShowMd] = useState(false)
  const [mdName, setMdName] = useState('')
  const [mdBody, setMdBody] = useState('')

  const invalidateArtifactQueries = (): void => {
    void qc.invalidateQueries({ queryKey: ['artifacts', projectId] })
    void qc.invalidateQueries({ queryKey: ['software', softwareId, 'artifacts'] })
    if (studioIdForListInvalidation) {
      void qc.invalidateQueries({
        queryKey: ['studio', studioIdForListInvalidation, 'artifacts'],
      })
      void qc.invalidateQueries({
        queryKey: ['artifactLibrary', studioIdForListInvalidation],
      })
    }
  }

  const uploadMut = useMutation({
    mutationFn: (file: File) =>
      uploadTarget === 'software'
        ? uploadSoftwareArtifact(softwareId, file)
        : uploadArtifact(projectId, file),
    onSuccess: () => {
      invalidateArtifactQueries()
    },
  })

  const mdMut = useMutation({
    mutationFn: () =>
      uploadTarget === 'software'
        ? createSoftwareMarkdownArtifact(softwareId, {
            name: mdName.trim() || 'Untitled.md',
            content: mdBody,
          })
        : createMarkdownArtifact(projectId, {
            name: mdName.trim() || 'Untitled.md',
            content: mdBody,
          }),
    onSuccess: () => {
      setMdName('')
      setMdBody('')
      setShowMd(false)
      invalidateArtifactQueries()
    },
  })

  if (!canUpload) {
    return null
  }

  const btnClass =
    'rounded-md border border-zinc-600 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50'

  return (
    <div className="flex flex-col items-stretch gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.md,application/pdf,text/markdown"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              uploadMut.mutate(f)
              e.target.value = ''
            }
          }}
        />
        <button
          type="button"
          className={btnClass}
          disabled={uploadMut.isPending}
          onClick={() => fileRef.current?.click()}
        >
          Upload file
        </button>
        {variant === 'full' ? (
          <button
            type="button"
            className={btnClass}
            onClick={() => setShowMd((v) => !v)}
          >
            New Markdown
          </button>
        ) : null}
      </div>
      {uploadMut.isError ? (
        <p className="text-right text-[11px] text-red-400">
          {formatApiDetail(uploadMut.error)}
        </p>
      ) : null}
      {variant === 'full' && showMd ? (
        <div className="rounded-md border border-zinc-700 bg-zinc-950/40 p-3">
          <label className="block text-[11px] font-medium text-zinc-400">
            Markdown name
            <input
              type="text"
              aria-label="Markdown name"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
              value={mdName}
              onChange={(e) => setMdName(e.target.value)}
              placeholder="notes.md"
            />
          </label>
          <label className="mt-2 block text-[11px] font-medium text-zinc-400">
            Markdown body
            <textarea
              aria-label="Markdown body"
              className="mt-1 min-h-[100px] w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
              value={mdBody}
              onChange={(e) => setMdBody(e.target.value)}
            />
          </label>
          {mdMut.isError ? (
            <p className="mt-2 text-[11px] text-red-400">
              {formatApiDetail(mdMut.error)}
            </p>
          ) : null}
          <button
            type="button"
            className={`mt-2 ${btnClass}`}
            disabled={mdMut.isPending}
            onClick={() => mdMut.mutate()}
          >
            Save Markdown
          </button>
        </div>
      ) : null}
    </div>
  )
}
