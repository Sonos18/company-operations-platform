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

  it('preserves only controlled quotation 5xx messages without retry semantics', async () => {
    for (const [status, code, message] of [
      [503, 'QUOTATION_ANALYSIS_NOT_CONFIGURED', 'Dịch vụ phân tích báo giá chưa được cấu hình.'],
      [502, 'QUOTATION_ANALYSIS_FAILED', 'Không thể phân tích báo giá. Bạn có thể nhập tay.'],
      [502, 'QUOTATION_ANALYSIS_INVALID', 'Kết quả phân tích không đủ rõ ràng.'],
      [500, 'INTERNAL_ERROR', 'Sensitive server detail'],
    ] as const) {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { code, message, requestId: 'quotation-error', details: {} },
      }), { status }))
      const client = createAuthenticatedHttpClient({ fetch, getAccessToken: () => 'token' })
      await expect(client.request({ url: '/api/test', schema })).rejects.toMatchObject({
        kind: 'api', code,
        message: code === 'INTERNAL_ERROR' ? 'Hệ thống không thể xử lý yêu cầu. Vui lòng thử lại sau.' : message,
        retryable: code === 'INTERNAL_ERROR',
        requestId: 'quotation-error',
      })
    }
  })

  it('preserves detail publish readiness blockers from a safe API error body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'COST_DETAIL_PUBLISH_NOT_READY', message: 'Not ready', requestId: 'c1010000-0000-4000-8000-000000000999', details: { blockingCodes: ['EVIDENCE_NOT_FINALIZED'] } } }), { status: 409 }))
    const client = createAuthenticatedHttpClient({ fetch, getAccessToken: vi.fn().mockResolvedValue('token') })

    await expect(client.request({ url: '/api/test', method: 'POST', schema })).rejects.toMatchObject({ code: 'COST_DETAIL_PUBLISH_NOT_READY', details: { blockingCodes: ['EVIDENCE_NOT_FINALIZED'] } })
  })
})
