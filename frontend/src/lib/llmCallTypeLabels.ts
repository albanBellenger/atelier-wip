/** Maps ``token_usage.call_type`` to short UI labels (best-effort; unknown keys pass through). */
export const LLM_CALL_TYPE_LABELS: Record<string, string> = {
  chat: 'Project chat',
  private_thread: 'Private thread',
  work_order_gen: 'Work order generation',
  section_improve: 'Section improve',
  conflict: 'Conflict analysis',
  drift: 'Drift detection',
  graph: 'Knowledge graph',
  rag_software_definition_summary: 'RAG (definition summary)',
  mcp: 'MCP',
  thread_conflict_scan: 'Thread: conflict scan',
  thread_patch_append: 'Thread: patch append',
  thread_patch_replace: 'Thread: patch replace',
  thread_patch_edit: 'Thread: patch edit',
}

export function llmCallTypeLabel(key: string): string {
  return LLM_CALL_TYPE_LABELS[key] ?? key
}

export const KNOWN_LLM_CALL_TYPES: string[] = [
  ...Object.keys(LLM_CALL_TYPE_LABELS),
  'thread',
  'thread_merge',
]
