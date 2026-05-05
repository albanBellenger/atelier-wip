import type { OeBlock } from './types'

export function acceptSuggestion(blocks: OeBlock[], id: string): OeBlock[] {
  const idx = blocks.findIndex((b) => b.id === id && b.type === 'ai-suggest')
  if (idx === -1) return blocks
  const block = blocks[idx]
  if (block.type !== 'ai-suggest') return blocks
  const newPs: OeBlock[] = block.additions.map((line, i) => {
    let t = line.replace(/^\+\s*/, '')
    t = t.replace(/\*\*(.+?)\*\*/g, '$1')
    return { id: `${id}-p-${i}`, type: 'p' as const, text: t }
  })
  return [...blocks.slice(0, idx), ...newPs, ...blocks.slice(idx + 1)]
}

export function rejectSuggestion(blocks: OeBlock[], id: string): OeBlock[] {
  return blocks.filter((b) => !(b.id === id && b.type === 'ai-suggest'))
}
