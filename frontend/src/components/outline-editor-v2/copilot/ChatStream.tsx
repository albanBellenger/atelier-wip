import type { ReactElement } from 'react'

/** Presentational slot — streaming UI lives in CopilotPanel / ConversationView. */
export function ChatStream(): ReactElement {
  return (
    <div data-testid="chat-stream-anchor" className="hidden" aria-hidden />
  )
}
