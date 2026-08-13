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
