import { expect, test } from '@playwright/test'

test('groups work and preserves assignment source', async ({ page }) => {
  await page.goto('/my-work')
  await expect(page.getByRole('heading', { name: 'Công việc của tôi' })).toBeVisible()
  for (const group of ['Quá hạn', 'Hôm nay', 'Sắp tới', 'Đang chờ']) {
    await expect(page.getByRole('heading', { name: group })).toBeVisible()
  }
  await expect(page.getByText('Giám đốc giao').first()).toBeVisible()
  await expect(page.getByText('Tự đề xuất').first()).toBeVisible()
})
