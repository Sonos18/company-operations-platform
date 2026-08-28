export interface CompanySwitchActions {
  selectCompany(companyId: string): boolean
  clearRuntimeData(): void
  reloadNuxtApp(options: { path: '/projects', force: true }): void | Promise<void>
}

export async function switchCompanyAndReload(
  companyId: string,
  actions: CompanySwitchActions,
): Promise<boolean> {
  if (!actions.selectCompany(companyId)) return false

  actions.clearRuntimeData()
  await actions.reloadNuxtApp({ path: '/projects', force: true })
  return true
}
