/**
 * Platform routing buckets: maps token_usage.call_source → one of four DB use_case keys.
 * Must stay aligned with backend ``use_case_for_call_source`` in llm_policy_service.py.
 */
import { llmCallSourceLabel } from './llmCallSourceLabels'

export const ROUTING_SORT_ORDER = ['chat', 'code_gen', 'classification', 'embeddings'] as const

export type RoutingBucketKey = (typeof ROUTING_SORT_ORDER)[number]

/** call_source strings that resolve to each routing bucket (best-effort inventory). */
export const ROUTING_BUCKET_CALL_TYPES: Record<RoutingBucketKey, readonly string[]> = {
  chat: [
    'chat',
    'private_thread',
    'conflict',
    'graph',
    'section_improve',
    'citation_health',
    'builder_composer_hint',
    'rag_software_definition_summary',
    'thread_conflict_scan',
    'thread_patch_append',
    'thread_patch_replace',
    'thread_patch_edit',
  ],
  code_gen: ['work_order_gen', 'mcp', 'work_order', 'mcp_wo'],
  classification: ['drift', 'section_drift'],
  embeddings: ['embedding', 'aembedding'],
}

/** Short title for the bucket (UI). */
export const ROUTING_BUCKET_TITLE: Record<RoutingBucketKey, string> = {
  chat: 'Chat & general agents',
  code_gen: 'Code & work orders',
  classification: 'Classification & drift',
  embeddings: 'Embeddings',
}

export const ROUTING_AGENT_GROUP_OPTIONS: { value: RoutingBucketKey; label: string }[] =
  ROUTING_SORT_ORDER.map((value) => ({
    value,
    label: ROUTING_BUCKET_TITLE[value],
  }))

export function routingBucketTitle(useCase: string): string {
  if (useCase in ROUTING_BUCKET_TITLE) {
    return ROUTING_BUCKET_TITLE[useCase as RoutingBucketKey]
  }
  return useCase
}

/** Human-readable list of agents (call sources) in this bucket. */
export function routingBucketAgentsSummary(useCase: string): string {
  const key = useCase as RoutingBucketKey
  const types = ROUTING_BUCKET_CALL_TYPES[key]
  if (!types?.length) return ''
  return types.map((ct) => llmCallSourceLabel(ct)).join(' · ')
}
