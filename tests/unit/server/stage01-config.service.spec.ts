import { describe, expect, it, vi } from 'vitest'
import { createStage01ConfigService } from '../../../server/features/stage01-config/stage01-config.service'
import { businessTaxonomies, context, criteria, draft, ids } from './stage01-config.fixture'

describe('Stage 01 configuration service', () => {
  it('allows read permission to retrieve only the server-scoped company configuration', async () => {
    const get = vi.fn().mockResolvedValue({ workflowKey: 'vqh.stage01' })
    const service = createStage01ConfigService({ get } as never)

    await service.get({ ...context, permissions: ['stage01.config.read'] })

    expect(get).toHaveBeenCalledWith(context.companyId)
  })

  it('checks each configuration permission before forwarding server company and request context', async () => {
    const repository = {
      get: vi.fn(), createDraft: vi.fn().mockResolvedValue(draft), updateDraft: vi.fn(), discardDraft: vi.fn(), publishDraft: vi.fn(),
    }
    const service = createStage01ConfigService(repository)
    const createInput = { expectedPublishedSnapshotId: ids.snapshot }

    await service.createDraft({ ...context, permissions: ['stage01.config.update'] }, createInput)

    expect(repository.createDraft).toHaveBeenCalledWith(context.companyId, createInput, context.requestId)
  })

  it('does not let read access create or update drafts', async () => {
    const repository = { createDraft: vi.fn(), updateDraft: vi.fn() }
    const service = createStage01ConfigService(repository as never)

    await expect(service.createDraft({ ...context, permissions: ['stage01.config.read'] }, { expectedPublishedSnapshotId: ids.snapshot }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    await expect(service.updateDraft({ ...context, permissions: ['stage01.config.read'] }, {
      expectedDraftVersion: 0, taxonomies: businessTaxonomies, criteria,
    })).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })

    expect(repository.createDraft).not.toHaveBeenCalled()
    expect(repository.updateDraft).not.toHaveBeenCalled()
  })

  it('does not let update access publish a draft', async () => {
    const publishDraft = vi.fn()
    const service = createStage01ConfigService({ publishDraft } as never)

    await expect(service.publishDraft({ ...context, permissions: ['stage01.config.update'] }, { expectedDraftVersion: 0 }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(publishDraft).not.toHaveBeenCalled()
  })
})
