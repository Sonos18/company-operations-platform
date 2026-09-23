import { expect, test } from './fixtures/authenticated'
import type { Page } from '@playwright/test'
import { createCompany } from './fixtures/auth-routes'
import {
  projectCostDraftManagementMetadataSchema,
  projectCostDraftSchema,
  projectCostOperationalDraftSchema,
} from '../../shared/schemas/costs/project-costs'

const projectId = '10000000-0000-4000-8000-000000000050'
const draftId = '30000000-0000-4000-8000-000000000052'
const categoryId = '20000000-0000-4000-8000-000000000051'
const metadata = projectCostDraftManagementMetadataSchema.parse({
  projects: [{ id: projectId, code: 'DA-C1-01', name: 'Dự án C1' }],
  categories: [
    { categoryId, code: 'vat_tu', name: 'Vật tư', isActive: true, draftEligible: true },
    { categoryId: '20000000-0000-4000-8000-000000000099', code: 'subcontract_labor', name: 'Thầu phụ', isActive: true, draftEligible: false },
  ],
})
const operationalDraft = projectCostOperationalDraftSchema.parse({
  id: draftId, projectId, description: 'Draft operational', costCategoryId: categoryId, businessReference: null,
  partyId: null, engagementId: null, componentId: null, relevantDate: null, workStatus: 'unknown',
  publicationState: 'draft', version: 1, createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z',
})
const financialDraft = projectCostDraftSchema.parse({
  ...operationalDraft, amount: '10.0000', currencyCode: 'VND', details: [], sourceFigureIds: [],
  publishReadiness: { ready: false, blockingCodes: ['FINANCIAL_DETAILS_REQUIRED'] },
})

async function mockDraftManagement(page: Page) {
  await page.route('**/api/companies/**/project-cost-drafts/metadata', route => route.fulfill({ json: metadata }))
  await page.route(`**/api/companies/**/projects/${projectId}/project-cost-drafts/operations`, route => route.fulfill({ json: [operationalDraft] }))
  await page.route(`**/api/companies/**/projects/${projectId}/project-cost-drafts`, route => route.fulfill({ json: [financialDraft] }))
  await page.route(`**/api/companies/**/project-costs/${draftId}/draft/operations`, route => route.fulfill({ json: operationalDraft }))
  await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => route.fulfill({ json: financialDraft }))
  await page.route(`**/api/companies/**/project-costs/${draftId}/evidence`, route => route.fulfill({ json: [] }))
}

