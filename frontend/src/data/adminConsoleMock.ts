/** Demo content for the platform-admin console UI until backend APIs exist. */

export const ADMIN_USER = {
  name: 'Sasha Wren',
  email: 'sasha@atelier.dev',
  initials: 'SW',
  role: 'Platform admin',
} as const

export type StudioRow = {
  id: string
  name: string
  software: number
  members: number
  monthSpend: number
  budget: number
  created: string
}

export const STUDIOS: StudioRow[] = [
  {
    id: 's_north',
    name: 'Northwind Atelier',
    software: 4,
    members: 12,
    monthSpend: 412.18,
    budget: 600,
    created: 'Jan 14, 2026',
  },
  {
    id: 's_kraft',
    name: 'Kraftwerk Labs',
    software: 2,
    members: 7,
    monthSpend: 187.4,
    budget: 400,
    created: 'Feb 02, 2026',
  },
  {
    id: 's_mono',
    name: 'Monolith Group',
    software: 1,
    members: 3,
    monthSpend: 44.2,
    budget: 150,
    created: 'Apr 11, 2026',
  },
  {
    id: 's_helio',
    name: 'Helio Studio',
    software: 0,
    members: 2,
    monthSpend: 0,
    budget: 100,
    created: 'Mar 22, 2026',
  },
]

export type ProviderStatus = 'connected' | 'disabled' | 'needs-key'

export type DeploymentProviderRow = {
  id: string
  name: string
  models: string[]
  status: ProviderStatus
  default: boolean
  lastUsed: string
}

/** Registered LLM providers for this deployment (admin UI). */
export const DEPLOYMENT_PROVIDERS: DeploymentProviderRow[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-sonnet-4.5', 'claude-opus-4.1', 'claude-haiku-4.5'],
    status: 'connected',
    default: true,
    lastUsed: '2m ago',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4.1', 'gpt-4o', 'o3-mini'],
    status: 'connected',
    default: false,
    lastUsed: '14m ago',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    models: ['mistral-large-2', 'codestral-2'],
    status: 'connected',
    default: false,
    lastUsed: '1h ago',
  },
  {
    id: 'google',
    name: 'Google Vertex',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    status: 'disabled',
    default: false,
    lastUsed: '—',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    models: ['gpt-4.1 (azure)'],
    status: 'needs-key',
    default: false,
    lastUsed: '—',
  },
  {
    id: 'selfhost',
    name: 'Self-hosted vLLM',
    models: ['llama-3.3-70b', 'qwen-2.5-coder-32b'],
    status: 'connected',
    default: false,
    lastUsed: 'yesterday',
  },
]

export type ProviderId = (typeof DEPLOYMENT_PROVIDERS)[number]['id']

/** @deprecated Use DEPLOYMENT_PROVIDERS */
export const ORG_PROVIDERS = DEPLOYMENT_PROVIDERS

/** Which org-level providers are enabled per studio (demo). */
export const PROVIDER_BY_STUDIO_INIT: Record<
  string,
  Record<ProviderId, boolean>
> = {
  s_north: {
    anthropic: true,
    openai: true,
    mistral: true,
    google: false,
    azure: false,
    selfhost: true,
  },
  s_kraft: {
    anthropic: true,
    openai: true,
    mistral: false,
    google: false,
    azure: false,
    selfhost: false,
  },
  s_mono: {
    anthropic: true,
    openai: false,
    mistral: false,
    google: false,
    azure: false,
    selfhost: false,
  },
  s_helio: {
    anthropic: false,
    openai: false,
    mistral: false,
    google: false,
    azure: false,
    selfhost: false,
  },
}

export type BuilderRole = 'Builder' | 'Owner' | 'External'
export type BuilderStatus = 'active' | 'trial' | 'invited'

export type BuilderRow = {
  id: string
  name: string
  email: string
  studio: string
  role: BuilderRole
  monthSpend: number
  budget: number
  tokens: number
  joined: string
  status: BuilderStatus
  initials: string
}

export const BUILDERS: BuilderRow[] = [
  {
    id: 'u_mara',
    name: 'Mara Caron',
    email: 'mara@northwind.dev',
    studio: 's_north',
    role: 'Builder',
    monthSpend: 142.1,
    budget: 200,
    tokens: 1_148_220,
    joined: 'Jan 14, 2026',
    status: 'active',
    initials: 'MC',
  },
  {
    id: 'u_lola',
    name: 'Lola Okafor',
    email: 'lola@northwind.dev',
    studio: 's_north',
    role: 'Builder',
    monthSpend: 88.4,
    budget: 200,
    tokens: 742_011,
    joined: 'Jan 18, 2026',
    status: 'active',
    initials: 'LO',
  },
  {
    id: 'u_theo',
    name: 'Theo Park',
    email: 'theo@northwind.dev',
    studio: 's_north',
    role: 'Builder',
    monthSpend: 61.92,
    budget: 150,
    tokens: 511_338,
    joined: 'Feb 03, 2026',
    status: 'active',
    initials: 'TP',
  },
  {
    id: 'u_yusra',
    name: 'Yusra Khan',
    email: 'yusra@northwind.dev',
    studio: 's_north',
    role: 'Builder',
    monthSpend: 44.1,
    budget: 150,
    tokens: 388_290,
    joined: 'Feb 11, 2026',
    status: 'active',
    initials: 'YK',
  },
  {
    id: 'u_ari',
    name: 'Ari Berger',
    email: 'ari@kraftwerk.io',
    studio: 's_kraft',
    role: 'Owner',
    monthSpend: 92.0,
    budget: 250,
    tokens: 814_002,
    joined: 'Feb 02, 2026',
    status: 'active',
    initials: 'AB',
  },
  {
    id: 'u_jin',
    name: 'Jin Watanabe',
    email: 'jin@kraftwerk.io',
    studio: 's_kraft',
    role: 'Builder',
    monthSpend: 44.4,
    budget: 200,
    tokens: 401_109,
    joined: 'Feb 08, 2026',
    status: 'active',
    initials: 'JW',
  },
  {
    id: 'u_ren',
    name: 'Ren Diaz',
    email: 'ren@monolith.co',
    studio: 's_mono',
    role: 'Owner',
    monthSpend: 31.1,
    budget: 150,
    tokens: 244_500,
    joined: 'Apr 11, 2026',
    status: 'active',
    initials: 'RD',
  },
  {
    id: 'u_ext',
    name: 'Q. Ito (ext)',
    email: 'q@external.dev',
    studio: 's_kraft',
    role: 'External',
    monthSpend: 8.1,
    budget: 50,
    tokens: 62_410,
    joined: 'Apr 22, 2026',
    status: 'active',
    initials: 'QI',
  },
  {
    id: 'u_inv',
    name: '—',
    email: 'invitee@northwind.dev',
    studio: 's_north',
    role: 'Builder',
    monthSpend: 0,
    budget: 100,
    tokens: 0,
    joined: '—',
    status: 'invited',
    initials: '··',
  },
]

