import { describe, expect, it } from 'vitest'

import {
  buildAnnotations,
  type Annotation,
  type AnnotationBlockRef,
} from './useAnnotations'

describe('buildAnnotations', () => {
  it('maps open gap issues (section_b null) to first block', () => {
    const blocks: AnnotationBlockRef[] = [
      { id: 'b1', kind: 'h2', text: 'Intro' },
      { id: 'b2', kind: 'p', text: 'Body.' },
    ]
    const ann = buildAnnotations({
      sectionId: 'sec-a',
      blocks,
      issues: [
        {
          id: 'i1',
          project_id: 'p',
          triggered_by: null,
          section_a_id: 'sec-a',
          section_b_id: null,
          description: 'Missing API error codes',
          status: 'open',
          origin: 'auto',
          run_actor_id: null,
          created_at: '',
        },
      ],
      staleWorkOrders: [],
      pendingSuggestionLabel: null,
    })
    expect(ann.b1?.some((a) => a.kind === 'gap')).toBe(true)
    expect(ann.b2 ?? []).toHaveLength(0)
  })

  it('attaches drift labels for stale work orders linked to this section', () => {
    const blocks: AnnotationBlockRef[] = [{ id: 'z', kind: 'p', text: 'x' }]
    const ann = buildAnnotations({
      sectionId: 's1',
      blocks,
      issues: [],
      staleWorkOrders: [
        {
          id: 'wo1',
          title: 'Implement login',
          is_stale: true,
        },
      ],
      pendingSuggestionLabel: null,
    })
    expect(ann.z?.some((a) => a.kind === 'drift')).toBe(true)
    expect(
      ann.z?.find((a) => a.kind === 'drift')?.label,
    ).toContain('Implement login')
  })

  it('flags cite on claim-like paragraphs without links or footnotes', () => {
    const blocks: AnnotationBlockRef[] = [
      {
        id: 'c1',
        kind: 'p',
        text: 'The system must guarantee transactional consistency for all writes.',
      },
      {
        id: 'c2',
        kind: 'p',
        text: 'See [RFC 9110](https://example.com) for details.',
      },
    ]
    const ann = buildAnnotations({
      sectionId: 's1',
      blocks,
      issues: [],
      staleWorkOrders: [],
      pendingSuggestionLabel: null,
    })
    expect(ann.c1?.some((a) => a.kind === 'cite')).toBe(true)
    expect(ann.c2?.some((a) => a.kind === 'cite')).toBe(false)
  })

  it('adds suggest annotation when a pending improvement proposal exists', () => {
    const blocks: AnnotationBlockRef[] = [{ id: 'o', kind: 'p', text: 'Hi' }]
    const ann = buildAnnotations({
      sectionId: 's1',
      blocks,
      issues: [],
      staleWorkOrders: [],
      pendingSuggestionLabel: 'Append closing paragraph',
    })
    expect(ann.o?.some((a) => a.kind === 'suggest')).toBe(true)
  })

  it('returns empty record when there are no blocks', () => {
    const ann = buildAnnotations({
      sectionId: 's1',
      blocks: [],
      issues: [],
      staleWorkOrders: [],
      pendingSuggestionLabel: 'x',
    })
    expect(Object.keys(ann)).toHaveLength(0)
  })
})
