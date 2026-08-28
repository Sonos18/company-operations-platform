import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { permissionCodes, type PermissionCode } from '../../../shared/constants/permissions'

export const supabaseAuthUrl = 'https://auth.taskovia.test'
export const authenticatedCompanyName = 'Công ty TNHH Thiết kế Xây dựng Việt Quốc Huy'

export interface AuthTestCompany {
  tenantId: string
  companyId: string
  companyCode: string
  companyName: string
  roles: string[]
  permissions: PermissionCode[]
}

export interface AuthTestState {
  email: string
  password: string
  accessToken: string
  refreshToken: string
  user: { id: string, email: string }
  sessionCompanies: AuthTestCompany[]
  sessionFailure: 'none' | 'network' | 'server'
  verifyRequests: Array<{ token_hash?: unknown, type?: unknown }>
}

export function createCompany(overrides: Partial<AuthTestCompany> = {}): AuthTestCompany {
  return {
    tenantId: '10000000-0000-4000-8000-000000000001',
    companyId: '10000000-0000-4000-8000-000000000002',
    companyCode: 'VQH',
    companyName: authenticatedCompanyName,
    roles: ['company_admin'],
    permissions: [...permissionCodes],
    ...overrides,
  }
}

export function createAuthTestState(overrides: Partial<AuthTestState> = {}): AuthTestState {
  return {
    email: 'auth-fixture@taskovia.test',
    password: randomUUID(),
    accessToken: randomUUID(),
    refreshToken: randomUUID(),
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'auth-fixture@taskovia.test',
    },
    sessionCompanies: [createCompany()],
    sessionFailure: 'none',
    verifyRequests: [],
    ...overrides,
  }
}

function sessionPayload(state: AuthTestState) {
  return {
    access_token: state.accessToken,
    refresh_token: state.refreshToken,
    token_type: 'bearer',
    expires_in: 3600,
    user: state.user,
  }
}

export async function installAuthRoutes(page: Page, state: AuthTestState): Promise<void> {
  await page.route(`${supabaseAuthUrl}/auth/v1/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.endsWith('/token')) {
      const body = request.postDataJSON() as { password?: string }
      if (url.searchParams.get('grant_type') === 'password' && body.password !== state.password) {
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

      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(sessionPayload(state)) })
      return
    }

    if (url.pathname.endsWith('/verify')) {
      state.verifyRequests.push(request.postDataJSON() as { token_hash?: unknown, type?: unknown })
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(sessionPayload(state)) })
      return
    }

    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: state.user }) })
      return
    }

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) })
  })

  await page.route('**/api/auth/session', async (route) => {
    if (!/^Bearer\s+\S+$/u.test(route.request().headers().authorization ?? '')) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({}) })
      return
    }
    if (state.sessionFailure === 'network') {
      await route.abort('failed')
      return
    }
    if (state.sessionFailure === 'server') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({}) })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: state.user,
        companies: state.sessionCompanies,
      }),
    })
  })
}
