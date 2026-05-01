import type { ReactElement } from 'react'

import type { MeResponse } from '../../services/api'

export type BuilderGreetingProps = {
  profile: MeResponse
  projectName: string | null
}

export function BuilderGreeting({
  profile,
  projectName,
}: BuilderGreetingProps): ReactElement {
  const hour = new Date().getHours()
  const greet =
    hour < 5
      ? 'Working late'
      : hour < 12
        ? 'Good morning'
        : hour < 18
          ? 'Good afternoon'
          : 'Good evening'
  const first = profile.user.display_name.split(/\s+/)[0] ?? profile.user.display_name

  return (
    <div className="pb-8">
      <div className="text-[13px] text-zinc-500">
        {greet}, {first}.
      </div>
      <h1 className="mt-1 font-serif text-[34px] font-medium leading-[1.1] tracking-[-0.02em] text-zinc-100">
        {projectName ? (
          <>
            Pick up where you left off on{' '}
            <span className="text-zinc-100">{projectName}</span>
            <span className="text-zinc-600">.</span>
          </>
        ) : (
          <>Your builder workspace.</>
        )}
      </h1>
    </div>
  )
}
