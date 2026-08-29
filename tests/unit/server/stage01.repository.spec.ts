import { describe, expect, it, vi } from 'vitest'
import { createSupabaseStage01Repository } from '../../../server/features/stage01/stage01.repository'

describe('Stage 01 Decision repository', () => {
  it('uses the fixed Final Decision RPC and maps a version conflict', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'VERSION_CONFLICT' },
    })
    const repository = createSupabaseStage01Repository({ rpc } as never)
    await expect(repository.recordFinalDecision(
      '63000000-0000-4000-8000-000000000020',
      '63000000-0000-4000-8000-000000000030',
      { expectedCycleVersion: 2, outcome: 'proceed', rationale: 'Approved' },
      '63000000-0000-4000-8000-000000000099',
    )).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' })
    expect(rpc).toHaveBeenCalledWith('record_stage01_final_decision', expect.objectContaining({
      target_company_id: '63000000-0000-4000-8000-000000000020',
      target_opportunity_id: '63000000-0000-4000-8000-000000000030',
    }))
  })
})
