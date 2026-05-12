import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { simpleLineDiff } from '../../lib/simpleLineDiff'
import { getSoftwareDocsSection, type IssueRow } from '../../services/api'

const DOC_SYNC_STORAGE_PREFIX = 'atelier_doc_sync:'

export interface IssuesPanelProps {
  studioId: string
  softwareId: string
  projectId: string
  issues: IssueRow[]
  canRunAnalysis: boolean
  canRunCodeDrift: boolean
  canManageIssues: boolean
  codeDriftDisabledReason: string | null
  analyzePending: boolean
  codeDriftPending: boolean
  resolvePending: boolean
  onRunAnalysis: () => void
  onRunCodeDrift: () => void
  onResolve: (issueId: string, opts?: { resolution_reason?: string }) => void
}

function woShortId(workOrderId: string | null | undefined): string {
  if (!workOrderId) return '????????'
  return workOrderId.replace(/-/g, '').slice(0, 8)
}

function issueKindIcon(kind: string | undefined): string {
  if (kind === 'code_drift_section') return '◇'
  if (kind === 'code_drift_work_order') return '◈'
  if (kind === 'doc_update_suggested') return '📄'
  return '⚠'
}

function issueKindLabel(kind: string | undefined, issue: IssueRow | null): string {
  if (kind === 'code_drift_section') return 'Code drift · section'
  if (kind === 'code_drift_work_order') return 'Code drift · work order'
  if (kind === 'doc_update_suggested')
    return `Suggested doc update for WO-${woShortId(issue?.work_order_id)}`
  return 'Conflict / gap'
}

function issueCardSummary(issue: IssueRow): string {
  if (issue.kind === 'doc_update_suggested' && issue.work_order_id) {
    return `Suggested doc update for WO-${woShortId(issue.work_order_id)}`
  }
  return issue.description
}

function navLinks(
  issue: IssueRow,
  studioId: string,
  softwareId: string,
  projectId: string,
): { label: string; to: string }[] {
  const links: { label: string; to: string }[] = []
  if (issue.kind === 'code_drift_section' && issue.section_a_id) {
    const isSoftwareDoc = !issue.project_id
    if (isSoftwareDoc) {
      links.push({
        label: 'Open Software Doc section',
        to: `/studios/${studioId}/software/${softwareId}/docs/${issue.section_a_id}`,
      })
    } else {
      links.push({
        label: 'Open project section',
        to: `/studios/${studioId}/software/${softwareId}/projects/${projectId}/sections/${issue.section_a_id}`,
      })
    }
  }
  if (issue.kind === 'doc_update_suggested' && issue.section_a_id) {
    links.push({
      label: 'Open Software Doc section',
      to: `/studios/${studioId}/software/${softwareId}/docs/${issue.section_a_id}`,
    })
  }
  if (issue.kind === 'code_drift_work_order' && issue.work_order_id) {
    links.push({
      label: 'Open work order',
      to: `/studios/${studioId}/software/${softwareId}/projects/${projectId}/work-orders?wo=${issue.work_order_id}`,
    })
  }
  if (issue.kind === 'conflict_or_gap' && issue.section_a_id) {
    links.push({
      label: 'Open primary section',
      to: `/studios/${studioId}/software/${softwareId}/projects/${projectId}/sections/${issue.section_a_id}`,
    })
  }
  return links
}

function formatCodeRefs(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== 'object') return ''
  const raw = payload.code_refs
  if (!Array.isArray(raw)) return ''
  const lines: string[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const path = String((item as { path?: unknown }).path ?? '')
    const sl = (item as { start_line?: unknown }).start_line
    const el = (item as { end_line?: unknown }).end_line
    if (!path) continue
    lines.push(`${path}:${String(sl)}-${String(el)}`)
  }
  return lines.join('\n')
}

function replacementMarkdown(issue: IssueRow): string {
  const p = issue.payload_json
  if (!p || typeof p !== 'object') return ''
  const raw = (p as { replacement_markdown?: unknown }).replacement_markdown
  return typeof raw === 'string' ? raw : ''
}

