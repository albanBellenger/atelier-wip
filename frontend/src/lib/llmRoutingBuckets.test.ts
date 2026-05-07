import { describe, expect, it } from 'vitest'

import {
  ROUTING_AGENT_GROUP_OPTIONS,
  ROUTING_BUCKET_CALL_TYPES,
  ROUTING_SORT_ORDER,
  routingBucketAgentsSummary,
  routingBucketTitle,
} from './llmRoutingBuckets'

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
    expect(routingBucketAgentsSummary('chat')).toContain('Project chat')
    expect(routingBucketAgentsSummary('code_gen')).toContain('Work order generation')
    expect(routingBucketAgentsSummary('classification')).toContain('Drift detection')
    expect(ROUTING_BUCKET_CALL_TYPES.embeddings).toContain('embedding')
  })
})
