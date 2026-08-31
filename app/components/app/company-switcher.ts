import { switchCompanyAndReload, type CompanySwitchActions } from './shell-actions'

export function resetCompanySwitcherValue(
  control: Pick<HTMLSelectElement, 'value'>,
  activeCompanyId: string,
): void {
  control.value = activeCompanyId
}

export async function selectCompanyWithUnsavedChanges(
  companyId: string,
  options: {
    activeCompanyId: string
    control: Pick<HTMLSelectElement, 'value'>
    confirmLeave(): boolean
    clear(): void
    actions: CompanySwitchActions
  },
): Promise<boolean> {
  if (!options.confirmLeave()) {
    resetCompanySwitcherValue(options.control, options.activeCompanyId)
    return false
  }

  options.clear()
  return switchCompanyAndReload(companyId, options.actions)
}
