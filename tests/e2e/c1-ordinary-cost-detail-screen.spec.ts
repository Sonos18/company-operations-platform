import { expect, test } from './fixtures/authenticated'
import type { Page } from '@playwright/test'
import { createCompany } from './fixtures/auth-routes'
import {
  projectCostDetailDraftSchema,
  projectCostDetailOperationalDraftSchema,
  projectCostDraftManagementMetadataSchema,
} from '../../shared/schemas/costs/project-costs'

const projectId = '10000000-0000-4000-8000-000000000050'
const ordinaryCategoryId = '20000000-0000-4000-8000-000000000051'
const subcontractCategoryId = '20000000-0000-4000-8000-000000000099'
const detailId = '30000000-0000-4000-8000-000000000088'

const metadata = projectCostDraftManagementMetadataSchema.parse({
  projects: [{ id: projectId, code: 'DA-C1-01', name: 'Dự án C1' }],
  categories: [
    { categoryId: ordinaryCategoryId, code: 'vat_tu', name: 'Vật tư thi công', isActive: true, draftEligible: true, postingStrategy: 'ordinary_detail' },
    { categoryId: subcontractCategoryId, code: 'thau_phu', name: 'Thầu phụ nhân công', isActive: true, draftEligible: false, postingStrategy: 'subcontract_payment' },
  ],
})

const operationalDetailDraft = projectCostDetailOperationalDraftSchema.parse({
  id: detailId,
  projectCostItemId: '90000000-0000-4000-8000-000000000001',
  projectId,
  categoryId: ordinaryCategoryId,
  lineNo: 1,
  description: 'Chi phí mua thép tròn D10',
  relevantDate: '2026-09-30',
  reference: 'HD-THEP-01',
  note: 'Giao đợt 1 tại kho dự án',
  publicationState: 'draft',
  version: 1,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
})

const fullDetailDraft = projectCostDetailDraftSchema.parse({
  ...operationalDetailDraft,
  quantity: '10.0000',
  unitCode: 'tấn',
  unitPrice: '15000000.0000',
  amount: '150000000.0000',
  retentionKind: 'warranty',
  retentionRateBps: 500,
  retentionAmount: '7500000.0000',
  sourceFigureIds: [],
  publishReadiness: {
    ready: true,
    blockingCodes: [],
  },
})

