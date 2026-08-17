import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/projects/project-thao-dien')
})

test('places the complete summary after the stage banners without a stage rail', async ({ page }) => {
  const summary = page.getByTestId('journey-summary')
  const metrics = summary.locator(':scope > [data-slot="root"]')

  await expect(page.getByTestId('journey-stage-card')).toHaveCount(7)
  await expect(page.getByTestId('journey-stage-rail')).toHaveCount(0)
  await expect(metrics).toHaveCount(3)
  await expect(metrics.nth(0)).toContainText('5/7')
  await expect(metrics.nth(0)).toContainText('giai đoạn hoàn tất')
  await expect(metrics.nth(1)).toContainText('5')
  await expect(metrics.nth(1)).toContainText('bước đang mở')
  await expect(metrics.nth(2)).toContainText('1')
  await expect(metrics.nth(2)).toContainText('hồ sơ còn thiếu')

  const summaryFollowsCarousel = await page.getByTestId('project-journey').evaluate((journey) => {
    const carousel = journey.querySelector('[data-testid="journey-carousel"]')
    const summaryElement = journey.querySelector('[data-testid="journey-summary"]')
    if (!carousel || !summaryElement) return false

    return Boolean(carousel.compareDocumentPosition(summaryElement) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(summaryFollowsCarousel).toBe(true)
})

test('centers the actual current stage and preserves workflow state while browsing', async ({ page }) => {
  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')
  await expect(page.getByTestId('journey-stage-card')).toHaveCount(7)
  await expect(focused).toContainText('Thi công & giám sát')
  await expect(page.getByTestId('journey-summary')).toContainText('5/7')

  await page.getByRole('button', { name: 'Giai đoạn trước' }).click()
  await expect(focused).toContainText('Hợp đồng & chuẩn bị thi công')
  await expect(page.getByText('Giai đoạn hiện tại: Thi công & giám sát').first()).toBeVisible()

  await page.getByRole('button', { name: 'Quay về giai đoạn hiện tại' }).click()
  await expect(focused).toContainText('Thi công & giám sát')
})

test('supports previous, next, and keyboard navigation at journey boundaries', async ({ page }) => {
  const carousel = page.getByTestId('journey-carousel')
  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')
  const previous = page.getByRole('button', { name: 'Giai đoạn trước' })
  const next = page.getByRole('button', { name: 'Giai đoạn sau' })

  for (let index = 0; index < 5; index += 1) await previous.click()
  await expect(focused).toContainText('Tiếp nhận yêu cầu')
  await expect(previous).toBeDisabled()

  await carousel.focus()
  await page.keyboard.press('ArrowRight')
  await expect(focused).toContainText('Khảo sát hiện trạng')

  for (let index = 0; index < 5; index += 1) await next.click()
  await expect(focused).toContainText('Nghiệm thu & bàn giao')
  await expect(next).toBeDisabled()
})

test('updates contextual footer content with the focused stage', async ({ page }) => {
  const footer = page.getByTestId('journey-footer')
  await expect(footer).toContainText('Thi công & giám sát')
  await expect(footer).toContainText('Cập nhật gần nhất')
  await expect(footer).toContainText('09:30 12 thg 8, 2026')

  await page.getByRole('button', { name: 'Giai đoạn trước' }).click()
  await expect(footer).toContainText('Hợp đồng & chuẩn bị thi công')
})

test('focuses the visible next-stage card when its preview is selected', async ({ page }) => {
  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')
  const nextStagePreview = page
    .getByTestId('journey-carousel')
    .getByRole('button', { name: 'Xem giai đoạn 07: Nghiệm thu & bàn giao' })

  await expect(nextStagePreview).toBeVisible()
  await nextStagePreview.click()

  await expect(focused).toContainText('Nghiệm thu & bàn giao')
})

test('keeps the focused-stage action inside the card at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/projects/project-thao-dien')

  const focused = page.locator('[data-testid="journey-stage-card"][data-focused="true"]')
  const action = focused.getByRole('link', { name: 'Mở không gian giai đoạn' })
  await expect(action).toBeVisible()

  const [cardBox, actionBox] = await Promise.all([focused.boundingBox(), action.boundingBox()])
  expect(cardBox).not.toBeNull()
  expect(actionBox).not.toBeNull()
  expect(actionBox!.y).toBeGreaterThanOrEqual(cardBox!.y)
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height)
})

test('shows a designed not-found state after an unknown project resolves', async ({ page }) => {
  await page.goto('/projects/project-does-not-exist')
  await expect(page.getByTestId('journey-not-found')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Quay lại danh sách dự án' })).toBeVisible()
})

test('removes nonessential card motion when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/projects/project-thao-dien')

  const viewportScrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)
  expect(viewportScrollBehavior).toBe('auto')

  const durations = await page.locator('[data-testid="journey-stage-card"]').first().evaluate((element) =>
    getComputedStyle(element).transitionDuration.split(',').map(value => Number.parseFloat(value)),
  )
  expect(durations.every(duration => duration <= 0.01)).toBe(true)

  const transforms = await page.locator('[data-testid="journey-stage-card"]').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).transform),
  )
  expect(transforms.every(transform => transform === 'none')).toBe(true)
})

for (const project of [
  { id: 'project-thao-dien', stageCount: 7, visualCount: 8 },
  { id: 'project-vinhomes', stageCount: 4, visualCount: 4 },
] as const) {
  test(`loads distinct optimized imagery for ${project.id}`, async ({ page }) => {
    await page.goto(`/projects/${project.id}`)
    await expect(page.getByTestId('journey-stage-card')).toHaveCount(project.stageCount)

    const visuals = page.getByTestId('journey-carousel').locator('img')
    await expect(visuals).toHaveCount(project.visualCount)
    await expect.poll(async () => visuals.evaluateAll(images => images.every((image) => {
      const element = image as HTMLImageElement
      return element.complete
        && element.naturalWidth === 1600
        && element.naturalHeight === 900
        && element.currentSrc.length > 0
    }))).toBe(true)
    const loaded = await visuals.evaluateAll(images => images.map((image) => {
      const element = image as HTMLImageElement
      return {
        complete: element.complete,
        width: element.naturalWidth,
        height: element.naturalHeight,
        pathname: new URL(element.currentSrc).pathname,
      }
    }))

    expect(loaded.every(image => image.complete)).toBe(true)
    expect(loaded.every(image => image.width === 1600 && image.height === 900)).toBe(true)
    expect(new Set(loaded.map(image => image.pathname)).size).toBe(project.visualCount)
    expect(loaded.every(image => image.pathname.startsWith('/mock/journey/'))).toBe(true)
  })
}
