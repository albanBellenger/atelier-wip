/** Values accepted by `PATCH /studios/:id/budget` and returned on overview rows. */
export type StudioBudgetOverageAction =
  | 'pause_generations'
  | 'allow_alert_studio_admin'
  | 'allow_alert_tool_admin'
  | 'allow_bill_org'
  | 'allow_with_warning'
  | 'throttle_requests'
  | 'read_only_llm'

export const STUDIO_BUDGET_OVERAGE_OPTIONS: {
  value: StudioBudgetOverageAction
  label: string
}[] = [
  { value: 'pause_generations', label: 'Pause generations (hard stop)' },
  { value: 'allow_alert_studio_admin', label: 'Allow + alert Studio Owners' },
  { value: 'allow_alert_tool_admin', label: 'Allow + alert platform admins' },
  { value: 'allow_bill_org', label: 'Allow + bill org (track overage)' },
  { value: 'allow_with_warning', label: 'Allow + in-app warning only' },
  { value: 'throttle_requests', label: 'Throttle request rate' },
  { value: 'read_only_llm', label: 'Read / classify only (no writes)' },
]
