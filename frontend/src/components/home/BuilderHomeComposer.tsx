import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  SOFTWARE_COMPOSER_CHAT_MODEL_KEY,
  SOFTWARE_COMPOSER_DRAFT_STATE_KEY,
} from '../../lib/softwareComposerNav'
import type { MeResponse } from '../../services/api'
import { postBuilderComposerHint } from '../../services/api'
import { useStudioChatModelPicker } from '../../hooks/useStudioChatModelPicker'
import { StudioChatModelPicker } from '../chat/StudioChatModelPicker'

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

  const {
    modelsQ,
    options: chatModelOptions,
    selectedModel: selectedChatModel,
    setSelectedModel,
    modelTitle,
  } = useStudioChatModelPicker({
    studioId,
    titleContextHint:
      'Software chat uses the selected model when you send a message.',
  })

  const headline = hintQ.data?.headline?.trim() || null
  const placeholder =
    hintQ.data?.input_placeholder?.trim() ||
    (canUseSoftwareChat
      ? `Ask anything about ${softwareName}…`
      : 'Software chat is available to Studio Owners and Builders.')

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
      toast.message('Studio Owner or Builder access is required for software chat.')
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
              : 'Studio Owners and Builders can start a software-wide thread from here.'
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
              <StudioChatModelPicker
                variant="composer"
                modelsQ={modelsQ}
                options={chatModelOptions}
                selectedModel={selectedChatModel}
                onModelChange={setSelectedModel}
                modelTitle={modelTitle}
                disabled={!canUseSoftwareChat}
              />
            </div>
            <button
              type="button"
              aria-label="Send to software chat"
              disabled={!canUseSoftwareChat || !draft.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white shadow-sm transition hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-40"
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
