import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createAuthTestState, installAuthRoutes, type AuthTestState } from './auth-routes'
import { installEmployeeRoutes } from './employee-routes'

type AuthenticatedFixtures = {
  authState: AuthTestState
}

/** Records what the browser saw so a failure on a machine we cannot attach to still explains itself. */
function collectDiagnostics(page: Page) {
  const startedAt = Date.now()
  const lines: string[] = []
  const stamp = () => `${String(Date.now() - startedAt).padStart(6)}ms`
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') lines.push(`${stamp()} console.${message.type()} ${message.text().slice(0, 300)}`)
  })
  page.on('pageerror', error => lines.push(`${stamp()} pageerror ${error.message.slice(0, 300)}`))
  page.on('requestfailed', request => lines.push(`${stamp()} requestfailed ${request.method()} ${request.url().slice(0, 160)} ${request.failure()?.errorText ?? ''}`))
  page.on('response', (response) => {
    if (response.status() >= 400) lines.push(`${stamp()} http ${response.status()} ${response.request().method()} ${response.url().slice(0, 160)}`)
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) lines.push(`${stamp()} navigated ${frame.url()}`)
  })
  page.on('crash', () => lines.push(`${stamp()} page crashed`))
  return lines
}

/** Resolves with the fallback after `ms`; the timer is always cleared so it never keeps the worker alive. */
async function within<T>(promise: Promise<T>, fallback: T, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  }
  finally {
    clearTimeout(timer)
  }
}

export const test = base.extend<AuthenticatedFixtures>({
  authState: async ({ browserName: _browserName }, use) => {
    await use(createAuthTestState())
  },
  page: async ({ page, authState }, use, testInfo) => {
    const diagnostics = collectDiagnostics(page)
    await installAuthRoutes(page, authState)
    await installEmployeeRoutes(page)
    await use(page)
    if (testInfo.status === testInfo.expectedStatus) return
    const body = [
      `url: ${page.url()}`,
      `closed: ${page.isClosed()}`,
      '--- browser events ---',
      ...diagnostics,
      '--- document ---',
      page.isClosed() ? '(page closed)' : await within(
        page.content().then(html => html.slice(0, 6000)).catch(() => '(page content unavailable)'),
        '(page content unavailable: page not responding)',
      ),
    ].join('\n')
    await testInfo.attach('page-diagnostics', { body, contentType: 'text/plain' })
  },
})

export { expect }
export type { Page } from '@playwright/test'
