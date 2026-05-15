import { Schema } from '@milkdown/prose/model'
import { describe, expect, it } from 'vitest'

import { buildIssueGutterDecorationSet } from './crepeIssueGutterPlugin'
import type { IssueGutterMark } from './issueGutterSpec'

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

describe('buildIssueGutterDecorationSet', () => {
  it('creates one widget decoration per resolved heading', () => {
    const doc = minimalSchema.node('doc', undefined, [
      minimalSchema.node('heading', { level: 1 }, [
        minimalSchema.text('One'),
      ]),
      minimalSchema.node('heading', { level: 2 }, [
        minimalSchema.text('Two'),
      ]),
    ])
    const marks: IssueGutterMark[] = [
      { issueId: 'a', variant: 'gap', headingIndex: 0 },
      { issueId: 'b', variant: 'conflict', headingIndex: 1 },
    ]
    const set = buildIssueGutterDecorationSet(doc, marks)
    expect(set.find().length).toBe(2)
  })

  it('skips marks with null or invalid heading index', () => {
    const doc = minimalSchema.node('doc', undefined, [
      minimalSchema.node('heading', { level: 1 }, [
        minimalSchema.text('One'),
      ]),
    ])
    const marks: IssueGutterMark[] = [
      { issueId: 'x', variant: 'gap', headingIndex: null },
      { issueId: 'y', variant: 'gap', headingIndex: 9 },
    ]
    const set = buildIssueGutterDecorationSet(doc, marks)
    expect(set.find().length).toBe(0)
  })
})
