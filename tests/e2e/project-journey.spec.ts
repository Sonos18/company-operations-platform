import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/project-thao-dien')
})

test('centers the actual current stage and preserves workflow state while browsing', async ({ page }) => {
  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')
  await expect(page.getByTestId('journey-stage-card')).toHaveCount(7)
  await expect(focused).toContainText('Thi công & giám sát')
  await expect(page.getByTestId('journey-summary')).toContainText('5/7')

  await page.getByRole('button', { name: 'Giai đoạn trước' }).click()
  await expect(focused).toContainText('Hợp đồng & chuẩn bị thi công')
  await expect(page.getByText('Giai đoạn hiện tại: Thi công & giám sát').first()).toBeVisible()

  await page.getByRole('button', { name: 'Quay về giai đoạn hiện tại' }).click()
  await expect(focused).toContainText('Thi công & giám sát')
})

test('supports direct rail and keyboard navigation at journey boundaries', async ({ page }) => {
  const carousel = page.getByTestId('journey-carousel')
  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')

  await page.getByTestId('journey-stage-rail').getByRole('button', { name: 'Xem giai đoạn 01: Tiếp nhận yêu cầu' }).click()
  await expect(focused).toContainText('Tiếp nhận yêu cầu')
  await expect(page.getByRole('button', { name: 'Giai đoạn trước' })).toBeDisabled()

  await carousel.focus()
  await page.keyboard.press('ArrowRight')
  await expect(focused).toContainText('Khảo sát hiện trạng')

  await page.getByTestId('journey-stage-rail').getByRole('button', { name: 'Xem giai đoạn 07: Nghiệm thu & bàn giao' }).click()
  await expect(page.getByRole('button', { name: 'Giai đoạn sau' })).toBeDisabled()
})