test('cost.manage discovers projects, creates drafts, and opens operational work without cost.read', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
  await mockDraftManagement(page)

  await page.goto('/cost-drafts')
  await expect(page.getByTestId('draft-management-page')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bản nháp chi phí' })).toBeVisible()
  await expect(page.getByTestId('draft-project-select')).toHaveValue(projectId)
  await expect(page.getByTestId('draft-management-create')).toBeVisible()
  await expect(page.getByTestId(`draft-management-row-${draftId}`)).toContainText('Draft operational')
  await expect(page.getByTestId('draft-management-amount')).toHaveCount(0)

  await page.getByTestId(`draft-management-open-${draftId}`).click()
  await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/drafts/${draftId}$`))
  await expect(page.getByTestId('draft-op-save-btn')).toBeVisible()
  await expect(page.getByTestId('financial-detail-editor')).toHaveCount(0)
  await page.goto('/costs')
  await expect(page).toHaveURL(/\/forbidden$/)
})

test('cost.prepare gets the financial draft projection without create or operational mutation', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.prepare'] })]
  await mockDraftManagement(page)

  await page.goto('/cost-drafts')
  await expect(page.getByTestId('draft-management-page')).toBeVisible()
  await expect(page.getByTestId('draft-management-create')).toHaveCount(0)
  await expect(page.getByTestId('draft-management-amount')).toContainText('10.0000')

  await page.getByTestId(`draft-management-open-${draftId}`).click()
  await expect(page.getByTestId('draft-operations-readonly-notice')).toBeVisible()
  await expect(page.getByTestId('save-financials-btn')).toBeVisible()
  await page.goto('/costs')
  await expect(page).toHaveURL(/\/forbidden$/)
})

test('cost.read keeps published finance access without draft-management actions', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.read'] })]
  await page.route('**/api/companies/**/project-finances*', route => route.fulfill({ json: { schemaVersion: 1, projects: [], nextCursor: null } }))

  await page.goto('/costs')
  await expect(page.getByTestId('project-costs-overview')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bản nháp chi phí' })).toHaveCount(0)
  await page.goto('/cost-drafts')
  await expect(page).toHaveURL(/\/forbidden$/)
})

test('actor without manage or prepare cannot navigate to draft management', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.source.read'] })]
  await page.goto('/cost-drafts')
  await expect(page).toHaveURL(/\/forbidden$/)
  await expect(page.getByRole('link', { name: 'Bản nháp chi phí' })).toHaveCount(0)
})

test('late draft response from project A cannot overwrite the selected project B', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
  const projectB = '10000000-0000-4000-8000-000000000060'
  const draftB = '30000000-0000-4000-8000-000000000062'
  let releaseProjectA!: () => void
  const projectAGate = new Promise<void>(resolve => { releaseProjectA = resolve })
  await page.route('**/api/companies/**/project-cost-drafts/metadata', route => route.fulfill({ json: { ...metadata, projects: [...metadata.projects, { id: projectB, code: 'DA-C1-02', name: 'Dự án B' }] } }))
  await page.route(`**/api/companies/**/projects/${projectId}/project-cost-drafts/operations`, async (route) => {
    await projectAGate
    await route.fulfill({ json: [operationalDraft] })
  })
  await page.route(`**/api/companies/**/projects/${projectB}/project-cost-drafts/operations`, route => route.fulfill({ json: [{ ...operationalDraft, id: draftB, projectId: projectB, description: 'Draft project B' }] }))

  await page.goto('/cost-drafts')
  await expect(page.getByTestId('draft-project-select')).toHaveValue(projectId)
  await page.getByTestId('draft-project-select').selectOption(projectB)
  await expect(page.getByTestId(`draft-management-row-${draftB}`)).toContainText('Draft project B')
  releaseProjectA()
  await page.waitForTimeout(100)

  await expect(page.getByTestId(`draft-management-row-${draftB}`)).toContainText('Draft project B')
  await expect(page.getByTestId(`draft-management-row-${draftId}`)).toHaveCount(0)
  await expect(page.getByTestId(`draft-management-open-${draftB}`)).toHaveAttribute('href', `/costs/${projectB}/drafts/${draftB}`)
})

test('query-only project navigation resynchronizes the draft selection and rows', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
  const projectB = '10000000-0000-4000-8000-000000000060'
  const draftB = '30000000-0000-4000-8000-000000000062'
  await page.route('**/api/companies/**/project-cost-drafts/metadata', route => route.fulfill({ json: { ...metadata, projects: [...metadata.projects, { id: projectB, code: 'DA-C1-02', name: 'Dự án B' }] } }))
  await page.route(`**/api/companies/**/projects/${projectId}/project-cost-drafts/operations`, route => route.fulfill({ json: [operationalDraft] }))
  await page.route(`**/api/companies/**/projects/${projectB}/project-cost-drafts/operations`, route => route.fulfill({ json: [{ ...operationalDraft, id: draftB, projectId: projectB, description: 'Draft project B' }] }))

  await page.goto(`/cost-drafts?projectId=${projectId}`)
  await expect(page.getByTestId(`draft-management-row-${draftId}`)).toBeVisible()
  await page.evaluate(async (path) => {
    const root = document.querySelector('#__nuxt') as HTMLElement & { __vue_app__?: { config: { globalProperties: { $router?: { push(target: string): Promise<unknown> } } } } }
    await root.__vue_app__?.config.globalProperties.$router?.push(path)
  }, `/cost-drafts?projectId=${projectB}`)

  await expect(page.getByTestId('draft-project-select')).toHaveValue(projectB)
  await expect(page.getByTestId(`draft-management-row-${draftB}`)).toContainText('Draft project B')
  await expect(page.getByTestId(`draft-management-row-${draftId}`)).toHaveCount(0)
})
