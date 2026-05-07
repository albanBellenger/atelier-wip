import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent, ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { useEditorV2Prefs } from '../components/outline-editor-v2/hooks/useEditorV2Prefs'
import {
  HOME_STUDIO_ID_LS_KEY,
  resolveHomeStudioId,
} from '../lib/homeStudioPreference'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { studioRoleLabel } from '../lib/roleLabels'
import { APP_VERSION } from '../version'
import { logout as logoutApi, me, patchMeProfile } from '../services/api'

export function MeProfilePage(): ReactElement {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const outlinePrefs = useEditorV2Prefs()
  const hostedEnvLabel = hostedEnvironmentLabel(getHostedEnvironment())
  const { data: profile, isPending, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })
  const [name, setName] = useState('')
  const [studioId, setStudioId] = useState<string | null>(null)

  useEffect(() => {
    if (isError) {
      void navigate('/auth', { replace: true })
    }
  }, [isError, navigate])

  useEffect(() => {
    if (!profile?.studios.length) {
      setStudioId(null)
      return
    }
    setStudioId((current) => {
      if (current && profile.studios.some((s) => s.studio_id === current)) {
        return current
      }
      return resolveHomeStudioId(profile) ?? profile.studios[0].studio_id
    })
  }, [profile])

  const handleStudioChange = useCallback((sid: string) => {
    localStorage.setItem(HOME_STUDIO_ID_LS_KEY, sid)
    setStudioId(sid)
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      /* still leave app */
    }
    void navigate('/auth', { replace: true })
  }, [navigate])

  useEffect(() => {
    if (profile) setName(profile.user.display_name)
  }, [profile])

  const save = useMutation({
    mutationFn: () => patchMeProfile({ display_name: name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })

  function onSubmit(e: FormEvent): void {
    e.preventDefault()
    void save.mutateAsync()
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  if (isPending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={studioId}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={{ label: 'Profile' }}
        />

        <div className="mx-auto mt-6 max-w-md">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-zinc-100">
            Profile
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-lg font-medium text-zinc-100">
              {profile.user.display_name}
            </p>
            {profile.user.is_platform_admin ? (
              <span className="rounded-md border border-violet-500/40 bg-violet-600/20 px-2 py-0.5 text-xs font-medium text-violet-300">
                Platform admin
              </span>
            ) : null}
          </div>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm text-zinc-400" htmlFor="profile-email">
              Email
              <input
                id="profile-email"
                readOnly
                aria-readonly="true"
                className="mt-1 w-full cursor-default rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-zinc-400 outline-none"
                value={profile.user.email}
              />
            </label>
            <p className="text-xs text-zinc-600">
              Email is your login identifier and cannot be changed here.
            </p>
            <label className="block text-sm text-zinc-400" htmlFor="profile-display-name">
              Display name
              <input
                id="profile-display-name"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-violet-600"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (save.isSuccess || save.isError) save.reset()
                }}
                maxLength={255}
                required
              />
            </label>
            {save.isError ? (
              <p className="text-sm text-rose-400">Could not save. Check your input.</p>
            ) : null}
            {save.isSuccess ? (
              <p className="text-sm text-emerald-400">Saved.</p>
            ) : null}
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              Save
            </button>
          </form>

          <section className="mt-12" aria-labelledby="outline-editor-beta-heading">
            <h2
              id="outline-editor-beta-heading"
              className="font-serif text-xl font-medium tracking-tight text-zinc-100"
            >
              Outline editor (beta)
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Document-first layout with a slide-in copilot. Changes apply on the next
              section visit or refresh — not mid-session.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <input
                type="checkbox"
                data-testid="pref-outline-editor-v2"
                className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-violet-600"
                checked={outlinePrefs.outlineEditorV2}
                onChange={(e) => outlinePrefs.setOutlineEditorV2(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-zinc-200">
                  Use new outline editor (V2)
                </span>
                <span className="mt-1 block text-xs text-zinc-500">
                  Document-first layout + slide-in copilot; reversible anytime.
                </span>
              </span>
            </label>
          </section>

          <section className="mt-12" aria-labelledby="your-studios-heading">
            <h2
              id="your-studios-heading"
              className="font-serif text-xl font-medium tracking-tight text-zinc-100"
            >
              Your studios
            </h2>
            {profile.studios.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                You&apos;re not a member of any studio yet.{' '}
                <Link to="/studios" className="font-medium text-violet-400 hover:underline">
                  Browse studios
                </Link>
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-950/50">
                {profile.studios.map((s) => (
                  <li
                    key={s.studio_id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <Link
                      to={`/studios/${s.studio_id}`}
                      className="font-medium text-violet-400 hover:underline"
                    >
                      {s.studio_name}
                    </Link>
                    <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-400">
                      {studioRoleLabel(s.role)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/60 pt-6 text-[11px] text-zinc-600">
          <span>Atelier · Builder workspace</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
            <Link
              to="/changelog"
              className="text-zinc-500 hover:text-zinc-300 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              v{APP_VERSION}
            </Link>
            <span className="select-none font-sans text-zinc-700" aria-hidden>
              ·
            </span>
            <span
              className="rounded border border-zinc-700/70 px-1.5 py-px text-[10px] font-sans font-normal uppercase tracking-wider text-zinc-500"
              title={`Hosted environment: ${hostedEnvLabel}`}
            >
              {hostedEnvLabel}
            </span>
          </span>
        </footer>
      </div>
    </div>
  )
}
