import { expect, test } from './fixtures/authenticated'
import { createCompany } from './fixtures/auth-routes'
import {
  financeItemDetailsSchema,
  financeOverviewSchema,
  financeSubcontractDetailSchema,
  financeSubcontractorDetailSchema,
  financeSubcontractorListSchema,
} from '../../shared/schemas/costs/project-finance'
import {
  recordSubcontractPaymentResultSchema,
  voidSubcontractPaymentResultSchema,
} from '../../shared/schemas/costs/project-finance-writes'
import {
  costCommandAckSchema,
  prepareProjectCostFinancialsInputSchema,
  projectCostBreakdownSchema,
  projectCostDraftSchema,
} from '../../shared/schemas/costs/project-costs'
import {
  costEvidenceFinalizedSchema,
  costEvidenceLinkResultSchema,
  costEvidenceMetadataSchema,
  costEvidenceUploadIntentSchema,
} from '../../shared/schemas/costs/cost-evidence'
import { sumFinanceMoney } from '../../shared/utils/project-finance-money'

const tenantId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000002'
const projectId = '10000000-0000-4000-8000-000000000050'
const materialCategoryId = '20000000-0000-4000-8000-000000000051'
const subcontractCategoryId = '20000000-0000-4000-8000-000000000099'
const publishedItemId = '90000000-0000-4000-8000-000000000001'
const draftId = '30000000-0000-4000-8000-000000000052'
const partyId = '40000000-0000-4000-8000-000000000053'
const subcontractId = '50000000-0000-4000-8000-000000000054'
const paymentId1 = '60000000-0000-4000-8000-000000000055'
const paymentId2 = '60000000-0000-4000-8000-000000000056'
const evidenceId = '70000000-0000-4000-8000-000000000057'
const linkId1 = '80000000-0000-4000-8000-000000000058'
const mockSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const mockObjectPath = `${tenantId}/${companyId}/${projectId}/${evidenceId}`

function draftFixture(id: string, targetProjectId: string, description: string) {
  return projectCostDraftSchema.parse({
    id,
    projectId: targetProjectId,
    description,
    costCategoryId: materialCategoryId,
    businessReference: null,
    partyId: null,
    engagementId: null,
    componentId: null,
    relevantDate: '2026-09-22',
    workStatus: 'in_progress',
    amount: '10000000.0000',
    currencyCode: 'VND',
    publicationState: 'draft',
    version: 1,
    details: [],
    sourceFigureIds: [],
    publishReadiness: { ready: false, blockingCodes: ['FINANCIAL_DETAILS_REQUIRED'] },
    createdAt: '2026-09-22T08:00:00.000Z',
    updatedAt: '2026-09-22T08:00:00.000Z',
  })
}

const mockProjectOverview = financeOverviewSchema.parse({
  schemaVersion: 1 as const,
  project: {
    projectId,
    projectCode: 'DA-C1-01',
    projectName: 'Dự án Thi công Trung tâm Thương mại',
    currencyCode: 'VND',
    moneyScale: 0,
    timeZone: 'Asia/Ho_Chi_Minh',
    operationalState: 'active' as const,
  },
  summary: {
    budget: { state: 'recorded' as const, amount: '4500000000.0000', recordedCount: 1 },
    ownerAdvances: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
    cost: { state: 'recorded' as const, amount: '1200000000.0000', recordedCount: 6, knownSubtotal: '1200000000.0000' },
    warrantyRetention: { state: 'recorded' as const, amount: '22500000.0000', recordedCount: 1 },
    reference: { kind: 'approved_budget' as const, amount: '4500000000.0000' },
    margin: { state: 'unavailable' as const, amount: null, reasons: ['BUDGET_BASIS_UNCONFIRMED' as const] },
    management: {
      receipts: { state: 'not_recorded' as const, amount: null, recordedCount: 0, origin: 'none' as const, quality: 'not_recorded' as const, coverage: 'none' as const, sourceReferences: [] },
      reference: { kind: 'approved_budget' as const, amount: '4500000000.0000', basis: 'unconfirmed_cost_budget' as const },
      result: { state: 'unavailable' as const, amount: null, basis: 'approved_budget_unconfirmed' as const, components: { receipts: null, cost: '1200000000.0000', independentlyHeldRetention: null }, reasons: ['BUDGET_BASIS_UNCONFIRMED' as const] },
      headline: { kind: 'unavailable' as const, amount: null, basis: 'none' as const },
    },
    issues: [],
  },
  categories: [
    {
      categoryId: materialCategoryId,
      code: 'vat_tu',
      name: 'Vật tư thi công',
      displayOrder: 1,
      isActive: true,
      itemId: '90000000-0000-4000-8000-000000000001',
      description: 'Vật tư thi công phần thô',
      businessReference: 'REF-VT-01',
      cost: { state: 'recorded' as const, amount: '750000000.0000', recordedCount: 5 },
      detailCount: 5,
      latestRecordedDate: '2026-09-20',
      latestRecordedDateSource: 'business_date' as const,
      warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    },
    {
      categoryId: subcontractCategoryId,
      code: 'subcontract_labor',
      name: 'Nhân công thầu phụ',
      displayOrder: 2,
      isActive: true,
      itemId: null,
      description: 'Nhân công kết cấu thép',
      businessReference: 'REF-KC-01',
      cost: { state: 'needs_reconciliation' as const, amount: null, recordedCount: 1 },
      detailCount: 0,
      latestRecordedDate: '2026-09-15',
      latestRecordedDateSource: 'created_at' as const,
      warrantyRetention: { state: 'recorded' as const, amount: '22500000.0000', recordedCount: 1 },
      recordedPaymentsTotal: '450000000.0000',
      recordedPaymentCount: 1,
      legacyReconciliationRequired: true,
    },
  ],
})

const mockSubcontractorList = financeSubcontractorListSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectOverview.project,
  coverage: 'needs_reconciliation' as const,
  parties: [
    {
      party: {
        partyId,
        code: 'CT-THEP',
        displayName: 'Nhà thầu Kết cấu thép',
        partyKind: 'organization' as const,
      },
      contracts: [
        {
          id: subcontractId,
          code: 'HD-KC-01',
          contractNo: 'KC-2026-01',
          contractName: 'Hợp đồng kết cấu thép',
          contractDate: '2026-08-01',
          contractValue: '500000000.0000',
          currencyCode: 'VND',
          defaultRetentionRateBps: 500,
          isActive: true,
          version: 1,
          paidTotal: '50000000.0000',
          paidCount: 1,
          recordedRetentionTotal: '2500000.0000',
          recordedRetentionRowCount: 1,
        },
      ],
    },
  ],
})

