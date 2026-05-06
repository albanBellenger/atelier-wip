/** SSE parsing for private thread POST (JSON lines: token | meta, then [DONE]). */

export interface PrivateThreadStreamMeta {
  findings?: { finding_type: string; description: string }[]
  conflicts?: { description: string }[]
  context_truncated?: boolean
  patch_proposal?: Record<string, unknown> | null
  history_trimmed?: boolean
  trim_notice?: string
  trim_notice_message_id?: string
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
            history_trimmed?: boolean
            trim_notice?: string
            trim_notice_message_id?: string
          }
          if (j.type === 'token' && j.text) {
            handlers.onToken(j.text)
          }
          if (j.type === 'meta') {
            const meta: PrivateThreadStreamMeta = {}
            if (Object.prototype.hasOwnProperty.call(j, 'findings')) {
              meta.findings = Array.isArray(j.findings) ? j.findings : []
            }
            if (Object.prototype.hasOwnProperty.call(j, 'conflicts')) {
              meta.conflicts = Array.isArray(j.conflicts) ? j.conflicts : []
            }
            if (typeof j.context_truncated === 'boolean') {
              meta.context_truncated = j.context_truncated
            }
            if (Object.prototype.hasOwnProperty.call(j, 'patch_proposal')) {
              meta.patch_proposal = j.patch_proposal as Record<
                string,
                unknown
              > | null
            }
            if (j.history_trimmed === true) {
              meta.history_trimmed = true
            }
            if (typeof j.trim_notice === 'string') {
              meta.trim_notice = j.trim_notice
            }
            if (typeof j.trim_notice_message_id === 'string') {
              meta.trim_notice_message_id = j.trim_notice_message_id
            }
            handlers.onMeta(meta)
          }
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  }
}
