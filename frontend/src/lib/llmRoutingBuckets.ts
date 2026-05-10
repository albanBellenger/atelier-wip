/**
 * Platform routing buckets: maps token_usage.call_source → DB use_case keys for admin UI copy.
 * Canonical call_source lists come from GET /admin/llm/routing/buckets (backend ``llm_routing_buckets``).
 */
import type { AdminLlmRoutingBucketsResponse, LlmRoutingRuleRow } from '../services/api'

import { llmCallSourceLabel } from './llmCallSourceLabels'

/** Fallback when GET /admin/llm/routing/buckets is not loaded; must match backend ``ROUTING_BUCKET_ORDER``. */
export const ROUTING_SORT_ORDER = ['chat', 'code_gen', 'classification', 'embeddings'] as const

export type RoutingBucketKey = (typeof ROUTING_SORT_ORDER)[number]

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

/** Prefer server ``bucket_order``; falls back to ``ROUTING_SORT_ORDER``. */
export function resolveRoutingBucketOrder(
  buckets: AdminLlmRoutingBucketsResponse | undefined,
): readonly string[] {
  const o = buckets?.bucket_order
  return o && o.length > 0 ? o : ROUTING_SORT_ORDER
}

export function routingAgentGroupOptionsFromBucketOrder(
  bucketOrder: readonly string[],
): { value: string; label: string }[] {
  return bucketOrder.map((value) => ({
    value,
    label: routingBucketTitle(value),
  }))
}

/** Stable admin UI ordering for routing rows; tie-break unknown ``use_case`` lexicographically. */
export function sortLlmRoutingRules(
  rules: LlmRoutingRuleRow[],
  bucketOrder: readonly string[] = ROUTING_SORT_ORDER,
): LlmRoutingRuleRow[] {
  const order = [...bucketOrder]
  return [...rules].sort((a, b) => {
    const ua = a.use_case ?? ''
    const ub = b.use_case ?? ''
    const ia = order.indexOf(ua)
    const ib = order.indexOf(ub)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return ua.localeCompare(ub)
  })
}

export function routingBucketTitle(useCase: string): string {
  if (useCase in ROUTING_BUCKET_TITLE) {
    return ROUTING_BUCKET_TITLE[useCase as RoutingBucketKey]
  }
  return useCase
}

/** Human-readable list of agents (call sources) in this bucket; empty if payload not loaded. */
export function routingBucketAgentsSummary(
  useCase: string,
  buckets: AdminLlmRoutingBucketsResponse | undefined,
): string {
  if (!buckets) return ''
  const row = buckets.buckets.find((b) => b.use_case === useCase)
  const types = row?.call_sources ?? []
  const base = types.map((ct) => llmCallSourceLabel(ct)).join(' · ')
  if (useCase === 'embeddings') {
    const parts = [base, buckets.embeddings_routing_note].filter((s) => s.length > 0)
    return parts.join(base ? '. ' : '')
  }
  if (useCase === 'chat') {
    const parts = [base, buckets.chat_default_note].filter((s) => s.length > 0)
    return parts.join(base ? '. ' : '')
  }
  return base
}
