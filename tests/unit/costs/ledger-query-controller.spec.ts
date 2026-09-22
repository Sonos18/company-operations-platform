import { describe, expect, it, vi } from 'vitest'
import { createLedgerQueryController, type SerializedLedgerQuery } from '../../../app/composables/costs/useLedgerQueryController'

describe('useLedgerQueryController (RR01, RR02, RR04)', () => {
  it('invalidates tracker immediately upon search input before debounce timer dispatches (RR02)', async () => {
    vi.useFakeTimers()

    const fetcher = vi.fn().mockResolvedValue({
      rows: [],
      pagination: { page: 1, pageSize: 25, totalPages: 1, filteredCount: 0, fullCount: 0, filteredAmount: null, fullAmount: null },
    })

    const controller = createLedgerQueryController({
      defaultRetention: 'all',
      getContext: () => ({ projectId: 'p1', itemId: 'i1' }),
      fetcher,
    })

    const initialGen = controller.tracker.generation

    // User types search intent
    controller.onSearchInput('cọc khoan')
    expect(controller.draftQuery.search).toBe('cọc khoan')
    expect(controller.isPendingDispatch.value).toBe(true)

    // Generation must have incremented immediately!
    const typingGen = controller.tracker.generation
    expect(typingGen).toBeGreaterThan(initialGen)

    // Fetcher has NOT been called yet (debounce is pending)
    expect(fetcher).not.toHaveBeenCalled()

    // Advance 300ms
    vi.advanceTimersByTime(300)
    await Promise.resolve()

    // Now fetcher has been called with the serialized search
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(
      { projectId: 'p1', itemId: 'i1' },
      expect.objectContaining({ q: 'cọc khoan', page: 1 }),
    )
    expect(controller.isPendingDispatch.value).toBe(false)

    vi.useRealTimers()
  })

  it('clearing search and dates completely removes parameters from the next request (RR01)', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      rows: [],
      pagination: { page: 1, pageSize: 25, totalPages: 1, filteredCount: 0, fullCount: 0, filteredAmount: null, fullAmount: null },
    })

    const controller = createLedgerQueryController({
      defaultRetention: 'all',
      getContext: () => ({ projectId: 'p1', itemId: 'i1' }),
      fetcher,
    })

    // Set filter states
    controller.draftQuery.search = 'khoan cọc'
    controller.draftQuery.dateFrom = '2026-08-01'
    controller.draftQuery.dateTo = '2026-08-15'
    controller.draftQuery.pageSize = 50
    controller.draftQuery.page = 3

    // Clear filters
    await controller.clearFilters()

    expect(controller.draftQuery.search).toBe('')
    expect(controller.draftQuery.dateFrom).toBe('')
    expect(controller.draftQuery.dateTo).toBe('')
    expect(controller.draftQuery.page).toBe(1)
    // Selected pageSize must be preserved! (RR01)
    expect(controller.draftQuery.pageSize).toBe(50)

    // Verify dispatched query has NO q, dateFrom, or dateTo keys
    const lastCallQuery = fetcher.mock.calls[0][1] as SerializedLedgerQuery
    expect(lastCallQuery.q).toBeUndefined()
    expect(lastCallQuery.dateFrom).toBeUndefined()
    expect(lastCallQuery.dateTo).toBeUndefined()
    expect(lastCallQuery.page).toBe(1)
    expect(lastCallQuery.pageSize).toBe(50)
  })

  it('validates inverted date ranges locally and prevents invalid request dispatch (RR01)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ rows: [] })

    const controller = createLedgerQueryController({
      defaultRetention: 'all',
      getContext: () => ({ projectId: 'p1', itemId: 'i1' }),
      fetcher,
    })

    controller.draftQuery.dateFrom = '2026-08-20'
    controller.draftQuery.dateTo = '2026-08-10' // Inverted!

    expect(controller.dateValidationError.value).toBe('Ngày kết thúc không được trước ngày bắt đầu')

    await controller.executeDispatch()

    expect(fetcher).not.toHaveBeenCalled()
    expect(controller.status.value).toBe('validation_error')
  })

  it('cancels pending debounce timer on page change or filter clearing (RR02)', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue({
      rows: [],
      pagination: { page: 2, pageSize: 25, totalPages: 3, filteredCount: 50, fullCount: 50, filteredAmount: null, fullAmount: null },
    })

    const controller = createLedgerQueryController({
      defaultRetention: 'all',
      getContext: () => ({ projectId: 'p1', itemId: 'i1' }),
      fetcher,
    })

    // User types in search
    controller.onSearchInput('đợt 1')
    expect(controller.isPendingDispatch.value).toBe(true)

    // User immediately clicks page 2 before debounce finishes
    controller.goToPage(2)
    expect(controller.isPendingDispatch.value).toBe(false)
    expect(controller.draftQuery.page).toBe(2)

    // Immediate dispatch happened for page 2
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ page: 2, q: 'đợt 1' }),
    )

    // Advance 300ms — no trailing timer may fire and reset page!
    vi.advanceTimersByTime(300)
    await Promise.resolve()

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(controller.draftQuery.page).toBe(2)

    vi.useRealTimers()
  })

  it('propagates typed error classifications and clears data on permission denial (RR04)', async () => {
    const permErr = {
      code: 'PERMISSION_DENIED',
      message: 'Access denied',
      kind: 'authorization',
    }
    const fetcher = vi.fn().mockRejectedValue(permErr)

    const controller = createLedgerQueryController({
      defaultRetention: 'all',
      getContext: () => ({ projectId: 'p1', itemId: 'i1' }),
      fetcher,
    })

    await controller.executeDispatch()

    expect(controller.status.value).toBe('permission')
    expect(controller.data.value).toBeNull()
  })

  it('handles server pagination clamping without loops (RR01)', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      rows: [{ id: '1' }],
      pagination: { page: 2, pageSize: 25, totalPages: 2, filteredCount: 30, fullCount: 30, filteredAmount: null, fullAmount: null },
    })

    const controller = createLedgerQueryController({
      defaultRetention: 'all',
      getContext: () => ({ projectId: 'p1', itemId: 'i1' }),
      fetcher,
      extractPagination: (d) => d.pagination,
      extractRowsCount: (d) => d.rows.length,
    })

    // User requested page 5, but server clamped to page 2
    controller.draftQuery.page = 5
    await controller.executeDispatch()

    expect(controller.draftQuery.page).toBe(2)
    expect(controller.status.value).toBe('ready')
    // Must NOT have caused an extra fetch loop
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
