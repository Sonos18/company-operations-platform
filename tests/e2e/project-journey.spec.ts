import { expect, test } from '@playwright/test'

test('uses one stage-card contract for focused and neighboring stages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/project-thao-dien')

  const cards = page.getByTestId('journey-stage-card')
  await expect(cards).toHaveCount(3)
  await expect(cards.filter({ hasText: 'Thi công & giám sát' })).toHaveAttribute('data-focused', 'true')

  await cards.filter({ hasText: 'Hợp đồng & chuẩn bị thi công' }).getByRole('button', { name: /Xem giai đoạn/ }).click()
  await expect(cards.filter({ hasText: 'Hợp đồng & chuẩn bị thi công' })).toHaveAttribute('data-focused', 'true')
})

test('centers the current stage and keeps project state while browsing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/project-thao-dien')
  const focused = page.getByTestId('stage-focused')
  await expect(focused).toContainText('Thi công & giám sát')
  await page.getByRole('button', { name: 'Giai đoạn trước' }).click()
  await expect(page.getByText('ĐANG THỰC HIỆN', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Quay về giai đoạn hiện tại' }).click()
  await expect(focused).toContainText('Thi công & giám sát')

  const track = await page.getByTestId('desktop-journey-carousel').boundingBox()
  const focusedBox = await page.locator('[data-testid="journey-stage-card"][data-focused="true"]').boundingBox()
  const neighborBox = await page.locator('[data-testid="journey-stage-card"][data-focused="false"]').first().boundingBox()
  const footerBox = await page.getByTestId('journey-footer').boundingBox()
  const dashboardBox = await page.locator('.journey-dashboard').boundingBox()
  expect(Math.abs(focusedBox!.width - track!.width * 0.58 * 1.015)).toBeLessThanOrEqual(3)
  expect(Math.abs(focusedBox!.height - track!.height * 0.84 * 1.015)).toBeLessThanOrEqual(3)
  expect(Math.abs(neighborBox!.height - track!.height * 0.54 * .94)).toBeLessThanOrEqual(3)
  expect(footerBox!.height).toBe(220)
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(dashboardBox!.y + dashboardBox!.height)
})

test('jumps directly to a stage from the journey rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/project-thao-dien')

  const rail = page.getByTestId('journey-stage-rail')
  await expect(rail).toBeVisible()
  await rail.getByRole('button', { name: 'Xem giai đoạn 04: Phối cảnh 3D & chốt phương án' }).click()

  await expect(page.getByTestId('stage-focused')).toContainText('Phối cảnh 3D & chốt phương án')
  await expect(rail.getByRole('button', { name: 'Xem giai đoạn 04: Phối cảnh 3D & chốt phương án' })).toHaveAttribute('aria-current', 'step')
})
