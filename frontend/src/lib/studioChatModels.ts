import type { StudioChatLlmModels } from '../services/api'

/** Stable order: effective → workspace default → policy/registry allow-list. */
export function buildChatModelOptions(d: StudioChatLlmModels): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (m: string | null | undefined): void => {
    const t = m?.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  push(d.effective_model)
  push(d.workspace_default_model)
  for (const a of d.allowed_models) push(a)
  return out
}

/** Tooltip copy for chat model picker (composer / copilot / rooms). */
export function studioChatModelPickerTitle(
  modelsQ: {
    isPending: boolean
    isError: boolean
    data: StudioChatLlmModels | undefined
  },
  contextHint?: string,
): string {
  if (modelsQ.isPending) return 'Loading models from workspace…'
  if (modelsQ.isError || !modelsQ.data) return 'Could not load workspace models.'
  const d = modelsQ.data
  const allowed = d.allowed_models.filter((m) => m.trim().length > 0)
  const eff = d.effective_model?.trim()
  const fallback = d.workspace_default_model?.trim()
  const rest =
    allowed.length > 0
      ? ` Allowed (connected providers): ${allowed.join(', ')}.`
      : ''
  const prefix =
    contextHint?.trim() ||
    'The selected model is used when you send a message in this studio.'
  if (eff || fallback) {
    return `${prefix}${rest}`
  }
  return allowed.length > 0
    ? `No routing override; connected models: ${allowed.join(', ')}.`
    : 'No connected LLM provider model is configured for chat in this studio.'
}
