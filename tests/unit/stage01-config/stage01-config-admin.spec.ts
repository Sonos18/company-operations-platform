import { describe, expect, it, vi } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import { useStage01ConfigAdmin } from '../../../app/composables/useStage01ConfigAdmin'
import type { Stage01ConfigRepository } from '../../../app/repositories/contracts'
import type {
  PublishStage01ConfigResult,
  Stage01BusinessConfigView,
  Stage01ConfigDraft,
} from '../../../shared/schemas/stage01-config'
import { businessTaxonomies, criteria, draft, ids } from '../server/stage01-config.fixture'

const timestamp = '2026-08-31T00:00:00.000Z'

function view(draftState: Stage01ConfigDraft | null = draft, templateVersion = 1): Stage01BusinessConfigView {
  return {
    workflowKey: 'vqh.stage01',
    published: {
      snapshotId: ids.snapshot,
      templateVersion,
      schemaVersion: 1,
      definitionHash: `definition-${templateVersion}`,
      publishedAt: timestamp,
      taxonomies: businessTaxonomies,
      criteria,
      system: {
        nodes: [],
        dependencies: [],
        dimensions: ['customer_need', 'scope_capability', 'resources_schedule', 'commercial_viability', 'risk_special_conditions'],
        capabilities: {},
        gates: {},
      },
    },
    draft: draftState,
  }
}

function updatedDraft(version: number, customerTypeLabel = 'Customer'): Stage01ConfigDraft {
  return {
    ...draft,
    version,
    updatedAt: `2026-08-31T00:00:0${version}.000Z`,
    taxonomies: {
      ...businessTaxonomies,
      customer_type: [{ code: 'customer', label: customerTypeLabel }],
    },
  }
}

class FakeStage01ConfigRepository implements Stage01ConfigRepository {
  currentView = view()
  nextDraft = updatedDraft(0)
  publishResult: PublishStage01ConfigResult = {
    snapshotId: ids.snapshot,
    templateVersion: 2,
    schemaVersion: 1,
    definitionHash: 'published-definition-2',
    publishedAt: timestamp,
  }

  get = vi.fn(async () => this.currentView)
  createDraft = vi.fn(async () => this.nextDraft)
  updateDraft = vi.fn(async () => this.nextDraft)
  discardDraft = vi.fn(async () => undefined)
  publishDraft = vi.fn(async () => this.publishResult)
}

