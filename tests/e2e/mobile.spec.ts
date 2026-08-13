import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('uses a vertical stage list on mobile', async ({ page }) => {
  await page.goto('/projects/project-thao-dien')
  await expect(page.getByTestId('mobile-stage-list')).toBeVisible()
  await expect(page.getByTestId('desktop-journey-carousel')).toBeHidden()
  await expect(page.getByTestId('journey-stage-rail')).toBeHidden()
})
