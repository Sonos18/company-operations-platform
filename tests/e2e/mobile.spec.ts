import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('keeps journey previous and next controls touch-sized', async ({ page }) => {
  await page.goto('/projects/project-thao-dien')

  for (const name of ['Giai đoạn trước', 'Giai đoạn sau']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})

test('keeps the focused-stage action touch-sized', async ({ page }) => {
  await page.setViewportSize({ width: 639, height: 844 })
  await page.goto('/projects/project-thao-dien')

  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')
  const box = await focused.getByRole('link', { name: 'Mở không gian giai đoạn' }).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
})

test('uses a swipeable journey without horizontal page overflow', async ({ page }) => {
  await page.goto('/projects/project-thao-dien')

  await expect(page.getByTestId('journey-carousel')).toBeVisible()
  await expect(page.getByTestId('mobile-stage-list')).toHaveCount(0)
  await expect(page.locator('[data-testid="journey-stage-card"][data-focused="true"]')).toContainText('Thi công & giám sát')

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)

  const carouselViewport = page.getByTestId('journey-carousel').locator('[data-slot="viewport"]')
  const box = await carouselViewport.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width * .75, box!.y + box!.height * .5)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * .25, box!.y + box!.height * .5, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('[data-testid="journey-stage-card"][data-focused="true"]')).toContainText('Nghiệm thu & bàn giao')
})

test('renders employee directory cards without horizontal overflow on mobile', async ({ page }) => {
  await page.goto('/employees')

  await expect(page.getByTestId('employee-cards')).toBeVisible()
  await expect(page.getByTestId('employee-table')).toBeHidden()
  await expect(page.getByTestId('employee-card')).toHaveCount(6)

  const search = page.getByRole('searchbox', { name: 'Tìm nhân sự' })
  const box = await search.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(44)

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
})
