import { computed, ref, shallowReactive } from 'vue'
import { createAsyncRequestTracker, type AsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import { mapCostsApiError, type CostsUiErrorState } from '../../utils/costs/costs-error-mapper'

export interface LedgerDraftQuery<TRetention extends string = string> {
  search: string
  dateFrom: string
  dateTo: string
  retention: TRetention
  pageSize: 25 | 50 | 100
  page: number
}

export type LedgerUiStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'module'
  | 'permission'
  | 'not_found'
  | 'validation_error'
  | 'error'

export interface SerializedLedgerQuery<TRetention extends string = string> {
  page: number
  pageSize: 25 | 50 | 100
  sort: 'newest'
  retention: TRetention
  q?: string
  dateFrom?: string
  dateTo?: string
}

export interface LedgerServerPagination {
  page: number
  pageSize: number
  totalPages: number
  filteredCount: number
  fullCount: number
  filteredAmount: string | null
  fullAmount: string | null
}

export interface LedgerQueryControllerOptions<
  TData,
  TContext extends Record<string, unknown>,
  TRetention extends string = string,
> {
  defaultRetention: TRetention
  defaultPageSize?: 25 | 50 | 100
  getContext: () => TContext | null
  fetcher: (context: TContext, query: SerializedLedgerQuery<TRetention>) => Promise<TData>
  extractPagination?: (data: TData) => LedgerServerPagination | null
  extractRowsCount?: (data: TData) => number
  onPermissionDenied?: () => void
}

export function createLedgerQueryController<
  TData,
  TContext extends Record<string, unknown>,
  TRetention extends string = string,
>(options: LedgerQueryControllerOptions<TData, TContext, TRetention>) {
  const tracker: AsyncRequestTracker = createAsyncRequestTracker()

  const draftQuery = shallowReactive<LedgerDraftQuery<TRetention>>({
    search: '',
    dateFrom: '',
    dateTo: '',
    retention: options.defaultRetention,
    pageSize: options.defaultPageSize ?? 25,
    page: 1,
  })

  const appliedQuery = ref<SerializedLedgerQuery<TRetention> | null>(null)
  const data = ref<TData | null>(null)
  const status = ref<LedgerUiStatus>('idle')
  const isPendingDispatch = ref(false)

  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

  // RR01: Local validation for date range
  const dateValidationError = computed<string | null>(() => {
    if (draftQuery.dateFrom && draftQuery.dateTo && draftQuery.dateFrom > draftQuery.dateTo) {
      return 'Ngày kết thúc không được trước ngày bắt đầu'
    }
    return null
  })

  function cancelDebounceTimer(): void {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
    isPendingDispatch.value = false
  }

  function serializeQuery(): SerializedLedgerQuery<TRetention> {
    const serialized: SerializedLedgerQuery<TRetention> = {
      page: draftQuery.page,
      pageSize: draftQuery.pageSize,
      sort: 'newest',
      retention: draftQuery.retention,
    }

    const trimmedSearch = draftQuery.search.trim()
    if (trimmedSearch) {
      serialized.q = trimmedSearch
    }

    if (draftQuery.dateFrom) {
      serialized.dateFrom = draftQuery.dateFrom
    }

    if (draftQuery.dateTo) {
      serialized.dateTo = draftQuery.dateTo
    }

    return serialized
  }

  async function executeDispatch(resetPage = false): Promise<void> {
    cancelDebounceTimer()

    const context = options.getContext()
    if (!context) {
      status.value = 'idle'
      return
    }

    if (dateValidationError.value) {
      // Inverted date range: do not submit invalid request (RR01)
      status.value = 'validation_error'
      return
    }

    if (resetPage) {
      draftQuery.page = 1
    }

    const serialized = serializeQuery()

    // Start request token capturing full context + query identity (RR02)
    const token = tracker.start({
      ...context,
      ...serialized,
    })

    status.value = 'loading'

    try {
      const result = await options.fetcher(context, serialized)
      if (!token.isCurrent()) return

      data.value = result
      appliedQuery.value = serialized

      // Server pagination clamping without duplicate fetch loop (RR01)
      if (options.extractPagination) {
        const pagination = options.extractPagination(result)
        if (pagination && pagination.page !== draftQuery.page) {
          draftQuery.page = pagination.page
        }
      }

      // Check whether rows are empty
      let count = 0
      if (options.extractRowsCount) {
        count = options.extractRowsCount(result)
      }
      else if (options.extractPagination) {
        const pagination = options.extractPagination(result)
        count = pagination ? pagination.filteredCount : 0
      }

      status.value = count === 0 ? 'empty' : 'ready'
    }
    catch (err: unknown) {
      if (!token.isCurrent()) return

      const mapped: CostsUiErrorState = mapCostsApiError(err, 'ledger')
      if (mapped === 'aborted') {
        return
      }

      // RR04: Propagate typed error state
      if (mapped === 'permission') {
        data.value = null
        status.value = 'permission'
        options.onPermissionDenied?.()
      }
      else if (mapped === 'module') {
        status.value = 'module'
      }
      else if (mapped === 'not_found') {
        data.value = null
        status.value = 'not_found'
      }
      else if (mapped === 'validation_error') {
        status.value = 'validation_error'
      }
      else {
        status.value = 'error'
      }
    }
  }

  // RR02: Invalidate immediately at user intent, before debounce dispatch
  function onSearchInput(newSearch: string): void {
    draftQuery.search = newSearch
    isPendingDispatch.value = true

    // Immediately invalidate in-flight responses so older responses are not accepted during debounce (RR02)
    tracker.invalidate()

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }

    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null
      isPendingDispatch.value = false
      executeDispatch(true)
    }, 300)
  }

  function onFilterChange<K extends 'dateFrom' | 'dateTo' | 'retention'>(
    field: K,
    value: LedgerDraftQuery<TRetention>[K],
  ): void {
    cancelDebounceTimer()
    draftQuery[field] = value

    // Invalidate immediately
    tracker.invalidate()

    if (dateValidationError.value) {
      status.value = 'validation_error'
      return
    }

    executeDispatch(true)
  }

  function onPageSizeChange(newSize: 25 | 50 | 100): void {
    cancelDebounceTimer()
    draftQuery.pageSize = newSize
    tracker.invalidate()
    executeDispatch(true)
  }

  function goToPage(newPage: number): void {
    cancelDebounceTimer()
    draftQuery.page = newPage
    tracker.invalidate()
    executeDispatch(false)
  }

  // RR01: Clear filters resets search, dates, retention, page=1, while preserving pageSize
  function clearFilters(): void {
    cancelDebounceTimer()
    draftQuery.search = ''
    draftQuery.dateFrom = ''
    draftQuery.dateTo = ''
    draftQuery.retention = options.defaultRetention
    draftQuery.page = 1
    tracker.invalidate()
    executeDispatch(false)
  }

  function retry(): void {
    cancelDebounceTimer()
    tracker.invalidate()
    executeDispatch(false)
  }

  function resetContext(): void {
    cancelDebounceTimer()
    tracker.invalidate()
    data.value = null
    appliedQuery.value = null
    status.value = 'idle'
    draftQuery.search = ''
    draftQuery.dateFrom = ''
    draftQuery.dateTo = ''
    draftQuery.retention = options.defaultRetention
    draftQuery.page = 1
  }

  function destroy(): void {
    cancelDebounceTimer()
    tracker.invalidate()
  }

  return {
    draftQuery,
    appliedQuery,
    data,
    status,
    isPendingDispatch,
    dateValidationError,
    tracker,
    onSearchInput,
    onFilterChange,
    onPageSizeChange,
    goToPage,
    clearFilters,
    retry,
    resetContext,
    destroy,
    executeDispatch,
  }
}
