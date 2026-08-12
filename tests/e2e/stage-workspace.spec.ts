import { expect, test } from '@playwright/test'

test('shows completed history and advisory missing records without blocking navigation', async ({ page }) => {
  await page.goto('/projects/project-thao-dien/stages/stage-design-3d')
  await expect(page.getByRole('heading', { name: 'Phối cảnh 3D & chốt phương án' })).toBeVisible()
  await expect(page.getByText('Điều kiện hướng dẫn — không khóa giai đoạn')).toBeVisible()
  await expect(page.getByText('Lịch sử hoạt động')).toBeVisible()
  await page.getByRole('link', { name: 'Mở bản vẽ' }).click()
  await expect(page).toHaveURL(/\/drawings$/)
})
