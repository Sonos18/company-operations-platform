import { expect, test } from './fixtures/authenticated'
import type { Page } from '@playwright/test'
import { createAuthTestState, createCompany, installAuthRoutes } from './fixtures/auth-routes'
import { appNotificationPageSchema } from '../../shared/schemas/costs/material-finance'

const companyId = '10000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000001'
const proposalId = '31000000-0000-4000-8000-000000000001'
const requestId = '34000000-0000-4000-8000-000000000001'
const userId = '11111111-1111-4111-8111-111111111111'
const base = `/api/companies/${companyId}`

// The API keeps microsecond precision. The cut-off sent to the server must be this exact string, because
// re-serialising it through Date would truncate to milliseconds and leave the newest notification unread.
const newestMaterialCreatedAt = '2026-10-16T03:00:00.123456+00:00'
const newestCostCreatedAt = '2026-10-12T03:00:00.000Z'
const secondPageCursor = 'cursor-page-2'

function materialItem(id: string, eventKind: string, createdAt: string, readAt: string | null) {
  return {
    id,
    eventKind,
    projectId,
    linkPath: `/materials/${projectId}/proposals/${proposalId}`,
    payload: eventKind === 'material.proposal.submitted'
      ? { projectName: 'Eo Gió', proposalNo: 18, revisionNo: 1, actorName: 'Nguyễn Văn An', summaryName1: 'Thép D10', summaryName2: null, summaryTotal: 1 }
      : { supplierName: 'NCC Thép Hòa Phát' },
    createdAt,
    readAt,
  }
}

