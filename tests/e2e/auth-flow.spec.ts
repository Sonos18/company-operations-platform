import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const supabaseUrl = 'https://auth.taskovia.test'
const fakeAccessToken = 'fake-access-token-for-e2e'

const sessionResponse = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'anh@example.com',
  },
  companies: [],
}

async function installAnonymousAuthRoutes(page: Page): Promise<void> {
  await page.route(`${supabaseUrl}/auth/v1/**`, async (route) => {
    const request = route.request()

    if (request.url().includes('/token?grant_type=password')) {
      const body = request.postDataJSON() as { email?: string, password?: string }
      if (body.password === 'incorrect-password') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'invalid_credentials', message: 'invalid credentials' }),
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: fakeAccessToken,
          refresh_token: 'fake-refresh-token-for-e2e',
          token_type: 'bearer',
          expires_in: 3600,
          user: sessionResponse.user,
        }),
      })
      return
    }

    if (request.url().includes('/verify')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: fakeAccessToken,
          refresh_token: 'fake-refresh-token-for-e2e',
          token_type: 'bearer',
          expires_in: 3600,
          user: sessionResponse.user,
        }),
      })
      return
    }

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) })
  })
  await page.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(sessionResponse),
  }))
}

test.beforeEach(async ({ page }) => {
  await installAnonymousAuthRoutes(page)
})

test('redirects anonymous visitors from protected routes to login', async ({ page }) => {
  await page.goto('/projects')
  await expect(page).toHaveURL(/\/login\?redirect=%2Fprojects/)
})

test('renders the accessible login form and validates required fields', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible()
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByText('Email là bắt buộc.')).toBeVisible()
  await expect(page.getByText('Mật khẩu là bắt buộc.')).toBeVisible()

  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
})
