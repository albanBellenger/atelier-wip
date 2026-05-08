import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  SOFTWARE_COMPOSER_CHAT_MODEL_KEY,
  SOFTWARE_COMPOSER_DRAFT_STATE_KEY,
  readStoredSoftwareChatModel,
  softwareChatModelStorageKey,
  type SoftwareComposerLocationState,
} from '../../lib/softwareComposerNav'
import { useStudioChatModelPicker } from '../../hooks/useStudioChatModelPicker'
import {
  formatOutboundPromptTokenCount,
  sumOutboundPromptTokens,
  type LlmOutboundPromptMessage,
} from '../../lib/llmOutboundPrompt'
import type { SoftwareChatMessageRow } from '../../services/api'
import { getSoftwareChat } from '../../services/api'
import { openSoftwareChatWebSocket } from '../../services/ws'
import { LlmOutboundPromptOverlay } from '../debug/LlmOutboundPromptOverlay'
import { DocumentTextIcon } from '../icons/DocumentTextIcon'
import { StudioChatModelPicker } from './StudioChatModelPicker'

type WsPayload =
  | { type: 'user_message'; id: string; user_id: string; content: string }
  | {
      type: 'assistant_message'
      id: string
      user_id: string | null
      content: string
      created_at: string
    }
  | { type: 'assistant_token'; text: string }
  | {
      type: 'assistant_done'
      message_id: string
      content: string
      llm_outbound_messages?: LlmOutboundPromptMessage[]
    }
  | { type: 'error'; message: string; code?: string }

export interface SoftwareChatRoomProps {
  softwareId: string
  /** Studio scope for chat model allow-list and persistence. */
  studioId: string
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
  const [llmPromptByMessageId, setLlmPromptByMessageId] = useState<
    Record<string, LlmOutboundPromptMessage[]>
  >({})
  const [llmPromptOverlayMessageId, setLlmPromptOverlayMessageId] = useState<
    string | null
  >(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingAutoRef = useRef<string | null>(null)
  const autoSentRef = useRef(false)
  const seededPendingRef = useRef(false)
  const preferredModelRef = useRef<string | null>(null)

  const {
    modelsQ,
    options,
    selectedModel,
    setSelectedModel,
    modelTitle,
  } = useStudioChatModelPicker({ studioId })

  useEffect(() => {
    if (seededPendingRef.current) return
    const state = location.state as SoftwareComposerLocationState | null
    const m = state?.[SOFTWARE_COMPOSER_CHAT_MODEL_KEY]
    if (typeof m === 'string' && m.trim()) {
      const id = m.trim()
      preferredModelRef.current = id
      window.localStorage.setItem(softwareChatModelStorageKey(studioId), id)
    } else {
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
      if (msg.type === 'assistant_message') {
        void qc.invalidateQueries({ queryKey: ['softwareChat', softwareId] })
        return
      }
      if (msg.type === 'assistant_token') {
        setStreamBuf((b) => b + msg.text)
        return
      }
      if (msg.type === 'assistant_done') {
        if (
          Array.isArray(msg.llm_outbound_messages) &&
          msg.llm_outbound_messages.length > 0
        ) {
          setLlmPromptByMessageId((prev) => ({
            ...prev,
            [msg.message_id]: msg.llm_outbound_messages ?? [],
          }))
        }
        setStreamBuf('')
        void qc.invalidateQueries({ queryKey: ['softwareChat', softwareId] })
        return
      }
      if (msg.type === 'error') {
        setStreamBuf('')
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
    const pm = (selectedModel?.trim() || preferredModelRef.current) ?? ''
    if (pm) {
      return { type: 'user_message', content, model: pm }
    }
    return { type: 'user_message', content }
  }, [selectedModel])

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
        {chronological.map((m) => {
          const outboundTotal = sumOutboundPromptTokens(
            llmPromptByMessageId[m.id],
          )
          return (
          <div
            key={m.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'ml-8 bg-violet-950/50 text-zinc-100'
                : 'mr-8 bg-zinc-800/80 text-zinc-200'
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
              <span>
                {m.role === 'user'
                  ? (m.user_display_name?.trim() || 'Member')
                  : 'Assistant'}
              </span>
              {m.role === 'assistant' &&
              (llmPromptByMessageId[m.id]?.length ?? 0) > 0 ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {outboundTotal != null ? (
                    <span
                      className="normal-case font-mono tracking-normal text-zinc-500"
                      title={`${outboundTotal} prompt tokens (LiteLLM)`}
                    >
                      {formatOutboundPromptTokenCount(outboundTotal)} tok
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center justify-center rounded border border-transparent p-0.5 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-900/80 hover:text-zinc-300"
                    aria-label="View LLM prompt"
                    onClick={() => setLlmPromptOverlayMessageId(m.id)}
                  >
                    <DocumentTextIcon />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
          )
        })}
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
      <LlmOutboundPromptOverlay
        open={llmPromptOverlayMessageId != null}
        onClose={() => setLlmPromptOverlayMessageId(null)}
        messages={
          llmPromptOverlayMessageId != null
            ? llmPromptByMessageId[llmPromptOverlayMessageId] ?? []
            : []
        }
      />
      <div className="flex flex-col gap-2 border-t border-zinc-800 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
            Model
          </span>
          <StudioChatModelPicker
            variant="chat-room"
            modelsQ={modelsQ}
            options={options}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            modelTitle={modelTitle}
            disabled={wsStatus !== 'open'}
            ariaLabel="Software chat model"
          />
        </div>
        <div className="flex gap-2">
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
    </div>
  )
}
