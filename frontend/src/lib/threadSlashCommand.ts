/** Maps leading slash commands to backend `command` + user message text (Slice D). */

export type ThreadStreamCommand = 'none' | 'improve' | 'critique'

export function parseThreadSlashInput(raw: string): {
  command: ThreadStreamCommand
  content: string
} {
  const t = raw.trim()
  if (t.startsWith('/improve')) {
    const rest = t.replace(/^\/improve\s*/, '').trim()
    return {
      command: 'improve',
      content: rest.length > 0 ? rest : 'Improve this section for clarity.',
    }
  }
  if (t.startsWith('/critique')) {
    const rest = t.replace(/^\/critique\s*/, '').trim()
    return {
      command: 'critique',
      content: rest.length > 0 ? rest : 'Critique this section for gaps and risks.',
    }
  }
  return { command: 'none', content: t }
}
