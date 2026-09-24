import { expect, test } from './fixtures/authenticated'
import { financeProjectListSchema } from '../../shared/schemas/costs/project-finance'

const navigationProjectList = financeProjectListSchema.parse({
  schemaVersion: 1,
  projects: Array.from({ length: 5 }, (_, index) => ({
    project: {
      projectId: `10000000-0000-4000-8000-00000000010${index + 1}`,
      projectCode: `P-${index + 1}`,
      projectName: `Project ${index + 1}`,
      currencyCode: 'VND',
      moneyScale: 0,
      timeZone: 'Asia/Ho_Chi_Minh',
      operationalState: 'active',
    },
    summary: {
      budget: { state: 'not_recorded', amount: null, recordedCount: 0 },
      ownerAdvances: { state: 'not_recorded', amount: null, recordedCount: 0 },
      cost: { state: 'not_recorded', amount: null, recordedCount: 0, knownSubtotal: '0.0000' },
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      reference: { kind: 'none', amount: null },
      margin: { state: 'unavailable', amount: null, reasons: ['NO_APPROVED_BUDGET', 'COST_INCOMPLETE'] },
      management: {
        receipts: { state: 'not_recorded', amount: null, recordedCount: 0, origin: 'none', quality: 'not_recorded', coverage: 'none', sourceReferences: [] },
        reference: { kind: 'none', amount: null, basis: 'none' },
        result: { state: 'unavailable', amount: null, basis: 'none', components: { receipts: null, cost: null, independentlyHeldRetention: null }, reasons: ['NO_REFERENCE', 'COST_INCOMPLETE', 'RETENTION_INCOMPLETE'] },
        headline: { kind: 'unavailable', amount: null, basis: 'none' },
      },
      issues: [],
    },
  })),
  nextCursor: null,
})

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
  await expect(page.getByTestId('app-sidebar').getByRole('link')).toHaveCount(7)
  await expect(page.getByTestId('app-sidebar').getByRole('link', { name: 'Cơ hội', exact: true })).toHaveAttribute('href', '/opportunities')
  await expect(page.getByTestId('app-sidebar').getByRole('link', { name: 'Chi phí dự án', exact: true })).toHaveAttribute('href', '/costs')
  await expect(page.getByTestId('app-sidebar').getByRole('link', { name: 'Bản nháp chi phí', exact: true })).toHaveAttribute('href', '/cost-drafts')
  await expect(page.getByTestId('app-sidebar').getByRole('link', { name: 'Nguồn chi phí', exact: true })).toHaveAttribute('href', '/costs/sources')

  await page.setViewportSize({ width: 390, height: 844 })

  await expect(header.getByRole('link', { name: 'Cấu hình', exact: true })).toBeVisible()

  const mobileNavigation = page.locator('.mobile-nav')
  await expect(mobileNavigation.getByRole('link')).toHaveCount(7)
  await expect(mobileNavigation.getByRole('link', { name: 'Cơ hội', exact: true })).toHaveAttribute('href', '/opportunities')
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

test('arranges seven mobile navigation links into a balanced 4+3 grid with touch-sized targets and page clearance', async ({ page }) => {
  await page.route('**/api/companies/**/project-costs', async (route) => {
    await route.fulfill({
      json: [
        {
          projectId: '10000000-0000-4000-8000-000000000101',
          projectCode: 'P-1',
          projectName: 'Project Alpha',
          summary: {
            currencyCode: 'VND',
            acceptedValue: '100.0000',
            acceptedCount: 1,
            inProgressValue: '200.0000',
            inProgressCount: 2,
            unknownStatusValue: '0.0000',
            unknownCount: 0,
            totalTrackedWorkValue: '300.0000',
          },
        },
        {
          projectId: '10000000-0000-4000-8000-000000000102',
          projectCode: 'P-2',
          projectName: 'Project Beta',
          summary: {
            currencyCode: 'USD',
            acceptedValue: '50.0000',
            acceptedCount: 1,
            inProgressValue: '0.0000',
            inProgressCount: 0,
            unknownStatusValue: '0.0000',
            unknownCount: 0,
            totalTrackedWorkValue: '50.0000',
          },
        },
        {
          projectId: '10000000-0000-4000-8000-000000000103',
          projectCode: 'P-3',
          projectName: 'Project Gamma',
          summary: {
            currencyCode: 'VND',
            acceptedValue: '10.0000',
            acceptedCount: 1,
            inProgressValue: '20.0000',
            inProgressCount: 1,
            unknownStatusValue: '0.0000',
            unknownCount: 0,
            totalTrackedWorkValue: '30.0000',
          },
        },
        {
          projectId: '10000000-0000-4000-8000-000000000104',
          projectCode: 'P-4',
          projectName: 'Project Delta',
          summary: {
            currencyCode: 'VND',
            acceptedValue: '15.0000',
            acceptedCount: 1,
            inProgressValue: '25.0000',
            inProgressCount: 1,
            unknownStatusValue: '0.0000',
            unknownCount: 0,
            totalTrackedWorkValue: '40.0000',
          },
        },
        {
          projectId: '10000000-0000-4000-8000-000000000105',
          projectCode: 'P-5',
          projectName: 'Project Epsilon',
          summary: {
            currencyCode: 'VND',
            acceptedValue: '80.0000',
            acceptedCount: 1,
            inProgressValue: '90.0000',
            inProgressCount: 1,
            unknownStatusValue: '0.0000',
            unknownCount: 0,
            totalTrackedWorkValue: '170.0000',
          },
        },
      ],
    })
  })
  await page.route('**/api/companies/**/project-finances*', route => route.fulfill({ json: navigationProjectList }))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/costs')

  const mobileNav = page.locator('.mobile-nav')
  await expect(mobileNav).toBeVisible()

  const links = mobileNav.getByRole('link')
  await expect(links).toHaveCount(7)

  // B. Tap targets: every visible mobile navigation link height >= 44
  const boxes = []
  for (let i = 0; i < 7; i++) {
    const box = await links.nth(i).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    boxes.push(box!)
  }

  // A. Navigation layout: exactly two balanced rows (4 + 3)
  const rows: typeof boxes[] = []
  for (const box of boxes) {
    const midY = box.y + box.height / 2
    let foundRow = rows.find(r => Math.abs(r[0].y + r[0].height / 2 - midY) < 10)
    if (!foundRow) {
      foundRow = []
      rows.push(foundRow)
    }
    foundRow.push(box)
  }

  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveLength(4)
  expect(rows[1]).toHaveLength(3)

  // Every visible link keeps its own horizontal slot.
  for (const row of rows) {
    const xPositions = row.map(b => Math.round(b.x))
    const uniqueX = new Set(xPositions)
    expect(uniqueX.size).toBe(row.length)
  }

  // C. No horizontal overflow
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)

  // D. Page content clearance on a long page
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  const lastCard = page.locator('.project-card').last()
  await expect(lastCard).toBeVisible()
  await expect.poll(async () => {
    const cardBox = await lastCard.boundingBox()
    const navBox = await mobileNav.boundingBox()
    if (!cardBox || !navBox) return false
    return cardBox.y + cardBox.height <= navBox.y
  }).toBe(true)
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
    const links = mobileNav.getByRole('link')
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