async function mockMetadata(page: Page) {
  await page.route('**/api/companies/**/project-cost-drafts/metadata', route => route.fulfill({ json: metadata }))
  await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts/operations`, route => route.fulfill({ json: [operationalDetailDraft] }))
  await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, route => route.fulfill({ json: [fullDetailDraft] }))
}

test.describe('C1 Ordinary Cost Detail Screen & Workflows (Phase 1)', () => {
  test('cost.manage creates an ordinary detail draft and opens the workbench without financial leakage', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
    await mockMetadata(page)

    let createdPayload: unknown = null
    await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        createdPayload = route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          json: {
            id: detailId,
            projectCostItemId: '90000000-0000-4000-8000-000000000001',
            version: 1,
            publicationState: 'draft',
            replayed: false,
          },
        })
        return
      }
      await route.fulfill({ json: [fullDetailDraft] })
    })

    await page.route(`**/api/companies/**/project-cost-details/${detailId}/draft/operations`, route => route.fulfill({ json: operationalDetailDraft }))
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/evidence`, route => route.fulfill({ json: [] }))

    // 1. Visit new detail screen
    await page.goto(`/costs/${projectId}/entries/new`)
    await expect(page.getByTestId('new-cost-detail-page')).toBeVisible()

    // Verify Decision 2.A: only active ordinary categories in dropdown
    const categoryOptions = page.getByTestId('new-category-select').locator('option')
    await expect(categoryOptions).toHaveCount(2) // 1 placeholder + 1 ordinary_detail (vat_tu)
    await expect(page.getByTestId('new-category-select')).toContainText('Vật tư thi công')

    // Fill operational form
    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Chi phí mua thép tròn D10')
    await page.getByTestId('new-date-input').fill('2026-09-30')
    await page.getByTestId('new-ref-input').fill('HD-THEP-01')
    await page.getByTestId('new-note-input').fill('Giao đợt 1 tại kho dự án')

    // Financial section must not be rendered without cost.prepare
    await expect(page.getByTestId('new-financial-card')).toHaveCount(0)

    // Save Draft button is visible, Publish Now is hidden
    await expect(page.getByTestId('save-draft-btn')).toBeVisible()
    await expect(page.getByTestId('publish-now-btn')).toHaveCount(0)

    // Submit Save Draft
    await page.getByTestId('save-draft-btn').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/entries/${detailId}$`))

    expect(createdPayload).toEqual({
      categoryId: ordinaryCategoryId,
      description: 'Chi phí mua thép tròn D10',
      relevantDate: '2026-09-30',
      reference: 'HD-THEP-01',
      note: 'Giao đợt 1 tại kho dự án',
    })

    // On workbench: operational form is visible, financial details are masked
    await expect(page.getByTestId('detail-draft-page')).toBeVisible()
    await expect(page.getByTestId('detail-operations-form')).toBeVisible()
    await expect(page.getByTestId('detail-financial-form')).toHaveCount(0)
    await expect(page.locator('text=Dữ liệu tài chính được bảo mật và quản lý bởi nhân sự có quyền')).toBeVisible()
  })

  test('subcontract deep link safely prevents ordinary detail creation and explains redirect', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage', 'cost.read'] })]
    await mockMetadata(page)

    // Deep link targeting a subcontract category
    await page.goto(`/costs/${projectId}/entries/new?categoryId=${subcontractCategoryId}`)
    await expect(page.getByTestId('new-cost-detail-page')).toBeVisible()

    // Subcontract notice banner must be visible
    await expect(page.getByTestId('subcontract-redirect-banner')).toBeVisible()
    await expect(page.getByTestId('subcontract-redirect-banner')).toContainText('Hạng mục này sử dụng mô hình chi phí thầu phụ')

    // Submit buttons must be disabled
    await expect(page.getByTestId('save-draft-btn')).toBeDisabled()
  })

  test('full capability user performs atomic Publish Now with string "0" zero-amount support', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage', 'cost.prepare', 'cost.publish_import', 'cost.read'] })]
    await mockMetadata(page)

    let publishNowPayload: unknown = null
    await page.route(`**/api/companies/**/projects/${projectId}/cost-entries`, async (route) => {
      publishNowPayload = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        json: {
          id: detailId,
          projectCostItemId: '90000000-0000-4000-8000-000000000001',
          version: 1,
          publicationState: 'published',
          replayed: false,
        },
      })
    })
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: { summary: {}, project: {} } }))

    await page.goto(`/costs/${projectId}/entries/new`)
    await expect(page.getByTestId('new-cost-detail-page')).toBeVisible()

    // Financial section must be visible for cost.prepare
    await expect(page.getByTestId('new-financial-card')).toBeVisible()

    // Both Save Draft and Publish Now are available
    await expect(page.getByTestId('save-draft-btn')).toBeVisible()
    await expect(page.getByTestId('publish-now-btn')).toBeVisible()

    // Fill form with valid zero amount
    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Dịch vụ bảo trì không tính phí')
    await page.getByTestId('new-amount-input').fill('0')
    await page.getByTestId('new-amount-input').blur()

    await expect(page.locator('text=Hiển thị: 0')).toBeVisible()
    await expect(page.getByTestId('publish-now-btn')).toBeEnabled()

    await page.getByTestId('publish-now-btn').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}$`))

    expect(publishNowPayload).toMatchObject({
      categoryId: ordinaryCategoryId,
      description: 'Dịch vụ bảo trì không tính phí',
      amount: '0',
    })
  })

  test('committed-but-response-lost retries exact payload and key without list guessing', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
    await mockMetadata(page)

    let requestCount = 0
    let firstIdempotencyKey: string | null = null
    let replayIdempotencyKey: string | null = null

    await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        requestCount++
        const key = route.request().headers()['idempotency-key']
        if (requestCount === 1) {
          firstIdempotencyKey = key
          // Simulate network drop mid-flight
          await route.abort('failed')
          return
        }
        replayIdempotencyKey = key
        await route.fulfill({
          status: 201,
          json: {
            id: detailId,
            projectCostItemId: '90000000-0000-4000-8000-000000000001',
            version: 1,
            publicationState: 'draft',
            replayed: true,
          },
        })
        return
      }
      await route.fulfill({ json: [fullDetailDraft] })
    })

    await page.route(`**/api/companies/**/project-cost-details/${detailId}/draft/operations`, route => route.fulfill({ json: operationalDetailDraft }))
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/evidence`, route => route.fulfill({ json: [] }))

    await page.goto(`/costs/${projectId}/entries/new`)
    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Chi phí vận chuyển cấu kiện')

    // Initial click drops network
    await page.getByTestId('save-draft-btn').click()

    // Retained replay banner must be visible
    await expect(page.getByTestId('retained-payload-replay-banner')).toBeVisible()
    await expect(page.getByTestId('replay-retained-command-btn')).toBeVisible()

    // Replay command
    await page.getByTestId('replay-retained-command-btn').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/entries/${detailId}$`))

    // Verified: Exactly the same idempotency key was replayed
    expect(requestCount).toBe(2)
    expect(firstIdempotencyKey).toBeTruthy()
    expect(replayIdempotencyKey).toBe(firstIdempotencyKey)
  })

  test('retains unresolved marker on IDEMPOTENCY_CONFLICT and keeps form protected', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
    await mockMetadata(page)

    await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'IDEMPOTENCY_CONFLICT: request fingerprint mismatch',
              requestId: 'req-conflict-1',
              details: {},
            },
          },
        })
        return
      }
      await route.fulfill({ json: [fullDetailDraft] })
    })

    await page.goto(`/costs/${projectId}/entries/new`)
    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Chi phí kiểm định vật liệu')

    await page.getByTestId('save-draft-btn').click()

    // Form error alert displays the conflict message
    await expect(page.getByTestId('new-entry-form-error')).toBeVisible()
    await expect(page.getByTestId('new-entry-form-error')).toContainText('Yêu cầu bị trùng lặp')

    // Verified: Marker was retained (banner or unresolved state active, Save Draft button remains protected/disabled)
    await expect(page.getByTestId('retained-payload-replay-banner')).toBeVisible()
    await expect(page.getByTestId('save-draft-btn')).toBeDisabled()
  })

  test('guards against rapid clicks and avoids double dispatch', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
    await mockMetadata(page)

    let releasePostResponse: (() => void) | null = null
    let postCount = 0
    await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        postCount++
        await new Promise<void>((resolve) => {
          releasePostResponse = () => {
            route.fulfill({
              status: 201,
              json: {
                id: detailId,
                projectCostItemId: '90000000-0000-4000-8000-000000000001',
                version: 1,
                publicationState: 'draft',
                replayed: false,
              },
            }).then(resolve)
          }
        })
        return
      }
      await route.fulfill({ json: [fullDetailDraft] })
    })

    await page.route(`**/api/companies/**/project-cost-details/${detailId}/draft/operations`, route => route.fulfill({ json: operationalDetailDraft }))
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/evidence`, route => route.fulfill({ json: [] }))

    await page.goto(`/costs/${projectId}/entries/new`)
    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Đổ bê tông sàn tầng 1')

    // Click once and assert the button is disabled while request is held
    const btn = page.getByTestId('save-draft-btn')
    await btn.click()
    await expect(btn).toBeDisabled()

    // Dispatch second click without swallowing errors; assert postCount === 1 while response is still held
    await btn.dispatchEvent('click')
    expect(postCount).toBe(1)

    // Release the response gate and verify navigation and postCount === 1
    expect(releasePostResponse).not.toBeNull()
    releasePostResponse!()

    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/entries/${detailId}$`))
    expect(postCount).toBe(1)
  })

  test('preserves same-context in-memory snapshots across ordinary navigation', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage', 'cost.read'] })]
    await mockMetadata(page)
    const minimalFinanceOverview = {
      schemaVersion: 1,
      project: {
        projectId,
        projectCode: 'DA-C1-01',
        projectName: 'Dự án C1',
        currencyCode: 'VND',
        moneyScale: 0,
        timeZone: 'Asia/Ho_Chi_Minh',
        operationalState: 'active',
      },
      summary: {
        budget: { state: 'not_recorded', amount: null, recordedCount: 0 },
        ownerAdvances: { state: 'not_recorded', amount: null, recordedCount: 0 },
        cost: { state: 'not_recorded', amount: null, recordedCount: 0, knownSubtotal: '0.0000' },
        warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
        reference: { kind: 'none', amount: null },
        margin: { state: 'unavailable', amount: null, reasons: ['NO_APPROVED_BUDGET'] },
        management: {
          receipts: { state: 'not_recorded', amount: null, recordedCount: 0, origin: 'none', quality: 'not_recorded', coverage: 'none', sourceReferences: [] },
          reference: { kind: 'none', amount: null, basis: 'none' },
          result: { state: 'unavailable', amount: null, basis: 'none', components: { receipts: null, cost: null, independentlyHeldRetention: null }, reasons: ['NO_REFERENCE'] },
          headline: { kind: 'unavailable', amount: null, basis: 'none' },
        },
        issues: [],
      },
      categories: [],
    }
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: minimalFinanceOverview }))

    let postCount = 0
    await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        postCount++
        if (postCount === 1) {
          // Drop connection
          await route.abort('failed')
          return
        }
        await route.fulfill({
          status: 201,
          json: {
            id: detailId,
            projectCostItemId: '90000000-0000-4000-8000-000000000001',
            version: 1,
            publicationState: 'draft',
            replayed: true,
          },
        })
        return
      }
      await route.fulfill({ json: [fullDetailDraft] })
    })

    await page.route(`**/api/companies/**/project-cost-details/${detailId}/draft/operations`, route => route.fulfill({ json: operationalDetailDraft }))
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/evidence`, route => route.fulfill({ json: [] }))

    // 1. Visit new detail screen and trigger failure
    await page.goto(`/costs/${projectId}/entries/new`)
    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Kiểm định cốt thép dầm')
    await page.getByTestId('save-draft-btn').click()
    await expect(page.getByTestId('retained-payload-replay-banner')).toBeVisible()

    // 2. Navigate away to project overview via client-side link (ordinary navigation)
    await page.getByRole('link', { name: /Quay lại/i }).click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}$`))

    // 3. Client-side navigate back to new detail screen via header button
    await page.getByTestId('header-create-detail-entry-btn').click()
    await expect(page.getByTestId('new-cost-detail-page')).toBeVisible()

    // Verified: In-memory snapshot was preserved across ordinary navigation!
    await expect(page.getByTestId('retained-payload-replay-banner')).toBeVisible()
    await page.getByTestId('replay-retained-command-btn').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/entries/${detailId}$`))
  })

  test('storage write failure prevents HTTP dispatch and releases loading state', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
    await mockMetadata(page)

    let postAttempted = false
    await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, async (route) => {
      postAttempted = true
      await route.fulfill({ status: 201, json: {} })
    })

    await page.goto(`/costs/${projectId}/entries/new`)
    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Thuê giàn giáo bao che')

    // Corrupt sessionStorage to throw QuotaExceeded on setItem
    await page.evaluate(() => {
      window.sessionStorage.setItem = () => {
        throw new Error('QuotaExceeded: storage blocked')
      }
    })

    // Submit Save Draft
    await page.getByTestId('save-draft-btn').click()

    // Storage error alert appears
    await expect(page.getByTestId('storage-error-alert')).toBeVisible()
    await expect(page.getByTestId('storage-error-alert')).toContainText('Không thể lưu trữ trạng thái phục hồi')

    // HTTP request was NEVER sent
    expect(postAttempted).toBe(false)

    // Button does not stay loading
    await expect(page.getByTestId('save-draft-btn')).toBeVisible()
  })

  test('dirty edits block publishing and discard restores clean state', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage', 'cost.prepare', 'cost.publish_import'] })]
    await mockMetadata(page)

    await page.route(`**/api/companies/**/project-cost-details/${detailId}/draft`, route => route.fulfill({ json: fullDetailDraft }))
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/evidence`, route => route.fulfill({ json: [] }))

    await page.goto(`/costs/${projectId}/entries/${detailId}`)
    await expect(page.getByTestId('detail-draft-page')).toBeVisible()

    // Publish button is initially enabled (readiness is ready: true)
    await expect(page.getByTestId('open-publish-modal-btn')).toBeEnabled()

    // Make an edit in operational form
    await page.getByTestId('detail-desc-input').fill('Chi phí mua thép tròn D10 đã điều chỉnh')

    // Unsaved edits warning is displayed and publish button is blocked
    await expect(page.getByTestId('unsaved-edits-page-alert')).toBeVisible()
    await expect(page.getByTestId('open-publish-modal-btn')).toBeDisabled()
    await expect(page.getByTestId('discard-operations-btn')).toBeVisible()

    // Discard operational changes
    await page.getByTestId('discard-operations-btn').click()

    // Form reverted, warning dismissed, publish button re-enabled
    await expect(page.getByTestId('unsaved-edits-page-alert')).toHaveCount(0)
    await expect(page.getByTestId('open-publish-modal-btn')).toBeEnabled()
    await expect(page.getByTestId('detail-desc-input')).toHaveValue('Chi phí mua thép tròn D10')
  })

  test('Regression 1 (stash→prepare): entered financials are stashed on draft save, hydrated as dirty, enable prepare, and retain stash until prepared', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage', 'cost.prepare', 'cost.publish_import'] })]
    await mockMetadata(page)

    const unpricedDraft = projectCostDetailDraftSchema.parse({
      ...fullDetailDraft,
      amount: null,
      quantity: null,
      unitCode: null,
      unitPrice: null,
      retentionKind: null,
      retentionRateBps: null,
      retentionAmount: null,
      publishReadiness: {
        ready: false,
        blockingCodes: ['FINANCIAL_DETAILS_REQUIRED'],
      },
    })

    let prepareCalled = false
    await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          json: {
            id: detailId,
            projectCostItemId: '90000000-0000-4000-8000-000000000001',
            version: 1,
            publicationState: 'draft',
            replayed: false,
          },
        })
        return
      }
      await route.fulfill({ json: [unpricedDraft] })
    })

    await page.route(`**/api/companies/**/project-cost-details/${detailId}/draft`, async (route) => {
      if (prepareCalled) {
        await route.fulfill({
          json: {
            ...unpricedDraft,
            version: 2,
            amount: '150000000.0000',
            publishReadiness: {
              ready: true,
              blockingCodes: [],
            },
          },
        })
      }
      else {
        await route.fulfill({ json: unpricedDraft })
      }
    })
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/evidence`, route => route.fulfill({ json: [] }))
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/financials`, async (route) => {
      prepareCalled = true
      await route.fulfill({
        json: {
          id: detailId,
          projectCostItemId: '90000000-0000-4000-8000-000000000001',
          publicationState: 'draft',
          version: 2,
          replayed: false,
        },
      })
    })

    // 1. Visit new detail screen and enter operational + financial info
    await page.goto(`/costs/${projectId}/entries/new`)
    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Chi phí mua thép tròn D10')
    await page.getByTestId('new-amount-input').fill('150000000')

    // 2. Click Save Draft -> Prompt modal opens
    await page.getByTestId('save-draft-btn').click()
    await expect(page.getByTestId('save-draft-confirm-modal')).toBeVisible()

    // 3. Confirm retaining financials for prepare step
    await page.getByTestId('confirm-save-draft-retain-fin-btn').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}/entries/${detailId}$`))

    // 4. Workbench: financial form is hydrated from stash as dirty values
    await expect(page.getByTestId('detail-draft-page')).toBeVisible()
    await expect(page.getByTestId('detail-amount-input')).toHaveValue('150000000')

    // Unsaved edits alert is shown, publish is blocked, Prepare button is enabled
    await expect(page.getByTestId('unsaved-edits-page-alert')).toBeVisible()
    await expect(page.getByTestId('save-financials-btn')).toBeEnabled()
    await expect(page.getByTestId('open-publish-modal-btn')).toBeDisabled()

    // 5. Click Save Financials to prepare
    await page.getByTestId('save-financials-btn').click()
    await expect(page.getByTestId('financial-success-alert')).toBeVisible()

    // 6. After successful prepare, dirty warning disappears and publish button is enabled
    await expect(page.getByTestId('unsaved-edits-page-alert')).toHaveCount(0)
    await expect(page.getByTestId('open-publish-modal-btn')).toBeEnabled()
  })

  test('Regression 2: dirty financial input survives operational save during same-detail refetch', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage', 'cost.prepare'] })]
    await mockMetadata(page)

    let operationalSaved = false
    await page.route(`**/api/companies/**/project-cost-details/${detailId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        operationalSaved = true
        await route.fulfill({
          json: {
            id: detailId,
            projectCostItemId: '90000000-0000-4000-8000-000000000001',
            publicationState: 'draft',
            version: 2,
            replayed: false,
          },
        })
        return
      }
      await route.continue()
    })
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/draft`, async (route) => {
      if (operationalSaved) {
        await route.fulfill({
          json: {
            ...fullDetailDraft,
            version: 2,
            description: 'Chi phí mua thép tròn D10 - Đã sửa vận hành',
          },
        })
      }
      else {
        await route.fulfill({ json: fullDetailDraft })
      }
    })
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/evidence`, route => route.fulfill({ json: [] }))

    await page.goto(`/costs/${projectId}/entries/${detailId}`)
    await expect(page.getByTestId('detail-draft-page')).toBeVisible()

    // 1. Enter dirty financial edit
    await page.getByTestId('detail-amount-input').fill('999000000')
    await expect(page.getByTestId('unsaved-edits-page-alert')).toBeVisible()

    // 2. Edit operational description and save
    await page.getByTestId('detail-desc-input').fill('Chi phí mua thép tròn D10 - Đã sửa vận hành')
    await page.getByTestId('save-operations-btn').click()
    await expect(page.getByTestId('operations-success-alert')).toBeVisible()

    // 3. Verified: Form did not unmount and dirty financial input survived the refetch!
    await expect(page.getByTestId('detail-amount-input')).toHaveValue('999000000')
    await expect(page.getByTestId('unsaved-edits-page-alert')).toBeVisible()
    await expect(page.getByTestId('discard-financials-btn')).toBeVisible()
  })

  test('Regression 4 (malformed/unreadable marker): blocks new dispatch and alerts user without overwriting storage', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage'] })]
    await mockMetadata(page)

    const companyId = authState.sessionCompanies[0]?.companyId
    const actorId = authState.user?.id

    await page.goto(`/costs/${projectId}/entries/new`)
    await expect(page.getByTestId('new-cost-detail-page')).toBeVisible()

    // Inject corrupted malformed JSON marker into sessionStorage
    const corruptedKey = `taskovia:unresolved:${companyId}:${actorId}:create_detail_draft:${projectId}`
    await page.evaluate(({ key }) => {
      window.sessionStorage.setItem(key, '{"corrupted_json": true, missing_bracket')
    }, { key: corruptedKey })

    // Reload page to evaluate corrupted recovery state
    await page.reload()
    await expect(page.getByTestId('new-cost-detail-page')).toBeVisible()

    // Untrusted recovery alert is visible
    await expect(page.getByTestId('untrusted-recovery-state-alert')).toBeVisible()
    await expect(page.getByTestId('untrusted-recovery-state-alert')).toContainText('Trạng thái phục hồi giao dịch không thể xác minh')

    // Submit button is disabled
    await expect(page.getByTestId('save-draft-btn')).toBeDisabled()

    // Verified: Corrupted storage was NOT overwritten or wiped
    const storageVal = await page.evaluate(({ key }) => {
      return window.sessionStorage.getItem(key)
    }, { key: corruptedKey })
    expect(storageVal).toBe('{"corrupted_json": true, missing_bracket')
  })

  test('navigating away while create-draft is pending leaves user on destination page and cleans original identity upon late response', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage', 'cost.read'] })]
    await mockMetadata(page)

    const companyId = authState.sessionCompanies[0]?.companyId ?? ''
    const actorId = authState.user?.id ?? ''

    let releaseDeferredResponse: (() => void) | null = null
    await page.route(`**/api/companies/**/projects/${projectId}/cost-entry-drafts`, async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise<void>((resolve) => {
          releaseDeferredResponse = () => {
            route.fulfill({
              status: 201,
              json: {
                id: detailId,
                projectCostItemId: '90000000-0000-4000-8000-000000000001',
                version: 1,
                publicationState: 'draft',
                replayed: false,
              },
            }).then(resolve)
          }
        })
        return
      }
      await route.fulfill({ json: [fullDetailDraft] })
    })
    await page.route(`**/api/companies/**/projects/${projectId}/finance`, route => route.fulfill({ json: { summary: {}, project: {} } }))

    // 1. Visit new detail screen and fill operational data
    await page.goto(`/costs/${projectId}/entries/new`)
    await expect(page.getByTestId('new-cost-detail-page')).toBeVisible()

    await page.getByTestId('new-category-select').selectOption(ordinaryCategoryId)
    await page.getByTestId('new-desc-input').fill('Kiểm định cốt thép dầm trễ')

    // 2. Click Save Draft to dispatch command
    await page.getByTestId('save-draft-btn').click()

    // Command marker must be persisted in sessionStorage for original identity
    const markerKey = `taskovia:unresolved:${companyId}:${actorId}:create_detail_draft:${projectId}`
    await expect.poll(async () => {
      return page.evaluate(({ key }) => window.sessionStorage.getItem(key), { key: markerKey })
    }).not.toBeNull()

    // 3. User navigates away via the back-link while request is pending
    await page.getByRole('link', { name: /Quay lại/i }).click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}$`))

    // 4. Release the delayed HTTP 201 response now that the originating page is unmounted
    expect(releaseDeferredResponse).not.toBeNull()
    releaseDeferredResponse!()

    // 5. Wait a moment and verify user STAYS on destination page (/costs/${projectId})
    // and does NOT navigate to /costs/${projectId}/entries/${detailId}
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(new RegExp(`/costs/${projectId}$`))

    // 6. Confirmed-success cleanup for the original command identity was preserved:
    const finalMarker = await page.evaluate(({ key }) => window.sessionStorage.getItem(key), { key: markerKey })
    expect(finalMarker).toBeNull()
  })

  test('ProjectCostDetailFinancialForm: exact decimal comparison distinguishes 9007199254740992 -> 9007199254740993 as dirty and equivalent formatting as equal', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['cost.manage', 'cost.prepare'] })]
    await mockMetadata(page)

    const baseAmount = '9007199254740992'
    const changedAmount = '9007199254740993'

    const largeAmountDraft = projectCostDetailDraftSchema.parse({
      ...operationalDetailDraft,
      quantity: '1.0000',
      unitCode: 'gói',
      unitPrice: baseAmount,
      amount: baseAmount,
      retentionKind: null,
      retentionRateBps: null,
      retentionAmount: null,
      sourceFigureIds: [],
      publishReadiness: {
        ready: true,
        blockingCodes: [],
      },
    })

    let savedPayload: unknown = null
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/draft`, route => route.fulfill({ json: largeAmountDraft }))
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/evidence`, route => route.fulfill({ json: [] }))
    await page.route(`**/api/companies/**/project-cost-details/${detailId}/financials`, async (route) => {
      savedPayload = route.request().postDataJSON()
      await route.fulfill({
        json: {
          id: detailId,
          projectCostItemId: '90000000-0000-4000-8000-000000000001',
          publicationState: 'draft',
          version: 2,
          replayed: false,
        },
      })
    })

    // 1. Visit workbench
    await page.goto(`/costs/${projectId}/entries/${detailId}`)
    await expect(page.getByTestId('detail-draft-page')).toBeVisible()
    await expect(page.getByTestId('detail-amount-input')).toHaveValue(baseAmount)

    // Initially clean
    await expect(page.getByTestId('save-financials-btn')).toBeDisabled()
    await expect(page.getByTestId('discard-financials-btn')).toHaveCount(0)
    await expect(page.getByTestId('unsaved-edits-page-alert')).toHaveCount(0)

    // 2. Equivalent decimal formatting: '9007199254740992.0000'
    await page.getByTestId('detail-amount-input').fill(`${baseAmount}.0000`)
    await page.getByTestId('detail-amount-input').blur()

    // Form must remain clean (not dirty)!
    await expect(page.getByTestId('save-financials-btn')).toBeDisabled()
    await expect(page.getByTestId('discard-financials-btn')).toHaveCount(0)
    await expect(page.getByTestId('unsaved-edits-page-alert')).toHaveCount(0)

    // 3. Exact decimal difference beyond IEEE-754 53-bit limit: '9007199254740993'
    // Under Number() this would be lost and considered unchanged, but exact comparison detects dirty!
    await page.getByTestId('detail-amount-input').fill(changedAmount)
    await page.getByTestId('detail-amount-input').blur()

    // Form must become dirty!
    await expect(page.getByTestId('save-financials-btn')).toBeEnabled()
    await expect(page.getByTestId('discard-financials-btn')).toBeVisible()
    await expect(page.getByTestId('unsaved-edits-page-alert')).toBeVisible()

    // 4. Test Discard behavior
    await page.getByTestId('discard-financials-btn').click()
    await expect(page.getByTestId('detail-amount-input')).toHaveValue(baseAmount)
    await expect(page.getByTestId('save-financials-btn')).toBeDisabled()
    await expect(page.getByTestId('discard-financials-btn')).toHaveCount(0)
    await expect(page.getByTestId('unsaved-edits-page-alert')).toHaveCount(0)

    // 5. Re-apply changedAmount and Save
    await page.getByTestId('detail-amount-input').fill(changedAmount)
    await page.getByTestId('save-financials-btn').click()

    await expect(page.getByTestId('financial-success-alert')).toBeVisible()
    expect(savedPayload).toMatchObject({
      expectedVersion: 1,
      amount: changedAmount,
    })
  })
})
