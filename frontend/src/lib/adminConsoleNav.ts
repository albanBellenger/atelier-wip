/** Route segments under `/admin/console`. */
export type AdminConsoleSection =
  | 'overview'
  | 'studios'
  | 'llm'
  | 'budgets'
  | 'embeddings'
  | 'codebase'
  | 'users'

export const ADMIN_CONSOLE_BASE = '/admin/console'

export function adminConsolePath(section: AdminConsoleSection): string {
  return `${ADMIN_CONSOLE_BASE}/${section}`
}
