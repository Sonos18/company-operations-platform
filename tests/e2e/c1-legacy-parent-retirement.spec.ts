import { expect, test } from './fixtures/authenticated'
import { createCompany } from './fixtures/auth-routes'
import { projectCostDetailDraftSchema } from '../../shared/schemas/costs/project-costs'

const projectId = '10000000-0000-4000-8000-000000000050'
const parentId = '30000000-0000-4000-8000-000000000052'
const detailId = '30000000-0000-4000-8000-000000000088'

test('retired legacy tab opens ordinary detail drafts without reading parent drafts', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
  let parentReads = 0
  await page.route('**/api/companies/**/project-cost-drafts/metadata', route => route.fulfill({ json: {
    projects: [{ id: projectId, code: 'DA-C1-01', name: 'Project C1' }],
    categories: [{ categoryId: '20000000-0000-4000-8000-000000000051', code: 'vat_tu', name: 'Materials', isActive: true, draftEligible: true, postingStrategy: 'ordinary_detail' }],
  } }))
  await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts/operations`, route => route.fulfill({ json: [] }))
  await page.route(`**/api/companies/**/projects/${projectId}/project-cost-drafts/operations`, route => { parentReads++; return route.fulfill({ json: [] }) })

  await page.goto(`/cost-drafts?projectId=${projectId}&tab=legacy`)
  await expect(page.getByTestId('detail-drafts-empty')).toBeVisible()
  await expect(page.getByTestId('draft-management-create-detail')).toHaveAttribute('href', `/costs/${projectId}/entries/new`)
  await expect(page.getByTestId('tab-legacy-parents')).toHaveCount(0)
  await expect(page.getByTestId('draft-management-create')).toHaveCount(0)
  expect(parentReads).toBe(0)
})

test('old parent draft deep link explains retirement without reading its parent ID as a detail', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
  let parentReads = 0
  let detailReads = 0
  await page.route(`**/api/companies/**/project-costs/${parentId}/draft/operations`, route => { parentReads++; return route.fulfill({ status: 404 }) })
  await page.route(`**/api/companies/**/project-costs/${parentId}/draft`, route => { parentReads++; return route.fulfill({ status: 403 }) })
  await page.route(`**/api/companies/**/project-cost-details/${parentId}/draft/operations`, route => { detailReads++; return route.fulfill({ status: 404 }) })

  await page.goto(`/costs/${projectId}/drafts/${parentId}`)
  await expect(page.getByTestId('legacy-parent-draft-retired')).toBeVisible()
  await expect(page.getByTestId('retired-detail-drafts-link')).toHaveAttribute('href', `/cost-drafts?projectId=${projectId}`)
  await expect(page.getByTestId('draft-not-found')).toHaveCount(0)
  await expect(page.getByTestId('draft-permission-denied')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('legacy-parent-draft-retired')).toBeVisible()
  expect({ parentReads, detailReads }).toEqual({ parentReads: 0, detailReads: 0 })
})

test('prepare-only lists financial detail drafts without parent reads or create action', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.prepare'] })]
  const detail = projectCostDetailDraftSchema.parse({
    id: detailId, projectCostItemId: '90000000-0000-4000-8000-000000000001', projectId,
    categoryId: '20000000-0000-4000-8000-000000000051', lineNo: 1,
    description: 'Prepared detail', relevantDate: null, reference: null, note: null,
    publicationState: 'draft', version: 1, createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z',
    amount: '10.0000', quantity: null, unitCode: null, unitPrice: null,
    retentionKind: null, retentionRateBps: null, retentionAmount: null, sourceFigureIds: [],
    publishReadiness: { ready: true, blockingCodes: [] },
  })
  let parentReads = 0
  await page.route('**/api/companies/**/project-cost-drafts/metadata', route => route.fulfill({ json: {
    projects: [{ id: projectId, code: 'DA-C1-01', name: 'Project C1' }],
    categories: [{ categoryId: detail.categoryId, code: 'vat_tu', name: 'Materials', isActive: true, draftEligible: true, postingStrategy: 'ordinary_detail' }],
  } }))
  await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, route => route.fulfill({ json: [detail] }))
  await page.route(`**/api/companies/**/projects/${projectId}/project-cost-drafts`, route => { parentReads++; return route.fulfill({ json: [] }) })

  await page.goto(`/cost-drafts?projectId=${projectId}`)
  await expect(page.getByTestId(`detail-draft-row-${detailId}`)).toContainText('Prepared detail')
  await expect(page.getByTestId('detail-draft-amount')).toBeVisible()
  await expect(page.getByTestId('draft-management-create-detail')).toHaveCount(0)
  await expect(page.getByTestId(`detail-draft-open-${detailId}`)).toHaveAttribute('href', `/costs/${projectId}/entries/${detailId}`)
  expect(parentReads).toBe(0)
})

test('published read access alone cannot enter draft management or the retired parent route', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.read'] })]
  await page.goto('/cost-drafts')
  await expect(page).toHaveURL(/\/forbidden$/)
  await page.goto(`/costs/${projectId}/drafts/${parentId}`)
  await expect(page).toHaveURL(/\/forbidden$/)
})
