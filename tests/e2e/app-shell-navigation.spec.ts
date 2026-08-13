import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1280, height: 900 } })

test('collapses the header and releases content height', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  const main = page.getByTestId('app-main')
  const toggle = page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' })

  await expect.poll(async () => (await header.boundingBox())?.height).toBe(64)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(88)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await toggle.click()

  await expect.poll(async () => (await header.boundingBox())?.height).toBe(44)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(68)
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'false')
  await expect(header.getByText('Việt Quốc Huy', { exact: true })).toBeHidden()

})

test('expands the header back to its original geometry', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  const main = page.getByTestId('app-main')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()
  await page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' }).click()

  await expect.poll(async () => (await header.boundingBox())?.height).toBe(64)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(88)
})

test('aligns the sidebar with the collapsed header', async ({ page }) => {
  await page.goto('/projects')

  const sidebar = page.locator('.app-sidebar')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()

  await expect.poll(async () => (await sidebar.boundingBox())?.y).toBe(44)
})

test('collapses the sidebar without changing compact header geometry', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  const sidebar = page.getByTestId('app-sidebar')
  const main = page.getByTestId('app-main')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()
  await expect.poll(async () => (await header.boundingBox())?.height).toBe(44)

  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(224)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(248)

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()

  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(88)
  await expect.poll(async () => (await header.boundingBox())?.height).toBe(44)
})

test('keeps icon-only sidebar links accessible', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()

  const projectsLink = page.getByRole('link', { name: 'Dự án', exact: true })
  await expect(projectsLink).toBeVisible()
  await expect(projectsLink).toHaveAttribute('title', 'Dự án')
})

test('expands the sidebar back to its original geometry', async ({ page }) => {
  await page.goto('/projects')

  const sidebar = page.getByTestId('app-sidebar')
  const main = page.getByTestId('app-main')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()
  await page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' }).click()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(224)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(248)
})

test('toggles the header from the keyboard', async ({ page }) => {
  await page.goto('/projects')

  const headerToggle = page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' })
  await headerToggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'false')
})

test('toggles the sidebar from the keyboard', async ({ page }) => {
  await page.goto('/projects')

  const sidebarToggle = page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' })
  await sidebarToggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' })).toHaveAttribute('aria-expanded', 'false')
})

test('removes shell transitions when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/projects')

  await expect.poll(async () => page.getByTestId('app-header').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await expect.poll(async () => page.getByTestId('app-sidebar').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await expect.poll(async () => page.getByTestId('app-main').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
})

test('keeps desktop shell controls and geometry at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto('/projects')

  await expect(page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' })).toBeVisible()
  await expect(page.locator('.mobile-nav')).toBeHidden()
  await expect.poll(async () => (await page.getByTestId('app-header').boundingBox())?.height).toBe(64)
  await expect.poll(async () => (await page.getByTestId('app-sidebar').boundingBox())?.width).toBe(224)
})

test('uses 200ms shell transitions with normal motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/projects')

  for (const testId of ['app-header', 'app-sidebar', 'app-main']) {
    const durations = await page.getByTestId(testId).evaluate(element => getComputedStyle(element).transitionDuration.split(',').map(duration => duration.trim()))
    expect(durations.length).toBeGreaterThan(0)
    expect(durations.every(duration => duration === '0.2s')).toBe(true)
  }
})

test('preserves the mobile header and bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects')

  await expect(page.getByRole('button', { name: /thanh điều hướng phía trên/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /thanh điều hướng bên trái/ })).toHaveCount(0)
  await expect(page.locator('.mobile-nav')).toBeVisible()
  await expect.poll(async () => (await page.getByTestId('app-header').boundingBox())?.height).toBe(64)
})

test('avoids horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects')

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
})

test('keeps compact state during client navigation', async ({ page }) => {
  await page.goto('/projects')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()
  await page.getByRole('link', { name: 'Công việc của tôi' }).click()

  await expect(page).toHaveURL(/\/my-work$/)
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' })).toHaveAttribute('aria-expanded', 'false')
})

test('resets compact state after a full reload', async ({ page }) => {
  await page.goto('/projects')

  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' }).click()
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()

  await page.reload()

  await expect(page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' })).toHaveAttribute('aria-expanded', 'true')
})
