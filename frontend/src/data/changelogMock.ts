export type ChangelogEntry = {
  version: string
  date: string
  items: string[]
}

/** Placeholder until changelog is served from the API or repo. */
export const CHANGELOG_MOCK_ENTRIES: ChangelogEntry[] = [
  {
    version: '0.1',
    date: '2026-05-01',
    items: [
      'Initial builder workspace: studio switcher, resume shortcuts, and attention feed.',
      'Software dashboard with activity timeline (mock-friendly).',
      'Private threads and section editor split layout.',
    ],
  },
  {
    version: '0.0.3',
    date: '2026-04-12',
    items: [
      'Cross-studio grants surfaced on the home dashboard.',
      'Notification bell with empty-state handling.',
    ],
  },
  {
    version: '0.0.2',
    date: '2026-03-20',
    items: [
      'Work orders list and artifact indexing stubs.',
      'RBAC-aligned routing for studio → software → project.',
    ],
  },
]
