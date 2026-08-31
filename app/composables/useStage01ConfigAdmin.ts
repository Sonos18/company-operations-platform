import { computed, ref } from 'vue'
import { ClientError } from '../errors/client-error'
import {
  buildStage01ConfigUpdateInput,
  cloneEditableConfig,
  isEditableConfigEqual,
  type Stage01ConfigEditableState,
} from '../features/stage01-config/stage01-config-editor'
import type { Stage01ConfigRepository } from '../repositories/contracts'
import type {
  PublishStage01ConfigResult,
  Stage01BusinessConfigView,
  Stage01ConfigDraft,
} from '../../shared/schemas/stage01-config'

export type Stage01ConfigOperation = 'load' | 'create' | 'save' | 'discard' | 'publish' | null

export function useStage01ConfigAdmin(repository: Stage01ConfigRepository) {
  const view = ref<Stage01BusinessConfigView | null>(null)
  const editable = ref<Stage01ConfigEditableState | null>(null)
  const operation = ref<Stage01ConfigOperation>(null)
  const error = ref<unknown | null>(null)
  const dirty = computed(() => {
    const draft = view.value?.draft
    return draft !== null && draft !== undefined && editable.value !== null
      && !isEditableConfigEqual(editable.value, cloneEditableConfig(draft))
  })

  function applyCanonicalView(nextView: Stage01BusinessConfigView): void {
    view.value = nextView
    editable.value = nextView.draft ? cloneEditableConfig(nextView.draft) : null
  }

  function applyDraft(nextDraft: Stage01ConfigDraft): void {
    if (!view.value) return
    view.value = { ...view.value, draft: nextDraft }
    editable.value = cloneEditableConfig(nextDraft)
  }

  async function run<T>(nextOperation: Exclude<Stage01ConfigOperation, null>, action: () => Promise<T>): Promise<T> {
    if (operation.value !== null) {
      throw new ClientError({
        kind: 'validation',
        code: 'VALIDATION_FAILED',
        message: 'Một thao tác cấu hình đang được xử lý. Vui lòng chờ hoàn tất.',
        retryable: false,
      })
    }
    operation.value = nextOperation
    error.value = null
    try {
      return await action()
    }
    catch (caught) {
      error.value = caught
      throw caught
    }
    finally {
      operation.value = null
    }
  }

  async function load(): Promise<void> {
    await run('load', async () => {
      applyCanonicalView(await repository.get())
    })
  }

  async function createDraft(): Promise<void> {
    await run('create', async () => {
      const canonicalView = view.value
      if (!canonicalView) return
      applyDraft(await repository.createDraft({ expectedPublishedSnapshotId: canonicalView.published.snapshotId }))
    })
  }

  async function saveDraft(): Promise<void> {
    await run('save', async () => {
      const persistedDraft = view.value?.draft
      if (!persistedDraft || !editable.value) return
      applyDraft(await repository.updateDraft(buildStage01ConfigUpdateInput(persistedDraft.version, editable.value)))
    })
  }

  async function discardDraft(): Promise<void> {
    await run('discard', async () => {
      const persistedDraft = view.value?.draft
      if (!persistedDraft || !view.value) return
      await repository.discardDraft({ expectedDraftVersion: persistedDraft.version })
      view.value = { ...view.value, draft: null }
      editable.value = null
    })
  }

  async function publishDraft(): Promise<PublishStage01ConfigResult | undefined> {
    return run('publish', async () => {
      const persistedDraft = view.value?.draft
      if (!persistedDraft || !editable.value) return undefined
      if (dirty.value) {
        throw new ClientError({
          kind: 'validation',
          code: 'VALIDATION_FAILED',
          message: 'Hãy lưu bản nháp trước khi xuất bản.',
          retryable: false,
        })
      }
      const result = await repository.publishDraft({ expectedDraftVersion: persistedDraft.version })
      applyCanonicalView(await repository.get())
      return result
    })
  }

  function resetLocal(): void {
    const persistedDraft = view.value?.draft
    editable.value = persistedDraft ? cloneEditableConfig(persistedDraft) : null
  }

  async function reloadCanonical(): Promise<void> {
    await load()
  }

  return {
    view,
    editable,
    dirty,
    operation,
    error,
    load,
    createDraft,
    saveDraft,
    discardDraft,
    publishDraft,
    resetLocal,
    reloadCanonical,
  }
}
