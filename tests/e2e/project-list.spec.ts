import { expect, test } from '@playwright/test'

test('lists only VQH projects and opens the selected project', async ({ page }) => {
  await page.goto('/projects')
  await expect(page.getByText('Việt Quốc Huy', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dự án' })).toBeVisible()
  await expect(page.getByText('Nhà phố Thảo Điền')).toBeVisible()
  await expect(page.getByText('Công ty kiểm thử cách ly')).toHaveCount(0)
  await page.getByRole('link', { name: /Mở dự án Nhà phố Thảo Điền/ }).click()
  await expect(page).toHaveURL(/\/projects\/project-thao-dien$/)
})
