import { expect, test } from './fixtures/authenticated'

test.use({ viewport: { width: 1280, height: 900 } })

test('publishes TASKOVIA product metadata', async ({ page }) => {
  await page.goto('/projects')

  await expect(page).toHaveTitle('TASKOVIA — Nền tảng vận hành đa công ty')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Nền tảng quản trị công việc và hành trình dự án cho nhiều công ty.',
  )
})

test('keeps TASKOVIA identity separate from company context', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  await expect(header.getByText('TASKOVIA', { exact: true })).toBeVisible()
  await expect(header.getByText('TV', { exact: true })).toBeVisible()
  await expect(header.getByText('Công ty TNHH Thiết kế Xây dựng Việt Quốc Huy', { exact: true })).toBeVisible()
  await expect(header.getByRole('link', { name: 'TASKOVIA — Về danh sách dự án' })).toBeVisible()
})

test('collapses the header and releases content height', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  const main = page.getByTestId('app-main')
  const toggle = page.getByRole('button', { name: 'Thu gọn thanh điều hướng phía trên' })
  const productName = header.getByText('TASKOVIA', { exact: true })
  const productMark = header.getByText('TV', { exact: true })
  const companyName = header.getByText('Công ty TNHH Thiết kế Xây dựng Việt Quốc Huy', { exact: true })
  const brandLink = header.getByRole('link', { name: 'TASKOVIA — Về danh sách dự án' })

  await expect.poll(async () => (await header.boundingBox())?.height).toBe(64)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(88)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await toggle.click()

  await expect.poll(async () => (await header.boundingBox())?.height).toBe(44)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(68)
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng phía trên' })).toHaveAttribute('aria-expanded', 'false')
  await expect(productName).toBeHidden()
  await expect(companyName).toBeHidden()
  await expect(productMark).toBeVisible()
  await expect(brandLink).toBeVisible()

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

test('keeps icon-only sidebar links accessible and keyboard navigable', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()

  const myWorkLink = page.getByRole('link', { name: 'Công việc của tôi', exact: true })
  await expect(myWorkLink).toBeVisible()
  await expect(myWorkLink).toHaveAttribute('title', 'Công việc của tôi')
  await myWorkLink.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/my-work$/)
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

  for (const { testId, properties } of [
    { testId: 'app-header', properties: ['height', 'padding'] },
    { testId: 'app-sidebar', properties: ['width', 'top', 'padding'] },
    { testId: 'app-main', properties: ['padding'] },
  ]) {
    const transition = await page.getByTestId(testId).evaluate(element => {
      const styles = getComputedStyle(element)
      return {
        durations: styles.transitionDuration.split(',').map(duration => duration.trim()),
        properties: styles.transitionProperty.split(',').map(property => property.trim()),
      }
    })
    expect(transition.properties).toEqual(properties)
    expect(transition.durations.length).toBeGreaterThan(0)
    expect(transition.durations.every(duration => duration === '0.2s')).toBe(true)
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

test('keeps the Stage 01 configuration action outside primary and mobile navigation', async ({ page }) => {
  await page.goto('/projects')

  const header = page.getByTestId('app-header')
  await expect(header.getByRole('link', { name: 'Cấu hình', exact: true })).toHaveAttribute('href', '/settings/stage-01')
  await expect(page.getByTestId('app-sidebar').getByRole('link')).toHaveCount(3)

  await page.setViewportSize({ width: 390, height: 844 })

  await expect(header.getByRole('link', { name: 'Cấu hình', exact: true })).toBeVisible()

  const mobileNavigation = page.locator('.mobile-nav')
  await expect(mobileNavigation.getByRole('link')).toHaveCount(3)
  await expect(mobileNavigation.getByRole('link', { name: 'Cấu hình', exact: true })).toHaveCount(0)
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
