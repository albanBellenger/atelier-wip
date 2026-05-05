import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  SOFTWARE_COMPOSER_CHAT_MODEL_KEY,
  SOFTWARE_COMPOSER_DRAFT_STATE_KEY,
  readStoredSoftwareChatModel,
  type SoftwareComposerLocationState,
} from '../../lib/softwareComposerNav'
import type { SoftwareChatMessageRow } from '../../services/api'
import { getSoftwareChat } from '../../services/api'
import { openSoftwareChatWebSocket } from '../../services/ws'

type WsPayload =
  | { type: 'user_message'; id: string; user_id: string; content: string }
  | { type: 'assistant_token'; text: string }
  | { type: 'assistant_done'; message_id: string; content: string }
  | { type: 'error'; message: string }

export interface SoftwareChatRoomProps {
  softwareId: string
  /** When set, restores persisted chat model preference from localStorage. */
  studioId?: string
}

/** Shared software chat: loads history, opens WebSocket for live send/stream. */
export function SoftwareChatRoom({
  softwareId,
  studioId,
}: SoftwareChatRoomProps): ReactElement {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>(
    'closed',
  )
  const [streamBuf, setStreamBuf] = useState('')
  const [wsError, setWsError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingAutoRef = useRef<string | null>(null)
  const autoSentRef = useRef(false)
  const seededPendingRef = useRef(false)
  const preferredModelRef = useRef<string | null>(null)

  useEffect(() => {
    if (seededPendingRef.current) return
    const state = location.state as SoftwareComposerLocationState | null
    const m = state?.[SOFTWARE_COMPOSER_CHAT_MODEL_KEY]
    if (typeof m === 'string' && m.trim()) {
      preferredModelRef.current = m.trim()
    } else if (studioId) {
      const fromLs = readStoredSoftwareChatModel(studioId)
      if (fromLs) preferredModelRef.current = fromLs
    }
    const s = state?.[SOFTWARE_COMPOSER_DRAFT_STATE_KEY]
    if (typeof s === 'string' && s.trim()) {
      pendingAutoRef.current = s.trim()
    }
    seededPendingRef.current = true
  }, [location.state, studioId])

  const historyQ = useQuery({
    queryKey: ['softwareChat', softwareId],
    queryFn: () => getSoftwareChat(softwareId, { limit: 50 }),
    enabled: Boolean(softwareId),
  })

  const chronological = useMemo((): SoftwareChatMessageRow[] => {
    const rows = historyQ.data?.messages ?? []
    return [...rows].reverse()
  }, [historyQ.data?.messages])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [chronological.length, streamBuf, scrollToBottom])

  useEffect(() => {
    if (!softwareId) return undefined
    setWsStatus('connecting')
    setWsError(null)
    const ws = openSoftwareChatWebSocket(softwareId)
    wsRef.current = ws
    ws.onopen = () => {
      if (wsRef.current !== ws) return
      setWsStatus('open')
    }
    ws.onclose = () => {
      if (wsRef.current !== ws) return
      wsRef.current = null
      setWsStatus('closed')
    }
    ws.onmessage = (ev) => {
      if (wsRef.current !== ws) return
      let msg: WsPayload
      try {
        msg = JSON.parse(ev.data as string) as WsPayload
      } catch {
        return
      }
      if (msg.type === 'assistant_token') {
        setStreamBuf((b) => b + msg.text)
        return
      }
      if (msg.type === 'assistant_done') {
        setStreamBuf('')
        void qc.invalidateQueries({ queryKey: ['softwareChat', softwareId] })
        return
      }
      if (msg.type === 'error') {
        setWsError(msg.message)
        return
      }
      if (msg.type === 'user_message') {
        void qc.invalidateQueries({ queryKey: ['softwareChat', softwareId] })
      }
    }
    return () => {
      ws.close()
      if (wsRef.current === ws) {
        wsRef.current = null
      }
    }
  }, [softwareId, qc])

  const userMessagePayload = useCallback((content: string): Record<string, string> => {
    const pm = preferredModelRef.current
    if (pm) {
      return { type: 'user_message', content, model: pm }
    }
    return { type: 'user_message', content }
  }, [])

  useEffect(() => {
    if (wsStatus !== 'open') return
    const pending = pendingAutoRef.current
    if (!pending || autoSentRef.current) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    autoSentRef.current = true
    pendingAutoRef.current = null
    setWsError(null)
    ws.send(JSON.stringify(userMessagePayload(pending)))
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: {} },
    )
  }, [wsStatus, navigate, location.pathname, location.search, userMessagePayload])

  function send(): void {
    const text = draft.trim()
    const ws = wsRef.current
    if (!text) return
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setWsError('Not connected — wait for live or refresh the page.')
      return
    }
    setWsError(null)
    ws.send(JSON.stringify(userMessagePayload(text)))
    setDraft('')
  }

  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="border-b border-zinc-800 px-4 py-2 text-xs text-zinc-500">
        Software chat
        <span className="ml-2 font-mono text-zinc-600">
          {wsStatus === 'open'
            ? '● live'
            : wsStatus === 'connecting'
              ? '… connecting'
              : '○ offline'}
        </span>
      </div>
      <div className="max-h-[min(60vh,520px)] flex-1 space-y-3 overflow-y-auto p-4">
        {historyQ.isPending && (
          <p className="text-sm text-zinc-500">Loading messages…</p>
        )}
        {historyQ.isError && (
          <p className="text-sm text-red-400">Could not load chat history.</p>
        )}
        {chronological.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'ml-8 bg-violet-950/50 text-zinc-100'
                : 'mr-8 bg-zinc-800/80 text-zinc-200'
            }`}
          >
            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
              {m.role === 'user' ? 'Member' : 'Assistant'}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {streamBuf ? (
          <div className="mr-8 rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
              Assistant
            </div>
            <div className="whitespace-pre-wrap">{streamBuf}</div>
          </div>
        ) : null}
        {wsError ? (
          <p className="text-sm text-amber-400" role="alert">
            {wsError}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-zinc-800 p-3">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          placeholder={
            wsStatus === 'open'
              ? 'Message the software team…'
              : 'Connecting…'
          }
          rows={2}
          value={draft}
          disabled={wsStatus !== 'open'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          type="button"
          disabled={wsStatus !== 'open' || !draft.trim()}
          className="self-end rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
          onClick={() => send()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
