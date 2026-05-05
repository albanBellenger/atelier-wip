import type { ReactElement } from 'react'

export function MarginGutter(props: {
  children: ReactElement
}): ReactElement {
  return (
    <div className="flex w-10 shrink-0 justify-center border-r border-zinc-800/40 bg-[#08080a]/50">
      {props.children}
    </div>
  )
}
