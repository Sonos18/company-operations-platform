import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures/authenticated'

test('has no serious accessibility violations on core pages', async ({ page }) => {
  for (const route of ['/projects', '/projects/project-thao-dien', '/my-work', '/employees']) {
    await page.goto(route)
    const result = await new AxeBuilder({ page }).analyze()
    expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
  }
})
