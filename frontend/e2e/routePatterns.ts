/**
 * Pathname-based Playwright route matchers. Prefer these over double-star URL
 * globs so requests proxied through Vite still match reliably.
 */
export const ROUTE = {
  adminConsoleOverview: /\/admin\/console\/overview(\?|$)/,
  /** GET /admin/studios/{id} (detail), not the list GET /admin/studios */
  adminStudioDetail: /\/admin\/studios\/[^/]+(\?|$)/,
  softwareCodebaseSnapshots: /\/software\/[^/]+\/codebase\/snapshots(\?|$)/,
  softwareDocsProposeOutline: /\/software\/[^/]+\/docs\/propose-outline(\?|$)/,
  softwareDocSectionProposeDraft: /\/software\/[^/]+\/docs\/[^/]+\/propose-draft(\?|$)/,
} as const
