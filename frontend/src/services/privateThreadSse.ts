/** SSE parsing for private thread POST (JSON lines: token | meta, then [DONE]). */

export interface PrivateThreadStreamMeta {
  findings: { finding_type: string; description: string }[]
  conflicts: { description: string }[]
  context_truncated?: boolean
  patch_proposal?: Record<string, unknown> | null
}

export async function consumePrivateThreadSseBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: {
    onToken: (text: string) => void
    onMeta: (meta: PrivateThreadStreamMeta) => void
  },
): Promise<void> {
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const block of parts) {
      for (const line of block.split('\n')) {
        if (!line.startsWith('data: ')) {
          continue
        }
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') {
          continue
        }
        try {
          const j = JSON.parse(payload) as {
            type?: string
            text?: string
            findings?: { finding_type: string; description: string }[]
            conflicts?: { description: string }[]
            context_truncated?: boolean
            patch_proposal?: Record<string, unknown> | null
          }
          if (j.type === 'token' && j.text) {
            handlers.onToken(j.text)
          }
          if (j.type === 'meta') {
            handlers.onMeta({
              findings: Array.isArray(j.findings) ? j.findings : [],
              conflicts: Array.isArray(j.conflicts) ? j.conflicts : [],
              context_truncated: Boolean(j.context_truncated),
              patch_proposal:
                j.patch_proposal === undefined
                  ? undefined
                  : (j.patch_proposal as Record<string, unknown> | null),
            })
          }
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  }
}
