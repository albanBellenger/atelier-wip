import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { Software } from '../../services/api'

export function StudioSoftwareSection(props: {
  studioId: string
  software: Software[] | undefined
  isPending: boolean
}): ReactElement {
  const { studioId, software, isPending } = props

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
          Software
          {software != null ? (
            <span className="ml-2 font-normal text-[13px] text-zinc-500">
              {software.length} {software.length === 1 ? 'product' : 'products'}
            </span>
          ) : null}
        </h2>
      </div>
      <div className="px-5 pb-5 pt-1">
        {isPending ? (
          <p className="mt-3 text-[13px] text-zinc-500">Loading software…</p>
        ) : null}
        {software && software.length === 0 ? (
          <p className="mt-3 text-[13px] text-zinc-500">No software yet.</p>
        ) : null}
        {software && software.length > 0 ? (
          <ul className="mt-3 divide-y divide-zinc-800/90">
            {software.map((sw) => (
              <li key={sw.id} className="py-3 first:pt-2">
                <Link
                  to={`/studios/${studioId}/software/${sw.id}`}
                  className="group flex flex-col gap-1 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-800/40"
                >
                  <span className="text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                    {sw.name}
                  </span>
                  {sw.description ? (
                    <span className="line-clamp-2 text-[13px] text-zinc-400">
                      {sw.description}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
