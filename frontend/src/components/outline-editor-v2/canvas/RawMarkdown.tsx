import * as Y from 'yjs'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

export function RawMarkdown(props: { ytext: Y.Text }): ReactElement {
  const { ytext } = props
  const [text, setText] = useState(() => ytext.toString())

  useEffect(() => {
    const obs = (): void => {
      setText(ytext.toString())
    }
    ytext.observe(obs)
    return () => {
      ytext.unobserve(obs)
    }
  }, [ytext])

  return (
    <textarea
      data-testid="raw-markdown-editor"
      className="outline-editor-shell min-h-[320px] w-full resize-y rounded-lg border border-zinc-800 bg-[#08080a] p-4 font-mono text-sm leading-relaxed text-zinc-200"
      spellCheck={false}
      value={text}
      aria-label="Raw markdown"
      onChange={(e) => {
        const next = e.target.value
        ytext.delete(0, ytext.length)
        ytext.insert(0, next)
      }}
    />
  )
}
