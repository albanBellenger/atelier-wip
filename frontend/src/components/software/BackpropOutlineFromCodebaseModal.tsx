import { useMutation } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useMemo, useState } from 'react'

import {
  createSoftwareDocsSection,
  proposeSoftwareDocsOutline,
  type BackpropOutlineSectionProposal,
} from '../../services/api'

export interface BackpropOutlineFromCodebaseModalProps {
  softwareId: string
  isOpen: boolean
  onClose: () => void
  onSectionsCreated: () => void
}

export function BackpropOutlineFromCodebaseModal(
  props: BackpropOutlineFromCodebaseModalProps,
): ReactElement | null {
  const { softwareId, isOpen, onClose, onSectionsCreated } = props
  const [hint, setHint] = useState('')
  const [rows, setRows] = useState<BackpropOutlineSectionProposal[]>([])
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  const proposeMut = useMutation({
    mutationFn: async () =>
      proposeSoftwareDocsOutline(softwareId, { hint: hint.trim() || null }),
    onSuccess: (data) => {
      setRows(data.sections ?? [])
      setSelected(new Set())
    },
  })

  const acceptMut = useMutation({
    mutationFn: async (indices: number[]) => {
      const ordered = [...indices].sort((a, b) => a - b)
      for (const i of ordered) {
        const r = rows[i]
        if (!r) continue
        const body = (r.summary ?? '').trim()
        await createSoftwareDocsSection(softwareId, {
          title: r.title,
          slug: r.slug,
          content: body.length > 0 ? body : undefined,
        })
      }
    },
    onSuccess: () => {
      onSectionsCreated()
      onClose()
      setRows([])
      setHint('')
      setSelected(new Set())
    },
  })

  const toggle = useCallback((i: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
      } else {
        next.add(i)
      }
      return next
    })
  }, [])

  const handleClose = useCallback(() => {
    if (acceptMut.isPending || proposeMut.isPending) {
      return
    }
    onClose()
    setRows([])
    setHint('')
    setSelected(new Set())
  }, [acceptMut.isPending, onClose, proposeMut.isPending])

  const emptyAfterPropose = useMemo(
    () => proposeMut.isSuccess && rows.length === 0,
    [proposeMut.isSuccess, rows.length],
  )

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backprop-outline-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-6 shadow-xl">
        <h2 id="backprop-outline-title" className="text-[16px] font-semibold text-zinc-100">
          Draft outline from codebase
        </h2>
        <p className="mt-2 text-[13px] text-zinc-500">
          Optional hint for the model (e.g. API surface, CLI vs library).
        </p>
        <textarea
          className="mt-3 min-h-[72px] w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600"
          placeholder="Hint (optional)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          disabled={proposeMut.isPending || acceptMut.isPending}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            disabled={proposeMut.isPending || acceptMut.isPending}
            onClick={() => proposeMut.mutate()}
          >
            {proposeMut.isPending ? 'Proposing…' : 'Propose outline'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-600 px-3 py-2 text-[12px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            disabled={acceptMut.isPending || proposeMut.isPending}
            onClick={() => void handleClose()}
          >
            Cancel
          </button>
        </div>
        {proposeMut.isError ? (
          <p className="mt-3 text-[13px] text-red-400">
            {(proposeMut.error as { detail?: string })?.detail ?? 'Request failed.'}
          </p>
        ) : null}
        {emptyAfterPropose ? (
          <p className="mt-4 text-[13px] text-zinc-400">No draft produced.</p>
        ) : null}
        {rows.length > 0 ? (
          <div className="mt-6 space-y-3">
            <p className="text-[12px] font-medium uppercase tracking-wide text-zinc-500">
              Proposed sections
            </p>
            <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <li
                  key={`${row.slug}-${i}`}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
                >
                  <label className="flex cursor-pointer gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(i)}
                      onChange={() => toggle(i)}
                      disabled={acceptMut.isPending}
                    />
                    <span>
                      <span className="text-[14px] font-medium text-zinc-100">{row.title}</span>
                      <span className="mt-1 block font-mono text-[11px] text-zinc-500">
                        {row.slug}
                      </span>
                      <span className="mt-1 block text-[12px] text-zinc-400">{row.summary}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-[12px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              disabled={acceptMut.isPending || selected.size === 0}
              onClick={() => acceptMut.mutate([...selected])}
            >
              {acceptMut.isPending ? 'Creating…' : 'Accept selected'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
