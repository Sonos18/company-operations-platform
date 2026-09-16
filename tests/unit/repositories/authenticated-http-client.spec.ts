import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createAuthenticatedHttpClient } from '../../../app/repositories/http/authenticated-http-client'

const schema = z.object({ ok: z.literal(true) })

describe('AuthenticatedHttpClient', () => {
  it('transports an idempotency key beside internally controlled auth and JSON headers', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const client = createAuthenticatedHttpClient({ fetch, getAccessToken: vi.fn().mockResolvedValue('token') })

    await client.request({ url: '/api/test', method: 'POST', body: { value: 1 }, idempotencyKey: 'c1010000-0000-4000-8000-000000000998', schema })

    expect(fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({ headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', 'Idempotency-Key': 'c1010000-0000-4000-8000-000000000998' } }))
  })

  it('omits the idempotency header when no key is supplied', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const client = createAuthenticatedHttpClient({ fetch, getAccessToken: vi.fn().mockResolvedValue('token') })

    await client.request({ url: '/api/test', method: 'POST', body: { value: 1 }, schema })

    expect(fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({ headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } }))
  })
})
