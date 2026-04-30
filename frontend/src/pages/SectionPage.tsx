import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SplitEditor } from '../components/editor/SplitEditor'
import { ThreadPanel } from '../components/thread/ThreadPanel'
import { colorsForUser, useYjsCollab } from '../hooks/useYjsCollab'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { getSection, me } from '../services/api'

/** Section deep-link with collaborative Markdown editor. */
export function SectionPage(): ReactElement {
  const { studioId, softwareId, projectId, sectionId } = useParams<{
    studioId: string
    softwareId: string
    projectId: string
    sectionId: string
  }>()
  const navigate = useNavigate()
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''
  const pid = projectId ?? ''
  const secid = sectionId ?? ''

  const {
    data: profile,
    isPending: profilePending,
    isError: profileError,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileError, navigate])

  const access = useStudioAccess(profile, sid, sfid)

  const sectionQ = useQuery({
    queryKey: ['section', pid, secid],
    queryFn: () => getSection(pid, secid),
    enabled: Boolean(pid && secid && access.isMember),
  })

  const collabUser = useMemo(() => {
    if (!profile?.user) return null
    const { color, colorLight } = colorsForUser(profile.user.id)
    return {
      name: profile.user.display_name,
      color,
      colorLight,
    }
  }, [profile?.user.display_name, profile?.user.id])

  const collab = useYjsCollab(
    sectionQ.data ? pid : undefined,
    sectionQ.data ? secid : undefined,
    collabUser,
  )

  if (!sid || !sfid || !pid || !secid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileError || profilePending || !profile) {
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
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  const projectHref = `/studios/${sid}/software/${sfid}/projects/${pid}`

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap gap-4 text-sm">
          <Link
            to={projectHref}
            className="text-violet-400 hover:underline"
          >
            ← Project
          </Link>
          <Link
            to={`/studios/${sid}/software/${sfid}`}
            className="text-zinc-500 hover:text-zinc-300"
          >
            Software
          </Link>
        </div>

        {sectionQ.isPending && (
          <p className="text-zinc-500">Loading section…</p>
        )}
        {sectionQ.isError && (
          <p className="text-red-400">Could not load section.</p>
        )}
        {sectionQ.data && (
          <>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
              <h1 className="text-2xl font-semibold">{sectionQ.data.title}</h1>
              <p className="mt-2 font-mono text-sm text-zinc-500">
                {sectionQ.data.slug}
              </p>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)] lg:items-start">
              <div>
                {!collab ? (
                  <p className="text-zinc-500">Connecting editor…</p>
                ) : (
                  <SplitEditor collab={collab} />
                )}
              </div>
              <ThreadPanel projectId={pid} sectionId={secid} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
