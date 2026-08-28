import { describe, expect, it } from 'vitest'
import { createAuthenticatedHttpClient } from '../../../app/repositories/http/authenticated-http-client'
import { createHttpSessionRepository } from '../../../app/repositories/http/http-session-repository'

const session = {
  user: { id: 'user-123', email: 'member@example.com' },
  companies: [{
    tenantId: '10000000-0000-4000-8000-000000000001',
    companyId: '10000000-0000-4000-8000-000000000002',
    companyCode: 'TASKOVIA',
    companyName: 'Taskovia',
    roles: ['admin'],
    permissions: ['employee.read_directory'],
  }],
}

describe('HTTP session repository', () => {
  it('gets the exact session endpoint with no body and strictly parses the canonical session response', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'session-token',
      fetch: async (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify(session), { status: 200 })
      },
    })
    const repository = createHttpSessionRepository(client)

    await expect(repository.get()).resolves.toEqual(session)

    expect(calls).toEqual([{
      url: '/api/auth/session',
      init: { method: 'GET', headers: { Authorization: 'Bearer session-token' } },
    }])
  })

  it('rejects a session response with unexpected fields instead of accepting an unsafe shape', async () => {
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'session-token',
      fetch: async () => new Response(JSON.stringify({ ...session, rawProviderSession: 'do-not-accept' }), { status: 200 }),
    })

    await expect(createHttpSessionRepository(client).get())
      .rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })
})
