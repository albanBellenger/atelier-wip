import type { ReactElement } from 'react'

import type { DocBlock as DocBlockModel } from '../hooks/useDocBlocks'

export function DocBlock(props: {
  block: DocBlockModel
  onSelect?: (id: string) => void
  selected?: boolean
}): ReactElement {
  const { block, onSelect, selected } = props

  const cls = selected ? 'ring-1 ring-violet-500/40' : ''

  if (block.type === 'h2') {
    return (
      <div
        data-testid={`doc-block-${block.id}`}
        role="presentation"
        onMouseDown={() => onSelect?.(block.id)}
        className={`rounded px-1 py-2 font-display text-2xl font-medium tracking-tight text-zinc-100 ${cls}`}
      >
        {block.text}
      </div>
    )
  }

  if (block.type === 'h3') {
    return (
      <div
        data-testid={`doc-block-${block.id}`}
        role="presentation"
        onMouseDown={() => onSelect?.(block.id)}
        className={`rounded px-1 py-1.5 font-display text-xl text-zinc-200 ${cls}`}
      >
        {block.text}
      </div>
    )
  }

  if (block.type === 'ul') {
    return (
      <ul
        data-testid={`doc-block-${block.id}`}
        className={`list-disc space-y-1 pl-6 text-zinc-300 ${cls}`}
        onMouseDown={() => onSelect?.(block.id)}
      >
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }

  return (
    <p
      data-testid={`doc-block-${block.id}`}
      role="presentation"
      onMouseDown={() => onSelect?.(block.id)}
      className={`whitespace-pre-wrap rounded px-1 py-2 text-sm leading-relaxed text-zinc-300 ${cls}`}
    >
      {block.text}
      {block.renderedAsPlain ? (
        <span className="ml-2 font-mono text-[10px] text-zinc-500">
          (rendered as plain)
        </span>
      ) : null}
    </p>
  )
}
