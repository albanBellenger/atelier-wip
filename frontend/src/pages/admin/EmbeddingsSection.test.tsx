import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { EmbeddingsSection } from './EmbeddingsSection'

describe('EmbeddingsSection', () => {
  it('loads library table and model registry from admin APIs', async () => {
    vi.spyOn(api, 'getAdminConsoleOverview').mockResolvedValue({
      studios: [],
      mtd_spend_total_usd: '0',
      active_builders_count: 0,
      embedding_collection_count: 42,
      recent_activity: [],
    })
    vi.spyOn(api, 'getAdminEmbeddingLibrary').mockResolvedValue([
      {
        studio_id: 'st1',
        studio_name: 'Studio One',
        artifact_count: 3,
        embedded_artifact_count: 2,
        artifact_vector_chunks: 10,
        section_vector_chunks: 20,
      },
    ])
    vi.spyOn(api, 'getAdminEmbeddingModels').mockResolvedValue([
      {
        id: 'rid',
        model_id: 'text-embedding-3-small',
        provider_name: 'openai',
        dim: 1536,
        cost_per_million_usd: '0.020000',
        region: 'US',
        default_role: 'default',
      },
    ])
    vi.spyOn(api, 'getAdminEmbeddingReindexPolicy').mockResolvedValue({
      id: 1,
      auto_reindex_trigger: 'on_document_change',
      debounce_seconds: 300,
      drift_threshold_pct: '5.00',
      retention_days: 90,
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <EmbeddingsSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Studio One')).toBeInTheDocument()
    expect(screen.getByText('text-embedding-3-small')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Artifact library \(by studio\)/i })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /open library/i })).toHaveAttribute(
        'href',
        '/studios/st1/artifact-library',
      )
    })
  })
})
