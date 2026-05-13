import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { BackpropSectionFromCodebaseModal } from '../components/software/BackpropSectionFromCodebaseModal'
import { SplitEditor } from '../components/editor/SplitEditor'
import type { MilkdownEditorApi } from '../components/editor/MilkdownEditor'
import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import {
  colorsForUser,
  useSoftwareDocYjsCollab,
} from '../hooks/useYjsCollab'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  getSoftwareDocsSection,
  getSoftware,
  listCodebaseSnapshots,
  listSoftware,
  logout as logoutApi,
  me,
  updateIssue,
} from '../services/api'

/** sessionStorage payload from IssuesPanel Apply */
interface DocSyncApplyPayload {
  projectId: string
  issueId: string
  replacementMarkdown: string
  softwareId: string
  sectionId: string
}

const DOC_SYNC_STORAGE_PREFIX = 'atelier_doc_sync:'

function readDocSyncPayload(issueId: string | null): DocSyncApplyPayload | null {
  if (!issueId) return null
  try {
    const raw = sessionStorage.getItem(`${DOC_SYNC_STORAGE_PREFIX}${issueId}`)
    if (!raw) return null
    const p = JSON.parse(raw) as DocSyncApplyPayload
    if (
      typeof p.projectId === 'string' &&
      typeof p.issueId === 'string' &&
      typeof p.replacementMarkdown === 'string' &&
      typeof p.softwareId === 'string' &&
      typeof p.sectionId === 'string'
    ) {
      return p
    }
  } catch {
    return null
  }
  return null
}

