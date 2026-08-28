import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { expect, test } from '@playwright/test'
import { createAuthTestState, installAuthRoutes } from './fixtures/auth-routes'

const storageStatePath = 'test-results/.auth/authenticated.json'

test('signs in through the login UI and saves authenticated browser state', async ({ page }) => {
  const state = createAuthTestState()
  await installAuthRoutes(page, state)

  await page.goto('/login')
  await page.getByLabel('Email').fill(state.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(state.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/projects$/)

  await mkdir(dirname(storageStatePath), { recursive: true })
  await page.context().storageState({ path: storageStatePath })
})
