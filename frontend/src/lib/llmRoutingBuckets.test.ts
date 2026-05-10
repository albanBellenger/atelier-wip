import { describe, expect, it } from 'vitest'

import type { AdminLlmRoutingBucketsResponse } from '../services/api'

import {
  ROUTING_AGENT_GROUP_OPTIONS,
  ROUTING_SORT_ORDER,
  routingBucketAgentsSummary,
  routingBucketTitle,
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
