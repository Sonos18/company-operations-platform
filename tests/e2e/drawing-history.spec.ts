import { expect, test } from '@playwright/test'

test('changes the circulating version without losing the approved baseline', async ({ page }) => {
  await page.goto('/projects/project-thao-dien/stages/stage-design-3d/drawings')
  await expect(page.getByText('Mốc khách hàng đã chốt')).toContainText('v1')
  await page.getByRole('button', { name: 'Đặt v2 làm bản lưu hành' }).click()
  await expect(page.getByTestId('circulating-version')).toContainText('v2')
  await expect(page.getByText('Mốc khách hàng đã chốt')).toContainText('v1')
  await page.reload()
  await expect(page.getByTestId('circulating-version')).toContainText('v2')
})