export function IssuesPanel(props: IssuesPanelProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const navigate = useNavigate()

  const selected = useMemo(
    () => props.issues.find((i) => i.id === selectedId) ?? null,
    [props.issues, selectedId],
  )

  const sectionProbeId =
    selected?.kind === 'doc_update_suggested' ? selected.section_a_id : null
  const docSecQ = useQuery({
    queryKey: ['softwareDocSection', props.softwareId, sectionProbeId],
    queryFn: () => getSoftwareDocsSection(props.softwareId, sectionProbeId!),
    enabled: Boolean(
      props.softwareId && sectionProbeId && selected?.kind === 'doc_update_suggested',
    ),
  })

  const docDiffLines = useMemo(() => {
    if (selected?.kind !== 'doc_update_suggested') return []
    const before = docSecQ.data?.content ?? ''
    const after = replacementMarkdown(selected)
    return simpleLineDiff(before, after)
  }, [selected, docSecQ.data?.content])

  const applyDocSyncDraft = (issue: IssueRow): void => {
    if (!issue.section_a_id) return
    const repl = replacementMarkdown(issue)
    try {
      sessionStorage.setItem(
        `${DOC_SYNC_STORAGE_PREFIX}${issue.id}`,
        JSON.stringify({
          projectId: props.projectId,
          issueId: issue.id,
          replacementMarkdown: repl,
          softwareId: props.softwareId,
          sectionId: issue.section_a_id,
        }),
      )
    } catch {
      /* ignore quota */
    }
    void navigate(
      `/studios/${props.studioId}/software/${props.softwareId}/docs/${issue.section_a_id}?docSyncIssue=${issue.id}`,
    )
  }

  const showCodeRefs =
    selected &&
    (selected.kind === 'code_drift_section' || selected.kind === 'code_drift_work_order')

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {props.canRunAnalysis ? (
            <button
              type="button"
              disabled={props.analyzePending}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
              onClick={() => props.onRunAnalysis()}
            >
              Run analysis
            </button>
          ) : null}
          {props.canRunCodeDrift ? (
            <button
              type="button"
              disabled={props.codeDriftPending || props.codeDriftDisabledReason !== null}
              title={
                props.codeDriftDisabledReason ??
                'Run code drift detection against the indexed repository'
              }
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
              onClick={() => props.onRunCodeDrift()}
            >
              Run code drift analysis
            </button>
          ) : null}
        </div>
        <ul className="space-y-3">
          {props.issues.map((issue) => {
            const active = issue.id === selectedId
            return (
              <li key={issue.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(issue.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-violet-500/80 bg-violet-950/30'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    <span className="mr-1.5 text-zinc-400" aria-hidden>
                      {issueKindIcon(issue.kind)}
                    </span>
                    {issueKindLabel(issue.kind, issue)}
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm text-zinc-200">
                    {issueCardSummary(issue)}
                  </p>
                  {issue.kind === 'doc_update_suggested' ? (
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{issue.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500">
                    {issue.status} · {issue.origin}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
        {props.issues.length === 0 ? (
          <p className="text-sm text-zinc-500">No issues yet.</p>
        ) : null}
      </div>

      <aside className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:sticky lg:top-4 lg:self-start">
        {!selected ? (
          <p className="text-sm text-zinc-500">Select an issue for details.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Kind</p>
              <p className="text-sm text-zinc-200">
                <span className="mr-1.5 text-zinc-400" aria-hidden>
                  {issueKindIcon(selected.kind)}
                </span>
                {issueKindLabel(selected.kind, selected)}
              </p>
            </div>
            {(selected.kind === 'code_drift_section' ||
              selected.kind === 'code_drift_work_order') &&
            selected.payload_json &&
            typeof selected.payload_json === 'object' ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Severity / verdict</p>
                <p className="text-sm text-zinc-200">
                  {String(
                    (selected.payload_json as { severity?: unknown }).severity ??
                      (selected.payload_json as { verdict?: unknown }).verdict ??
                      '—',
                  )}
                </p>
              </div>
            ) : null}
            {selected.kind === 'doc_update_suggested' ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Diff preview</p>
                {docSecQ.isPending ? (
                  <p className="mt-1 text-xs text-zinc-500">Loading section text…</p>
                ) : docSecQ.isError ? (
                  <p className="mt-1 text-xs text-rose-400">Could not load section for diff.</p>
                ) : (
                  <pre
                    className="mt-1 max-h-56 overflow-auto rounded bg-zinc-950/80 p-2 font-mono text-[11px] leading-relaxed text-zinc-300"
                    data-testid="doc-sync-diff"
                  >
                    {docDiffLines.map((ln, idx) => (
                      <div
                        key={`${ln.tag}-${idx}`}
                        className={
                          ln.tag === '+'
                            ? 'bg-emerald-950/40 text-emerald-200'
                            : ln.tag === '-'
                              ? 'bg-rose-950/30 text-rose-200'
                              : 'text-zinc-400'
                        }
                      >
                        <span className="inline-block w-3 select-none">{ln.tag}</span>
                        {ln.text}
                      </div>
                    ))}
                  </pre>
                )}
              </div>
            ) : null}
            {showCodeRefs ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Code references</p>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-950/80 p-2 text-xs text-zinc-300">
                  {formatCodeRefs(selected.payload_json as Record<string, unknown>) || '—'}
                </pre>
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Reason</p>
              <p className="mt-1 text-sm text-zinc-200 whitespace-pre-wrap">
                {selected.description}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {navLinks(selected, props.studioId, props.softwareId, props.projectId).map(
                (l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="text-sm text-violet-400 hover:underline"
                  >
                    {l.label}
                  </Link>
                ),
              )}
            </div>
            {selected.status === 'open' &&
            selected.kind === 'doc_update_suggested' &&
            props.canManageIssues ? (
              <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                  onClick={() => applyDocSyncDraft(selected)}
                  disabled={props.resolvePending || !selected.section_a_id}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  onClick={() => applyDocSyncDraft(selected)}
                  disabled={props.resolvePending || !selected.section_a_id}
                >
                  Apply with edits
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
                  onClick={() =>
                    props.onResolve(selected.id, { resolution_reason: 'dismissed' })
                  }
                  disabled={props.resolvePending}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {selected.status === 'open' &&
            selected.kind !== 'doc_update_suggested' &&
            props.canManageIssues ? (
              <button
                type="button"
                className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                onClick={() => props.onResolve(selected.id)}
                disabled={props.resolvePending}
              >
                Mark resolved
              </button>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  )
}