describe('Stage 01 configuration admin lifecycle', () => {
  // Defect caught: action controls could remain enabled while a repository operation is in flight.
  it('reports the pending load operation until the canonical request settles', async () => {
    const repository = new FakeStage01ConfigRepository()
    let resolveGet: (value: Stage01BusinessConfigView) => void
    repository.get.mockImplementationOnce(() => new Promise<Stage01BusinessConfigView>((resolve) => {
      resolveGet = resolve
    }))
    const admin = useStage01ConfigAdmin(repository)

    const loading = admin.load()

    expect(admin.operation.value).toBe('load')
    resolveGet!(repository.currentView)
    await loading
    expect(admin.operation.value).toBeNull()
  })

  // Defect caught: an overlapping mutation could issue a duplicate optimistic-version request and clear the first action's pending state.
  it('rejects an overlapping lifecycle action while preserving the in-flight operation state', async () => {
    const repository = new FakeStage01ConfigRepository()
    let resolveUpdate: (value: Stage01ConfigDraft) => void
    repository.updateDraft.mockImplementationOnce(() => new Promise<Stage01ConfigDraft>((resolve) => {
      resolveUpdate = resolve
    }))
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()

    const saving = admin.saveDraft()
    expect(admin.operation.value).toBe('save')

    await expect(admin.discardDraft()).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      retryable: false,
    })

    expect(repository.discardDraft).not.toHaveBeenCalled()
    expect(admin.operation.value).toBe('save')
    expect(admin.error.value).toBeNull()

    resolveUpdate!(updatedDraft(1))
    await saving
    expect(admin.operation.value).toBeNull()
  })

  // Defect caught: a draft editor could render against no draft or retain stale local edits after a canonical reload.
  it('loads canonical state and creates editable state only for the returned draft', async () => {
    const repository = new FakeStage01ConfigRepository()
    repository.currentView = view(null)
    const admin = useStage01ConfigAdmin(repository)

    await admin.load()

    expect(admin.view.value).toEqual(repository.currentView)
    expect(admin.editable.value).toBeNull()
    expect(admin.dirty.value).toBe(false)

    repository.currentView = view(updatedDraft(3, 'Reloaded customer'))
    await admin.reloadCanonical()

    expect(admin.view.value).toEqual(repository.currentView)
    expect(admin.editable.value?.taxonomies.customer_type[0]?.label).toBe('Reloaded customer')
    expect(admin.dirty.value).toBe(false)
  })

  // Defect caught: draft creation could use a stale identifier or expose the repository draft for local mutation.
  it('creates a draft from the current published snapshot and initializes an editable clone', async () => {
    const repository = new FakeStage01ConfigRepository()
    repository.currentView = view(null)
    repository.nextDraft = updatedDraft(0)
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()

    await admin.createDraft()

    expect(repository.createDraft).toHaveBeenCalledWith({ expectedPublishedSnapshotId: ids.snapshot })
    expect(admin.view.value?.draft).toEqual(repository.nextDraft)
    expect(admin.editable.value).toEqual({
      taxonomies: repository.nextDraft.taxonomies,
      criteria: repository.nextDraft.criteria,
    })
    expect(admin.editable.value?.taxonomies).not.toBe(repository.nextDraft.taxonomies)
  })

  // Defect caught: editing controls could mutate the persisted baseline and inadvertently advance optimistic concurrency state.
  it('marks only local editable changes dirty without mutating the persisted draft', async () => {
    const repository = new FakeStage01ConfigRepository()
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()

    admin.editable.value!.taxonomies.customer_type[0]!.label = 'Changed locally'

    expect(admin.dirty.value).toBe(true)
    expect(admin.view.value?.draft?.version).toBe(0)
    expect(admin.view.value?.draft?.taxonomies.customer_type[0]?.label).toBe('Customer')
  })

  // Defect caught: save could omit the persisted optimistic version, save stale content, or leave the editor dirty after the server baseline changes.
  it('saves the strict current editable state against the persisted draft version and resets dirty state', async () => {
    const repository = new FakeStage01ConfigRepository()
    repository.nextDraft = updatedDraft(1, 'Saved customer')
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()
    admin.editable.value!.taxonomies.customer_type[0]!.label = 'Saved customer'

    await admin.saveDraft()

    expect(repository.updateDraft).toHaveBeenCalledWith({
      expectedDraftVersion: 0,
      taxonomies: expect.objectContaining({
        customer_type: [{ code: 'customer', label: 'Saved customer' }],
      }),
      criteria,
    })
    expect(admin.view.value?.draft).toEqual(repository.nextDraft)
    expect(admin.editable.value?.taxonomies.customer_type[0]?.label).toBe('Saved customer')
    expect(admin.dirty.value).toBe(false)
  })

  // Defect caught: discard could erase the published canonical configuration or discard a different draft version.
  it('discards the persisted draft version while retaining the published canonical state', async () => {
    const repository = new FakeStage01ConfigRepository()
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()

    await admin.discardDraft()

    expect(repository.discardDraft).toHaveBeenCalledWith({ expectedDraftVersion: 0 })
    expect(admin.view.value).toMatchObject({ published: repository.currentView.published, draft: null })
    expect(admin.editable.value).toBeNull()
    expect(admin.dirty.value).toBe(false)
  })

  // Defect caught: publishing unsaved local changes could silently overwrite the server draft rather than requiring an explicit save.
  it('refuses dirty publish without calling the repository and exposes the validation error', async () => {
    const repository = new FakeStage01ConfigRepository()
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()
    admin.editable.value!.taxonomies.customer_type[0]!.label = 'Needs saving'

    await expect(admin.publishDraft()).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Hãy lưu bản nháp trước khi xuất bản.',
    })

    expect(repository.publishDraft).not.toHaveBeenCalled()
    expect(admin.error.value).toBeInstanceOf(ClientError)
    expect(admin.error.value).toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  // Defect caught: publish could synthesize canonical published state locally or lose the server's result version needed for success feedback.
  it('publishes the clean persisted draft then returns its result after reloading canonical state', async () => {
    const repository = new FakeStage01ConfigRepository()
    const canonicalAfterPublish = view(null, 2)
    repository.currentView = view(updatedDraft(4))
    repository.publishResult = {
      snapshotId: ids.snapshot,
      templateVersion: 2,
      schemaVersion: 1,
      definitionHash: 'published-definition-2',
      publishedAt: timestamp,
    }
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()
    repository.get.mockResolvedValueOnce(canonicalAfterPublish)

    const result = await admin.publishDraft()

    expect(repository.publishDraft).toHaveBeenCalledWith({ expectedDraftVersion: 4 })
    expect(repository.get).toHaveBeenCalledTimes(2)
    expect(result).toEqual(repository.publishResult)
    expect(admin.view.value).toEqual(canonicalAfterPublish)
    expect(admin.editable.value).toBeNull()
  })

  // Defect caught: failed mutations could replace user edits or mask the actionable server conflict with a new generic error.
  it('preserves editable state and the original ClientError when save or publish fails', async () => {
    const repository = new FakeStage01ConfigRepository()
    const saveFailure = new ClientError({ kind: 'api', code: 'VERSION_CONFLICT', message: 'stale save', retryable: false })
    const publishFailure = new ClientError({ kind: 'api', code: 'VERSION_CONFLICT', message: 'stale publish', retryable: false })
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()
    admin.editable.value!.taxonomies.customer_type[0]!.label = 'Keep this edit'
    repository.updateDraft.mockRejectedValueOnce(saveFailure)

    await expect(admin.saveDraft()).rejects.toBe(saveFailure)
    expect(admin.error.value).toBe(saveFailure)
    expect(admin.editable.value?.taxonomies.customer_type[0]?.label).toBe('Keep this edit')

    repository.updateDraft.mockResolvedValueOnce(updatedDraft(1, 'Keep this edit'))
    await admin.saveDraft()
    repository.publishDraft.mockRejectedValueOnce(publishFailure)

    await expect(admin.publishDraft()).rejects.toBe(publishFailure)
    expect(admin.error.value).toBe(publishFailure)
    expect(admin.editable.value?.taxonomies.customer_type[0]?.label).toBe('Keep this edit')
  })

  // Defect caught: reset could reuse a locally mutated object rather than rebuilding from the persisted server draft.
  it('resets local changes from a fresh clone of the persisted draft', async () => {
    const repository = new FakeStage01ConfigRepository()
    const admin = useStage01ConfigAdmin(repository)
    await admin.load()
    admin.editable.value!.taxonomies.customer_type[0]!.label = 'Unsaved edit'

    admin.resetLocal()

    expect(admin.editable.value?.taxonomies.customer_type[0]?.label).toBe('Customer')
    expect(admin.editable.value?.taxonomies).not.toBe(admin.view.value?.draft?.taxonomies)
    expect(admin.dirty.value).toBe(false)
  })
})
