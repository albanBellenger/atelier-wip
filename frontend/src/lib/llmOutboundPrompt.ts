/** OpenAI-style message snapshot when ATELIER_LOG_LLM_PROMPTS is enabled (dev / PII). */
export type LlmOutboundPromptMessage = {
  role: string
  content: string
  /** LiteLLM token_counter delta for this message when backend counted successfully. */
  tokens?: number
}

export function sumOutboundPromptTokens(
  messages: LlmOutboundPromptMessage[] | undefined,
): number | null {
  if (!messages?.length) {
    return null
  }
  let sum = 0
  let any = false
  for (const m of messages) {
    if (typeof m.tokens === 'number' && Number.isFinite(m.tokens)) {
      sum += m.tokens
      any = true
    }
  }
  return any ? sum : null
}

/** Compact display for token totals (overlay header + thread toolbars). */
export function formatOutboundPromptTokenCount(n: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(n)
}
