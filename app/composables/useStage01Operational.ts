import { computed, ref } from 'vue'
import { ClientError } from '../errors/client-error'
import type { Stage01OperationalDetail } from '../features/stage01/stage01.types'
import type { Stage01Repository } from '../repositories/contracts'

export type Stage01OperationalOperation = 'load' | 'command' | null

export function useStage01Operational(repository: Stage01Repository, opportunityId: string) {
  const detail = ref<Stage01OperationalDetail | null>(null)
  const operation = ref<Stage01OperationalOperation>(null)
  const error = ref<unknown | null>(null)
  const pending = computed(() => operation.value !== null)

  async function run<T>(nextOperation: Exclude<Stage01OperationalOperation, null>, action: () => Promise<T>): Promise<T> {
    if (operation.value !== null) {
      throw new ClientError({
        kind: 'validation',
        code: 'VALIDATION_FAILED',
        message: 'Một thao tác Stage 01 đang được xử lý. Vui lòng chờ hoàn tất.',
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

  async function fetchCanonicalDetail(): Promise<Stage01OperationalDetail> {
    const nextDetail = await repository.get(opportunityId)
    detail.value = nextDetail
    return nextDetail
  }

  async function load(): Promise<Stage01OperationalDetail> {
    return run('load', fetchCanonicalDetail)
  }

  async function runAndReload<T>(action: () => Promise<T>): Promise<T> {
    return run('command', async () => {
      const result = await action()
      await fetchCanonicalDetail()
      return result
    })
  }

  return { detail, operation, error, pending, load, runAndReload }
}
