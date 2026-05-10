import { describe, expect, it } from 'vitest'

import type { AdminLlmRoutingBucketsResponse, LlmRoutingRuleRow } from '../services/api'

import {
  ROUTING_AGENT_GROUP_OPTIONS,
  ROUTING_SORT_ORDER,
  resolveRoutingBucketOrder,
  routingBucketAgentsSummary,
  routingBucketTitle,
  sortLlmRoutingRules,
} from './llmRoutingBuckets'

const BUCKETS_FIXTURE: AdminLlmRoutingBucketsResponse = {
  bucket_order: ['chat', 'code_gen', 'classification', 'embeddings'],
  buckets: [
    { use_case: 'chat', call_sources: ['chat'] },
    { use_case: 'code_gen', call_sources: ['work_order_gen'] },
    { use_case: 'classification', call_sources: ['drift'] },
    { use_case: 'embeddings', call_sources: ['embedding'] },
  ],
  embeddings_match: 'substring',
  embeddings_substring: 'embed',
  embeddings_routing_note: 'Substring rule note.',
  chat_default_note: 'Default chat note.',
}

describe('llmRoutingBuckets', () => {
  it('exposes four buckets in policy order', () => {
    expect(ROUTING_SORT_ORDER).toHaveLength(4)
    expect(ROUTING_AGENT_GROUP_OPTIONS.map((o) => o.value)).toEqual([
      'chat',
      'code_gen',
      'classification',
      'embeddings',
    ])
  })

  it('resolveRoutingBucketOrder falls back when bucket_order empty', () => {
    expect(resolveRoutingBucketOrder(undefined)).toEqual([...ROUTING_SORT_ORDER])
    expect(resolveRoutingBucketOrder({ ...BUCKETS_FIXTURE, bucket_order: [] })).toEqual([
      ...ROUTING_SORT_ORDER,
    ])
  })

  it('sortLlmRoutingRules orders by API bucket_order when it differs from fallback', () => {
    const rules: LlmRoutingRuleRow[] = [
      { use_case: 'embeddings', primary_model: 'm1', fallback_model: null },
      { use_case: 'chat', primary_model: 'm2', fallback_model: null },
    ]
    const reversed = ['embeddings', 'classification', 'code_gen', 'chat'] as const
    expect(sortLlmRoutingRules(rules, reversed).map((r) => r.use_case)).toEqual([
      'embeddings',
      'chat',
    ])
    expect(sortLlmRoutingRules(rules).map((r) => r.use_case)).toEqual(['chat', 'embeddings'])
  })

  it('maps titles and agent summaries for each bucket', () => {
    expect(routingBucketTitle('chat')).toBe('Chat & general agents')
    expect(routingBucketAgentsSummary('chat', BUCKETS_FIXTURE)).toContain('Project chat')
    expect(routingBucketAgentsSummary('code_gen', BUCKETS_FIXTURE)).toContain('Work order generation')
    expect(routingBucketAgentsSummary('classification', BUCKETS_FIXTURE)).toContain('Drift detection')
    expect(routingBucketAgentsSummary('embeddings', BUCKETS_FIXTURE)).toContain('embedding')
    expect(routingBucketAgentsSummary('embeddings', BUCKETS_FIXTURE)).toContain('Substring rule note')
    expect(routingBucketAgentsSummary('chat', BUCKETS_FIXTURE)).toContain('Default chat note')
  })

  it('returns empty summary when buckets payload is missing', () => {
    expect(routingBucketAgentsSummary('chat', undefined)).toBe('')
  })
})