export type EmbedCollectionStatus = 'live' | 'stale' | 'indexing'

export type EmbedCollectionRow = {
  id: string
  studio: string
  name: string
  model: string
  dim: number
  vectors: number
  sizeMB: number
  freshness: string
  status: EmbedCollectionStatus
  drift: string
}

export const EMBED_COLLECTIONS: EmbedCollectionRow[] = [
  {
    id: 'ec_portal',
    studio: 's_north',
    name: 'Customer Portal · spec',
    model: 'voyage-3-large',
    dim: 1024,
    vectors: 82_410,
    sizeMB: 612,
    freshness: '5m ago',
    status: 'live',
    drift: '0.3%',
  },
  {
    id: 'ec_inv',
    studio: 's_north',
    name: 'Inventory API · spec',
    model: 'voyage-3-large',
    dim: 1024,
    vectors: 18_220,
    sizeMB: 138,
    freshness: '2h ago',
    status: 'live',
    drift: '0.0%',
  },
  {
    id: 'ec_design',
    studio: 's_north',
    name: 'Brand & design assets',
    model: 'openai-text-embed-3',
    dim: 1536,
    vectors: 4_188,
    sizeMB: 44,
    freshness: '1d ago',
    status: 'live',
    drift: '—',
  },
  {
    id: 'ec_voice',
    studio: 's_kraft',
    name: 'Voice Agent transcripts',
    model: 'voyage-multimodal-3',
    dim: 1024,
    vectors: 142_009,
    sizeMB: 1240,
    freshness: '12m ago',
    status: 'live',
    drift: '1.1%',
  },
  {
    id: 'ec_legacy',
    studio: 's_kraft',
    name: 'Legacy SF community export',
    model: 'voyage-3-large',
    dim: 1024,
    vectors: 61_400,
    sizeMB: 488,
    freshness: '3w ago',
    status: 'stale',
    drift: '8.4%',
  },
  {
    id: 'ec_mono',
    studio: 's_mono',
    name: 'Pilot · onboarding corpus',
    model: 'openai-text-embed-3',
    dim: 1536,
    vectors: 820,
    sizeMB: 9,
    freshness: '—',
    status: 'indexing',
    drift: '—',
  },
]

export type EmbedModelRow = {
  id: string
  provider: string
  dim: number
  costPerM: number
  region: string
}

export const EMBED_MODELS: EmbedModelRow[] = [
  {
    id: 'voyage-3-large',
    provider: 'Voyage',
    dim: 1024,
    costPerM: 0.12,
    region: 'EU+US',
  },
  {
    id: 'openai-text-embed-3',
    provider: 'OpenAI',
    dim: 1536,
    costPerM: 0.13,
    region: 'US',
  },
  {
    id: 'voyage-multimodal-3',
    provider: 'Voyage',
    dim: 1024,
    costPerM: 0.18,
    region: 'EU+US',
  },
  {
    id: 'cohere-embed-v4',
    provider: 'Cohere',
    dim: 1024,
    costPerM: 0.1,
    region: 'US',
  },
]

export type AuditEntry = {
  who: string
  what: string
  target: string
  when: string
}

export const AUDIT_LOG: AuditEntry[] = [
  {
    who: 'S. Wren',
    what: 'enabled provider',
    target: 'Mistral · Kraftwerk Labs',
    when: '12m ago',
  },
  {
    who: 'S. Wren',
    what: 'raised budget',
    target: 'Northwind Atelier · $500 → $600',
    when: '1h ago',
  },
  {
    who: 'M. Caron',
    what: 'rotated key',
    target: 'Anthropic · Northwind Atelier',
    when: '3h ago',
  },
  {
    who: 'S. Wren',
    what: 'invited user',
    target: 'invitee@northwind.dev',
    when: 'yesterday',
  },
  {
    who: 'System',
    what: 'marked stale',
    target: 'Legacy SF community export',
    when: '2d ago',
  },
  {
    who: 'A. Berger',
    what: 'connected GitLab',
    target: 'Kraftwerk Labs',
    when: '5d ago',
  },
]

export const ADMIN_CONSOLE_MONTH_TOTAL = '643.78'

export const DEPLOYMENT_WIDE_HARD_CAP_USD = 2000

/** @deprecated */
export const ORG_WIDE_HARD_CAP_USD = DEPLOYMENT_WIDE_HARD_CAP_USD
