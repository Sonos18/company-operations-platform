import { expect, test } from './fixtures/authenticated'
import { createCompany } from './fixtures/auth-routes'
import {
  financeOverviewSchema,
  financeSubcontractDetailSchema,
  financeSubcontractorListSchema,
} from '../../shared/schemas/costs/project-finance'
import {
  recordSubcontractPaymentResultSchema,
  voidSubcontractPaymentResultSchema,
} from '../../shared/schemas/costs/project-finance-writes'
import {
  projectCostDraftSchema,
} from '../../shared/schemas/costs/project-costs'
import {
  costEvidenceFinalizedSchema,
  costEvidenceLinkResultSchema,
  costEvidenceMetadataSchema,
  costEvidenceUploadIntentSchema,
} from '../../shared/schemas/costs/cost-evidence'

const tenantId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000002'
const projectId = '10000000-0000-4000-8000-000000000050'
const materialCategoryId = '20000000-0000-4000-8000-000000000051'
const subcontractCategoryId = '20000000-0000-4000-8000-000000000099'
const draftId = '30000000-0000-4000-8000-000000000052'
const partyId = '40000000-0000-4000-8000-000000000053'
const subcontractId = '50000000-0000-4000-8000-000000000054'
const paymentId1 = '60000000-0000-4000-8000-000000000055'
const paymentId2 = '60000000-0000-4000-8000-000000000056'
const evidenceId = '70000000-0000-4000-8000-000000000057'
const linkId1 = '80000000-0000-4000-8000-000000000058'
const mockSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const mockObjectPath = `${tenantId}/${companyId}/${projectId}/${evidenceId}`

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
    await page.route(`**/api/companies/**/project-costs/${draftId}/evidence`, route => {
      if (route.request().method() === 'GET') {
        route.fulfill({ json: evidenceList })
      }
      else if (route.request().method() === 'POST') {
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
      route.fulfill({ status: 200, json: { Key: `c1-accounting-evidence/${mockObjectPath}` } })
    })

    // Mock finalize evidence: POST /evidence-files/:evidenceFileId/finalize
    await page.route(`**/api/companies/**/evidence-files/${evidenceId}/finalize`, route => {
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
    await page.getByTestId('draft-op-save-btn').click()
    await expect(page.getByTestId('draft-operations-success')).toBeVisible()

    // 6. Financial preparation: save financials
    const saveFinancialsBtn = page.getByTestId('save-financials-btn')
    await expect(saveFinancialsBtn).toBeVisible()
    await saveFinancialsBtn.click()
    await expect(page.getByTestId('financial-editor-success')).toBeVisible()

    // 7. Evidence upload: select file and upload
    const fileInput = page.getByTestId('evidence-file-input')
    await fileInput.setInputFiles({
      name: 'hoa_don_vat_tu.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('mock pdf content'),
    })
    await page.getByTestId('evidence-upload-btn').click()
    await expect(page.getByTestId('evidence-table')).toBeVisible()
    await expect(page.getByTestId('evidence-filename')).toContainText('hoa_don_vat_tu.pdf')

    // 8. Publish: open modal and confirm
    const openPublishBtn = page.getByTestId('open-publish-modal-btn')
    await expect(openPublishBtn).toBeEnabled()
    await openPublishBtn.click()
    await page.getByTestId('confirm-publish-btn').click()

    // 9. Successfully navigates back to published costs overview
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}$`))
  })

  test('Flow B — Subcontract cash: records payment, voids payment, and submits replacement using replacesPaymentId', async ({ page }) => {
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
        reference: 'UNC-001',
        sourceReference: null,
        note: null,
        createdAt: '2026-09-10T08:00:00.000Z',
        version: 1,
      },
    ]

    const getSubcontractDetail = () => financeSubcontractDetailSchema.parse({
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
        paidTotal: '50000000.0000',
        paidCount: paymentRows.length,
        recordedRetentionTotal: '2500000.0000',
        recordedRetentionRowCount: 1,
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
          filteredAmount: '50000000.0000',
          fullAmount: '50000000.0000',
        },
        recordedTotal: '50000000.0000',
        recordedCount: paymentRows.length,
        recordedRetentionTotal: '2500000.0000',
        recordedRetentionRowCount: 1,
      },
    })

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
          reference: payload.paymentReference || null,
          sourceReference: null,
          note: null,
          createdAt: new Date().toISOString(),
          version: 1,
        })
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

    // Mock void payment
    await page.route(`**/api/companies/**/projects/${projectId}/subcontracts/${subcontractId}/payments/${paymentId1}/void`, route => {
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

    // 3. Status updates to voided in the ledger
    await expect(page.getByTestId(`payment-status-${paymentId1}`)).toHaveText('Đã hủy')

    // 4. Start replacement directly from the voided payment row
    const replaceBtn = page.getByTestId(`replace-payment-btn-${paymentId1}`)
    await expect(replaceBtn).toBeVisible()
    await replaceBtn.click()

    // 5. Record replacement modal opens with replacesPaymentId set
    await page.getByTestId('pay-amount-input').fill('50000000.0000')
    await page.getByTestId('confirm-record-payment-btn').click()

    // 6. Verify payload submitted replacesPaymentId
    expect(lastRecordPaymentPayload).toMatchObject({
      replacesPaymentId: paymentId1,
      paidAmount: '50000000.0000',
    })
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
    await expect(page.getByText('(Thiếu cost.file.read)')).toBeVisible()
  })
})
