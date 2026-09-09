import AxeBuilder from '@axe-core/playwright'
import { createCompany } from './fixtures/auth-routes'
import { expect, test } from './fixtures/authenticated'
import { createDenseStage01OperationalDetail, createStage01OperationalRouteState, installStage01OperationalRoutes, installStatefulStage01OperationalRoutes, stage01OpportunityId } from './fixtures/stage01-operational'

async function goToDenseWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`/opportunities/${stage01OpportunityId}/stage-01`)
  await expect(page.getByRole('heading', { name: 'Công ty Việt Quốc Huy' })).toBeVisible()
}

const densePermissions = [
  'project.read', 'journey.read', 'opportunity.read', 'opportunity.update',
  'journey.blocker.raise', 'stage01.evaluation.update', 'stage01.recommendation.submit',
  'stage01.clarification.return',
]

test('keeps dense Stage 01 history readable without horizontal overflow at mobile and desktop sizes', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: densePermissions })]
  const detail = createDenseStage01OperationalDetail()
  await installStage01OperationalRoutes(page, detail)
  const mutationRequests: import('@playwright/test').Request[] = []
  page.on('request', request => { if (request.method() !== 'GET') mutationRequests.push(request) })

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await goToDenseWorkspace(page)
    await expect(page.getByText('Liên hệ dày 20', { exact: true })).toBeVisible()
    await expect(page.getByText('Chu kỳ #20 · Chưa ghi nhận quyết định', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await expect(page.locator('.intake-controls__card').filter({ hasText: 'Liên hệ' }).getByRole('listitem')).toHaveCount(20)
    await expect(page.locator('.evaluation-decision__section').filter({ hasText: 'Chu kỳ quyết định' }).getByRole('listitem')).toHaveCount(20)
    await expect(page.getByRole('region', { name: 'Đánh giá, đề xuất và quyết định', exact: true })
      .getByRole('article').first().getByText('Bản sửa #2', { exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Chưa chỉ định người có thẩm quyền quyết định.' })).toBeVisible()

    const cycleOne = page.locator('details').filter({ has: page.getByText('Chu kỳ #1 · Đã ghi nhận quyết định', { exact: true }) })
    const cycleTwo = page.locator('details').filter({ has: page.getByText('Chu kỳ #2 · Đã ghi nhận quyết định', { exact: true }) })
    await expect(cycleOne).toHaveCount(1)
    await expect(cycleTwo).toHaveCount(1)
    const mutationsBeforeInspection = mutationRequests.length
    await cycleOne.locator('summary').click()
    await cycleTwo.locator('summary').click()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await expect(cycleOne.locator('time[datetime="2026-09-01T00:00:00.000Z"]').first()).toHaveAttribute('datetime', '2026-09-01T00:00:00.000Z')
    await expect(cycleOne).toContainText('dense-reference-')
    await expect(cycleOne).toContainText('Đề xuất chu kỳ 1, phiên bản 2')
    await expect(cycleOne).toContainText('Lý do chu kỳ 1, bản sửa 1')
    await expect(cycleOne.locator('form, input, select, textarea')).toHaveCount(0)
    await expect(cycleTwo).toContainText('Kích hoạt lại: Kích hoạt lại chu kỳ 2')
    await expect(cycleTwo).toContainText('Quyết định cuối cùng: Tiếp tục')
    await expect(cycleTwo).toContainText('Cần làm rõ chu kỳ 2 · Đề xuất tham chiếu: 82000000-0000-4000-8000-000000003211')
    await expect(cycleTwo).toContainText('Đề xuất được quyết định tham chiếu: 82000000-0000-4000-8000-000000003211 · phiên bản #1 · Đề xuất tiếp tục · Đề xuất chu kỳ 2, phiên bản 1')
    await expect(cycleTwo).toContainText('Lý do ghi đè: Ngoại lệ đã được ghi nhận trong quyết định chu kỳ 2')
    const cycleTwoEvaluationHistory = cycleTwo.locator('ol').filter({ hasText: 'Tính khả thi thương mại · Bản sửa #1' })
    const cycleTwoRecommendationHistory = cycleTwo.locator('ol').filter({ hasText: 'Phiên bản #1 · Đề xuất tiếp tục' })
    await expect(cycleTwoEvaluationHistory).toHaveCount(1)
    await expect(cycleTwoRecommendationHistory).toHaveCount(1)
    await expect(cycleTwoEvaluationHistory.getByText('Người thực hiện: 82000000-0000-4000-8000-000000000900', { exact: true })).toHaveCount(10)
    await expect(cycleTwoEvaluationHistory.locator('time[datetime="2026-09-01T00:00:00.000Z"]')).toHaveCount(10)
    await expect(cycleTwoRecommendationHistory.getByText('Người thực hiện: 82000000-0000-4000-8000-000000000900', { exact: true })).toHaveCount(2)
    await expect(cycleTwoRecommendationHistory.locator('time[datetime="2026-09-01T00:00:00.000Z"]')).toHaveCount(2)
    const cycleTwoFinalDecision = cycleTwo.getByRole('heading', { name: 'Quyết định cuối cùng', exact: true })
    await expect(cycleTwoFinalDecision.locator('xpath=following-sibling::p[contains(normalize-space(.), "Người thực hiện:")]')).toHaveText('Người thực hiện: 82000000-0000-4000-8000-000000000900')
    await expect(cycleTwoFinalDecision.locator('xpath=following-sibling::time[1]')).toHaveAttribute('datetime', '2026-09-01T00:00:00.000Z')
    await expect(cycleOne).not.toContainText('Đề xuất chu kỳ 2')
    await expect(cycleTwo).not.toContainText('Đề xuất chu kỳ 1')
    expect(mutationRequests.length).toBe(mutationsBeforeInspection)
    await cycleOne.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(cycleOne).not.toHaveAttribute('open', '')
    await page.keyboard.press('Enter')
    await expect(cycleOne).toHaveAttribute('open', '')
  }
})

test('keeps dense Stage 01 critical controls labelled and keyboard-operable', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: densePermissions })]
  const state = createStage01OperationalRouteState()
  state.detail = createDenseStage01OperationalDetail()
  await installStatefulStage01OperationalRoutes(page, state)

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await goToDenseWorkspace(page)

    const edit = page.getByRole('button', { name: 'Chỉnh sửa cơ hội', exact: true })
    await edit.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Tên khách hàng chính', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Trạng thái vị trí', exact: true })).toBeVisible()

    const workflow = page.getByRole('region', { name: 'Điều hành node, phân công và blocker', exact: true })
    const intake = workflow.locator('article').filter({ has: page.getByRole('heading', { name: '01.1 Tiếp nhận', exact: true }) })
    const blocker = intake.getByRole('button', { name: 'Nêu blocker', exact: true })
    await blocker.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('combobox', { name: 'Ảnh hưởng', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Danh mục blocker', exact: true })).toBeVisible()
    const description = page.getByRole('textbox', { name: 'Mô tả blocker', exact: true })
    await expect(description).toBeVisible()
    await description.fill(`Blocker dense ${viewport.width}`)
    const save = page.getByRole('button', { name: 'Lưu blocker', exact: true })
    await save.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Đã nêu blocker.' })).toBeVisible()
  }
})

test('has no critical axe violations on dense Stage 01', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: densePermissions })]
  await installStage01OperationalRoutes(page, createDenseStage01OperationalDetail())
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await goToDenseWorkspace(page)
    const historicalCycle = page.getByRole('region', { name: 'Chu kỳ quyết định', exact: true })
      .locator('details').filter({ has: page.getByText('Chu kỳ #1 · Đã ghi nhận quyết định', { exact: true }) })
    await historicalCycle.locator('summary').click()
    const result = await new AxeBuilder({ page }).analyze()
    expect(result.violations.filter(violation => violation.impact === 'critical')).toEqual([])
  }
})
