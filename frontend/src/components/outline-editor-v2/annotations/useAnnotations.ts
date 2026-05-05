import { useMemo } from 'react'

import type { IssueRow, WorkOrder } from '../../../services/api'

export type AnnotationKind = 'gap' | 'drift' | 'cite' | 'suggest'

export interface Annotation {
  id: string
  kind: AnnotationKind
  label: string
  detail?: string
}

export type AnnotationMap = Record<string, Annotation[]>

export interface AnnotationBlockRef {
  id: string
  kind: 'h2' | 'h3' | 'p' | 'ul'
  text: string
}

export interface BuildAnnotationsInput {
  sectionId: string
  blocks: AnnotationBlockRef[]
  issues: IssueRow[]
  staleWorkOrders: Pick<WorkOrder, 'id' | 'title' | 'is_stale'>[]
  pendingSuggestionLabel: string | null
}

function emptyMap(blockIds: string[]): AnnotationMap {
  const m: AnnotationMap = {}
  for (const id of blockIds) {
    m[id] = []
  }
  return m
}

function firstBlockId(blocks: AnnotationBlockRef[]): string | undefined {
  return blocks[0]?.id
}

/** Heuristic: normative / claim-like prose without markdown links or footnotes. */
export function paragraphNeedsCitation(text: string): boolean {
  const t = text.trim()
  if (t.length < 36) {
    return false
  }
  if (/\[[^\]]+\]\([^)\s]+\)/.test(t)) {
    return false
  }
  if (/\[\^\w+\]/.test(t)) {
    return false
  }
  if (/https?:\/\//i.test(t)) {
    return false
  }
  return /\b(shall|must|always|never|guarantee|required to)\b/i.test(t)
}

export function buildAnnotations(input: BuildAnnotationsInput): AnnotationMap {
  const { sectionId, blocks, issues, staleWorkOrders, pendingSuggestionLabel } =
    input
  if (blocks.length === 0) {
    return {}
  }

  const ids = blocks.map((b) => b.id)
  const out = emptyMap(ids)
  const anchor = firstBlockId(blocks)
  if (!anchor) {
    return out
  }

  const openGaps = issues.filter(
    (i) =>
      i.status === 'open' &&
      i.section_b_id == null &&
      i.section_a_id === sectionId,
  )
  for (const g of openGaps) {
    out[anchor].push({
      id: `gap:${g.id}`,
      kind: 'gap',
      label: 'Gap',
      detail: g.description.slice(0, 200),
    })
  }

  for (const wo of staleWorkOrders) {
    if (!wo.is_stale) {
      continue
    }
    out[anchor].push({
      id: `drift:${wo.id}`,
      kind: 'drift',
      label: `Drift · ${wo.title}`,
      detail: wo.title,
    })
  }

  for (const b of blocks) {
    if (b.kind !== 'p') {
      continue
    }
    if (paragraphNeedsCitation(b.text)) {
      out[b.id].push({
        id: `cite:${b.id}`,
        kind: 'cite',
        label: 'Citation',
        detail: 'Claim may need explicit traceability',
      })
    }
  }

  if (pendingSuggestionLabel?.trim()) {
    out[anchor].push({
      id: 'suggest:pending',
      kind: 'suggest',
      label: 'Suggestion',
      detail: pendingSuggestionLabel.trim(),
    })
  }

  return out
}

export interface UseAnnotationsArgs {
  sectionId: string
  blocks: AnnotationBlockRef[]
  issues: IssueRow[] | undefined
  staleWorkOrders: Pick<WorkOrder, 'id' | 'title' | 'is_stale'>[] | undefined
  pendingSuggestionLabel: string | null
}

export function useAnnotations(args: UseAnnotationsArgs): AnnotationMap {
  const {
    sectionId,
    blocks,
    issues = [],
    staleWorkOrders = [],
    pendingSuggestionLabel,
  } = args

  return useMemo(
    () =>
      buildAnnotations({
        sectionId,
        blocks,
        issues,
        staleWorkOrders,
        pendingSuggestionLabel,
      }),
    [sectionId, blocks, issues, staleWorkOrders, pendingSuggestionLabel],
  )
}
