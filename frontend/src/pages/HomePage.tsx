import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearToken, getToken, me } from '../services/api'
import type { MeResponse } from '../services/api'

export function HomePage(): ReactElement {
  const navigate = useNavigate()
  const token = getToken()

  const { data: profile, isPending, isError } = useQuery<MeResponse>({
    queryKey: ['auth', 'me', token],
    queryFn: () => me(token as string),
    enabled: Boolean(token),
  })

  useEffect(() => {
    if (!token) {
      navigate('/auth', { replace: true })
    }
  }, [token, navigate])

  useEffect(() => {
    if (isError) {
      clearToken()
      navigate('/auth', { replace: true })
    }
  }, [isError, navigate])

  function logout(): void {
    clearToken()
    navigate('/auth', { replace: true })
  }

  if (!token || isPending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="mt-4 text-zinc-400">
          Signed in as{' '}
          <span className="text-zinc-200">{profile.user.display_name}</span> (
          {profile.user.email})
        </p>
        {profile.user.is_tool_admin && (
          <p className="mt-2 text-sm text-violet-400">Tool administrator</p>
        )}
        <p className="mt-6 text-sm text-zinc-500">
          This is a placeholder home screen for Slice&nbsp;1. Studio list and
          the rest of the app arrive in later slices.
        </p>
        <button
          type="button"
          onClick={logout}
          className="mt-8 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Log out
        </button>
        <p className="mt-8 text-center text-sm text-zinc-600">
          <Link to="/auth" className="text-violet-400 hover:underline">
            Back to auth
          </Link>
        </p>
      </div>
    </div>
  )
}
