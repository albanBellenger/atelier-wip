import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useState } from 'react'

import {
  getCitationHealth,
  getSectionContextPreferences,
  listArtifacts,
  listSections,
  listWorkOrders,
  patchSectionContextPreferences,
} from '../../services/api'

export function SourcesTab(props: {
  projectId: string
  sectionId: string
  canEditContext?: boolean
}): ReactElement {
  const { projectId, sectionId, canEditContext = false } = props
  const qc = useQueryClient()
  const [urlDraft, setUrlDraft] = useState('')
  const [urlNoteDraft, setUrlNoteDraft] = useState('')

  const citeQ = useQuery({
    queryKey: ['citationHealth', projectId, sectionId],
    queryFn: () => getCitationHealth(projectId, sectionId),
    enabled: Boolean(projectId && sectionId),
  })
  const artQ = useQuery({
    queryKey: ['artifacts', projectId],
    queryFn: () => listArtifacts(projectId),
    enabled: Boolean(projectId),
  })
  const woQ = useQuery({
    queryKey: ['workOrders', projectId],
    queryFn: () => listWorkOrders(projectId),
    enabled: Boolean(projectId),
  })
  const sectionsQ = useQuery({
    queryKey: ['sections', projectId],
    queryFn: () => listSections(projectId),
    enabled: Boolean(projectId),
  })

  const prefsQ = useQuery({
    queryKey: ['sectionContextPreferences', projectId, sectionId],
    queryFn: () => getSectionContextPreferences(projectId, sectionId),
    enabled: Boolean(projectId && sectionId),
  })

  const patchPrefsMut = useMutation({
    mutationFn: (body: Parameters<typeof patchSectionContextPreferences>[2]) =>
      patchSectionContextPreferences(projectId, sectionId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ['sectionContextPreferences', projectId, sectionId],
      })
      await qc.invalidateQueries({
        queryKey: ['contextPreview', projectId, sectionId],
      })
    },
  })

  const projectArtifacts = (artQ.data ?? []).filter(
    (a) => a.project_id === projectId,
  )

  const pinnedArtifacts = new Set(prefsQ.data?.pinned_artifact_ids ?? [])
  const pinnedWos = new Set(prefsQ.data?.pinned_work_order_ids ?? [])
  const pinnedSections = new Set(prefsQ.data?.pinned_section_ids ?? [])

  const togglePin = (
    key: 'pinned_artifact_ids' | 'pinned_work_order_ids' | 'pinned_section_ids',
    id: string,
  ): void => {
    if (!prefsQ.data || !canEditContext) {
      return
    }
    const cur = [...(prefsQ.data[key] ?? [])]
    const idx = cur.indexOf(id)
    if (idx >= 0) {
      cur.splice(idx, 1)
    } else {
      cur.push(id)
    }
    patchPrefsMut.mutate({ [key]: cur })
  }

  const extraUrls = prefsQ.data?.extra_urls ?? []

  const addExtraUrl = (): void => {
    if (!prefsQ.data || !canEditContext) {
      return
    }
    const url = urlDraft.trim()
    if (url.length === 0) {
      return
    }
    const next = [
      ...extraUrls.map((u) => ({ url: u.url, note: u.note ?? '' })),
      { url, note: urlNoteDraft.trim() },
    ]
    setUrlDraft('')
    setUrlNoteDraft('')
    patchPrefsMut.mutate({ extra_urls: next })
  }

  const removeExtraUrlAt = (index: number): void => {
    if (!prefsQ.data || !canEditContext) {
      return
    }
    const next = extraUrls
      .map((u) => ({ url: u.url, note: u.note ?? '' }))
      .filter((_, i) => i !== index)
    patchPrefsMut.mutate({ extra_urls: next })
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 text-sm"
      data-testid="sources-tab"
    >
      <div>
        <div className="text-xs font-medium text-zinc-300">Citation health</div>
        {citeQ.isPending ? (
          <p className="mt-1 text-xs text-zinc-500">Loading…</p>
        ) : citeQ.isError ? (
          <p className="mt-1 text-xs text-red-400">Could not load citations.</p>
        ) : citeQ.data ? (
          <ul className="mt-2 space-y-2">
            {citeQ.data.missing_items.map((m, i) => (
              <li
                key={i}
                className="rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200"
              >
                {m.statement}
              </li>
            ))}
            {citeQ.data.missing_items.length === 0 ? (
              <li className="text-xs text-zinc-500">
                No missing citations flagged.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <div>
        <div className="text-xs font-medium text-zinc-300">Artifacts</div>
        {artQ.isPending ? (
          <p className="mt-1 text-xs text-zinc-500">Loading…</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {projectArtifacts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5 text-[12px]"
              >
                <span className="truncate font-mono text-zinc-200">
                  {a.name}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] uppercase text-zinc-500">
                    {a.file_type}
                  </span>
                  {canEditContext ? (
                    <button
                      type="button"
                      disabled={patchPrefsMut.isPending}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        pinnedArtifacts.has(a.id)
                          ? 'bg-violet-900/50 text-violet-200'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                      onClick={() => togglePin('pinned_artifact_ids', a.id)}
                    >
                      {pinnedArtifacts.has(a.id) ? 'Pinned' : 'Pin'}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-xs font-medium text-zinc-300">Work orders</div>
        {woQ.isPending ? (
          <p className="mt-1 text-xs text-zinc-500">Loading…</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {(woQ.data ?? []).map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5 text-[12px]"
              >
                <span className="truncate font-mono text-zinc-200">
                  {w.title}
                </span>
                {canEditContext ? (
                  <button
                    type="button"
                    disabled={patchPrefsMut.isPending}
                    className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${
                      pinnedWos.has(w.id)
                        ? 'bg-violet-900/50 text-violet-200'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                    onClick={() => togglePin('pinned_work_order_ids', w.id)}
                  >
                    {pinnedWos.has(w.id) ? 'Pinned' : 'Pin'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-xs font-medium text-zinc-300">Sections</div>
        {sectionsQ.isPending ? (
          <p className="mt-1 text-xs text-zinc-500">Loading…</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {(sectionsQ.data ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5 text-[12px]"
              >
                <span className="truncate text-zinc-200">{s.title}</span>
                {canEditContext ? (
                  <button
                    type="button"
                    disabled={patchPrefsMut.isPending || s.id === sectionId}
                    title={
                      s.id === sectionId
                        ? 'Current section'
                        : pinnedSections.has(s.id)
                          ? 'Unpin'
                          : 'Pin to context'
                    }
                    className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${
                      pinnedSections.has(s.id)
                        ? 'bg-violet-900/50 text-violet-200'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                    onClick={() => togglePin('pinned_section_ids', s.id)}
                  >
                    {s.id === sectionId
                      ? 'Here'
                      : pinnedSections.has(s.id)
                        ? 'Pinned'
                        : 'Pin'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-xs font-medium text-zinc-300">Pinned URLs</div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Stored as structured notes until URL fetch is wired. Included in your
          context preferences for this section.
        </p>
        {canEditContext ? (
          <div
            className="mt-2 flex flex-col gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 p-2"
            data-testid="sources-extra-url-form"
          >
            <label className="block text-[11px] text-zinc-500">
              URL
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[12px] text-zinc-100"
              />
            </label>
            <label className="block text-[11px] text-zinc-500">
              Note (optional)
              <input
                type="text"
                value={urlNoteDraft}
                onChange={(e) => setUrlNoteDraft(e.target.value)}
                placeholder="Why this link matters…"
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[12px] text-zinc-100"
              />
            </label>
            <button
              type="button"
              disabled={patchPrefsMut.isPending || urlDraft.trim().length === 0}
              onClick={() => addExtraUrl()}
              className="self-start rounded-md bg-violet-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to context
            </button>
          </div>
        ) : null}
        {extraUrls.length > 0 ? (
          <ul className="mt-2 space-y-1" data-testid="sources-extra-url-list">
            {extraUrls.map((u, i) => (
              <li
                key={`${u.url}-${i}`}
                className="flex items-start justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5 text-[12px]"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-zinc-200" title={u.url}>
                    {u.url}
                  </div>
                  {u.note != null && u.note !== '' ? (
                    <div className="mt-0.5 text-[11px] text-zinc-500">{u.note}</div>
                  ) : null}
                </div>
                {canEditContext ? (
                  <button
                    type="button"
                    disabled={patchPrefsMut.isPending}
                    className="shrink-0 rounded px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    onClick={() => removeExtraUrlAt(i)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !canEditContext ? (
          <p className="mt-2 text-xs text-zinc-600">No pinned URLs.</p>
        ) : (
          <p className="mt-2 text-xs text-zinc-600">No pinned URLs yet.</p>
        )}
      </div>
    </div>
  )
}
