import { describe, expect, it, vi } from 'vitest'
import { createStage01Service } from '../../../server/features/stage01/stage01.service'

describe('Stage 01 service', () => {
  it('requires the Final Decision permission before repository access', async () => {
    const recordFinalDecision = vi.fn()
    const service = createStage01Service({ recordFinalDecision } as never)
    const context = {
      actorId: '66000000-0000-4000-8000-000000000001',
      tenantId: '66000000-0000-4000-8000-000000000010',
      companyId: '66000000-0000-4000-8000-000000000020',
      permissions: [] as const,
      requestId: '66000000-0000-4000-8000-000000000099',
    }
    await expect(service.recordFinalDecision(
      context,
      '66000000-0000-4000-8000-000000000030',
      { expectedCycleVersion: 0, outcome: 'proceed', rationale: 'Approved' },
    )).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(recordFinalDecision).not.toHaveBeenCalled()
  })
})
