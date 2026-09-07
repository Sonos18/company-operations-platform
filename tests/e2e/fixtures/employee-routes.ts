import type { Page } from '@playwright/test'
import { CANONICAL_MOCK_EMPLOYEES } from '../../../app/repositories/mock/fixtures'
import { employeeListResponseSchema } from '../../../shared/schemas/employees'

const employeeDirectoryResponse = employeeListResponseSchema.parse({
  items: CANONICAL_MOCK_EMPLOYEES.map(employee => {
    const {
      tenantId: _tenantId,
      companyId: _companyId,
      managerEmployeeId: _managerEmployeeId,
      privateDetails: _privateDetails,
      ...directoryEmployee
    } = employee
    return directoryEmployee
  }),
  page: 1,
  pageSize: 100,
  total: CANONICAL_MOCK_EMPLOYEES.length,
})

export async function installEmployeeRoutes(page: Page): Promise<void> {
  await page.route(/\/api\/companies\/[^/]+\/employees(?:\?.*)?$/, async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== 'GET'
      || url.searchParams.get('page') !== '1'
      || url.searchParams.get('pageSize') !== '100') return route.fallback()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(employeeDirectoryResponse),
    })
  })
}
