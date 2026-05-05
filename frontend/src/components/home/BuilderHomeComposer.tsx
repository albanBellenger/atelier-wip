import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  SOFTWARE_COMPOSER_CHAT_MODEL_KEY,
  SOFTWARE_COMPOSER_DRAFT_STATE_KEY,
  readStoredSoftwareChatModel,
  softwareChatModelStorageKey,
} from '../../lib/softwareComposerNav'
import type { StudioChatLlmModels } from '../../services/api'
import {
  getStudioChatLlmModels,
  postBuilderComposerHint,
} from '../../services/api'
import type { MeResponse } from '../../services/api'

/** Stable order: effective → workspace default → policy/registry allow-list. */
function buildChatModelOptions(d: StudioChatLlmModels): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (m: string | null | undefined): void => {
    const t = m?.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  push(d.effective_model)
  push(d.workspace_default_model)
  for (const a of d.allowed_models) push(a)
  return out
}

export type BuilderHomeComposerProps = {
  profile: MeResponse
  studioId: string
  softwareId: string
  projectId: string | null
  projectName: string | null
  softwareName: string
  canUseSoftwareChat: boolean
  canSeeComposerHint: boolean
}

export function BuilderHomeComposer({
  profile,
  studioId,
  softwareId,
  projectId,
  projectName,
  softwareName,
  canUseSoftwareChat,
  canSeeComposerHint,
}: BuilderHomeComposerProps): ReactElement {
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [plusOpen, setPlusOpen] = useState(false)
  const [selectedChatModel, setSelectedChatModel] = useState<string | null>(null)

  const hintQ = useQuery({
    queryKey: [
      'me',
      'builder-composer-hint',
      softwareId,
      projectId ?? 'none',
    ],
    queryFn: () =>
      postBuilderComposerHint({
        software_id: softwareId,
        project_id: projectId,
        local_hour: new Date().getHours(),
      }),
    enabled: Boolean(softwareId && canSeeComposerHint),
    staleTime: 15 * 60_000,
    retry: 1,
  })

  const modelsQ = useQuery({
    queryKey: ['studios', studioId, 'llm-chat-models'],
    queryFn: () => getStudioChatLlmModels(studioId),
    enabled: Boolean(studioId),
    staleTime: 60_000,
    retry: 1,
  })

  const chatModelOptions = useMemo((): string[] => {
    if (!modelsQ.data) return []
    return buildChatModelOptions(modelsQ.data)
  }, [modelsQ.data])

  useEffect(() => {
    if (chatModelOptions.length === 0) {
      setSelectedChatModel(null)
      return
    }
    let cancelled = false
    const stored = readStoredSoftwareChatModel(studioId)
    const pick =
      stored && chatModelOptions.includes(stored)
        ? stored
        : chatModelOptions[0] ?? null
    if (!cancelled) setSelectedChatModel(pick)
    return () => {
      cancelled = true
    }
  }, [chatModelOptions, studioId])

  const headline = hintQ.data?.headline?.trim() || null
  const placeholder =
    hintQ.data?.input_placeholder?.trim() ||
    (canUseSoftwareChat
      ? `Ask anything about ${softwareName}…`
      : 'Software chat is available to studio editors.')

  const basePath = `/studios/${studioId}/software/${softwareId}`

  const trySlashCommand = useCallback(
    (raw: string): boolean => {
      const t = raw.trim()
      if (!t.startsWith('/')) return false
      const cmd = t.split(/\s+/)[0]?.toLowerCase() ?? ''
      if (cmd === '/help') {
        toast.message(
          'Commands: /help — this list. /settings — software settings. /projects — scroll to projects.',
        )
        return true
      }
      if (cmd === '/settings') {
        void navigate(`${basePath}/settings`)
        return true
      }
      if (cmd === '/projects') {
        void navigate(`${basePath}#software-projects-section`)
        setTimeout(() => {
          document
            .getElementById('software-projects-section')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 0)
        return true
      }
      return false
    },
    [basePath, navigate],
  )

  const onSubmitIntent = useCallback((): void => {
    if (!canUseSoftwareChat) {
      toast.message('Studio editor access is required for software chat.')
      return
    }
    const text = draft.trim()
    if (!text) return
    if (trySlashCommand(text)) {
      setDraft('')
      return
    }
    void navigate(`${basePath}?tab=chat`, {
      state: {
        [SOFTWARE_COMPOSER_DRAFT_STATE_KEY]: text,
        ...(selectedChatModel
          ? { [SOFTWARE_COMPOSER_CHAT_MODEL_KEY]: selectedChatModel }
          : {}),
      },
    })
    setDraft('')
  }, [
    basePath,
    canUseSoftwareChat,
    draft,
    navigate,
    selectedChatModel,
    trySlashCommand,
  ])

  const firstName =
    profile.user.display_name.split(/\s+/)[0] ?? profile.user.display_name

  const subline = useMemo(() => {
    if (headline) return headline
    if (hintQ.isPending) return 'Preparing your workspace…'
    if (projectName) {
      return `${firstName}, you're focused on ${projectName}.`
    }
    return `${firstName}, you're building ${softwareName}.`
  }, [firstName, headline, hintQ.isPending, projectName, softwareName])

  const modelTitle = useMemo(() => {
    if (modelsQ.isPending) return 'Loading models from workspace…'
    if (modelsQ.isError || !modelsQ.data) return 'Could not load workspace models.'
    const d = modelsQ.data
    const allowed = d.allowed_models.filter((m) => m.trim().length > 0)
    const eff = d.effective_model?.trim()
    const fallback = d.workspace_default_model?.trim()
    const rest =
      allowed.length > 0
        ? ` Allowed (connected providers): ${allowed.join(', ')}.`
        : ''
    if (eff || fallback) {
      return `Software chat uses the selected model when you send a message.${rest}`
    }
    return allowed.length > 0
      ? `No routing override; connected models: ${allowed.join(', ')}.`
      : 'No connected LLM provider model is configured for chat in this studio.'
  }, [modelsQ.data, modelsQ.isError, modelsQ.isPending])

  return (
    <div className="pb-8">
      <div className="mb-3 text-[13px] text-zinc-500">{subline}</div>
      <div className="relative rounded-3xl border border-zinc-700/80 bg-zinc-900/50 p-4 shadow-lg shadow-black/20">
        <textarea
          className="min-h-[72px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={placeholder}
          rows={3}
          value={draft}
          disabled={!canUseSoftwareChat}
          title={
            canUseSoftwareChat
              ? undefined
              : 'Studio editors can start a software-wide thread from here.'
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmitIntent()
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-3">
          <div className="relative">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/80 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
              aria-haspopup="menu"
              aria-expanded={plusOpen}
              onClick={() => setPlusOpen((v) => !v)}
            >
              <span className="text-lg leading-none">+</span>
            </button>
            {plusOpen ? (
              <div
                className="absolute bottom-full left-0 z-10 mb-1 min-w-[10rem] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  className="block w-full px-3 py-2 text-left text-[12px] text-zinc-500"
                >
                  Attach (soon)
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 text-[11px] text-zinc-500">
              {modelsQ.isPending ? (
                <span className="truncate" title={modelTitle}>
                  …
                </span>
              ) : modelsQ.isError || !modelsQ.data ? (
                <span className="truncate" title={modelTitle}>
                  —
                </span>
              ) : chatModelOptions.length === 0 ? (
                <span className="truncate" title={modelTitle}>
                  Not configured
                </span>
              ) : chatModelOptions.length === 1 ? (
                <span className="truncate text-zinc-100" title={modelTitle}>
                  {chatModelOptions[0]}
                </span>
              ) : (
                <div className="relative flex max-w-[min(240px,55vw)] min-w-0 items-center">
                  <select
                    aria-label="Chat model"
                    className="block max-w-full cursor-pointer appearance-none truncate bg-transparent py-1 pl-0 pr-5 text-[11px] font-semibold text-zinc-100 hover:text-zinc-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/35 disabled:cursor-not-allowed"
                    title={modelTitle}
                    value={selectedChatModel ?? chatModelOptions[0] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setSelectedChatModel(v)
                      window.localStorage.setItem(
                        softwareChatModelStorageKey(studioId),
                        v,
                      )
                    }}
                  >
                    {chatModelOptions.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                  <span
                    className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] leading-none text-zinc-500"
                    aria-hidden
                  >
                    ▾
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Send to software chat"
              disabled={!canUseSoftwareChat || !draft.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/35 text-white shadow-sm transition hover:bg-violet-500/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onSubmitIntent()}
            >
              <span className="text-base leading-none" aria-hidden>
                ↑
              </span>
            </button>
          </div>
        </div>
      </div>
      {canUseSoftwareChat ? (
        <p className="mt-2 text-[11px] text-zinc-600">
          Press Enter to open software chat. Shift+Enter for a new line. Try{' '}
          <span className="font-mono text-zinc-500">/help</span>.
        </p>
      ) : null}
    </div>
  )
}