test.describe('C1 Accounting Write Browser Acceptance Suite (F-UI5)', () => {
  test('Flow A — Draft / publish: creates draft, edits operational data, prepares financials, uploads evidence and publishes', async ({ page }) => {
    let currentDraftVersion = 1
    let currentDescription = 'Cung cấp thép móng D20'
    let intentCount = 0
    let storageUploadCount = 0
    let finalizeCount = 0
    const linkKeys: Array<string | null> = []

    // Mock project finance overview
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => {
      route.fulfill({ json: mockProjectOverview })
    })

    // Mock draft list on project overview page
    await page.route(`**/api/companies/**/projects/${projectId}/project-cost-drafts`, route => {
      route.fulfill({ json: [] })
    })

    // Mock create draft: POST /projects/:projectId/project-costs
    await page.route(`**/api/companies/**/projects/${projectId}/project-costs`, route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          json: {
            id: draftId,
            version: currentDraftVersion,
            publicationState: 'draft',
            replayed: false,
          },
        })
      }
      else {
        route.continue()
      }
    })

    // Mock get draft: GET /project-costs/:draftId/draft
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => {
      route.fulfill({
        json: projectCostDraftSchema.parse({
          id: draftId,
          projectId,
          description: currentDescription,
          costCategoryId: materialCategoryId,
          businessReference: 'HD-THEP-01',
          partyId: null,
          engagementId: null,
          componentId: null,
          relevantDate: '2026-09-22',
          workStatus: 'in_progress',
          amount: '85000000.0000',
          currencyCode: 'VND',
          publicationState: 'draft',
          version: currentDraftVersion,
          details: [
            {
              id: '80000000-0000-4000-8000-000000000001',
              projectCostItemId: draftId,
              lineNo: 1,
              detailKind: 'line_item',
              description: 'Thép Hòa Phát phi 20',
              quantity: '5.0000',
              unitCode: 'tấn',
              unitPrice: '17000000.0000',
              amount: '85000000.0000',
              retentionKind: null,
              retentionRateBps: null,
              retentionAmount: null,
              relevantDate: '2026-09-22',
              reference: 'HD-01',
              note: null,
              version: currentDraftVersion,
              createdAt: '2026-09-22T08:00:00.000Z',
              updatedAt: '2026-09-22T08:00:00.000Z',
            },
          ],
          sourceFigureIds: [],
          publishReadiness: {
            ready: true,
            blockingCodes: [],
          },
          createdAt: '2026-09-22T08:00:00.000Z',
          updatedAt: '2026-09-22T08:00:00.000Z',
        }),
      })
    })

    // Mock update operational draft: PATCH /project-costs/:draftId
    await page.route(`**/api/companies/**/project-costs/${draftId}`, route => {
      if (route.request().method() === 'PATCH') {
        currentDraftVersion = 2
        currentDescription = 'Cung cấp thép móng D20 đã hiệu chỉnh vận hành'
        route.fulfill({
          json: {
            id: draftId,
            version: currentDraftVersion,
            publicationState: 'draft',
            replayed: false,
          },
        })
      }
      else {
        route.continue()
      }
    })

    // Mock prepare financials: PUT /project-costs/:draftId/financials
    await page.route(`**/api/companies/**/project-costs/${draftId}/financials`, route => {
      currentDraftVersion = 3
      route.fulfill({
        json: {
          id: draftId,
          version: currentDraftVersion,
          publicationState: 'draft',
          amount: '85000000.0000',
          detailCount: 1,
          publishReadiness: {
            ready: true,
            blockingCodes: [],
          },
          replayed: false,
        },
      })
    })

    // Mock evidence list: GET /project-costs/:draftId/evidence
    const evidenceList: ReturnType<typeof costEvidenceMetadataSchema.parse>[] = []
    await page.route(`**/api/companies/**/project-costs/${draftId}/evidence`, async route => {
      if (route.request().method() === 'GET') {
        route.fulfill({ json: evidenceList })
      }
      else if (route.request().method() === 'POST') {
        linkKeys.push(await route.request().headerValue('idempotency-key'))
        if (linkKeys.length === 1) {
          await route.abort('connectionfailed')
          return
        }
        // Link evidence
        const newEvidence = costEvidenceMetadataSchema.parse({
          linkId: linkId1,
          evidenceFileId: evidenceId,
          evidenceKind: 'invoice',
          accountingSourceVersionId: null,
          originalFilename: 'hoa_don_vat_tu.pdf',
          sizeBytes: 1024,
          mimeType: 'application/pdf',
          sha256: mockSha256,
          finalizedAt: new Date().toISOString(),
        })
        evidenceList.push(newEvidence)
        route.fulfill({
          json: costEvidenceLinkResultSchema.parse({
            linkId: linkId1,
            costId: draftId,
            evidenceFileId: evidenceId,
            evidenceKind: 'invoice',
            replayed: false,
          }),
        })
      }
      else {
        route.continue()
      }
    })

    // Mock upload intent: POST /projects/:projectId/evidence/upload-intents
    await page.route(`**/api/companies/**/projects/${projectId}/evidence/upload-intents`, route => {
      intentCount += 1
      route.fulfill({
        status: 201,
        json: costEvidenceUploadIntentSchema.parse({
          evidenceFileId: evidenceId,
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: mockObjectPath,
          expiresAt: new Date(Date.now() + 120000).toISOString(),
          replayed: false,
        }),
      })
    })

    // Mock Supabase storage upload
    await page.route('**/storage/v1/object/**', route => {
      storageUploadCount += 1
      route.fulfill({ status: 200, json: { Key: `c1-accounting-evidence/${mockObjectPath}` } })
    })

    // Mock finalize evidence: POST /evidence-files/:evidenceFileId/finalize
    await page.route(`**/api/companies/**/evidence-files/${evidenceId}/finalize`, route => {
      finalizeCount += 1
      route.fulfill({
        json: costEvidenceFinalizedSchema.parse({
          id: evidenceId,
          status: 'finalized',
          originalFilename: 'hoa_don_vat_tu.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256: mockSha256,
          version: 1,
          finalizedAt: new Date().toISOString(),
          replayed: false,
        }),
      })
    })

    // Mock publish: POST /project-costs/:draftId/publish
    await page.route(`**/api/companies/**/project-costs/${draftId}/publish`, route => {
      route.fulfill({
        json: {
          id: draftId,
          version: 4,
          publicationState: 'published',
          replayed: false,
        },
      })
    })

    // 1. Open project costs page
    await page.goto(`/costs/${projectId}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dự án Thi công Trung tâm Thương mại')

    // 2. Click create draft
    const createDraftBtn = page.getByTestId('header-create-draft-btn')
    await expect(createDraftBtn).toBeVisible()
    await createDraftBtn.click()

    // 3. Fill draft creation modal
    await page.getByTestId('draft-create-description').fill('Cung cấp thép móng D20')
    await page.getByTestId('draft-create-category').selectOption(materialCategoryId)
    await page.getByTestId('draft-create-submit').click()

    // 4. Navigates to draft workbench
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/drafts/${draftId}`))
    await expect(page.getByTestId('draft-workbench-page')).toBeVisible()
    await expect(page.getByTestId('draft-title')).toContainText('Cung cấp thép móng D20')

    // 5. Operational edit
    await page.getByTestId('draft-op-description').fill('Cung cấp thép móng D20 đã hiệu chỉnh vận hành')
    const operationalSave = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes(`/project-costs/${draftId}`))
    await page.getByTestId('draft-op-save-btn').click()
    await operationalSave
    await expect(page.getByTestId('draft-title')).toHaveText('Cung cấp thép móng D20 đã hiệu chỉnh vận hành')

    // 6. Financial preparation: save financials
    const saveFinancialsBtn = page.getByTestId('save-financials-btn')
    await expect(saveFinancialsBtn).toBeVisible()
    const financialSave = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/project-costs/${draftId}/financials`))
    await saveFinancialsBtn.click()
    await financialSave
    await expect(page.getByTestId('draft-title')).toHaveText('Cung cấp thép móng D20 đã hiệu chỉnh vận hành')

    // 7. Evidence upload: select file and upload
    const fileInput = page.getByTestId('evidence-file-input')
    await fileInput.setInputFiles({
      name: 'hoa_don_vat_tu.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('mock pdf content'),
    })
    await page.getByTestId('evidence-upload-btn').click()
    await expect.poll(() => linkKeys.length).toBe(1)
    await expect(page.getByTestId('upload-error-alert')).toBeVisible()
    await page.getByTestId('evidence-upload-btn').click()
    await expect.poll(() => linkKeys.length).toBe(2)
    await expect(page.getByTestId('evidence-table')).toBeVisible()
    await expect(page.getByTestId('evidence-filename')).toContainText('hoa_don_vat_tu.pdf')
    expect(intentCount).toBe(1)
    expect(storageUploadCount).toBe(1)
    expect(finalizeCount).toBe(1)
    expect(linkKeys[1]).toBe(linkKeys[0])

    // 8. Publish: open modal and confirm
    const openPublishBtn = page.getByTestId('open-publish-modal-btn')
    await expect(openPublishBtn).toBeEnabled()
    await openPublishBtn.click()
    await page.getByTestId('confirm-publish-btn').click()

    // 9. Successfully navigates back to published costs overview
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}$`))
  })

  test('Flow L — draft create retries preserve the logical key and rotate after change or success', async ({ page }) => {
    const nextDraftId = '30000000-0000-4000-8000-000000000072'
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: mockProjectOverview }))
    await page.route(`**/api/companies/**/projects/${projectId}/project-cost-drafts`, route => route.fulfill({ json: [] }))
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => route.fulfill({ json: draftFixture(draftId, projectId, 'Draft changed payload') }))
    await page.route(`**/api/companies/**/project-costs/${nextDraftId}/draft`, route => route.fulfill({ json: draftFixture(nextDraftId, projectId, 'Draft after success') }))
    await page.route('**/api/companies/**/project-costs/*/evidence', route => route.fulfill({ json: [] }))

    const requests: Array<{ body: Record<string, unknown>; idempotencyKey: string | undefined }> = []
    await page.route(`**/api/companies/**/projects/${projectId}/project-costs`, route => {
      const request = route.request()
      if (request.method() !== 'POST') return route.continue()
      requests.push({ body: request.postDataJSON(), idempotencyKey: request.headers()['idempotency-key'] })
      if (requests.length <= 2) return route.abort('connectionfailed')
      const id = requests.length === 3 ? draftId : nextDraftId
      return route.fulfill({ status: 201, json: costCommandAckSchema.parse({ id, version: 0, publicationState: 'draft', replayed: false }) })
    })

    await page.goto(`/costs/${projectId}`)
    await page.getByTestId('header-create-draft-btn').click()
    await page.getByTestId('draft-create-description').fill('Draft retry payload')
    await page.getByTestId('draft-create-category').selectOption(materialCategoryId)
    await page.getByTestId('draft-create-submit').click()
    await expect(page.getByTestId('draft-create-error')).toBeVisible()
    await page.getByRole('button', { name: 'Hủy', exact: true }).click()
    await page.getByTestId('header-create-draft-btn').click()
    await page.getByTestId('draft-create-description').fill('Draft retry payload')
    await page.getByTestId('draft-create-category').selectOption(materialCategoryId)
    await page.getByTestId('draft-create-submit').click()
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1]).toEqual(requests[0])

    await page.getByTestId('draft-create-description').fill('Draft changed payload')
    await page.getByTestId('draft-create-submit').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/drafts/${draftId}$`))
    expect(requests[2]?.idempotencyKey).not.toBe(requests[1]?.idempotencyKey)

    await page.goto(`/costs/${projectId}`)
    await page.getByTestId('header-create-draft-btn').click()
    await page.getByTestId('draft-create-description').fill('Draft after success')
    await page.getByTestId('draft-create-category').selectOption(materialCategoryId)
    await page.getByTestId('draft-create-submit').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/drafts/${nextDraftId}$`))
    expect(requests[3]?.idempotencyKey).not.toBe(requests[2]?.idempotencyKey)
  })

  test('Flow M — publish retry reuses its key and recovers COST_ALREADY_PUBLISHED', async ({ page }) => {
    const readyDraft = projectCostDraftSchema.parse({
      ...draftFixture(draftId, projectId, 'Ready publish retry'),
      amount: '10000000.0000',
      details: [{
        id: '80000000-0000-4000-8000-000000000020', projectCostItemId: draftId, lineNo: 1, detailKind: 'line_item', description: 'Ready line', quantity: null, unitCode: null, unitPrice: null, amount: '10000000.0000', retentionKind: null, retentionRateBps: null, retentionAmount: null, relevantDate: null, reference: null, note: null, version: 1, createdAt: '2026-09-22T08:00:00.000Z', updatedAt: '2026-09-22T08:00:00.000Z',
      }],
      publishReadiness: { ready: true, blockingCodes: [] },
    })
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => route.fulfill({ json: readyDraft }))
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: mockProjectOverview }))
    await page.route(`**/api/companies/**/project-costs/${draftId}/evidence`, route => route.fulfill({ json: [] }))
    const requests: Array<{ body: Record<string, unknown>; idempotencyKey: string | undefined }> = []
    await page.route(`**/api/companies/**/project-costs/${draftId}/publish`, route => {
      const request = route.request()
      requests.push({ body: request.postDataJSON(), idempotencyKey: request.headers()['idempotency-key'] })
      if (requests.length === 1) return route.abort('connectionfailed')
      return route.fulfill({ status: 409, json: { error: { code: 'COST_ALREADY_PUBLISHED', message: 'Project Cost đã được công bố.', requestId: 'req-published', details: {} } } })
    })

    await page.goto(`/costs/${projectId}/drafts/${draftId}`)
    await page.getByTestId('open-publish-modal-btn').click()
    await page.getByTestId('confirm-publish-btn').click()
    await expect(page.getByTestId('publish-error-alert')).toBeVisible()
    await page.getByRole('button', { name: 'Hủy', exact: true }).click()
    await page.getByTestId('open-publish-modal-btn').click()
    await page.getByTestId('confirm-publish-btn').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}$`))
    expect(requests[1]).toEqual(requests[0])
  })

  test('Flow M — a genuinely changed publish version uses a new key', async ({ page }) => {
    let version = 1
    const readyDraft = () => projectCostDraftSchema.parse({
      ...draftFixture(draftId, projectId, 'Ready publish version'),
      version,
      amount: '10000000.0000',
      details: [{
        id: '80000000-0000-4000-8000-000000000021', projectCostItemId: draftId, lineNo: 1, detailKind: 'line_item', description: 'Ready line', quantity: null, unitCode: null, unitPrice: null, amount: '10000000.0000', retentionKind: null, retentionRateBps: null, retentionAmount: null, relevantDate: null, reference: null, note: null, version, createdAt: '2026-09-22T08:00:00.000Z', updatedAt: '2026-09-22T08:00:00.000Z',
      }],
      publishReadiness: { ready: true, blockingCodes: [] },
    })
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => route.fulfill({ json: readyDraft() }))
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: mockProjectOverview }))
    await page.route(`**/api/companies/**/project-costs/${draftId}/evidence`, route => route.fulfill({ json: [] }))
    const requests: Array<{ body: Record<string, unknown>; idempotencyKey: string | undefined }> = []
    await page.route(`**/api/companies/**/project-costs/${draftId}/publish`, route => {
      const request = route.request()
      requests.push({ body: request.postDataJSON(), idempotencyKey: request.headers()['idempotency-key'] })
      if (requests.length === 1) return route.abort('connectionfailed')
      return route.fulfill({ json: costCommandAckSchema.parse({ id: draftId, version: 3, publicationState: 'published', replayed: false }) })
    })

    await page.goto(`/costs/${projectId}/drafts/${draftId}`)
    await page.getByTestId('open-publish-modal-btn').click()
    await page.getByTestId('confirm-publish-btn').click()
    await expect(page.getByTestId('publish-error-alert')).toBeVisible()
    await page.getByRole('button', { name: 'Hủy' }).click()
    version = 2
    await page.reload()
    await page.getByTestId('open-publish-modal-btn').click()
    await page.getByTestId('confirm-publish-btn').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}$`))
    expect(requests[0]?.body).toEqual({ expectedVersion: 1 })
    expect(requests[1]?.body).toEqual({ expectedVersion: 2 })
    expect(requests[1]?.idempotencyKey).not.toBe(requests[0]?.idempotencyKey)
  })

  test('Flow B / Flow I — void survives refresh and replacement uses the same payment and contract', async ({ page }) => {
    const paymentRows: Array<{
      id: string
      contractId: string
      contractCode: string
      contractNo: string | null
      description: string
      paidAmount: string
      warrantyRetentionAmount: string | null
      retentionRateBps: number | null
      paymentDate: string | null
      effectiveDate: string
      dateSource: 'payment_date' | 'created_at'
      recordStatus: 'recorded' | 'voided'
      replacementPaymentId: string | null
      reference: string | null
      sourceReference: string | null
      note: string | null
      createdAt: string
      version: number
    }> = [
      {
        id: paymentId1,
        contractId: subcontractId,
        contractCode: 'HD-KC-01',
        contractNo: 'KC-2026-01',
        description: 'Tạm ứng lần 1 thi công kết cấu',
        paidAmount: '50000000.0000',
        warrantyRetentionAmount: '2500000.0000',
        retentionRateBps: 500,
        paymentDate: '2026-09-10',
        effectiveDate: '2026-09-10',
        dateSource: 'payment_date',
        recordStatus: 'recorded',
        replacementPaymentId: null,
        reference: 'UNC-001',
        sourceReference: null,
        note: null,
        createdAt: '2026-09-10T08:00:00.000Z',
        version: 1,
      },
    ]

    const getSubcontractDetail = () => {
      const recordedRows = paymentRows.filter(row => row.recordStatus === 'recorded')
      const recordedTotal = sumFinanceMoney(recordedRows.map(row => row.paidAmount))
      const recordedRetentionValues = recordedRows.flatMap(row => row.warrantyRetentionAmount === null ? [] : [row.warrantyRetentionAmount])
      return financeSubcontractDetailSchema.parse({
      schemaVersion: 1 as const,
      project: mockProjectOverview.project,
      party: {
        partyId,
        code: 'CT-THEP',
        displayName: 'Nhà thầu Kết cấu thép',
        partyKind: 'organization' as const,
      },
      contract: {
        id: subcontractId,
        code: 'HD-KC-01',
        contractNo: 'KC-2026-01',
        contractName: 'Hợp đồng kết cấu thép',
        contractDate: '2026-08-01',
        contractValue: '500000000.0000',
        currencyCode: 'VND',
        defaultRetentionRateBps: 500,
        isActive: true,
        version: 1,
        reference: null,
        sourceReference: null,
        note: null,
        paidTotal: recordedTotal,
        paidCount: recordedRows.length,
        recordedRetentionTotal: recordedRetentionValues.length === 0 ? null : sumFinanceMoney(recordedRetentionValues),
        recordedRetentionRowCount: recordedRetentionValues.length,
        referenceHeadroom: '450000000.0000',
        referenceHeadroomReason: null,
      },
      payments: {
        rows: paymentRows,
        pagination: {
          page: 1,
          pageSize: 25 as const,
          totalPages: 1,
          filteredCount: paymentRows.length,
          fullCount: paymentRows.length,
          filteredAmount: recordedTotal,
          fullAmount: recordedTotal,
        },
        recordedTotal,
        recordedCount: recordedRows.length,
        recordedRetentionTotal: recordedRetentionValues.length === 0 ? null : sumFinanceMoney(recordedRetentionValues),
        recordedRetentionRowCount: recordedRetentionValues.length,
      },
    })
    }

    // Mock project overview & categories
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => {
      route.fulfill({ json: mockProjectOverview })
    })

    // Mock subcontractors list
    await page.route(`**/api/companies/**/projects/${projectId}/finance/subcontractors`, route => {
      route.fulfill({ json: mockSubcontractorList })
    })

    // Mock subcontract detail endpoint with query params wildcard
    await page.route(`**/api/companies/**/projects/${projectId}/finance/subcontracts/${subcontractId}*`, route => {
      route.fulfill({ json: getSubcontractDetail() })
    })

    let lastRecordPaymentPayload: unknown = null
    await page.route(`**/api/companies/**/projects/${projectId}/subcontracts/${subcontractId}/payments`, route => {
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON()
        lastRecordPaymentPayload = payload
        const newPaymentId = payload.replacesPaymentId ? paymentId2 : '60000000-0000-4000-8000-000000000059'
        paymentRows.push({
          id: newPaymentId,
          contractId: subcontractId,
          contractCode: 'HD-KC-01',
          contractNo: 'KC-2026-01',
          description: payload.description,
          paidAmount: payload.paidAmount,
          warrantyRetentionAmount: payload.warrantyRetentionAmount || null,
          retentionRateBps: payload.retentionRateBps || null,
          paymentDate: payload.paymentDate || '2026-09-10',
          effectiveDate: payload.paymentDate || '2026-09-10',
          dateSource: 'payment_date',
          recordStatus: 'recorded',
          replacementPaymentId: null,
          reference: payload.paymentReference || null,
          sourceReference: null,
          note: null,
          createdAt: new Date().toISOString(),
          version: 1,
        })
        if (payload.replacesPaymentId) {
          const original = paymentRows.find(row => row.id === payload.replacesPaymentId)
          if (original) original.replacementPaymentId = newPaymentId
        }
        route.fulfill({
          status: 201,
          json: recordSubcontractPaymentResultSchema.parse({
            paymentId: newPaymentId,
            version: 1,
            status: 'recorded',
            replayed: false,
          }),
        })
      }
      else {
        route.continue()
      }
    })

    const voidRequests: Array<{ body: unknown; idempotencyKey: string | null }> = []
    // Mock void payment, including two unknown outcomes before canonical success.
    await page.route(`**/api/companies/**/projects/${projectId}/subcontracts/${subcontractId}/payments/${paymentId1}/void`, async route => {
      voidRequests.push({ body: route.request().postDataJSON(), idempotencyKey: await route.request().headerValue('idempotency-key') })
      if (voidRequests.length <= 2) {
        await route.abort('connectionfailed')
        return
      }
      const p = paymentRows.find(r => r.id === paymentId1)
      if (p) {
        p.recordStatus = 'voided'
        p.version = 2
      }
      route.fulfill({
        json: voidSubcontractPaymentResultSchema.parse({
          paymentId: paymentId1,
          version: 2,
          status: 'voided',
          replayed: false,
        }),
      })
    })

    // 1. Navigate to subcontract ledger using subcontract category
    await page.goto(`/costs/${projectId}/categories/${subcontractCategoryId}?contractId=${subcontractId}&partyId=${partyId}`)
    await expect(page.getByTestId('contractor-name-header')).toContainText('Nhà thầu Kết cấu thép')
    await expect(page.getByTestId(`payment-row-${paymentId1}`)).toBeVisible()

    // 2. Void payment
    const voidBtn = page.getByTestId(`void-payment-btn-${paymentId1}`)
    await expect(voidBtn).toBeVisible()
    await voidBtn.click()

    await page.getByTestId('void-reason-input').fill('Chuyển nhầm tài khoản, cần xuất lại ủy nhiệm chi')
    await page.getByTestId('confirm-void-payment-btn').click()
    await expect.poll(() => voidRequests.length).toBe(1)
    await expect(page.getByTestId('void-payment-error')).toBeVisible()
    await page.getByRole('button', { name: 'Hủy bỏ', exact: true }).click()
    await page.getByTestId(`void-payment-btn-${paymentId1}`).click()
    await page.getByTestId('void-reason-input').fill('Chuyển nhầm tài khoản, cần xuất lại ủy nhiệm chi')
    await page.getByTestId('confirm-void-payment-btn').click()
    await expect.poll(() => voidRequests.length).toBe(2)
    await expect(page.getByTestId('void-payment-error')).toBeVisible()
    await page.getByTestId('void-reason-input').fill('Chuyển nhầm tài khoản, đã xác minh lại')
    await page.getByTestId('confirm-void-payment-btn').click()
    await expect.poll(() => voidRequests.length).toBe(3)

    expect(voidRequests[1]).toEqual(voidRequests[0])
    expect(voidRequests[2]?.body).toEqual({ expectedVersion: 1, reason: 'Chuyển nhầm tài khoản, đã xác minh lại' })
    expect(voidRequests[2]?.idempotencyKey).not.toBe(voidRequests[0]?.idempotencyKey)

    // 3. Status updates to voided in the ledger
    await expect(page.getByTestId(`payment-status-${paymentId1}`)).toHaveText('Đã hủy')

    // Flow I: the server projection keeps immutable voided history visible after a full reload.
    await page.reload()
    await expect(page.getByTestId(`payment-row-${paymentId1}`)).toBeVisible()
    await expect(page.getByTestId(`payment-status-${paymentId1}`)).toHaveText('Đã hủy')
    await expect(page.getByTestId('payment-totals-bar')).toContainText('Lịch sử: 1 khoản · Đã ghi nhận: 0 VND')
    await expect(page.getByTestId('ledger-full-total')).toHaveText('0 VND')

    // 4. Start replacement directly from the voided payment row
    const replaceBtn = page.getByTestId(`replace-payment-btn-${paymentId1}`)
    await expect(replaceBtn).toBeVisible()
    await replaceBtn.click()

    // 5. Record replacement modal opens with replacesPaymentId set
    await page.getByTestId('pay-amount-input').fill('50000000.0000')
    await page.getByTestId('confirm-record-payment-btn').click()
    await expect(page.getByTestId('record-payment-form')).toHaveCount(0)

    // 6. Verify payload submitted replacesPaymentId
    expect(lastRecordPaymentPayload).toMatchObject({
      replacesPaymentId: paymentId1,
      paidAmount: '50000000.0000',
    })
    await expect(page.getByTestId(`payment-row-${paymentId1}`)).toBeVisible()
    await expect(page.getByTestId(`replace-payment-btn-${paymentId1}`)).toHaveCount(0)
    await expect(page.getByTestId(`payment-replaced-hint-${paymentId1}`)).toBeVisible()
    await expect(page.getByTestId(`payment-row-${paymentId2}`)).toBeVisible()
  })

  test('Flow H — payment unknown-outcome retry preserves body, evidence identity, and idempotency key', async ({ page }) => {
    const detail = financeSubcontractDetailSchema.parse({
      schemaVersion: 1,
      project: mockProjectOverview.project,
      party: mockSubcontractorList.parties[0]!.party,
      contract: {
        ...mockSubcontractorList.parties[0]!.contracts[0]!,
        reference: null,
        sourceReference: null,
        note: null,
        referenceHeadroom: '450000000.0000',
        referenceHeadroomReason: null,
      },
      payments: {
        rows: [],
        pagination: { page: 1, pageSize: 25, totalPages: 1, filteredCount: 0, fullCount: 0, filteredAmount: '0.0000', fullAmount: '0.0000' },
        recordedTotal: '0.0000',
        recordedCount: 0,
        recordedRetentionTotal: null,
        recordedRetentionRowCount: 0,
      },
    })
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: mockProjectOverview }))
    await page.route(`**/api/companies/**/projects/${projectId}/finance/subcontractors`, route => route.fulfill({ json: mockSubcontractorList }))
    await page.route(`**/api/companies/**/projects/${projectId}/finance/subcontracts/${subcontractId}*`, route => route.fulfill({ json: detail }))

    let uploadIntentCount = 0
    let storageUploadCount = 0
    let finalizeCount = 0
    await page.route(`**/api/companies/**/projects/${projectId}/evidence/upload-intents`, route => {
      uploadIntentCount += 1
      route.fulfill({ status: 201, json: costEvidenceUploadIntentSchema.parse({ evidenceFileId: evidenceId, version: 0, bucketId: 'c1-accounting-evidence', objectPath: mockObjectPath, expiresAt: new Date(Date.now() + 120000).toISOString(), replayed: false }) })
    })
    await page.route('**/storage/v1/object/**', route => {
      storageUploadCount += 1
      route.fulfill({ status: 200, json: { Key: `c1-accounting-evidence/${mockObjectPath}` } })
    })
    await page.route(`**/api/companies/**/evidence-files/${evidenceId}/finalize`, route => {
      finalizeCount += 1
      route.fulfill({ json: costEvidenceFinalizedSchema.parse({ id: evidenceId, status: 'finalized', originalFilename: 'payment.pdf', mimeType: 'application/pdf', sizeBytes: 16, sha256: mockSha256, version: 1, finalizedAt: new Date().toISOString(), replayed: false }) })
    })

    const requests: Array<{ body: Record<string, unknown>; idempotencyKey: string | undefined }> = []
    await page.route(`**/api/companies/**/projects/${projectId}/subcontracts/${subcontractId}/payments`, route => {
      const request = route.request()
      requests.push({ body: request.postDataJSON(), idempotencyKey: request.headers()['idempotency-key'] })
      if (requests.length <= 2) return route.abort('connectionfailed')
      return route.fulfill({ status: 201, json: recordSubcontractPaymentResultSchema.parse({ paymentId: paymentId2, version: 1, status: 'recorded', replayed: requests.length > 3 }) })
    })

    await page.goto(`/costs/${projectId}/categories/${subcontractCategoryId}?contractId=${subcontractId}&partyId=${partyId}`)
    await page.getByTestId('open-record-payment-btn').click()
    await page.getByTestId('pay-description-input').fill('Thanh toán retry an toàn')
    await page.getByTestId('pay-amount-input').fill('10000000.0000')
    await page.getByTestId('pay-evidence-file-input').setInputFiles({ name: 'payment.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 payment') })

    await page.getByTestId('confirm-record-payment-btn').click()
    await expect(page.getByTestId('record-payment-error')).toBeVisible()
    await page.getByRole('button', { name: 'Hủy', exact: true }).click()
    await page.getByTestId('open-record-payment-btn').click()
    await page.getByTestId('pay-description-input').fill('Thanh toán retry an toàn')
    await page.getByTestId('pay-amount-input').fill('10000000.0000')
    await page.getByTestId('pay-evidence-file-input').setInputFiles({ name: 'payment.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 payment') })
    await page.getByTestId('confirm-record-payment-btn').click()
    await expect.poll(() => requests.length).toBe(2)

    expect(requests[1]).toEqual(requests[0])
    expect(requests[0]?.body.evidenceFileIds).toEqual([evidenceId])
    expect(uploadIntentCount).toBe(1)
    expect(storageUploadCount).toBe(1)
    expect(finalizeCount).toBe(1)

    await page.getByTestId('pay-amount-input').fill('11000000.0000')
    await page.getByTestId('confirm-record-payment-btn').click()
    await expect(page.getByTestId('record-payment-form')).toHaveCount(0)
    expect(requests[2]?.body).toMatchObject({ paidAmount: '11000000.0000', evidenceFileIds: [evidenceId] })
    expect(requests[2]?.idempotencyKey).not.toBe(requests[1]?.idempotencyKey)
    expect(uploadIntentCount).toBe(1)

    await page.getByTestId('open-record-payment-btn').click()
    await page.getByTestId('pay-description-input').fill('Thanh toán mới sau thành công')
    await page.getByTestId('pay-amount-input').fill('12000000.0000')
    await page.getByTestId('confirm-record-payment-btn').click()
    await expect(page.getByTestId('record-payment-form')).toHaveCount(0)
    expect(requests[3]?.idempotencyKey).not.toBe(requests[2]?.idempotencyKey)
  })

  test('Flow J — stale draft response cannot overwrite a newer company context', async ({ page, authState }) => {
    const companyB = '10000000-0000-4000-8000-000000000060'
    authState.sessionCompanies = [
      createCompany(),
      createCompany({ companyId: companyB, companyCode: 'VQH-B', companyName: 'Công ty B' }),
    ]
    let releaseDraftA!: () => void
    const draftAGate = new Promise<void>(resolve => { releaseDraftA = resolve })
    await page.route(`**/api/companies/${companyId}/project-costs/${draftId}/draft`, async route => {
      await draftAGate
      await route.fulfill({ json: draftFixture(draftId, projectId, 'Draft A stale') })
    })
    await page.route(`**/api/companies/${companyB}/project-costs/${draftId}/draft`, route => route.fulfill({ json: draftFixture(draftId, projectId, 'Draft B current') }))
    await page.route(`**/api/companies/${companyId}/projects/${projectId}/finance`, route => route.fulfill({ json: mockProjectOverview }))
    await page.route(`**/api/companies/${companyB}/projects/${projectId}/finance`, route => route.fulfill({ json: { ...mockProjectOverview, project: { ...mockProjectOverview.project, projectCode: 'DA-C1-02', projectName: 'Dự án B' } } }))
    await page.route('**/api/companies/**/project-costs/*/evidence', route => route.fulfill({ json: [] }))

    await page.goto(`/costs/${projectId}/drafts/${draftId}`)
    await expect(page.getByText('Đang tải dữ liệu bản nháp…')).toBeVisible()
    await page.evaluate((targetCompanyId) => {
      const root = document.querySelector('#__nuxt') as HTMLElement & { __vue_app__?: { config: { globalProperties: { $nuxt?: { $companyAccessStore?: { selectCompany(companyId: string): boolean } } } } } }
      const store = root.__vue_app__?.config.globalProperties.$nuxt?.$companyAccessStore
      if (!store?.selectCompany(targetCompanyId)) throw new Error('Unable to switch company in test')
    }, companyB)
    await expect(page.getByTestId('draft-title')).toHaveText('Draft B current')

    const staleResponse = page.waitForResponse(response => response.url().includes(`/project-costs/${draftId}/draft`))
    releaseDraftA()
    await staleResponse
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

    await expect(page.getByTestId('draft-title')).toHaveText('Draft B current')
    await expect(page.getByText('DA-C1-02')).toBeVisible()
    await expect(page.getByLabel('Chuyển công ty')).toHaveValue(companyB)
  })

  test('Flow J — Draft A resolving last cannot cross Draft B route and evidence context', async ({ page }) => {
    const projectB = '10000000-0000-4000-8000-000000000070'
    const draftB = '30000000-0000-4000-8000-000000000071'
    let releaseDraftA!: () => void
    const draftAGate = new Promise<void>(resolve => { releaseDraftA = resolve })
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, async route => {
      await draftAGate
      await route.fulfill({ json: draftFixture(draftId, projectId, 'Draft A stale route') })
    })
    await page.route(`**/api/companies/**/project-costs/${draftB}/draft`, route => route.fulfill({ json: draftFixture(draftB, projectB, 'Draft B current route') }))
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: mockProjectOverview }))
    await page.route(`**/api/companies/**/projects/${projectB}/finance`, route => route.fulfill({ json: { ...mockProjectOverview, project: { ...mockProjectOverview.project, projectId: projectB, projectCode: 'DA-C1-B', projectName: 'Dự án Route B' } } }))
    const evidenceDraftIds: string[] = []
    await page.route('**/api/companies/**/project-costs/*/evidence', (route) => {
      evidenceDraftIds.push(new URL(route.request().url()).pathname.split('/').at(-2)!)
      route.fulfill({ json: [] })
    })

    await page.goto(`/costs/${projectId}/drafts/${draftId}`)
    await expect(page.getByText('Đang tải dữ liệu bản nháp…')).toBeVisible()
    await page.evaluate(async (path) => {
      const root = document.querySelector('#__nuxt') as HTMLElement & { __vue_app__?: { config: { globalProperties: { $router?: { push(target: string): Promise<unknown> } } } } }
      const router = root.__vue_app__?.config.globalProperties.$router
      if (!router) throw new Error('Unable to resolve router in test')
      await router.push(path)
    }, `/costs/${projectB}/drafts/${draftB}`)
    await expect(page).toHaveURL(new RegExp(`/costs/${projectB}/drafts/${draftB}$`))
    await expect(page.getByTestId('draft-title')).toHaveText('Draft B current route')
    await expect.poll(() => evidenceDraftIds).toContain(draftB)

    const staleResponse = page.waitForResponse(response => response.url().includes(`/project-costs/${draftId}/draft`))
    releaseDraftA()
    await staleResponse
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

    await expect(page.getByTestId('draft-title')).toHaveText('Draft B current route')
    await expect(page.getByText('DA-C1-B')).toBeVisible()
    expect(evidenceDraftIds).toEqual([draftB])
  })

  test('Flow K — removing retention clears local dependents and sends canonical nulls', async ({ page }) => {
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => route.fulfill({ json: projectCostDraftSchema.parse({
      id: draftId,
      projectId,
      description: 'Draft with retained line',
      costCategoryId: materialCategoryId,
      businessReference: null,
      partyId: null,
      engagementId: null,
      componentId: null,
      relevantDate: '2026-09-22',
      workStatus: 'in_progress',
      amount: '20000.0000',
      currencyCode: 'VND',
      publicationState: 'draft',
      version: 1,
      details: [{
        id: '80000000-0000-4000-8000-000000000010',
        projectCostItemId: draftId,
        lineNo: 1,
        detailKind: 'line_item',
        description: 'Retained line',
        quantity: null,
        unitCode: null,
        unitPrice: null,
        amount: '20000.0000',
        retentionKind: 'warranty',
        retentionRateBps: 500,
        retentionAmount: '1000.0000',
        relevantDate: null,
        reference: null,
        note: null,
        version: 1,
        createdAt: '2026-09-22T08:00:00.000Z',
        updatedAt: '2026-09-22T08:00:00.000Z',
      }],
      sourceFigureIds: [],
      publishReadiness: { ready: true, blockingCodes: [] },
      createdAt: '2026-09-22T08:00:00.000Z',
      updatedAt: '2026-09-22T08:00:00.000Z',
    }) }))
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: mockProjectOverview }))
    await page.route(`**/api/companies/**/project-costs/${draftId}/evidence`, route => route.fulfill({ json: [] }))
    let savedPayload: unknown = null
    await page.route(`**/api/companies/**/project-costs/${draftId}/financials`, route => {
      savedPayload = route.request().postDataJSON()
      route.fulfill({ json: { id: draftId, version: 2, publicationState: 'draft', amount: '20000.0000', detailCount: 1, publishReadiness: { ready: true, blockingCodes: [] }, replayed: false } })
    })

    await page.goto(`/costs/${projectId}/drafts/${draftId}`)
    const retention = page.getByTestId('line-retention-select')
    await expect(retention).toHaveValue('warranty')
    await expect(page.getByTestId('line-retention-amount-input')).toHaveValue('1000.0000')
    await retention.selectOption('')
    await expect(page.getByTestId('line-retention-amount-input')).toHaveCount(0)
    await retention.selectOption('warranty')
    await expect(page.getByTestId('line-retention-amount-input')).toHaveValue('')
    await retention.selectOption('')
    await expect(retention).toHaveValue('')
    await page.getByTestId('save-financials-btn').click()
    await expect.poll(() => savedPayload).not.toBeNull()

    const parsed = prepareProjectCostFinancialsInputSchema.parse(savedPayload)
    expect(parsed.details[0]).toMatchObject({ retentionKind: null, retentionRateBps: null, retentionAmount: null })
  })

  test('Permission case: cost.file.read without cost.read does NOT show raw evidence download/open button', async ({ page, authState }) => {
    // Setup authenticated state without cost.read (has cost.manage, cost.prepare, cost.source.read, cost.file.read)
    authState.sessionCompanies = [
      createCompany({
        permissions: ['cost.manage', 'cost.prepare', 'cost.source.read', 'cost.file.read'],
      }),
    ]

    // Mock draft (prepare capability)
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => {
      route.fulfill({
        json: projectCostDraftSchema.parse({
          id: draftId,
          projectId,
          description: 'Hạng mục chi phí',
          costCategoryId: materialCategoryId,
          businessReference: null,
          partyId: null,
          engagementId: null,
          componentId: null,
          relevantDate: '2026-09-22',
          workStatus: 'in_progress',
          amount: '10000000.0000',
          currencyCode: 'VND',
          publicationState: 'draft',
          version: 1,
          details: [],
          sourceFigureIds: [],
          publishReadiness: { ready: false, blockingCodes: ['FINANCIAL_DETAILS_REQUIRED'] },
          createdAt: '2026-09-22T08:00:00.000Z',
          updatedAt: '2026-09-22T08:00:00.000Z',
        }),
      })
    })

    // Mock evidence metadata list (allowed under cost.source.read)
    await page.route(`**/api/companies/**/project-costs/${draftId}/evidence`, route => {
      route.fulfill({
        json: [
          costEvidenceMetadataSchema.parse({
            linkId: linkId1,
            evidenceFileId: evidenceId,
            evidenceKind: 'invoice',
            accountingSourceVersionId: null,
            originalFilename: 'bang_ke_nguon.xlsx',
            sizeBytes: 2048,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sha256: mockSha256,
            finalizedAt: new Date().toISOString(),
          }),
        ],
      })
    })

    // Navigate to draft workbench directly without cost.read
    await page.goto(`/costs/${projectId}/drafts/${draftId}`)
    await expect(page.getByTestId('draft-workbench-page')).toBeVisible()

    // Evidence row is rendered via cost.source.read
    await expect(page.getByTestId('evidence-filename')).toContainText('bang_ke_nguon.xlsx')

    // Raw download button MUST NOT be present because actor lacks cost.read
    await expect(page.getByTestId('evidence-download-btn')).toHaveCount(0)
    await expect(page.getByText('(Cần cost.read + cost.file.read)')).toBeVisible()
  })

  test('Flow C — Operational correction: safely diffs published cost operational changes omitting untouched fields and category label fallback', async ({ page }) => {
    let lastCorrectionPayload: Record<string, unknown> | null = null
    const correctionRequests: Array<{ body: Record<string, unknown>; idempotencyKey: string | null }> = []

    // Mock finance overview
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => {
      route.fulfill({ json: mockProjectOverview })
    })

    // Mock project cost items (canonical published parent state)
    await page.route(`**/api/companies/**/projects/${projectId}/project-costs`, route => {
      route.fulfill({
        json: projectCostBreakdownSchema.parse({
          projectId,
          projectCode: 'DA-C1-01',
          projectName: 'Dự án Thi công Trung tâm Thương mại',
          summary: {
            currencyCode: 'VND',
            acceptedValue: '750000000.0000',
            acceptedCount: 1,
            inProgressValue: '0.0000',
            inProgressCount: 0,
            unknownStatusValue: '0.0000',
            unknownCount: 0,
            totalTrackedWorkValue: '750000000.0000',
          },
          items: [
            {
              id: publishedItemId,
              tenantId,
              companyId,
              projectId,
              description: 'Vật tư thi công phần thô',
              amount: '750000000.0000',
              currencyCode: 'VND',
              workStatus: 'accepted',
              businessReference: 'REF-VT-01',
              partyId: null,
              engagementId: null,
              componentId: null,
              relevantDate: '2026-09-18',
              version: 3,
              createdAt: '2026-09-18T08:00:00.000Z',
              updatedAt: '2026-09-18T08:00:00.000Z',
            },
          ],
        }),
      })
    })

    // Mock ordinary item details
    await page.route(`**/api/companies/**/projects/${projectId}/finance/items/${publishedItemId}/**`, route => {
      route.fulfill({
        json: financeItemDetailsSchema.parse({
          schemaVersion: 1 as const,
          kind: 'ordinary' as const,
          project: mockProjectOverview.project,
          category: mockProjectOverview.categories[0]!,
          item: {
            id: publishedItemId,
            description: 'Vật tư thi công phần thô',
            businessReference: 'REF-VT-01',
            parentAmount: '750000000.0000',
            currencyCode: 'VND',
            version: 3,
          },
          details: {
            rows: [],
            pagination: {
              page: 1,
              pageSize: 25,
              totalPages: 1,
              filteredCount: 0,
              fullCount: 0,
              filteredAmount: '0.0000',
              fullAmount: '0.0000',
            },
          },
        }),
      })
    })

    // Mock project cost item details (financial line items)
    await page.route(`**/api/companies/**/project-costs/${publishedItemId}/details`, route => {
      route.fulfill({
        json: {
          projectCostItemId: publishedItemId,
          totalAmount: '750000000.0000',
          currencyCode: 'VND',
          details: [],
        },
      })
    })

    // Intercept correction request
    await page.route(`**/api/companies/**/project-costs/${publishedItemId}/corrections`, async route => {
      lastCorrectionPayload = route.request().postDataJSON()
      correctionRequests.push({ body: lastCorrectionPayload!, idempotencyKey: await route.request().headerValue('idempotency-key') })
      if (correctionRequests.length <= 2) {
        await route.abort('connectionfailed')
        return
      }
      route.fulfill({
        json: costCommandAckSchema.parse({
          id: publishedItemId,
          version: 4,
          publicationState: 'published',
          replayed: false,
        }),
      })
    })

    // 1. Navigate to category page
    await page.goto(`/costs/${projectId}/categories/${materialCategoryId}`)
    await expect(page.getByTestId('category-detail-page')).toBeVisible()
    await expect(page.getByTestId('category-heading')).toBeVisible()

    // 2. Open correction modal
    await page.getByTestId('open-correction-btn').click()
    await expect(page.getByTestId('correction-modal')).toBeVisible()

    // Verify financial correction is safely disabled
    await expect(page.getByTestId('financial-correction-disabled-notice')).toBeVisible()
    await expect(page.getByTestId('toggle-fin-changes')).toBeDisabled()

    // 3. Enable operational changes
    await page.getByTestId('toggle-op-changes').check()
    await expect(page.getByTestId('corr-op-description')).toBeVisible()

    // Verify current description in form is canonical description, NOT categoryDisplayName!
    await expect(page.getByTestId('corr-op-description')).toHaveValue('Vật tư thi công phần thô')
    expect(await page.getByTestId('corr-op-description').inputValue()).not.toContain('[vat_tu]')

    // 4. Change description only
    await page.getByTestId('corr-op-description').fill('Vật tư thi công phần thô (Đã bổ sung phụ lục)')

    // 5. Enter reason
    await page.getByTestId('correction-reason-input').fill('Điều chỉnh diễn giải chi phí theo phụ lục hợp đồng')

    // 6. Submit correction
    await page.getByTestId('confirm-correction-btn').click()
    await expect.poll(() => correctionRequests.length).toBe(1)
    await expect(page.getByTestId('correction-error-alert')).toBeVisible()
    await page.getByRole('button', { name: 'Hủy', exact: true }).click()
    await page.getByTestId('open-correction-btn').click()
    await page.getByTestId('toggle-op-changes').check()
    await page.getByTestId('corr-op-description').fill('Vật tư thi công phần thô (Đã bổ sung phụ lục)')
    await page.getByTestId('correction-reason-input').fill('Điều chỉnh diễn giải chi phí theo phụ lục hợp đồng')
    await page.getByTestId('confirm-correction-btn').click()
    await expect.poll(() => correctionRequests.length).toBe(2)
    await expect(page.getByTestId('correction-error-alert')).toBeVisible()
    await page.getByTestId('correction-reason-input').fill('Điều chỉnh diễn giải đã xác minh lại')
    await page.getByTestId('confirm-correction-btn').click()
    await expect.poll(() => correctionRequests.length).toBe(3)

    // 7. Modal closes
    await expect(page.getByTestId('correction-modal')).toHaveCount(0)

    // 8. Assert correction payload matches PATCH invariant: only description, untouched fields omitted
    expect(correctionRequests[1]).toEqual(correctionRequests[0])
    expect(correctionRequests[2]?.idempotencyKey).not.toBe(correctionRequests[0]?.idempotencyKey)
    expect(lastCorrectionPayload).toEqual({
      expectedVersion: 3,
      reason: 'Điều chỉnh diễn giải đã xác minh lại',
      operationalChanges: {
        description: 'Vật tư thi công phần thô (Đã bổ sung phụ lục)',
      },
    })
    const op = (lastCorrectionPayload as { operationalChanges?: Record<string, unknown> })?.operationalChanges
    expect(op?.workStatus).toBeUndefined()
    expect(op?.businessReference).toBeUndefined()
    expect(op?.relevantDate).toBeUndefined()
    expect((lastCorrectionPayload as Record<string, unknown>)?.financialChanges).toBeUndefined()

    await page.getByTestId('open-correction-btn').click()
    await page.getByTestId('toggle-op-changes').check()
    await page.getByTestId('corr-op-description').fill('Vật tư thi công phần thô (Đã bổ sung phụ lục)')
    await page.getByTestId('correction-reason-input').fill('Điều chỉnh diễn giải đã xác minh lại')
    await page.getByTestId('confirm-correction-btn').click()
    await expect.poll(() => correctionRequests.length).toBe(4)
    expect(correctionRequests[3]?.body).toEqual(correctionRequests[2]?.body)
    expect(correctionRequests[3]?.idempotencyKey).not.toBe(correctionRequests[2]?.idempotencyKey)
  })

  test('Flow D — Fallback operational correction: when canonical parent request fails, falls back to finance item and hides unavailable workStatus/relevantDate', async ({ page }) => {
    let fallbackCorrectionPayload: Record<string, unknown> | null = null

    // Mock finance overview
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => {
      route.fulfill({ json: mockProjectOverview })
    })

    // Mock canonical parent request to fail (404) to trigger safe fallback to finance item details
    await page.route(`**/api/companies/**/projects/${projectId}/project-costs`, route => {
      route.fulfill({
        status: 404,
        json: { code: 'RESOURCE_NOT_FOUND', message: 'Không tìm thấy Project Cost.' },
      })
    })

    // Mock ordinary item details (provides description and businessReference, but NOT workStatus or relevantDate)
    await page.route(`**/api/companies/**/projects/${projectId}/finance/items/${publishedItemId}/**`, route => {
      route.fulfill({
        json: financeItemDetailsSchema.parse({
          schemaVersion: 1 as const,
          kind: 'ordinary' as const,
          project: mockProjectOverview.project,
          category: mockProjectOverview.categories[0]!,
          item: {
            id: publishedItemId,
            description: 'Vật tư thi công phần thô',
            businessReference: 'REF-VT-01',
            parentAmount: '750000000.0000',
            currencyCode: 'VND',
            version: 3,
          },
          details: {
            rows: [],
            pagination: {
              page: 1,
              pageSize: 25,
              totalPages: 1,
              filteredCount: 0,
              fullCount: 0,
              filteredAmount: '0.0000',
              fullAmount: '0.0000',
            },
          },
        }),
      })
    })

    // Mock project cost details
    await page.route(`**/api/companies/**/project-costs/${publishedItemId}/details`, route => {
      route.fulfill({
        json: {
          projectCostItemId: publishedItemId,
          totalAmount: '750000000.0000',
          currencyCode: 'VND',
          details: [],
        },
      })
    })

    // Intercept correction request
    await page.route(`**/api/companies/**/project-costs/${publishedItemId}/corrections`, async route => {
      fallbackCorrectionPayload = route.request().postDataJSON()
      route.fulfill({
        json: costCommandAckSchema.parse({
          id: publishedItemId,
          version: 4,
          publicationState: 'published',
          replayed: false,
        }),
      })
    })

    // 1. Navigate to category page
    await page.goto(`/costs/${projectId}/categories/${materialCategoryId}`)
    await expect(page.getByTestId('category-detail-page')).toBeVisible()
    await expect(page.getByTestId('category-heading')).toBeVisible()
    await expect(page.getByTestId('ordinary-category-actions')).toBeVisible()

    // 2. Open correction modal
    await page.getByTestId('open-correction-btn').click()
    await expect(page.getByTestId('correction-modal')).toBeVisible()

    // 3. Enable operational changes
    await page.getByTestId('toggle-op-changes').check()

    // 4. Assert field availability: description and businessReference are visible; workStatus and relevantDate are ABSENT
    await expect(page.getByTestId('corr-op-description')).toBeVisible()
    await expect(page.getByTestId('corr-op-ref')).toBeVisible()
    await expect(page.getByTestId('corr-op-work-status')).toHaveCount(0)
    await expect(page.getByTestId('corr-op-date')).toHaveCount(0)

    // 5. Change description only
    await page.getByTestId('corr-op-description').fill('Vật tư thi công phần thô (Fallback chỉnh sửa)')

    // 6. Enter reason
    await page.getByTestId('correction-reason-input').fill('Hiệu chỉnh mô tả trong chế độ fallback an toàn')

    // 7. Submit correction
    await page.getByTestId('confirm-correction-btn').click()

    // 8. Modal closes
    await expect(page.getByTestId('correction-modal')).toHaveCount(0)

    // 9. Assert payload strictly contains only description, and omits unavailable fields
    expect(fallbackCorrectionPayload).toEqual({
      expectedVersion: 3,
      reason: 'Hiệu chỉnh mô tả trong chế độ fallback an toàn',
      operationalChanges: {
        description: 'Vật tư thi công phần thô (Fallback chỉnh sửa)',
      },
    })
    const op = (fallbackCorrectionPayload as { operationalChanges?: Record<string, unknown> })?.operationalChanges
    expect(op?.workStatus).toBeUndefined()
    expect(op?.relevantDate).toBeUndefined()
    expect(op?.businessReference).toBeUndefined()
    expect((fallbackCorrectionPayload as Record<string, unknown>)?.financialChanges).toBeUndefined()
  })

  test('Flow E — Cash-only without prepare: can record payment, but evidence upload is disabled and omitted', async ({ page, authState }) => {
    // Setup cash-only permission (cost.record_cash + cost.read, WITHOUT cost.prepare)
    authState.sessionCompanies = [
      createCompany({
        permissions: ['cost.read', 'cost.record_cash'],
      }),
    ]

    let recordedPayload: Record<string, unknown> | null = null
    let uploadIntentCalled = false

    // Mock overview
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => {
      route.fulfill({ json: mockProjectOverview })
    })

    // Mock subcontractors list
    await page.route(`**/api/companies/**/projects/${projectId}/finance/subcontractors`, route => {
      route.fulfill({ json: mockSubcontractorList })
    })

    // Mock contract detail
    await page.route(`**/api/companies/**/projects/${projectId}/finance/subcontracts/${subcontractId}*`, route => {
      route.fulfill({
        json: financeSubcontractDetailSchema.parse({
          schemaVersion: 1 as const,
          project: mockProjectOverview.project,
          party: mockSubcontractorList.parties[0]!.party,
          contract: {
            ...mockSubcontractorList.parties[0]!.contracts[0]!,
            reference: 'REF-01',
            sourceReference: null,
            note: null,
            referenceHeadroom: '450000000.0000',
            referenceHeadroomReason: null,
          },
          payments: {
            rows: [],
            pagination: {
              page: 1,
              pageSize: 25,
              totalPages: 1,
              filteredCount: 0,
              fullCount: 0,
              filteredAmount: '0.0000',
              fullAmount: '0.0000',
            },
            recordedTotal: '0.0000',
            recordedCount: 0,
            recordedRetentionTotal: '0.0000',
            recordedRetentionRowCount: 0,
          },
        }),
      })
    })

    // Fail if upload-intent is invoked
    await page.route(`**/api/companies/**/projects/${projectId}/evidence/upload-intents`, route => {
      uploadIntentCalled = true
      route.fulfill({ status: 500, json: { code: 'UNEXPECTED', message: 'Upload intent should not be called' } })
    })

    // Intercept payment record
    await page.route(`**/api/companies/**/projects/${projectId}/subcontracts/${subcontractId}/payments`, async route => {
      recordedPayload = route.request().postDataJSON()
      route.fulfill({
        status: 201,
        json: recordSubcontractPaymentResultSchema.parse({
          paymentId: paymentId1,
          version: 2,
          status: 'recorded',
          replayed: false,
        }),
      })
    })

    // Navigate to subcontract ledger
    await page.goto(`/costs/${projectId}/categories/${subcontractCategoryId}?contractId=${subcontractId}`)
    await expect(page.getByTestId('contractor-ledger-area')).toBeVisible()

    // Open record payment modal
    await page.getByTestId('open-record-payment-btn').click()
    await expect(page.getByTestId('record-payment-form')).toBeVisible()

    // Assert evidence permission notice is visible and file input is hidden
    await expect(page.getByTestId('pay-evidence-permission-notice')).toBeVisible()
    await expect(page.getByTestId('pay-evidence-file-input')).toHaveCount(0)

    // Fill payment fields
    await page.getByTestId('pay-description-input').fill('Tạm ứng tiền mặt nhân công')
    await page.getByTestId('pay-amount-input').fill('20000000')

    // Submit
    await page.getByTestId('confirm-record-payment-btn').click()

    // Modal closes
    await expect(page.getByTestId('record-payment-form')).toHaveCount(0)

    // Assert payload does NOT contain evidenceFileIds and no upload intent occurred
    expect(uploadIntentCalled).toBe(false)
    expect(recordedPayload).toMatchObject({
      expectedSubcontractVersion: 1,
      description: 'Tạm ứng tiền mặt nhân công',
      paidAmount: '20000000',
    })
    expect((recordedPayload as Record<string, unknown>)?.evidenceFileIds).toBeUndefined()
  })

  test('Flow F — Multi-contract party ledger: routes void and replacement to correct contracts, and requires explicit contract selection for new payment', async ({ page }) => {
    const subcontractId2 = '50000000-0000-4000-8000-000000000088'
    let voidEndpointHit = ''
    let replacementEndpointHit = ''
    let newPaymentEndpointHit = ''
    let replacementPayload: Record<string, unknown> | null = null

    const contract1 = mockSubcontractorList.parties[0]!.contracts[0]!
    const contract2 = {
      id: subcontractId2,
      code: 'HD-KC-02',
      contractNo: 'KC-2026-02',
      contractName: 'Hợp đồng kết cấu thép đợt 2',
      contractDate: '2026-08-15',
      contractValue: '300000000.0000',
      currencyCode: 'VND',
      defaultRetentionRateBps: 500,
      isActive: true,
      version: 2,
      paidTotal: '30000000.0000',
      paidCount: 1,
      recordedRetentionTotal: '1500000.0000',
      recordedRetentionRowCount: 1,
    }

    const paymentRows = [
      {
        id: paymentId1,
        contractId: subcontractId,
        contractCode: contract1.code,
        contractNo: contract1.contractNo,
        description: 'Thanh toán đợt 1 hợp đồng 1',
        paidAmount: '50000000.0000',
        warrantyRetentionAmount: '2500000.0000',
        retentionRateBps: 500,
        paymentDate: '2026-08-10',
        effectiveDate: '2026-08-10',
        dateSource: 'payment_date' as const,
        recordStatus: 'recorded' as const,
        replacementPaymentId: null,
        reference: 'PC-01',
        sourceReference: null,
        note: null,
        createdAt: '2026-08-10T08:00:00.000Z',
        version: 1,
      },
      {
        id: paymentId2,
        contractId: subcontractId2,
        contractCode: contract2.code,
        contractNo: contract2.contractNo,
        description: 'Thanh toán đợt 1 hợp đồng 2',
        paidAmount: '30000000.0000',
        warrantyRetentionAmount: '1500000.0000',
        retentionRateBps: 500,
        paymentDate: '2026-08-20',
        effectiveDate: '2026-08-20',
        dateSource: 'payment_date' as const,
        recordStatus: 'recorded' as const,
        replacementPaymentId: null,
        reference: 'PC-02',
        sourceReference: null,
        note: null,
        createdAt: '2026-08-20T08:00:00.000Z',
        version: 1,
      },
    ]

    // Mock overview
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => {
      route.fulfill({ json: mockProjectOverview })
    })

    // Mock subcontractors list and party ledger details
    await page.route(`**/api/companies/**/projects/${projectId}/finance/subcontractors**`, route => {
      const url = route.request().url()
      if (url.includes(`/subcontractors/${partyId}`)) {
        route.fulfill({
          json: financeSubcontractorDetailSchema.parse({
            schemaVersion: 1 as const,
            project: mockProjectOverview.project,
            party: mockSubcontractorList.parties[0]!.party,
            contracts: [contract1, contract2],
            payments: {
              rows: paymentRows,
              pagination: {
                page: 1,
                pageSize: 25,
                totalPages: 1,
                filteredCount: 2,
                fullCount: 2,
                filteredAmount: '80000000.0000',
                fullAmount: '80000000.0000',
              },
              recordedTotal: '80000000.0000',
              recordedCount: 2,
              recordedRetentionTotal: '4000000.0000',
              recordedRetentionRowCount: 2,
            },
          }),
        })
      }
      else {
        route.fulfill({ json: mockSubcontractorList })
      }
    })

    // Intercept void endpoint for Contract 2
    await page.route(`**/api/companies/**/projects/${projectId}/subcontracts/${subcontractId2}/payments/${paymentId2}/void`, async route => {
      voidEndpointHit = route.request().url()
      const p = paymentRows.find(r => r.id === paymentId2)
      if (p) {
        p.recordStatus = 'voided'
        p.version = 2
      }
      route.fulfill({
        status: 200,
        json: voidSubcontractPaymentResultSchema.parse({
          paymentId: paymentId2,
          version: 2,
          status: 'voided',
          replayed: false,
        }),
      })
    })

    // Intercept payment record on Contract 2
    await page.route(`**/api/companies/**/projects/${projectId}/subcontracts/${subcontractId2}/payments`, async route => {
      const body = route.request().postDataJSON()
      if (body?.replacesPaymentId) {
        replacementEndpointHit = route.request().url()
        replacementPayload = body
      }
      else {
        newPaymentEndpointHit = route.request().url()
      }
      route.fulfill({
        status: 201,
        json: recordSubcontractPaymentResultSchema.parse({
          paymentId: '60000000-0000-4000-8000-000000000099',
          version: 3,
          status: 'recorded',
          replayed: false,
        }),
      })
    })

    // 1. Navigate to party-level ledger
    await page.goto(`/costs/${projectId}/categories/${subcontractCategoryId}?partyId=${partyId}`)
    await expect(page.getByTestId('contractor-ledger-area')).toBeVisible()

    // 2. Void Payment 2 (which belongs to Contract 2)
    await page.getByTestId(`void-payment-btn-${paymentId2}`).click()
    await expect(page.getByTestId('void-reason-input')).toBeVisible()
    await page.getByTestId('void-reason-input').fill('Hủy do sai thông tin hợp đồng 2')
    await page.getByTestId('confirm-void-payment-btn').click()

    // 3. Status updates to voided in the ledger, proving void completed
    await expect(page.getByTestId(`payment-status-${paymentId2}`)).toHaveText('Đã hủy')

    // Assert void endpoint was called on Contract 2 (NOT Contract 1)
    expect(voidEndpointHit).toContain(`/subcontracts/${subcontractId2}/payments/${paymentId2}/void`)
    expect(voidEndpointHit).not.toContain(`/subcontracts/${subcontractId}/`)

    // Start replacement for Payment 2
    const replaceBtn = page.getByTestId(`replace-payment-btn-${paymentId2}`)
    await expect(replaceBtn).toBeVisible()
    await replaceBtn.click()
    await expect(page.getByTestId('record-payment-form')).toBeVisible()

    // Fill replacement payment
    await page.getByTestId('pay-description-input').fill('Thanh toán thay thế hợp đồng 2')
    await page.getByTestId('pay-amount-input').fill('28000000')
    await page.getByTestId('confirm-record-payment-btn').click()
    await expect(page.getByTestId('record-payment-form')).toHaveCount(0)

    // Assert replacement was recorded against Contract 2 with replacesPaymentId
    expect(replacementEndpointHit).toContain(`/subcontracts/${subcontractId2}/payments`)
    expect(replacementPayload).toMatchObject({
      expectedSubcontractVersion: 2,
      replacesPaymentId: paymentId2,
      paidAmount: '28000000',
    })

    // 4. Record NEW payment in party-level view: must prompt explicit contract selection
    await page.getByTestId('open-record-payment-btn').click()
    await expect(page.getByTestId('select-contract-dropdown')).toBeVisible()

    // Select Contract 2 explicitly
    await page.getByTestId('select-contract-dropdown').selectOption(subcontractId2)
    await page.getByTestId('confirm-select-contract-btn').click()

    // Record modal opens
    await expect(page.getByTestId('record-payment-form')).toBeVisible()
    await page.getByTestId('pay-description-input').fill('Thanh toán mới theo hợp đồng 2')
    await page.getByTestId('pay-amount-input').fill('15000000')
    await page.getByTestId('confirm-record-payment-btn').click()
    await expect(page.getByTestId('record-payment-form')).toHaveCount(0)

    // Assert new payment went to Contract 2
    expect(newPaymentEndpointHit).toContain(`/subcontracts/${subcontractId2}/payments`)
  })

  test('Flow G — Draft canonical error states: displays not-found and permission-denied views based on ClientError.code', async ({ page }) => {
    // 1. Mock 404 with RESOURCE_NOT_FOUND
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => {
      route.fulfill({
        status: 404,
        json: {
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Bản nháp không tồn tại.',
            requestId: 'req-404',
            details: {},
          },
        },
      })
    })

    await page.goto(`/costs/${projectId}/drafts/${draftId}`)
    await expect(page.getByTestId('draft-not-found')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Bản nháp không tồn tại' })).toBeVisible()

    // 2. Mock 403 with PERMISSION_DENIED
    await page.route(`**/api/companies/**/project-costs/${draftId}/draft`, route => {
      route.fulfill({
        status: 403,
        json: {
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Không có quyền truy cập bản nháp.',
            requestId: 'req-403',
            details: {},
          },
        },
      })
    })

    await page.goto(`/costs/${projectId}/drafts/${draftId}`)
    await expect(page.getByTestId('draft-permission-denied')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Không có quyền truy cập bản nháp' })).toBeVisible()
  })
})