/** Collaborative Markdown editor for a single software-level documentation section. */
export function SoftwareDocEditorPage(): ReactElement {
  const { studioId, softwareId, sectionId } = useParams<{
    studioId: string
    softwareId: string
    sectionId: string
  }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const docSyncIssueId = searchParams.get('docSyncIssue')
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''
  const secid = sectionId ?? ''

  const profileQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileQ.isError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileQ.isError, navigate])

  const profile = profileQ.data
  const access = useStudioAccess(profile, sid, sfid)

  const sectionQ = useQuery({
    queryKey: ['softwareDocSection', sfid, secid],
    queryFn: () => getSoftwareDocsSection(sfid, secid),
    enabled: Boolean(sfid && secid && access.isMember),
  })

  const snapshotsQ = useQuery({
    queryKey: ['codebaseSnapshots', sfid],
    queryFn: () => listCodebaseSnapshots(sfid),
    enabled: Boolean(sfid && access.isStudioEditor),
  })

  const hasReadyCodebase = Boolean(
    snapshotsQ.data?.some((s) => s.status === 'ready'),
  )

  const [backpropOpen, setBackpropOpen] = useState(false)

  const swQ = useQuery({
    queryKey: ['softwareOne', sid, sfid],
    queryFn: () => getSoftware(sid, sfid),
    enabled: Boolean(sid && sfid && access.isMember),
  })

  const studioSoftwareListQ = useQuery({
    queryKey: ['software', sid],
    queryFn: () => listSoftware(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const headerTrailingCrumb = useMemo(() => {
    if (!swQ.data) return undefined
    const rows = studioSoftwareListQ.data ?? []
    const base = { label: swQ.data.name, softwareId: sfid }
    if (rows.length <= 1) return base
    return {
      ...base,
      softwareSwitcher: {
        currentSoftwareId: sfid,
        softwareOptions: rows.map((r) => ({ id: r.id, name: r.name })),
        onSoftwareSelect: (nextId: string) => {
          void navigate(`/studios/${sid}/software/${nextId}`)
        },
      },
    }
  }, [swQ.data, studioSoftwareListQ.data, sfid, sid, navigate])

  const collabUser = useMemo(() => {
    if (!profile?.user) return null
    const { color, colorLight } = colorsForUser(profile.user.id)
    return {
      name: profile.user.display_name,
      color,
      colorLight,
    }
  }, [profile?.user?.display_name, profile?.user?.id])

  const collab = useSoftwareDocYjsCollab(
    access.isStudioEditor ? sfid : undefined,
    access.isStudioEditor ? secid : undefined,
    collabUser,
  )

  const editorApiRef = useRef<MilkdownEditorApi | null>(null)

  const applyBackpropDraft = useCallback(
    (md: string) => {
      editorApiRef.current?.replaceFullMarkdown(md)
    },
    [],
  )

  const docSyncPayload = useMemo(
    () => readDocSyncPayload(docSyncIssueId),
    [docSyncIssueId],
  )
  const docSyncDraftAppliedRef = useRef(false)
  const docSyncResolvedRef = useRef(false)

  useEffect(() => {
    docSyncDraftAppliedRef.current = false
    docSyncResolvedRef.current = false
  }, [docSyncIssueId, secid])

  useEffect(() => {
    if (!collab || !docSyncPayload || !docSyncIssueId) {
      return
    }
    if (docSyncPayload.sectionId !== secid || docSyncPayload.softwareId !== sfid) {
      return
    }
    if (docSyncDraftAppliedRef.current) {
      return
    }
    applyBackpropDraft(docSyncPayload.replacementMarkdown)
    docSyncDraftAppliedRef.current = true
  }, [collab, docSyncPayload, docSyncIssueId, secid, sfid, applyBackpropDraft])

  useEffect(() => {
    if (!collab || !docSyncPayload || !docSyncIssueId) {
      return
    }
    if (docSyncPayload.sectionId !== secid) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const tick = (): void => {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        timer = null
        if (cancelled) {
          return
        }
        void (async () => {
          try {
            const sec = await getSoftwareDocsSection(sfid, secid)
            if (
              sec.content.trim() !== docSyncPayload.replacementMarkdown.trim()
            ) {
              tick()
              return
            }
            if (docSyncResolvedRef.current) {
              return
            }
            docSyncResolvedRef.current = true
            await updateIssue(
              docSyncPayload.projectId,
              docSyncPayload.issueId,
              'resolved',
              { resolution_reason: 'applied' },
            )
            try {
              sessionStorage.removeItem(
                `${DOC_SYNC_STORAGE_PREFIX}${docSyncPayload.issueId}`,
              )
            } catch {
              /* ignore */
            }
            await qc.invalidateQueries({
              queryKey: ['issues', docSyncPayload.projectId],
            })
            const next = new URLSearchParams(searchParams)
            next.delete('docSyncIssue')
            setSearchParams(next, { replace: true })
          } catch {
            docSyncResolvedRef.current = false
            tick()
          }
        })()
      }, 800)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [collab, docSyncPayload, docSyncIssueId, secid, sfid, qc, searchParams, setSearchParams])

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      /* still leave */
    }
    void navigate('/auth', { replace: true })
  }, [navigate])

  const handleStudioChange = useCallback(
    (nextStudioId: string) => {
      void navigate(`/studios/${nextStudioId}`)
    },
    [navigate],
  )

  if (!sid || !sfid || !secid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileQ.isPending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>No access.</p>
        <Link to={`/studios/${sid}/software/${sfid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  const title = sectionQ.data?.title ?? 'Software documentation'

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={sid}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={headerTrailingCrumb}
        />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            to={`/studios/${sid}/software/${sfid}?tab=docs`}
            className="text-[13px] text-violet-400 hover:underline"
          >
            ← Software docs
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="text-[18px] font-semibold text-zinc-100">{title}</h1>
          {access.isStudioEditor ? (
            <button
              type="button"
              title={hasReadyCodebase ? undefined : 'Index the codebase first'}
              className="ml-auto rounded-lg border border-zinc-600 px-3 py-2 text-[12px] text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasReadyCodebase}
              onClick={() => setBackpropOpen(true)}
            >
              Draft from codebase
            </button>
          ) : null}
        </div>

        {sectionQ.isPending ? (
          <p className="mt-8 text-zinc-500">Loading…</p>
        ) : null}
        {sectionQ.isError ? (
          <p className="mt-8 text-red-400">Could not load this documentation page.</p>
        ) : null}

        {sectionQ.data && access.isStudioEditor ? (
          <div className="mt-6 h-[min(720px,calc(100vh-220px))] min-h-[420px] rounded-xl border border-zinc-800 bg-zinc-900/40">
            <SplitEditor
              collab={collab}
              defaultMarkdown={sectionQ.data.content ?? ''}
              readOnly={false}
              editorApiRef={editorApiRef}
            />
          </div>
        ) : null}

        {access.isStudioEditor ? (
          <BackpropSectionFromCodebaseModal
            softwareId={sfid}
            sectionId={secid}
            currentMarkdown={sectionQ.data?.content ?? ''}
            hasIndexedCodebase={hasReadyCodebase}
            isOpen={backpropOpen}
            onDismiss={() => setBackpropOpen(false)}
            onInsert={applyBackpropDraft}
          />
        ) : null}

        {sectionQ.data && !access.isStudioEditor ? (
          <article className="prose prose-invert prose-zinc mt-8 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {sectionQ.data.content || '_Empty_'}
            </ReactMarkdown>
          </article>
        ) : null}
      </div>
    </div>
  )
}
