import { useMutation } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { proposeSoftwareDocSectionDraft } from '../../services/api'

export interface BackpropSectionFromCodebaseModalProps {
  softwareId: string
  sectionId: string
  currentMarkdown: string
  hasIndexedCodebase: boolean
  isOpen: boolean
  onDismiss: () => void
  onInsert: (markdown: string) => void | Promise<void>
}

export function BackpropSectionFromCodebaseModal(
  props: BackpropSectionFromCodebaseModalProps,
): ReactElement | null {
  const {
    softwareId,
    sectionId,
    currentMarkdown,
    hasIndexedCodebase,
    isOpen,
    onDismiss,
    onInsert,
  } = props
  const [markdown, setMarkdown] = useState('')
  const [sources, setSources] = useState<string[]>([])

  const proposeMut = useMutation({
    mutationFn: () => proposeSoftwareDocSectionDraft(softwareId, sectionId),
    onSuccess: (data) => {
      setMarkdown(data.markdown ?? '')
      setSources(data.source_files ?? [])
    },
  })

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setMarkdown('')
    setSources([])
    proposeMut.reset()
    // Intentionally only reset when dialog opens or target section changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable reset API
  }, [isOpen, sectionId])

  const handleDismiss = useCallback(() => {
    if (proposeMut.isPending) {
      return
    }
    setMarkdown('')
    setSources([])
    proposeMut.reset()
    onDismiss()
  }, [onDismiss, proposeMut])

  const handleInsert = useCallback(() => {
    if (!markdown.trim()) {
      return
    }
    void (async (): Promise<void> => {
      try {
        await Promise.resolve(onInsert(markdown))
      } finally {
        handleDismiss()
      }
    })()
  }, [handleDismiss, markdown, onInsert])

  if (!isOpen) {
    return null
  }

  const noDraft =
    proposeMut.isSuccess && (!markdown || markdown.trim().length === 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backprop-section-title"
    >
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-6 shadow-xl">
        <h2 id="backprop-section-title" className="text-[16px] font-semibold text-zinc-100">
          Draft from codebase
        </h2>
        {!hasIndexedCodebase ? (
          <p className="mt-3 text-[13px] text-zinc-500">Index the codebase first.</p>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              className="rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              disabled={proposeMut.isPending}
              onClick={() => proposeMut.mutate()}
            >
              {proposeMut.isPending ? 'Requesting…' : 'Generate draft'}
            </button>
            {proposeMut.isError ? (
              <p className="mt-3 text-[13px] text-red-400">
                {(proposeMut.error as { detail?: string })?.detail ?? 'Request failed.'}
              </p>
            ) : null}
            {noDraft ? <p className="mt-4 text-[13px] text-zinc-400">No draft produced.</p> : null}
            {markdown.trim() ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Current
                  </p>
                  <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <article className="prose prose-invert prose-sm prose-zinc max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {currentMarkdown || '_Empty_'}
                      </ReactMarkdown>
                    </article>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Proposed
                  </p>
                  <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <article className="prose prose-invert prose-sm prose-zinc max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
                    </article>
                  </div>
                </div>
              </div>
            ) : null}
            {sources.length > 0 ? (
              <div className="mt-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Source files
                </p>
                <ul className="mt-2 list-inside list-disc font-mono text-[11px] text-zinc-400">
                  {sources.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {markdown.trim() ? (
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-[12px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  disabled={!markdown.trim()}
                  onClick={() => handleInsert()}
                >
                  Insert into editor
                </button>
              </div>
            ) : null}
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-600 px-3 py-2 text-[12px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            disabled={proposeMut.isPending}
            onClick={() => handleDismiss()}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
