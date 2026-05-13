import { act, renderHook } from '@testing-library/react'
import * as Y from 'yjs'
import { afterEach, describe, expect, it } from 'vitest'

import { YDOC_TEXT_FIELD } from '../../../services/ws'
import { useDocBlocks, docBlocksFromMarkdown, type DocBlock } from './useDocBlocks'

function makeYtext(initial: string): Y.Text {
  const doc = new Y.Doc()
  const ytext = doc.getText(YDOC_TEXT_FIELD)
  if (initial.length > 0) {
    ytext.insert(0, initial)
  }
  return ytext
}

describe('useDocBlocks', () => {
  afterEach(() => {
    // Y.Doc cleanup happens when ytext goes out of scope; no shared global state
  })

  it('parses h2, h3, paragraph, and bullet list from markdown', () => {
    const md = `## Section title

### Subheading

Intro paragraph.

- first item
- second item

Closing line.
`
    const ytext = makeYtext(md)
    const { result } = renderHook(() => useDocBlocks(ytext))

    const blocks = result.current.blocks as DocBlock[]
    expect(blocks.map((b) => b.type)).toEqual([
      'h2',
      'h3',
      'p',
      'ul',
      'p',
    ])
    expect(blocks[0]).toMatchObject({ type: 'h2', text: 'Section title' })
    expect(blocks[1]).toMatchObject({ type: 'h3', text: 'Subheading' })
    expect(blocks[2]).toMatchObject({
      type: 'p',
      text: 'Intro paragraph.',
    })
    expect(blocks[3]).toMatchObject({
      type: 'ul',
      items: ['first item', 'second item'],
    })
    expect(blocks[4]).toMatchObject({ type: 'p', text: 'Closing line.' })
  })

  it('keeps stable block ids across re-renders when markdown is unchanged', () => {
    const md = '## Hello\n\nBody.\n'
    const ytext = makeYtext(md)
    const { result, rerender } = renderHook(() => useDocBlocks(ytext))
    const firstIds = result.current.blocks.map((b) => b.id)

    rerender()
    const secondIds = result.current.blocks.map((b) => b.id)
    expect(secondIds).toEqual(firstIds)
  })

  it('keeps ids stable for unchanged leading blocks when a later paragraph edits', () => {
    const ytext = makeYtext('## H\n\nFirst.\n\nLast.')
    const { result, rerender } = renderHook(() => useDocBlocks(ytext))

    const before = result.current.blocks.map((b) => ({ id: b.id, type: b.type }))
    expect(before).toHaveLength(3)

    act(() => {
      const full = ytext.toString()
      const idx = full.indexOf('Last.')
      ytext.delete(idx, 'Last.'.length)
      ytext.insert(idx, 'Last edited.')
    })
    rerender()

    const after = result.current.blocks
    expect(after).toHaveLength(3)
    expect(after[0].id).toBe(before[0].id)
    expect(after[1].id).toBe(before[1].id)
    expect(after[2].type).toBe('p')
    expect(after[2].id).not.toBe(before[2].id)
  })

  it('emits a table block for GFM pipe tables', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n'
    const ytext = makeYtext(md)
    const { result } = renderHook(() => useDocBlocks(ytext))

    const blocks = result.current.blocks
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('table')
    if (blocks[0].type === 'table') {
      expect(blocks[0].markdown).toContain('| a | b |')
      expect(blocks[0].markdown).toContain('| 1 | 2 |')
    }
  })

  it('returns empty blocks when ytext is null', () => {
    const { result } = renderHook(() => useDocBlocks(null))
    expect(result.current.blocks).toEqual([])
  })

  it('updates blocks when ytext content changes', () => {
    const ytext = makeYtext('## One')
    const { result, rerender } = renderHook(() => useDocBlocks(ytext))

    expect(result.current.blocks).toHaveLength(1)
    expect(result.current.blocks[0]).toMatchObject({ type: 'h2', text: 'One' })

    act(() => {
      ytext.insert(ytext.length, '\n\nNew paragraph.')
    })
    rerender()

    expect(result.current.blocks.length).toBeGreaterThanOrEqual(2)
    const last = result.current.blocks[result.current.blocks.length - 1]
    expect(last.type).toBe('p')
    if (last.type === 'p') {
      expect(last.text).toContain('New paragraph')
    }
  })
})

describe('docBlocksFromMarkdown', () => {
  it('matches useDocBlocks parsing for a string', () => {
    const md = '## Title\n\nBody.\n'
    const ytext = makeYtext(md)
    const { result } = renderHook(() => useDocBlocks(ytext))
    const fromHook = result.current.blocks as DocBlock[]
    const fromFn = docBlocksFromMarkdown(md)
    expect(fromFn.map((b) => ({ type: b.type, id: b.id }))).toEqual(
      fromHook.map((b) => ({ type: b.type, id: b.id })),
    )
  })
})
