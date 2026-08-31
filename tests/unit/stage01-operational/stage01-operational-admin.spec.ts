import { describe, expect, it, vi } from 'vitest'
import { useStage01Operational } from '../../../app/composables/useStage01Operational'
import type { Stage01Repository } from '../../../app/repositories/contracts'
import type { Stage01OperationalDetail } from '../../../app/features/stage01/stage01.types'

const opportunityId = '83000000-0000-4000-8000-000000000030'

function repositoryWith(get: ReturnType<typeof vi.fn>): Stage01Repository {
  return { get } as unknown as Stage01Repository
}

describe('Stage 01 operational command orchestration', () => {
  it('reloads the sole canonical aggregate exactly once after a resolved command', async () => {
    const detail = { opportunity: { id: opportunityId } } as Stage01OperationalDetail
    const get = vi.fn().mockResolvedValue(detail)
    const command = vi.fn().mockResolvedValue(undefined)
    const operational = useStage01Operational(repositoryWith(get), opportunityId)

    await operational.runAndReload(command)

    expect(command).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(opportunityId)
    expect(operational.detail.value).toStrictEqual(detail)
    expect(operational.error.value).toBeNull()
  })

  it('does not reload after a rejected command and retains the original error', async () => {
    const failure = new Error('VERSION_CONFLICT')
    const get = vi.fn()
    const command = vi.fn().mockRejectedValue(failure)
    const operational = useStage01Operational(repositoryWith(get), opportunityId)

    await expect(operational.runAndReload(command)).rejects.toBe(failure)

    expect(get).not.toHaveBeenCalled()
    expect(operational.error.value).toBe(failure)
    expect(operational.operation.value).toBeNull()
  })
})
