import type { ReactElement } from 'react'

import {
  formatOutboundPromptTokenCount,
  sumOutboundPromptTokens,
  type LlmOutboundPromptMessage,
} from '../../lib/llmOutboundPrompt'

export function LlmOutboundPromptOverlay(props: {
  open: boolean
  onClose: () => void
  messages: LlmOutboundPromptMessage[]
}): ReactElement | null {
  const { open, onClose, messages } = props
  if (!open) {
    return null
  }

  const totalTokens = sumOutboundPromptTokens(messages)

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close prompt overlay"
        onClick={onClose}
      />
      <div
        className="relative flex h-full w-full max-w-lg flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-outbound-prompt-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h2
              id="llm-outbound-prompt-title"
              className="shrink-0 text-sm font-medium text-zinc-200"
            >
              LLM outbound messages
            </h2>
            {totalTokens != null ? (
              <span
                className="truncate font-mono text-[10px] text-zinc-500"
                title={`${totalTokens} prompt tokens (LiteLLM)`}
              >
                {formatOutboundPromptTokenCount(totalTokens)} tok
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ol className="flex list-none flex-col gap-4 p-0">
            {messages.map((msg, i) => (
              <li key={`${msg.role}-${i}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-violet-300">
                    {msg.role}
                  </span>
                  {typeof msg.tokens === 'number' &&
                  Number.isFinite(msg.tokens) ? (
                    <span className="font-mono text-[10px] text-zinc-500">
                      · {formatOutboundPromptTokenCount(msg.tokens)} tok
                    </span>
                  ) : null}
                </div>
                <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3 text-xs leading-relaxed text-zinc-300">
                  {msg.content}
                </pre>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
