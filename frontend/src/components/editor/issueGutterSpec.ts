import type { Node as ProseNode } from '@milkdown/prose/model'

import type { IssueRow } from '../../services/api'

export type IssueGutterVariant = 'gap' | 'conflict'

/** One gutter widget target for the current section editor. */
export interface IssueGutterMark {
  issueId: string
  variant: IssueGutterVariant
  headingIndex: number | null
}

function readPayloadInt(
  payload: Record<string, unknown> | null,
  key: string,
): number | null {
  if (payload == null) {
    return null
  }
  const v = payload[key]
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
    return v
  }
  return null
}

/**
 * Maps open project issues to gutter marks for the outline Crepe editor.
 * Only `kind === 'conflict_or_gap'` rows use heading anchors from analyze.
 */
export function buildIssueGutterMarksForSection(
  issues: readonly IssueRow[],
  sectionId: string,
): IssueGutterMark[] {
  const out: IssueGutterMark[] = []
  for (const row of issues) {
    if (row.status !== 'open' || row.kind !== 'conflict_or_gap') {
      continue
    }
    const a = row.section_a_id
    const b = row.section_b_id
    const payload = row.payload_json

    if (b == null && a === sectionId) {
      const headingIndex = readPayloadInt(payload, 'heading_index')
      out.push({ issueId: row.id, variant: 'gap', headingIndex })
      continue
    }
    if (b != null && (a === sectionId || b === sectionId)) {
      const key = a === sectionId ? 'heading_index_a' : 'heading_index_b'
      const headingIndex = readPayloadInt(payload, key)
      out.push({ issueId: row.id, variant: 'conflict', headingIndex })
    }
  }
  return out
}

/** Start positions of each `heading` block in document order (0-based index matches backend). */
export function collectHeadingStartPositions(doc: ProseNode): number[] {
  const positions: number[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      positions.push(pos)
    }
    return true
  })
  return positions
}

export function headingPositionForIndex(
  headingStarts: readonly number[],
  headingIndex: number | null,
): number | null {
  if (headingIndex == null) {
    return null
  }
  if (headingIndex < 0 || headingIndex >= headingStarts.length) {
    return null
  }
  return headingStarts[headingIndex] ?? null
}
