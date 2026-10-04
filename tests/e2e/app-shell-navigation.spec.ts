import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures/authenticated'

test.use({ viewport: { width: 1280, height: 900 } })

test('publishes TASKOVIA product metadata', async ({ page }) => {
  await page.goto('/projects')
  await expect(page).toHaveTitle('TASKOVIA — Nền tảng vận hành đa công ty')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Nền tảng quản trị công việc và hành trình dự án cho nhiều công ty.')
})

test('removes the global topbar and places identity and utilities in the full-height rail', async ({ page }) => {
  await page.goto('/projects')
  await expect(page.getByTestId('app-header')).toHaveCount(0)
  const sidebar = page.getByTestId('app-sidebar')
  await expect(sidebar.getByRole('link', { name: 'TASKOVIA — Về danh sách dự án' })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Mở thông báo' })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Mở menu tài khoản' })).toBeVisible()
  await expect.poll(async () => (await sidebar.boundingBox())?.y).toBe(0)
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64)
  await expect.poll(async () => page.getByTestId('app-main').evaluate(element => Number.parseFloat(getComputedStyle(element).paddingTop))).toBe(24)
  const box = await sidebar.boundingBox()
  const avatar = await sidebar.getByRole('button', { name: 'Mở menu tài khoản' }).boundingBox()
  expect(avatar!.y).toBeGreaterThan(box!.height / 2)
})

test('expands and collapses the sidebar without restoring a topbar', async ({ page }) => {
  await page.goto('/projects')
  const sidebar = page.getByTestId('app-sidebar')
  const main = page.getByTestId('app-main')
  await page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' }).click()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(224)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(248)
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' }).click()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64)
  await expect.poll(async () => main.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(88)
})

test('keeps compact links accessible and keyboard navigable', async ({ page }) => {
  await page.goto('/projects')
  const link = page.getByTestId('app-sidebar').getByRole('link', { name: 'Công việc của tôi', exact: true })
  await expect(link).toHaveAttribute('title', 'Công việc của tôi')
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/my-work$/)
})

test('preserves expanded state during navigation and resets to compact after reload', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' }).click()
  await page.getByTestId('app-sidebar').getByRole('link', { name: 'Công việc của tôi', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Thu gọn thanh điều hướng bên trái' })).toHaveAttribute('aria-expanded', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng bên trái' })).toHaveAttribute('aria-expanded', 'false')
})

test('opens and closes the account popover by repeated avatar clicks', async ({ page }) => {
  await page.goto('/projects')
  const avatar = page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' })
  await avatar.click()
  await expect(avatar).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible()
  await expect(page.getByText('Công ty TNHH Thiết kế Xây dựng Việt Quốc Huy', { exact: true })).toBeVisible()
  await avatar.click()
  await expect(avatar).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeHidden()
})

test('opens account utilities by keyboard and restores focus on Escape', async ({ page }) => {
  await page.goto('/projects')
  const avatar = page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' })
  await avatar.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(avatar).toHaveAttribute('aria-expanded', 'false')
  await expect(avatar).toBeFocused()
})

test('closes account utilities when clicking the page outside', async ({ page }) => {
  await page.goto('/projects')
  const avatar = page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' })
  await avatar.click()
  await page.getByTestId('app-main').click({ position: { x: 400, y: 10 } })
  await expect(avatar).toHaveAttribute('aria-expanded', 'false')
})

test('keeps Tab and Shift+Tab within the open account dialog', async ({ page }) => {
  await page.goto('/projects')
  await page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' }).click()
  const dialog = page.getByRole('dialog', { name: 'Menu tài khoản' })
  const controls = dialog.locator('a[href], select:not([disabled]), button:not([disabled])')
  await controls.last().focus()
  await page.keyboard.press('Tab')
  await expect(controls.first()).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(controls.last()).toBeFocused()
})

test('retains an accessible company selector for accounts with multiple companies', async ({ page, authState }) => {
  authState.sessionCompanies.push({
    ...authState.sessionCompanies[0]!,
    companyId: '20000000-0000-4000-8000-000000000202',
    companyName: 'Công ty thứ hai',
  })
  await page.goto('/projects')
  await page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' }).click()
  const selector = page.getByRole('combobox', { name: 'Chuyển công ty' })
  await expect(selector).toBeVisible()
  await expect(selector.locator('option')).toHaveCount(2)
  await expect(selector).toHaveValue(authState.sessionCompanies[0]!.companyId)
})

