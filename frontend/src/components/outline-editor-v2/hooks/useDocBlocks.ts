import { useEffect, useMemo, useState } from 'react'
import type * as Y from 'yjs'

export type DocBlock =
  | { id: string; type: 'h2'; text: string }
  | { id: string; type: 'h3'; text: string }
  | { id: string; type: 'p'; text: string; renderedAsPlain?: boolean }
  | { id: string; type: 'ul'; items: string[] }
  | { id: string; type: 'table'; markdown: string }

type ParsedBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string; renderedAsPlain?: boolean }
  | { type: 'ul'; items: string[] }
  | { type: 'table'; markdown: string }

function hashBlockId(index: number, kind: string, textSample: string): string {
  const sample = textSample.slice(0, 24)
  const payload = `${index}:${kind}:${sample}`
  let h = 5381
  for (let i = 0; i < payload.length; i += 1) {
    h = (Math.imul(h, 33) ^ payload.charCodeAt(i)) >>> 0
  }
  return `b_${h.toString(16)}`
}

function textSampleForBlock(block: ParsedBlock): string {
  if (block.type === 'ul') {
    return block.items.join('\n')
  }
  if (block.type === 'table') {
    return block.markdown
  }
  return block.text
}

function withIds(blocks: ParsedBlock[]): DocBlock[] {
  return blocks.map((block, index) => {
    const kind = block.type
    const sample = textSampleForBlock(block)
    const id = hashBlockId(index, kind, sample)
    if (block.type === 'h2') {
      return { id, type: 'h2', text: block.text }
    }
    if (block.type === 'h3') {
      return { id, type: 'h3', text: block.text }
    }
    if (block.type === 'ul') {
      return { id, type: 'ul', items: block.items }
    }
    if (block.type === 'table') {
      return { id, type: 'table', markdown: block.markdown }
    }
    return {
      id,
      type: 'p',
      text: block.text,
      ...(block.renderedAsPlain ? { renderedAsPlain: true } : {}),
    }
  })
}

/** GitHub-flavoured markdown pipe table (header + separator row). */
function isGfmTable(text: string): boolean {
  const t = text.trim()
  if (t.length === 0) {
    return false
  }
  const lines = text.split(/\r?\n/)
  const pipeLines = lines.filter((l) => l.includes('|'))
  if (pipeLines.length < 2) {
    return false
  }
  return lines.some((l) => /^\s*\|[\s\-:|]+\|\s*$/.test(l))
}

function isUnsupportedParagraph(text: string): boolean {
  const t = text.trim()
  if (t.length === 0) {
    return false
  }
  if (t.includes('```')) {
    return true
  }
  if (/^\s*!\[[^\]]*\]\([^)]+\)/m.test(text)) {
    return true
  }
  return false
}

function parseMarkdownBlocks(markdown: string): ParsedBlock[] {
  const raw = markdown.replace(/\r\n/g, '\n')
  if (raw.trim().length === 0) {
    return []
  }

  const lines = raw.split('\n')
  const blocks: ParsedBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().length === 0) {
      i += 1
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() })
      i += 1
      continue
    }

    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() })
      i += 1
      continue
    }

    if (/^-\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^-\s/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s/, '').trim())
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    const paraLines: string[] = []
    while (i < lines.length) {
      const L = lines[i]
      if (L.trim().length === 0) {
        break
      }
      if (L.startsWith('### ') || L.startsWith('## ')) {
        break
      }
      if (/^-\s/.test(L)) {
        break
      }
      paraLines.push(L)
      i += 1
    }
    const text = paraLines.join('\n')
    if (isGfmTable(text)) {
      blocks.push({ type: 'table', markdown: text })
    } else {
      const plain = isUnsupportedParagraph(text)
      blocks.push({
        type: 'p',
        text,
        ...(plain ? { renderedAsPlain: true } : {}),
      })
    }
  }

  return blocks
}

export function useDocBlocks(ytext: Y.Text | null): { blocks: DocBlock[] } {
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    if (ytext == null) {
      return
    }
    const onChange = (): void => {
      setEpoch((n) => n + 1)
    }
    ytext.observe(onChange)
    return () => {
      ytext.unobserve(onChange)
    }
  }, [ytext])

  const blocks = useMemo(() => {
    if (ytext == null) {
      return []
    }
    const md = ytext.toString()
    return withIds(parseMarkdownBlocks(md))
  }, [ytext, epoch])

  return { blocks }
}
