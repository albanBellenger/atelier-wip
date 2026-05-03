/** Maps leading slash commands to stream payload (Slice D) or structured improve API. */

export type ThreadStreamCommand = 'none' | 'improve' | 'critique'

export type ThreadIntent = 'ask' | 'append' | 'replace_selection' | 'edit'

export type ParsedComposerInput =
  | { kind: 'improve_section'; instruction: string | null }
  | {
      kind: 'stream'
      command: ThreadStreamCommand
      threadIntent: ThreadIntent
      content: string
    }

export function parseThreadComposerInput(raw: string): ParsedComposerInput {
  const t = raw.trim()
  if (t.startsWith('/improve')) {
    const rest = t.replace(/^\/improve\s*/, '').trim()
    return {
      kind: 'improve_section',
      instruction: rest.length > 0 ? rest : null,
    }
  }
  if (t.startsWith('/critique')) {
    const rest = t.replace(/^\/critique\s*/, '').trim()
    return {
      kind: 'stream',
      command: 'critique',
      threadIntent: 'ask',
      content:
        rest.length > 0
          ? rest
          : 'Critique this section for gaps and risks.',
    }
  }
  if (t.startsWith('/append')) {
    const rest = t.replace(/^\/append\s*/, '').trim()
    return {
      kind: 'stream',
      command: 'none',
      threadIntent: 'append',
      content:
        rest.length > 0
          ? rest
          : 'Append helpful content to the end of this section.',
    }
  }
  if (t.startsWith('/replace')) {
    const rest = t.replace(/^\/replace\s*/, '').trim()
    return {
      kind: 'stream',
      command: 'none',
      threadIntent: 'replace_selection',
      content:
        rest.length > 0 ? rest : 'Replace the selection as described.',
    }
  }
  if (t.startsWith('/edit')) {
    const rest = t.replace(/^\/edit\s*/, '').trim()
    return {
      kind: 'stream',
      command: 'none',
      threadIntent: 'edit',
      content:
        rest.length > 0
          ? rest
          : 'Edit the section using a unique snippet replacement.',
    }
  }
  if (t.startsWith('/ask')) {
    const rest = t.replace(/^\/ask\s*/, '').trim()
    return {
      kind: 'stream',
      command: 'none',
      threadIntent: 'ask',
      content: rest,
    }
  }
  return {
    kind: 'stream',
    command: 'none',
    threadIntent: 'ask',
    content: t,
  }
}

/** Legacy shape for callers that only need stream `command` + visible text. */
export function parseThreadSlashInput(raw: string): {
  command: ThreadStreamCommand
  content: string
} {
  const p = parseThreadComposerInput(raw)
  if (p.kind === 'improve_section') {
    const c =
      p.instruction && p.instruction.length > 0
        ? p.instruction
        : 'Improve this section for clarity.'
    return { command: 'improve', content: c }
  }
  if (p.kind === 'stream') {
    return { command: p.command, content: p.content }
  }
  return { command: 'none', content: raw.trim() }
}