test('keeps admin utilities filtered by the current company permissions', async ({ page, authState }) => {
  authState.sessionCompanies[0]!.permissions = ['project.read', 'task.read_assigned', 'employee.read_directory']
  await page.goto('/projects')
  await page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' }).click()
  await expect(page.getByRole('link', { name: 'Cấu hình', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible()
})

test('keeps existing permission-filtered admin and reset controls in account utilities', async ({ page }) => {
  await page.goto('/projects')
  await page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' }).click()
  await expect(page.getByRole('link', { name: 'Cấu hình', exact: true })).toHaveAttribute('href', '/settings/stage-01')
  await expect(page.getByRole('button', { name: 'Khôi phục dữ liệu mẫu' })).toBeVisible()
})

test('uses the existing signout flow from the avatar popover', async ({ page }) => {
  await page.goto('/projects')
  await page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' }).click()
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('removes shell transitions for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/projects')
  for (const testId of ['app-sidebar', 'app-main']) {
    await expect.poll(async () => page.getByTestId(testId).evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  }
})

test('keeps desktop navigation at the 768px boundary', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto('/projects')
  await expect(page.getByTestId('app-sidebar')).toBeVisible()
  await expect(page.locator('.mobile-nav')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Mở menu tài khoản' })).toBeVisible()
})

test('keeps account controls usable at a short desktop height', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 440 })
  await page.goto('/projects')
  const avatar = page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' })
  await expect(avatar).toBeInViewport()
  await avatar.click()
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeInViewport()
})

test('preserves mobile primary navigation and exposes account utilities without a topbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects')
  await expect(page.getByTestId('app-sidebar')).toBeHidden()
  await expect(page.getByTestId('app-header')).toHaveCount(0)
  const nav = page.locator('.mobile-nav')
  await expect(nav).toBeVisible()
  for (const name of ['Công việc của tôi', 'Cơ hội', 'Chi phí dự án', 'Bản nháp chi phí', 'Nguồn chi phí']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
  }
  const avatar = nav.getByRole('button', { name: 'Mở menu tài khoản' })
  await expect(nav.getByRole('button', { name: 'Mở thông báo' })).toBeVisible()
  await avatar.click()
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(avatar).toBeFocused()
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
  for (const target of await nav.locator('a, button').all()) {
    const box = await target.boundingBox()
    if (box) expect(box.height).toBeGreaterThanOrEqual(44)
  }
})

test('has no serious or critical accessibility violations in desktop and mobile shell utilities', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/projects')
    await page.getByRole('button', { name: 'Mở menu tài khoản' }).click()
    const scan = await new AxeBuilder({ page }).include(viewport.width >= 768 ? '.app-sidebar' : '.mobile-nav').analyze()
    expect(scan.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  }
})

test('captures the desktop and mobile shell for visual review', async ({ page }, testInfo) => {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport)
    await page.goto('/projects')
    await expect(page.getByTestId('app-main')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true })
    const avatar = page.getByRole('button', { name: 'Mở menu tài khoản' })
    if (await avatar.count()) {
      await avatar.click()
      await page.screenshot({ path: testInfo.outputPath(`${name}-account.png`), fullPage: true })
      await page.keyboard.press('Escape')
    }
  }
})

test('keeps the account dialog inside short mobile viewports with every control reachable', async ({ page, authState }) => {
  authState.sessionCompanies.push({ ...authState.sessionCompanies[0]!, companyId: '20000000-0000-4000-8000-000000000202', companyName: 'Second company' })
  for (const viewport of [{ width: 390, height: 400 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/projects')
    await page.locator('.mobile-nav').getByRole('button', { name: 'Mở menu tài khoản' }).click()
    const dialog = page.getByRole('dialog', { name: 'Menu tài khoản' })
    const box = await dialog.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    for (const control of await dialog.locator('a[href], select, button').all()) {
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeInViewport()
    }
    await page.keyboard.press('Escape')
  }
})

test('closes the hidden account dialog when crossing the responsive breakpoint', async ({ page }) => {
  await page.goto('/projects')
  await page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  const avatar = page.locator('.mobile-nav').getByRole('button', { name: 'Mở menu tài khoản' })
  await avatar.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(avatar).toBeFocused()
  await avatar.click()
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  const desktopAvatar = page.getByTestId('app-sidebar').getByRole('button', { name: 'Mở menu tài khoản' })
  await desktopAvatar.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(desktopAvatar).toBeFocused()
})

test('highlights correct mobile navigation link for project costs and cost sources', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  // /costs overview
  await page.goto('/costs')
  const costLink = page.locator('.mobile-nav a[href="/costs"]')
  const sourceLink = page.locator('.mobile-nav a[href="/costs/sources"]')
  await expect(costLink).toHaveClass(/active/)
  await expect(sourceLink).not.toHaveClass(/active/)

  // /costs/sources
  await page.goto('/costs/sources')
  await expect(sourceLink).toHaveClass(/active/)
  await expect(costLink).not.toHaveClass(/active/)
})

test('preserves touch targets and avoids overflow when 3, 4, or 5 links are visible', async ({ page, authState }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  const permMap = {
    3: ['project.read', 'task.read_assigned', 'employee.read_directory'],
    4: ['project.read', 'task.read_assigned', 'employee.read_directory', 'opportunity.read'],
    5: ['project.read', 'task.read_assigned', 'employee.read_directory', 'opportunity.read', 'cost.read'],
  } as const

  for (const count of [3, 4, 5] as const) {
    authState.sessionCompanies[0].permissions = [...permMap[count]]
    await page.goto('/projects')

    const mobileNav = page.locator('.mobile-nav')
    const links = mobileNav.locator('.mobile-nav-grid').getByRole('link')
    await expect(links).toHaveCount(count)

    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }))
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
  }
})
