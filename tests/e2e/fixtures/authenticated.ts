import { expect, test as base } from '@playwright/test'
import { createAuthTestState, installAuthRoutes, type AuthTestState } from './auth-routes'
import { installEmployeeRoutes } from './employee-routes'

type AuthenticatedFixtures = {
  authState: AuthTestState
}

export const test = base.extend<AuthenticatedFixtures>({
  authState: async ({ browserName: _browserName }, use) => {
    await use(createAuthTestState())
  },
  page: async ({ page, authState }, use) => {
    await installAuthRoutes(page, authState)
    await installEmployeeRoutes(page)
    await use(page)
  },
})

export { expect }
export type { Page } from '@playwright/test'
