import { expect, test } from './fixtures/authenticated'

test('shows approved target and latest construction photo at equal width', async ({ page }) => {
  await page.goto('/projects/project-thao-dien')
  const target = page.getByTestId('design-target')
  const current = page.getByTestId('site-current')
  await expect(target).toContainText('Mục tiêu đã chốt')
  await expect(current).toContainText('Hiện trạng mới nhất')
  const [targetBox, currentBox] = await Promise.all([target.boundingBox(), current.boundingBox()])
  expect(Math.abs(targetBox!.width - currentBox!.width)).toBeLessThanOrEqual(2)
  await expect(current).toContainText('Anh Hiếu')
})
