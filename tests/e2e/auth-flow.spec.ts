import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  createAuthTestState,
  createCompany,
  installAuthRoutes,
  type AuthTestState,
} from './fixtures/auth-routes'

const invalidPassword = crypto.randomUUID()
const shortPassword = crypto.randomUUID().slice(0, 8)
const recoveryTokenHash = crypto.randomUUID()
const invalidTokenHash = crypto.randomUUID()
const surplusTokenHash = crypto.randomUUID()

const grantedCompany = createCompany({
  roles: ['administrator'],
  permissions: ['project.read'],
})
const alternateCompany = createCompany({
  tenantId: '20000000-0000-4000-8000-000000000001',
  companyId: '20000000-0000-4000-8000-000000000002',
  companyCode: 'TASKOVIA',
  companyName: 'Công ty kiểm thử Taskovia',
  roles: ['company_admin'],
  permissions: ['project.read', 'employee.read_directory'],
})
let authState: AuthTestState

test.beforeEach(async ({ page }) => {
  authState = createAuthTestState({ sessionCompanies: [] })
  await installAuthRoutes(page, authState)
})

test('redirects anonymous visitors from protected routes to login', async ({ page }) => {
  await page.goto('/projects')
  await expect(page).toHaveURL(/\/login/)
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/projects')
})

test('renders the accessible login form and validates required fields', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible()
  await expect(page.locator('h1')).toHaveCount(1)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByText('Email là bắt buộc.')).toBeVisible()
  await expect(page.getByText('Mật khẩu là bắt buộc.')).toBeVisible()

  const result = await new AxeBuilder({ page }).include('main').analyze()
  expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
})

test('shows a safe invalid-credentials message and routes a successful login through access state', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('anh@example.com')
  const password = page.getByLabel('Mật khẩu', { exact: true })
  await password.fill(invalidPassword)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không chính xác.')
  await expect(password).toHaveValue('')

  await password.fill(authState.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/no-access$/)

  authState.sessionCompanies = [grantedCompany]
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page).toHaveURL(/\/projects$/)
})

test('persists a successful login across reload and clears it after logout', async ({ page }) => {
  authState.sessionCompanies = [grantedCompany]
  await page.goto('/login')
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(authState.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/projects$/)

  await page.reload()
  await expect(page).toHaveURL(/\/projects$/)

  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
})

test('rejects malformed app-session authorization and sends a non-empty bearer token after login', async ({ page }) => {
  await page.goto('/login')
  const rejectedStatuses = await page.evaluate(async () => Promise.all([
    fetch('/api/auth/session').then(response => response.status),
    fetch('/api/auth/session', { headers: { Authorization: '' } }).then(response => response.status),
    fetch('/api/auth/session', { headers: { Authorization: 'Token malformed' } }).then(response => response.status),
  ]))
  expect(rejectedStatuses).toEqual([401, 401, 401])

  let sawBearerAuthorization = false
  await page.route('**/api/auth/session', async (route) => {
    sawBearerAuthorization = /^Bearer\s+\S+$/u.test(route.request().headers().authorization ?? '')
    await route.fallback()
  })
  authState.sessionCompanies = [grantedCompany]
  await page.goto('/login')
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(authState.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  expect(sawBearerAuthorization).toBe(true)
})

test('always acknowledges a valid forgot-password request generically', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByRole('button', { name: 'Gửi hướng dẫn' }).click()
  await expect(page.getByRole('status')).toHaveText('Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.')
})

