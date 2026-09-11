import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useStage01Operational } from '../../../app/composables/useStage01Operational'
import type { Stage01CanonicalRecoveryEntry } from '../../../app/composables/useStage01Operational'
import type { Stage01Repository } from '../../../app/repositories/contracts'
import type { Stage01OperationalDetail } from '../../../app/features/stage01/stage01.types'
import type { ContactRecoveryEntry } from '../../../app/features/stage01-operational/contact-recovery'

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
    expect(operational.canonicalSyncRequired.value).toBe(false)
  })

  it('marks canonical recovery required after a successful command whose GET fails, while retaining the previous detail', async () => {
    const previous = { opportunity: { id: opportunityId, version: 1 } } as Stage01OperationalDetail
    const get = vi.fn().mockRejectedValue(new Error('GET failed'))
    const command = vi.fn().mockResolvedValue(undefined)
    const operational = useStage01Operational(repositoryWith(get), opportunityId, { companyId: 'company-a' })
    operational.detail.value = previous

    await expect(operational.runAndReload(command)).rejects.toMatchObject({ code: 'CANONICAL_RELOAD_REQUIRED' })

    expect(command).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
    expect(operational.detail.value).toStrictEqual(previous)
    expect(operational.canonicalSyncRequired.value).toBe(true)
    expect(operational.error.value).toMatchObject({ code: 'CANONICAL_RELOAD_REQUIRED' })
  })

  it('rejects a later mutation before invoking its callback while canonical recovery is required', async () => {
    const get = vi.fn().mockRejectedValue(new Error('GET failed'))
    const command = vi.fn().mockResolvedValue(undefined)
    const nextCommand = vi.fn().mockResolvedValue(undefined)
    const operational = useStage01Operational(repositoryWith(get), opportunityId, { companyId: 'company-a' })

    await expect(operational.runAndReload(command)).rejects.toMatchObject({ code: 'CANONICAL_RELOAD_REQUIRED' })
    await expect(operational.runAndReload(nextCommand)).rejects.toMatchObject({ code: 'CANONICAL_RELOAD_REQUIRED' })

    expect(command).toHaveBeenCalledTimes(1)
    expect(nextCommand).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('clears recovery only after a successful GET-only retry and keeps the lock after a failed retry', async () => {
    const recovered = { opportunity: { id: opportunityId, version: 2 } } as Stage01OperationalDetail
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('GET failed'))
      .mockRejectedValueOnce(new Error('GET still failed'))
      .mockResolvedValueOnce(recovered)
    const command = vi.fn().mockResolvedValue(undefined)
    const recoveryState = ref<Record<string, Stage01CanonicalRecoveryEntry>>({})
    const operational = useStage01Operational(repositoryWith(get), opportunityId, { companyId: 'company-a', recoveryState })

    await expect(operational.runAndReload(command)).rejects.toMatchObject({ code: 'CANONICAL_RELOAD_REQUIRED' })
    await expect(operational.load()).rejects.toThrow('GET still failed')
    expect(operational.canonicalSyncRequired.value).toBe(true)

    await operational.load()

    expect(get).toHaveBeenCalledTimes(3)
    expect(operational.detail.value).toStrictEqual(recovered)
    expect(operational.canonicalSyncRequired.value).toBe(false)
    expect(operational.error.value).toBeNull()
  })

  it('allows the original command exactly once, then allows a new command after canonical recovery succeeds', async () => {
    const recovered = { opportunity: { id: opportunityId, version: 2 } } as Stage01OperationalDetail
    const get = vi.fn().mockRejectedValueOnce(new Error('GET failed')).mockResolvedValueOnce(recovered).mockResolvedValueOnce(recovered)
    const command = vi.fn().mockResolvedValue(undefined)
    const nextCommand = vi.fn().mockResolvedValue(undefined)
    const operational = useStage01Operational(repositoryWith(get), opportunityId)

    await expect(operational.runAndReload(command)).rejects.toMatchObject({ code: 'CANONICAL_RELOAD_REQUIRED' })
    await operational.load()
    await operational.runAndReload(nextCommand)

    expect(command).toHaveBeenCalledTimes(1)
    expect(nextCommand).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('prevents a duplicate submission while the first command is in flight', async () => {
    let release!: () => void
    const command = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const get = vi.fn().mockResolvedValue({ opportunity: { id: opportunityId } } as Stage01OperationalDetail)
    const duplicate = vi.fn().mockResolvedValue(undefined)
    const operational = useStage01Operational(repositoryWith(get), opportunityId)

    const first = operational.runAndReload(command)
    await expect(operational.runAndReload(duplicate)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(duplicate).not.toHaveBeenCalled()

    release()
    await first
    expect(command).toHaveBeenCalledTimes(1)
  })

  it('rejects a duplicate mutation while its canonical GET is pending', async () => {
    let release!: (detail: Stage01OperationalDetail) => void
    const detail = { opportunity: { id: opportunityId, version: 1 } } as Stage01OperationalDetail
    const get = vi.fn(() => new Promise<Stage01OperationalDetail>(resolve => { release = resolve }))
    const command = vi.fn().mockResolvedValue(undefined)
    const duplicate = vi.fn().mockResolvedValue(undefined)
    const operational = useStage01Operational(repositoryWith(get), opportunityId)

    const first = operational.runAndReload(command)
    await Promise.resolve()
    await Promise.resolve()
    expect(get).toHaveBeenCalledTimes(1)
    expect(operational.pending.value).toBe(true)
    expect(operational.canonicalSyncRequired.value).toBe(true)

    await expect(operational.runAndReload(duplicate)).rejects.toMatchObject({ code: 'CANONICAL_RELOAD_REQUIRED' })
    expect(command).toHaveBeenCalledTimes(1)
    expect(duplicate).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledTimes(1)

    release(detail)
    await first
    expect(operational.canonicalSyncRequired.value).toBe(false)
  })

  it('does not block a different company while the previous resource is waiting for canonical recovery', async () => {
    let releaseCompanyA!: (detail: Stage01OperationalDetail) => void
    const recoveryState = ref<Record<string, Stage01CanonicalRecoveryEntry>>({})
    const detailA = { opportunity: { id: opportunityId, version: 1 } } as Stage01OperationalDetail
    const getA = vi.fn(() => new Promise<Stage01OperationalDetail>(resolve => { releaseCompanyA = resolve }))
    const companyA = useStage01Operational(repositoryWith(getA), opportunityId, { companyId: 'company-a', recoveryState })
    const commandA = vi.fn().mockResolvedValue(undefined)
    const runA = companyA.runAndReload(commandA)
    await Promise.resolve()
    await Promise.resolve()
    expect(getA).toHaveBeenCalledTimes(1)

    const detailB = { opportunity: { id: opportunityId, version: 2 } } as Stage01OperationalDetail
    const getB = vi.fn().mockResolvedValue(detailB)
    const companyB = useStage01Operational(repositoryWith(getB), opportunityId, { companyId: 'company-b', recoveryState })
    const commandB = vi.fn().mockResolvedValue(undefined)
    await companyB.runAndReload(commandB)

    expect(commandB).toHaveBeenCalledTimes(1)
    expect(getB).toHaveBeenCalledTimes(1)
    expect(companyB.canonicalSyncRequired.value).toBe(false)
    expect(companyA.pending.value).toBe(true)
    expect(companyA.canonicalSyncRequired.value).toBe(true)

    releaseCompanyA(detailA)
    await runA
    expect(companyA.canonicalSyncRequired.value).toBe(false)
  })

  it('keeps recovery markers isolated by company and opportunity across navigation', async () => {
    const recoveryState = ref<Record<string, Stage01CanonicalRecoveryEntry>>({})
    const get = vi.fn().mockRejectedValue(new Error('GET failed'))
    const a = useStage01Operational(repositoryWith(get), 'opportunity-a', { companyId: 'company-a', recoveryState })
    const command = vi.fn().mockResolvedValue(undefined)

    await expect(a.runAndReload(command)).rejects.toMatchObject({ code: 'CANONICAL_RELOAD_REQUIRED' })

    const sameCompanyDifferentOpportunity = useStage01Operational(repositoryWith(vi.fn()), 'opportunity-b', { companyId: 'company-a', recoveryState })
    const differentCompany = useStage01Operational(repositoryWith(vi.fn()), 'opportunity-a', { companyId: 'company-b', recoveryState })
    const backToA = useStage01Operational(repositoryWith(vi.fn()), 'opportunity-a', { companyId: 'company-a', recoveryState })

    expect(sameCompanyDifferentOpportunity.canonicalSyncRequired.value).toBe(false)
    expect(differentCompany.canonicalSyncRequired.value).toBe(false)
    expect(backToA.canonicalSyncRequired.value).toBe(true)
  })

  it('does not let an older in-flight GET clear a newer recovery marker for the same resource', async () => {
    let releaseOldRead!: (detail: Stage01OperationalDetail) => void
    const oldDetail = { opportunity: { id: opportunityId, version: 1 } } as Stage01OperationalDetail
    const oldGet = vi.fn(() => new Promise<Stage01OperationalDetail>(resolve => { releaseOldRead = resolve }))
    const recoveryState = ref<Record<string, Stage01CanonicalRecoveryEntry>>({})
    const oldOperational = useStage01Operational(repositoryWith(oldGet), opportunityId, { companyId: 'company-a', recoveryState })
    const oldCommand = vi.fn().mockResolvedValue(undefined)
    const oldRun = oldOperational.runAndReload(oldCommand)
    await Promise.resolve()
    await Promise.resolve()
    expect(oldGet).toHaveBeenCalledTimes(1)

    const newDetail = { opportunity: { id: opportunityId, version: 2 } } as Stage01OperationalDetail
    const newGet = vi.fn().mockResolvedValue(newDetail)
    const newOperational = useStage01Operational(repositoryWith(newGet), opportunityId, { companyId: 'company-a', recoveryState })
    await expect(newOperational.load()).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(newGet).not.toHaveBeenCalled()
    expect(newOperational.canonicalSyncRequired.value).toBe(true)
    expect(newOperational.pending.value).toBe(true)

    releaseOldRead(oldDetail)
    await oldRun

    expect(oldOperational.canonicalSyncRequired.value).toBe(false)
    expect(newOperational.canonicalSyncRequired.value).toBe(false)
    expect(newOperational.pending.value).toBe(false)
    expect(newOperational.detail.value).toStrictEqual(oldDetail)
    await newOperational.load()
    expect(newOperational.detail.value).toStrictEqual(newDetail)
  })

  it('keeps Contact recovery scoped by actor, company, and Opportunity across remounts', () => {
    const recoveryState = ref<Record<string, Stage01CanonicalRecoveryEntry>>({})
    const recovery: ContactRecoveryEntry = {
      phase: 'link_pending',
      contactId: '83000000-0000-4000-8000-000000000031',
      contactVersion: 1,
      methodCompleted: true,
      draft: { displayName: 'Chị Lan', relationshipCode: 'primary_contact', methodType: 'phone', methodValue: '0900000000', isPrimary: true },
      reason: '',
    }
    const first = useStage01Operational(repositoryWith(vi.fn()), opportunityId, { actorId: 'user-a', companyId: 'company-a', recoveryState })
    first.setContactRecovery(recovery)

    const sameResource = useStage01Operational(repositoryWith(vi.fn()), opportunityId, { actorId: 'user-a', companyId: 'company-a', recoveryState })
    const differentCompany = useStage01Operational(repositoryWith(vi.fn()), opportunityId, { actorId: 'user-a', companyId: 'company-b', recoveryState })
    const differentActor = useStage01Operational(repositoryWith(vi.fn()), opportunityId, { actorId: 'user-b', companyId: 'company-a', recoveryState })

    expect(sameResource.contactRecovery.value).toStrictEqual(recovery)
    expect(differentCompany.contactRecovery.value).toBeNull()
    expect(differentActor.contactRecovery.value).toBeNull()
  })
})
