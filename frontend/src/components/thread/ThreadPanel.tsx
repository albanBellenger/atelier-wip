import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  getPrivateThread,
  streamPrivateThreadReply,
  type PrivateThreadMessage,
} from '../../services/api'
import { ContextTruncationBanner } from './ContextTruncationBanner'

export function ThreadPanel(props: {
  projectId: string
  sectionId: string
}): ReactElement {
  const { projectId, sectionId } = props
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState('')
  const [conflicts, setConflicts] = useState<{ description: string }[]>([])
  const [contextTruncated, setContextTruncated] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const threadQ = useQuery({
    queryKey: ['privateThread', projectId, sectionId],
    queryFn: () => getPrivateThread(projectId, sectionId),
    enabled: Boolean(projectId && sectionId),
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadQ.data?.messages, streaming])

  const sendMut = useMutation({
    mutationFn: async () => {
      const content = draft.trim()
      if (!content) {
        return
      }
      setErr(null)
      setDraft('')
      setStreaming('')
      setConflicts([])
      setContextTruncated(false)
      await streamPrivateThreadReply(projectId, sectionId, content, {
        onToken: (t: string) => {
          setStreaming((s) => s + t)
        },
        onMeta: (meta: {
          conflicts: { description: string }[]
          context_truncated?: boolean
        }) => {
          setConflicts(meta.conflicts)
          setContextTruncated(Boolean(meta.context_truncated))
        },
      })
    },
    onSuccess: () => {
      setStreaming('')
      void qc.invalidateQueries({
        queryKey: ['privateThread', projectId, sectionId],
      })
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'detail' in e
          ? String((e as { detail: unknown }).detail)
          : 'Request failed'
      setErr(msg)
    },
  })

  const msgs = threadQ.data?.messages ?? []

  return (
    <aside className="flex h-[min(70vh,560px)] flex-col rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="border-b border-zinc-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-200">Private thread</h2>
        <p className="text-xs text-zinc-500">
          RAG-backed assistant (streaming). Conflicts scanned after reply.
        </p>
      </div>
      <ContextTruncationBanner visible={contextTruncated} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {threadQ.isPending && (
          <p className="text-zinc-500">Loading thread…</p>
        )}
        {msgs.map((m: PrivateThreadMessage) => (
          <div
            key={m.id}
            className={`rounded-lg px-2 py-1.5 ${
              m.role === 'user'
                ? 'ml-4 bg-violet-950/50 text-zinc-100'
                : 'mr-4 bg-zinc-800/80 text-zinc-200'
            }`}
          >
            <span className="text-[10px] uppercase text-zinc-500">{m.role}</span>
            <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {streaming && (
          <div className="mr-4 rounded-lg bg-zinc-800/80 px-2 py-1.5 text-zinc-200">
            <span className="text-[10px] uppercase text-zinc-500">assistant</span>
            <p className="mt-0.5 whitespace-pre-wrap">{streaming}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {conflicts.length > 0 && (
        <div className="border-t border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          <p className="font-medium text-amber-200">Possible conflicts</p>
          <ul className="mt-1 list-inside list-disc">
            {conflicts.map((c, i) => (
              <li key={i}>{c.description}</li>
            ))}
          </ul>
        </div>
      )}
      {err && (
        <p className="border-t border-red-900/40 px-3 py-2 text-xs text-red-300">
          {err}
        </p>
      )}
      <div className="border-t border-zinc-800 p-2">
        <textarea
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          rows={3}
          placeholder="Ask about this section…"
          value={draft}
          disabled={sendMut.isPending}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          disabled={!draft.trim() || sendMut.isPending}
          className="w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          onClick={() => sendMut.mutate()}
        >
          {sendMut.isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </aside>
  )
}