const idOf = (n: number) => `36000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const costId = '35000000-0000-4000-8000-000000000001'

function costNotification(readAt: string | null) {
  return {
    id: costId,
    projectId,
    requestId,
    submittedVersionId: '37000000-0000-4000-8000-000000000001',
    kind: 'installment',
    decisionId: '38000000-0000-4000-8000-000000000001',
    recipientId: userId,
    deliveryState: 'available',
    readAt,
    createdAt: newestCostCreatedAt,
  }
}

interface ReadAllBody { materialUpTo: string | null, costUpTo: string | null }

interface NotificationMocks {
  readAllBodies: ReadAllBody[]
  listCursors: Array<string | null>
  costLists: () => number
}

/**
 * Stubs both notification sources. `read` flips once the read-all command arrives, so the reload that follows
 * it returns every notification as read. The first material page has a next cursor; the second has none.
 */
async function mockNotificationSources(page: Page, options: { costStatus?: number } = {}): Promise<NotificationMocks> {
  const readAllBodies: ReadAllBody[] = []
  const listCursors: Array<string | null> = []
  let read = false
  let costLists = 0
  const readAt = () => (read ? '2026-10-16T04:00:00+00:00' : null)

  await page.route(`**${base}/cost-notifications`, (route) => {
    costLists++
    return options.costStatus
      ? route.fulfill({ status: options.costStatus, json: { code: 'INTERNAL', message: 'cost notifications unavailable' } })
      : route.fulfill({ json: [costNotification(readAt())] })
  })
  await page.route(`**${base}/notifications**`, (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname.endsWith('/notifications/read-all')) {
      readAllBodies.push(request.postDataJSON() as ReadAllBody)
      read = true
      return route.fulfill({ json: { material: 2, cost: options.costStatus ? 0 : 1 } })
    }
    const cursor = url.searchParams.get('cursor')
    listCursors.push(cursor)
    const items = cursor === secondPageCursor
      ? [materialItem(idOf(3), 'material.order.created', '2026-10-01T03:00:00+00:00', readAt())]
      : [
          materialItem(idOf(1), 'material.proposal.submitted', newestMaterialCreatedAt, readAt()),
          materialItem(idOf(2), 'material.order.created', '2026-10-15T03:00:00+00:00', readAt()),
        ]
    return route.fulfill({
      json: appNotificationPageSchema.parse({ items, nextCursor: cursor === secondPageCursor ? null : secondPageCursor }),
    })
  })
  return { readAllBodies, listCursors, costLists: () => costLists }
}

async function openMaterialsPage(page: Page) {
  await installAuthRoutes(page, createAuthTestState({
    sessionCompanies: [createCompany({ companyId, permissions: ['material.read', 'cost.notification.read'] })],
  }))
  await page.route(`**${base}/material-procurement/projects`, route => route.fulfill({
    json: [{ projectId, code: 'DA-EG-01', name: 'Eo Gió', locationText: null }],
  }))
  await page.route(`**${base}/material-finance/inbox**`, route => route.fulfill({
    json: { awaitingContract: [], dueInstallments: [], returnedRequests: [], pendingApproval: [], approvedAwaitingPayment: [] },
  }))
}

const bellButton = (page: Page) => page.getByRole('button', { name: /^Thông báo/ })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Thông báo' })

test.use({ viewport: { width: 1280, height: 900 } })

test.describe('Trung tâm thông báo', () => {
  test('nút hiện số chưa đọc và hộp có nhãn Cần duyệt, Đã duyệt', async ({ page }) => {
    await openMaterialsPage(page)
    await mockNotificationSources(page)

    await page.goto('/materials')
    await expect(bellButton(page).getByTestId('notification-unread-count')).toHaveText('3')
    // Screen readers hear the unread count with its meaning, not a bare number.
    await expect(page.getByRole('button', { name: 'Thông báo 3 chưa đọc' })).toBeVisible()

    await bellButton(page).click()
    const box = dialog(page)
    await expect(box).toBeVisible()
    await expect(box.getByTestId('material-notification')).toHaveCount(2)
    await expect(box.getByTestId('cost-notification')).toHaveCount(1)
    await expect(box.getByText('Cần duyệt', { exact: true })).toBeVisible()
    await expect(box.getByText('Đã duyệt', { exact: true })).toBeVisible()
    await expect(box.getByRole('img', { name: 'Chưa đọc' })).toHaveCount(3)
  })

  test('có nextCursor thì có "Xem thêm" và bấm thì thêm thẻ', async ({ page }) => {
    await openMaterialsPage(page)
    const mocks = await mockNotificationSources(page)

    await page.goto('/materials')
    await bellButton(page).click()
    const box = dialog(page)
    await expect(box.getByTestId('material-notification')).toHaveCount(2)

    const more = box.getByRole('button', { name: 'Xem thêm', exact: true })
    await expect(more).toBeVisible()
    await more.click()

    await expect(box.getByTestId('material-notification')).toHaveCount(3)
    // The last page has no cursor, so the button goes away.
    await expect(more).toHaveCount(0)
    expect(mocks.listCursors.filter((cursor): cursor is string => cursor !== null)).toEqual([secondPageCursor])
  })

  test('"Đánh dấu đã đọc hết" gửi mốc đúng của từng nguồn rồi nạp lại', async ({ page }) => {
    await openMaterialsPage(page)
    const mocks = await mockNotificationSources(page)

    await page.goto('/materials')
    await bellButton(page).click()
    const box = dialog(page)
    await expect(box.getByTestId('material-notification')).toHaveCount(2)
    const listsBefore = mocks.costLists()

    await box.getByRole('button', { name: 'Đánh dấu đã đọc hết', exact: true }).click()

    await expect.poll(() => mocks.readAllBodies.length).toBe(1)
    // Raw createdAt strings: the microsecond fraction must survive.
    expect(mocks.readAllBodies[0]).toEqual({ materialUpTo: newestMaterialCreatedAt, costUpTo: newestCostCreatedAt })
    // The list is reloaded afterwards and shows everything as read.
    await expect.poll(() => mocks.costLists()).toBeGreaterThan(listsBefore)
    await expect(bellButton(page).getByTestId('notification-unread-count')).toHaveCount(0)
    await expect(box.getByRole('img', { name: 'Chưa đọc' })).toHaveCount(0)
    await expect(box.getByRole('button', { name: 'Đánh dấu đã đọc hết', exact: true })).toBeDisabled()
  })

  test('"Đánh dấu đã đọc hết" bị khóa khi danh sách đang nạp', async ({ page }) => {
    await openMaterialsPage(page)
    await mockNotificationSources(page)
    // Registered after the shared mock, so this handler runs first and holds the list back.
    let releaseList: () => void = () => {}
    const listGate = new Promise<void>((resolve) => { releaseList = resolve })
    let hold = false
    await page.route(`**${base}/cost-notifications`, async (route) => {
      if (hold) await listGate
      await route.fallback()
    })

    await page.goto('/materials')
    await expect(bellButton(page).getByTestId('notification-unread-count')).toHaveText('3')
    await bellButton(page).click()
    const box = dialog(page)
    await expect(box.getByTestId('material-notification')).toHaveCount(2)
    const markAll = box.getByRole('button', { name: 'Đánh dấu đã đọc hết', exact: true })
    await expect(markAll).toBeEnabled()

    hold = true
    await box.getByRole('button', { name: 'Làm mới', exact: true }).click()
    await expect(box.getByText('Đang nạp thông báo...')).toBeVisible()
    await expect(markAll).toBeDisabled()

    releaseList()
    await expect(box.getByText('Đang nạp thông báo...')).toHaveCount(0)
    await expect(markAll).toBeEnabled()
  })

  test('nguồn khoản chi lỗi 500 thì costUpTo là null và nguồn vật tư vẫn được đánh dấu', async ({ page }) => {
    await openMaterialsPage(page)
    const mocks = await mockNotificationSources(page, { costStatus: 500 })

    await page.goto('/materials')
    await expect(bellButton(page).getByTestId('notification-unread-count')).toHaveText('2')
    await bellButton(page).click()
    const box = dialog(page)
    await expect(box.getByTestId('material-notification')).toHaveCount(2)
    await expect(box.getByTestId('cost-notification')).toHaveCount(0)

    await box.getByRole('button', { name: 'Đánh dấu đã đọc hết', exact: true }).click()

    await expect.poll(() => mocks.readAllBodies.length).toBe(1)
    expect(mocks.readAllBodies[0]).toEqual({ materialUpTo: newestMaterialCreatedAt, costUpTo: null })
  })

  test('Esc đóng hộp và trả tiêu điểm về nút mở', async ({ page }) => {
    await openMaterialsPage(page)
    await mockNotificationSources(page)

    await page.goto('/materials')
    const bell = bellButton(page)
    await bell.click()
    await expect(dialog(page)).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(dialog(page)).toHaveCount(0)
    await expect(bell).toBeFocused()
  })

  test('ở 375px không có cuộn ngang, cả khi hộp đang mở', async ({ page }) => {
    await openMaterialsPage(page)
    await mockNotificationSources(page)
    await page.setViewportSize({ width: 375, height: 812 })

    await page.goto('/materials')
    await expect(bellButton(page).getByTestId('notification-unread-count')).toHaveText('3')
    await bellButton(page).click()
    const box = dialog(page)
    await expect(box.getByTestId('material-notification')).toHaveCount(2)

    const overflow = await page.evaluate(() => {
      const root = document.documentElement
      const dialogElement = document.querySelector('[role="dialog"]')
      return {
        pageScrollWidth: root.scrollWidth,
        pageClientWidth: root.clientWidth,
        dialogScrollWidth: dialogElement?.scrollWidth ?? 0,
        dialogClientWidth: dialogElement?.clientWidth ?? 0,
      }
    })
    expect(overflow.pageScrollWidth).toBeLessThanOrEqual(overflow.pageClientWidth)
    expect(overflow.dialogClientWidth).toBeGreaterThan(0)
    expect(overflow.dialogScrollWidth).toBeLessThanOrEqual(overflow.dialogClientWidth)
  })
})
