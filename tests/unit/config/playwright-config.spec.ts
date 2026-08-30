import { describe, expect, it } from 'vitest'
import {
  createPlaywrightConfig,
  resolvePlaywrightPort,
  resolvePlaywrightReuseExistingServer,
} from '../../../playwright.config.ts'

describe('Playwright project server configuration', () => {
  it('uses a project-specific default port and never reuses an existing server', () => {
    const config = createPlaywrightConfig(4317)

    expect(config.use?.baseURL).toBe('http://127.0.0.1:4317')
    expect(config.webServer).toMatchObject({
      command: 'pnpm dev --host 127.0.0.1 --port 4317',
      url: 'http://127.0.0.1:4317',
      reuseExistingServer: false,
    })
  })

  it('accepts only a safe explicit PLAYWRIGHT_PORT value', () => {
    expect(resolvePlaywrightPort('4317')).toBe(4317)
    expect(resolvePlaywrightPort(undefined)).not.toBe(3000)
    expect(() => resolvePlaywrightPort('3000x')).toThrow('PLAYWRIGHT_PORT must be an integer between 1024 and 65535')
    expect(() => resolvePlaywrightPort('80')).toThrow('PLAYWRIGHT_PORT must be an integer between 1024 and 65535')
  })

  it('reuses a separately managed web server only through an explicit safe override', () => {
    expect(resolvePlaywrightReuseExistingServer(undefined)).toBe(false)
    expect(resolvePlaywrightReuseExistingServer('false')).toBe(false)
    expect(resolvePlaywrightReuseExistingServer('true')).toBe(true)
    expect(() => resolvePlaywrightReuseExistingServer('1')).toThrow(
      'PLAYWRIGHT_REUSE_EXISTING_SERVER must be true or false',
    )

    const config = createPlaywrightConfig(4318, true)
    expect(config.webServer).toMatchObject({
      url: 'http://127.0.0.1:4318',
      reuseExistingServer: true,
    })
  })
})
