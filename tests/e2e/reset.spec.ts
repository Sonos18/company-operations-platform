import { expect, test } from './fixtures/authenticated'

test('restores the original mock state', async ({ page }) => {
  await page.goto('/projects/project-thao-dien/stages/stage-design-3d/drawings')
  await page.getByRole('button', { name: 'Đặt v2 làm bản lưu hành' }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Khôi phục dữ liệu mẫu' }).click()
  await expect(page.getByTestId('circulating-version')).toContainText('v1')
})