test('scrubs callback tokens and denies a recovery session after closing and reopening the tab', async ({ page }) => {
  await page.goto(`/auth/callback?${new URLSearchParams({ token_hash: recoveryTokenHash, type: 'recovery' })}`)
  await expect(page).toHaveURL(/\/reset-password$/)
  await expect(page.getByRole('heading', { name: 'Đặt lại mật khẩu' })).toBeVisible()
  expect(page.url()).not.toContain(recoveryTokenHash)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(authState.recoveryAccessToken)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(authState.recoveryRefreshToken)
  expect(authState.verifyRequests).toHaveLength(1)
  expect(authState.verifyRequests[0]).toEqual(expect.objectContaining({ token_hash: recoveryTokenHash, type: 'recovery' }))

  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(shortPassword)
  await page.getByLabel('Xác nhận mật khẩu mới', { exact: true }).fill(shortPassword)
  await page.getByRole('button', { name: 'Cập nhật mật khẩu' }).click()
  await expect(page.getByText('Mật khẩu phải có từ 12 đến 72 ký tự và không chỉ gồm khoảng trắng.')).toBeVisible()

  const context = page.context()
  await page.close()
  const reopenedPage = await context.newPage()
  await installAuthRoutes(reopenedPage, authState)
  await reopenedPage.goto('/projects')
  await expect(reopenedPage).toHaveURL(/\/login/)

  await expect(reopenedPage.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible()
})

test('denies an expired recovery marker and requires a new link', async ({ page }) => {
  await page.goto(`/auth/callback?${new URLSearchParams({ token_hash: recoveryTokenHash, type: 'recovery' })}`)
  await expect(page).toHaveURL(/\/reset-password$/)

  await page.evaluate(() => {
    sessionStorage.setItem('taskovia:recovery-flow', JSON.stringify({
      type: 'recovery',
      timestamp: Date.now() - 16 * 60 * 1_000,
    }))
  })
  await page.reload()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/projects')
  await expect(page).toHaveURL(/\/login/)
})

test('updates the password from an accepted recovery callback', async ({ page }) => {
  authState.sessionCompanies = [grantedCompany]
  await page.goto(`/auth/callback?${new URLSearchParams({ token_hash: recoveryTokenHash, type: 'recovery' })}`)
  await expect(page).toHaveURL(/\/reset-password$/)

  const password = crypto.randomUUID()
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(password)
  await page.getByLabel('Xác nhận mật khẩu mới', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Cập nhật mật khẩu' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await page.reload()
  await expect(page).toHaveURL(/\/projects$/)
})

test('scrubs malformed callback queries without rendering a token', async ({ page }) => {
  await page.goto(`/auth/callback?${new URLSearchParams({ token_hash: invalidTokenHash, type: 'unsupported' })}`)
  await expect(page).toHaveURL(/\/auth\/callback$/)
  await expect(page.getByRole('heading', { name: 'Không thể xác minh liên kết' })).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(invalidTokenHash)
  expect(authState.verifyRequests).toEqual([])
})

test('rejects callback queries with surplus fields before calling the provider', async ({ page }) => {
  await page.goto(`/auth/callback?${new URLSearchParams({ token_hash: surplusTokenHash, type: 'recovery', extra: 'unexpected' })}`)
  await expect(page).toHaveURL(/\/auth\/callback$/)
  await expect(page.getByRole('heading', { name: 'Không thể xác minh liên kết' })).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(surplusTokenHash)
  expect(authState.verifyRequests).toEqual([])
})

test('requires company selection, switches the header company, and preserves the selected company', async ({ page }) => {
  authState.sessionCompanies = [grantedCompany, alternateCompany]
  await page.goto('/login')
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(authState.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/select-company$/)

  await page.getByRole('button', { name: grantedCompany.companyName }).click()
  await expect(page).toHaveURL(/\/projects$/)

  const switcher = page.getByRole('combobox', { name: 'Chuyển công ty' })
  await switcher.selectOption(alternateCompany.companyId)
  await expect(page).toHaveURL(/\/projects$/)
  await expect(switcher).toHaveValue(alternateCompany.companyId)
  await expect(page.getByTestId('app-header')).toContainText(alternateCompany.companyName)

  await page.reload()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('combobox', { name: 'Chuyển công ty' })).toHaveValue(alternateCompany.companyId)
  await expect(page.getByTestId('app-header')).toContainText(alternateCompany.companyName)

  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(authState.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('combobox', { name: 'Chuyển công ty' })).toHaveValue(alternateCompany.companyId)
  await expect(page.getByTestId('app-header')).toContainText(alternateCompany.companyName)
})

test('routes a signed-in user without the page permission to forbidden without logging out', async ({ page }) => {
  authState.sessionCompanies = [grantedCompany]
  await page.goto('/login')
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(authState.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/projects$/)

  await page.goto('/employees')
  await expect(page).toHaveURL(/\/forbidden$/)
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible()
})

test('fails closed on an app-session connection error and recovers only after retry', async ({ page }) => {
  authState.sessionCompanies = [grantedCompany]
  authState.sessionFailure = 'server'
  await page.goto('/login')
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(authState.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('heading', { name: 'Không thể xác minh quyền truy cập' })).toBeVisible()

  authState.sessionFailure = 'none'
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page).toHaveURL(/\/projects$/)
})

test('clears the session when logging out from a connection error', async ({ page }) => {
  authState.sessionCompanies = [grantedCompany]
  authState.sessionFailure = 'server'
  await page.goto('/login')
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(authState.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('heading', { name: 'Không thể xác minh quyền truy cập' })).toBeVisible()

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.getByRole('button', { name: 'Đăng xuất' }).click(),
  ])
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
})
