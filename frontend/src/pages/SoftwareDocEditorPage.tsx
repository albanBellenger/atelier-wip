import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { SplitEditor } from '../components/editor/SplitEditor'
import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import {
  colorsForUser,
  useSoftwareDocYjsCollab,
} from '../hooks/useYjsCollab'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  getSoftwareDocsSection,
  getSoftware,
  listSoftware,
  logout as logoutApi,
  me,
} from '../services/api'

/** Collaborative Markdown editor for a single software-level documentation section. */
export function SoftwareDocEditorPage(): ReactElement {
  const { studioId, softwareId, sectionId } = useParams<{
    studioId: string
    softwareId: string
    sectionId: string
  }>()
  const navigate = useNavigate()
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
        </div>

        {sectionQ.isPending ? (
          <p className="mt-8 text-zinc-500">Loading…</p>
        ) : null}
        {sectionQ.isError ? (
          <p className="mt-8 text-red-400">Could not load this documentation page.</p>
        ) : null}

        {sectionQ.data && access.isStudioEditor ? (
          <div className="mt-6 h-[min(720px,calc(100vh-220px))] min-h-[420px] rounded-xl border border-zinc-800 bg-zinc-900/40">
            <SplitEditor collab={collab} />
          </div>
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
