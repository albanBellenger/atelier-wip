import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  listProjectIssues,
  me,
  runProjectAnalyze,
  updateIssue,
} from '../services/api'

export function IssuesPage(): ReactElement {
  const { studioId, softwareId, projectId } = useParams<{
    studioId: string
    softwareId: string
    projectId: string
  }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''
  const pid = projectId ?? ''

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

  const access = useStudioAccess(profileQ.data, sid, sfid)

  const issuesQ = useQuery({
    queryKey: ['issues', pid],
    queryFn: () => listProjectIssues(pid),
    enabled: Boolean(pid && access.isMember),
  })

  const analyzeMut = useMutation({
    mutationFn: () => runProjectAnalyze(pid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['issues', pid] })
    },
  })

  const resolveMut = useMutation({
    mutationFn: (issueId: string) =>
      updateIssue(pid, issueId, 'resolved'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['issues', pid] })
    },
  })

  if (!sid || !sfid || !pid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileQ.isPending || !profileQ.data) {
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

  if (access.isCrossStudioViewer) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>Issues are not visible for cross-studio viewers.</p>
        <Link
          to={`/studios/${sid}/software/${sfid}/projects/${pid}`}
          className="mt-4 inline-block text-violet-400"
        >
          Back to project
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            to={`/studios/${sid}/software/${sfid}/projects/${pid}`}
            className="text-violet-400 hover:underline"
          >
            ← Project
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Issues</h1>
        {access.isStudioEditor ? (
          <button
            type="button"
            disabled={analyzeMut.isPending}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
            onClick={() => analyzeMut.mutate()}
          >
            Run analysis
          </button>
        ) : null}
        {analyzeMut.isSuccess && (
          <p className="text-sm text-emerald-400">
            Created {analyzeMut.data.issues_created} issue(s).
          </p>
        )}
        {issuesQ.isPending && (
          <p className="text-zinc-500">Loading issues…</p>
        )}
        {issuesQ.isError && (
          <p className="text-red-400">Could not load issues.</p>
        )}
        <ul className="space-y-4">
          {(issuesQ.data ?? []).map((issue) => (
            <li
              key={issue.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                {issue.description}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Status: {issue.status} · origin: {issue.origin}
              </p>
              {issue.status === 'open' && access.isStudioEditor ? (
                <button
                  type="button"
                  className="mt-3 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
                  onClick={() => resolveMut.mutate(issue.id)}
                  disabled={resolveMut.isPending}
                >
                  Mark resolved
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {!issuesQ.isPending && (issuesQ.data?.length ?? 0) === 0 && (
          <p className="text-zinc-500">No issues yet.</p>
        )}
      </div>
    </div>
  )
}
