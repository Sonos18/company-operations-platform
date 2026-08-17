import { defineConfig, devices } from '@playwright/test'

const DEFAULT_PLAYWRIGHT_PORT = 4317

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
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
      command: `pnpm dev --host 127.0.0.1 --port ${port}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  })
}

export default createPlaywrightConfig()
