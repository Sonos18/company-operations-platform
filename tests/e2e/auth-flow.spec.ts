import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const supabaseUrl = 'https://auth.taskovia.test'
const accessToken = crypto.randomUUID()
const refreshToken = crypto.randomUUID()
const invalidPassword = crypto.randomUUID()
const validPassword = crypto.randomUUID()
const shortPassword = crypto.randomUUID().slice(0, 8)
const recoveryTokenHash = crypto.randomUUID()
const invalidTokenHash = crypto.randomUUID()
const surplusTokenHash = crypto.randomUUID()

const sessionUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'anh@example.com',
}
const grantedCompany = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  companyId: '10000000-0000-4000-8000-000000000002',
  companyCode: 'TASKOVIA',
  companyName: 'Taskovia',
  roles: ['administrator'],
  permissions: ['project.read'],
}
let sessionCompanies: typeof grantedCompany[] = []
const verifyRequests: Array<{ token_hash?: unknown, type?: unknown }> = []

function sessionResponse() {
  return {
    user: {
      ...sessionUser,
    },
    companies: sessionCompanies,
  }
}

async function installAnonymousAuthRoutes(page: Page): Promise<void> {
  await page.route(`${supabaseUrl}/auth/v1/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
      const body = request.postDataJSON() as { email?: string, password?: string }
      if (body.password === invalidPassword) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          headers: {
            'Access-Control-Expose-Headers': 'X-Supabase-Api-Version',
            'X-Supabase-Api-Version': '2024-01-01',
          },
          body: JSON.stringify({ code: 'invalid_credentials', message: 'invalid credentials' }),
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'bearer',
          expires_in: 3600,
          user: sessionUser,
        }),
      })
      return
    }

    if (url.pathname.endsWith('/verify')) {
      verifyRequests.push(request.postDataJSON() as { token_hash?: unknown, type?: unknown })
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'bearer',
          expires_in: 3600,
          user: sessionUser,
        }),
      })
      return
    }

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) })
  })
  await page.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(sessionResponse()),
  }))
}

test.beforeEach(async ({ page }) => {
  sessionCompanies = []
  verifyRequests.length = 0
  await installAnonymousAuthRoutes(page)
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

  await password.fill(validPassword)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/no-access$/)

  sessionCompanies = [grantedCompany]
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page).toHaveURL(/\/projects$/)
})

test('always acknowledges a valid forgot-password request generically', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill('anh@example.com')
  await page.getByRole('button', { name: 'Gửi hướng dẫn' }).click()
  await expect(page.getByRole('status')).toHaveText('Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.')
})

test('scrubs callback tokens before opening reset password and preserves recovery through reload', async ({ page }) => {
  await page.goto(`/auth/callback?${new URLSearchParams({ token_hash: recoveryTokenHash, type: 'recovery' })}`)
  await expect(page).toHaveURL(/\/reset-password$/)
  await expect(page.getByRole('heading', { name: 'Đặt lại mật khẩu' })).toBeVisible()
  expect(page.url()).not.toContain(recoveryTokenHash)
  expect(verifyRequests).toHaveLength(1)
  expect(verifyRequests[0]).toEqual(expect.objectContaining({ token_hash: recoveryTokenHash, type: 'recovery' }))

  await page.reload()
  await expect(page).toHaveURL(/\/reset-password$/)
  await expect(page.getByRole('heading', { name: 'Đặt lại mật khẩu' })).toBeVisible()
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(shortPassword)
  await page.getByLabel('Xác nhận mật khẩu mới', { exact: true }).fill(shortPassword)
  await page.getByRole('button', { name: 'Cập nhật mật khẩu' }).click()
  await expect(page.getByText('Mật khẩu phải có từ 12 đến 72 ký tự và không chỉ gồm khoảng trắng.')).toBeVisible()
})

test('scrubs malformed callback queries without rendering a token', async ({ page }) => {
  await page.goto(`/auth/callback?${new URLSearchParams({ token_hash: invalidTokenHash, type: 'unsupported' })}`)
  await expect(page).toHaveURL(/\/auth\/callback$/)
  await expect(page.getByRole('heading', { name: 'Không thể xác minh liên kết' })).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(invalidTokenHash)
  expect(verifyRequests).toEqual([])
})

test('rejects callback queries with surplus fields before calling the provider', async ({ page }) => {
  await page.goto(`/auth/callback?${new URLSearchParams({ token_hash: surplusTokenHash, type: 'recovery', extra: 'unexpected' })}`)
  await expect(page).toHaveURL(/\/auth\/callback$/)
  await expect(page.getByRole('heading', { name: 'Không thể xác minh liên kết' })).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(surplusTokenHash)
  expect(verifyRequests).toEqual([])
})
