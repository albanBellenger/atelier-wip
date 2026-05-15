import { Schema } from '@milkdown/prose/model'
import { describe, expect, it } from 'vitest'

import type { IssueRow } from '../../services/api'

import {
  buildIssueGutterMarksForSection,
  collectHeadingStartPositions,
  headingPositionForIndex,
} from './issueGutterSpec'

const minimalSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'text*',
      toDOM: (): ['p', 0] => ['p', 0],
    },
    heading: {
      attrs: { level: { default: 1 } },
      group: 'block',
      content: 'text*',
      defining: true,
      toDOM: (node): [string, number] => [`h${String(node.attrs.level)}`, 0],
    },
    text: { name: 'text', inline: true, group: 'inline' },
  },
})

describe('buildIssueGutterMarksForSection', () => {
  const sid = 'sec-1'

  it('maps section gap with heading_index', () => {
    const issues: IssueRow[] = [
      {
        id: 'i1',
        project_id: 'p',
        software_id: null,
        work_order_id: null,
        kind: 'conflict_or_gap',
        triggered_by: null,
        section_a_id: sid,
        section_b_id: null,
        description: 'gap',
        status: 'open',
        origin: 'auto',
        run_actor_id: null,
        payload_json: { finding_type: 'section_gap', heading_index: 1 },
        resolution_reason: null,
        created_at: '',
      },
    ]
    expect(buildIssueGutterMarksForSection(issues, sid)).toEqual([
      { issueId: 'i1', variant: 'gap', headingIndex: 1 },
    ])
  })

  it('maps pair conflict for section A with heading_index_a', () => {
    const issues: IssueRow[] = [
      {
        id: 'i2',
        project_id: 'p',
        software_id: null,
        work_order_id: null,
        kind: 'conflict_or_gap',
        triggered_by: null,
        section_a_id: sid,
        section_b_id: 'sec-2',
        description: 'c',
        status: 'open',
        origin: 'auto',
        run_actor_id: null,
        payload_json: { heading_index_a: 0, heading_index_b: 2 },
        resolution_reason: null,
        created_at: '',
      },
    ]
    expect(buildIssueGutterMarksForSection(issues, sid)).toEqual([
      { issueId: 'i2', variant: 'conflict', headingIndex: 0 },
    ])
  })

  it('maps pair conflict for section B with heading_index_b', () => {
    const issues: IssueRow[] = [
      {
        id: 'i3',
        project_id: 'p',
        software_id: null,
        work_order_id: null,
        kind: 'conflict_or_gap',
        triggered_by: null,
        section_a_id: 'sec-0',
        section_b_id: sid,
        description: 'c',
        status: 'open',
        origin: 'auto',
        run_actor_id: null,
        payload_json: { heading_index_a: 1, heading_index_b: 3 },
        resolution_reason: null,
        created_at: '',
      },
    ]
    expect(buildIssueGutterMarksForSection(issues, sid)).toEqual([
      { issueId: 'i3', variant: 'conflict', headingIndex: 3 },
    ])
  })

  it('ignores non-open and non-conflict_or_gap issues', () => {
    const issues: IssueRow[] = [
      {
        id: 'x',
        project_id: 'p',
        software_id: null,
        work_order_id: null,
        kind: 'code_drift_section',
        triggered_by: null,
        section_a_id: sid,
        section_b_id: null,
        description: 'd',
        status: 'open',
        origin: 'auto',
        run_actor_id: null,
        payload_json: { heading_index: 0 },
        resolution_reason: null,
        created_at: '',
      },
      {
        id: 'y',
        project_id: 'p',
        software_id: null,
        work_order_id: null,
        kind: 'conflict_or_gap',
        triggered_by: null,
        section_a_id: sid,
        section_b_id: null,
        description: 'd',
        status: 'resolved',
        origin: 'auto',
        run_actor_id: null,
        payload_json: { heading_index: 0 },
        resolution_reason: null,
        created_at: '',
      },
    ]
    expect(buildIssueGutterMarksForSection(issues, sid)).toEqual([])
  })
})

describe('collectHeadingStartPositions', () => {
  it('returns ordered heading start positions', () => {
    const doc = minimalSchema.node('doc', undefined, [
      minimalSchema.node('heading', { level: 1 }, [
        minimalSchema.text('One'),
      ]),
      minimalSchema.node('paragraph', undefined, [
        minimalSchema.text('p'),
      ]),
      minimalSchema.node('heading', { level: 2 }, [
        minimalSchema.text('Two'),
      ]),
    ])
    expect(collectHeadingStartPositions(doc)).toEqual([0, 8])
  })
})

describe('headingPositionForIndex', () => {
  it('returns null for out-of-range or null index', () => {
    expect(headingPositionForIndex([0, 5], null)).toBeNull()
    expect(headingPositionForIndex([0, 5], -1)).toBeNull()
    expect(headingPositionForIndex([0, 5], 2)).toBeNull()
  })

  it('returns position at index', () => {
    expect(headingPositionForIndex([10, 20], 1)).toBe(20)
  })
})
