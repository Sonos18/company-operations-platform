import { defineConfig, devices } from '@playwright/test'
import { assertCloudDevTarget } from './scripts/assert-cloud-dev-target.mjs'

const port = 4327
const baseURL = `http://127.0.0.1:${port}`

assertCloudDevTarget({ cwd: process.cwd() })

export default defineConfig({
  testDir: './tests/acceptance/stage01-cloud-dev',
  outputDir: 'test-results/b4-stage01/playwright',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  globalSetup: './tests/acceptance/stage01-cloud-dev/global-setup.ts',
  globalTeardown: './tests/acceptance/stage01-cloud-dev/global-teardown.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4327',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NUXT_PUBLIC_APP_URL: baseURL },
  },
})
