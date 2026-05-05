import type {
  OeBlock,
  OeContextGroup,
  OeCritique,
  OeModel,
  OePendingDiff,
  OeSection,
  OeSlash,
  OeSource,
  OeThreadMsg,
} from './types'

export const ACCENTS: Record<string, string> = {
  violet: '#8b5cf6',
  indigo: '#6366f1',
  cyan: '#22d3ee',
  lime: '#a3e635',
  amber: '#f59e0b',
}

export const OE_SECTIONS: OeSection[] = [
  {
    id: 's1',
    num: 1,
    title: 'Golden copy',
    slug: 'golden-copy',
    status: 'ok',
    issueCount: 0,
  },
  {
    id: 's2',
    num: 2,
    title: 'Employee lifecycle',
    slug: 'employee-lifecycle',
    status: 'warn',
    issueCount: 2,
  },
  {
    id: 's3',
    num: 3,
    title: 'API contracts',
    slug: 'api-contracts',
    status: 'ok',
    issueCount: 0,
  },
]

export const OE_DOC: { blocks: OeBlock[] } = {
  blocks: [
    { id: 'b1', type: 'h2', text: 'Golden copy' },
    { id: 'b2', type: 'h3', text: 'Purpose' },
    {
      id: 'b3',
      type: 'p',
      text: 'Maintain the authoritative **Employee** master-data record.',
    },
    { id: 'b4', type: 'h3', text: 'In scope' },
    {
      id: 'b5',
      type: 'ul',
      items: ['Create / update / deactivate employees', 'SSOT for HRIS sync'],
    },
    {
      id: 'b6',
      type: 'ai-suggest',
      title: 'Clarify retention policy',
      originCmd: '/tighten',
      additions: [
        '+ Retention defaults to **7 years** after separation unless jurisdiction requires longer.',
      ],
      rationale: 'Adds an explicit retention anchor the copilot can cite.',
    },
  ],
}

export const OE_CONTEXT: OeContextGroup[] = [
  {
    id: 'g1',
    title: 'This section',
    items: [
      {
        id: 'c1',
        kind: 'Section',
        name: 'Golden copy (outline)',
        tokens: 1200,
        pinned: true,
      },
      {
        id: 'c2',
        kind: 'Work order',
        name: 'WO-441 HRIS field map',
        tokens: 890,
        auto: true,
      },
    ],
  },
  {
    id: 'g2',
    title: 'Related',
    items: [
      {
        id: 'c3',
        kind: 'Artifact',
        name: 'employee-schema.json',
        tokens: 420,
        drift: true,
      },
      {
        id: 'c4',
        kind: 'Spec',
        name: 'Privacy & retention',
        tokens: 610,
        conflict: true,
      },
    ],
  },
]

export const OE_THREAD: OeThreadMsg[] = [
  { id: 'm1', role: 'user', text: 'Summarize gaps for HRIS sync.' },
  {
    id: 'm2',
    role: 'model',
    text: 'Two gaps stand out: missing citation for the SSOT line, and drift on the schema artifact.',
    refs: [{ label: 'Diff · retention', diffId: 'd1' }],
  },
]

export const OE_CRITIQUE: OeCritique[] = [
  {
    id: 'cr1',
    kind: 'gap',
    severity: 'high',
    text: 'SSOT statement lacks a cited source in Sources.',
  },
  {
    id: 'cr2',
    kind: 'drift',
    severity: 'med',
    text: 'Artifact hash differs from last indexed revision.',
  },
]

export const OE_SLASH: OeSlash[] = [
  { cmd: 'tighten', desc: 'Tighten prose for spec tone' },
  { cmd: 'cite', desc: 'Insert citation placeholders' },
  { cmd: 'diff', desc: 'Open pending diffs' },
  { cmd: 'context', desc: 'Jump to context budget' },
]

export const OE_MODELS: OeModel[] = [
  { id: 'mo1', short: 'fast-8b' },
  { id: 'mo2', short: 'balanced-32b', tag: 'default' },
  { id: 'mo3', short: 'reason-70b' },
  { id: 'mo4', short: 'code-16b' },
]

export const OE_SOURCES: OeSource[] = [
  {
    id: 'so1',
    kind: 'URL',
    name: 'internal://policies/retention',
    ts: '2h ago',
  },
  {
    id: 'so2',
    kind: 'Artifact',
    name: 'employee-schema.json',
    ts: '1d ago',
    missing: true,
  },
]

export const OE_PENDING_DIFFS: OePendingDiff[] = [
  {
    id: 'd1',
    title: 'Retention clause',
    preview: '+ Retention defaults to **7 years**…',
    blockId: 'b6',
  },
]
