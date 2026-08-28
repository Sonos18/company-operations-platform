import { randomUUID } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const DEFAULT_PLAYWRIGHT_PORT = 4317
const PLAYWRIGHT_SUPABASE_ANON_KEY = randomUUID()

export function resolvePlaywrightPort(value = process.env.PLAYWRIGHT_PORT) {
  if (value === undefined) return DEFAULT_PLAYWRIGHT_PORT
  if (!/^\d+$/.test(value)) throw new Error('PLAYWRIGHT_PORT must be an integer between 1024 and 65535')

  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PLAYWRIGHT_PORT must be an integer between 1024 and 65535')
  }
  return port
}

export function createPlaywrightConfig(port = resolvePlaywrightPort()) {
  const baseURL = `http://127.0.0.1:${port}`
  return defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    workers: 1,
    timeout: 60_000,
    expect: { timeout: 30_000 },
    use: {
      baseURL,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
    },
    projects: [
      {
        name: 'auth-setup',
        testMatch: 'auth.setup.ts',
        use: { ...devices['Desktop Chrome'] },
      },
      {
        name: 'auth-flow',
        testMatch: 'auth-flow.spec.ts',
        use: { ...devices['Desktop Chrome'] },
      },
      {
        name: 'chromium',
        testIgnore: ['auth.setup.ts', 'auth-flow.spec.ts'],
        dependencies: ['auth-setup'],
        use: {
          ...devices['Desktop Chrome'],
          storageState: 'test-results/.auth/authenticated.json',
        },
      },
    ],
    webServer: {
      command: `pnpm dev --host 127.0.0.1 --port ${port}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NUXT_PUBLIC_APP_URL: baseURL,
        NUXT_PUBLIC_SUPABASE_URL: 'https://auth.taskovia.test',
        NUXT_PUBLIC_SUPABASE_ANON_KEY: PLAYWRIGHT_SUPABASE_ANON_KEY,
      },
    },
  })
}

export default createPlaywrightConfig()
