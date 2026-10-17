import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAllCutoff } from '../../../app/utils/notifications/notification-display'
import { createRealtimeReloadGate } from '../../../app/utils/notifications/realtime-reload-gate'
import { markAllCutoffFor, showLoadingPlaceholder, sourceAfterLoad, staleAfterLoad } from '../../../app/utils/notifications/notification-list-refresh'

// The bell is a Nuxt SFC and the repo runs unit tests in a node environment, so the bell's deferral wiring lives in this
// gate. The bell calls signal() from the realtime composable and settled() when its own load / mark-all ends.
function setup() {
  let busy = false
  const reload = vi.fn()
  const gate = createRealtimeReloadGate({ reload, isBusy: () => busy })
  return {
    reload,
    gate,
    setBusy(value: boolean) { busy = value },
    finish() { busy = false; gate.settled() },
  }
}

describe('createRealtimeReloadGate', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('reloads immediately for a signal while idle and outside any echo window', () => {
    const { gate, reload } = setup()
    gate.signal()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('serves a signal that arrived during mark-all with exactly one reload after it completes', () => {
    const { gate, reload, setBusy, finish } = setup()
    setBusy(true)
    gate.signal()
    gate.signal()
    expect(reload).not.toHaveBeenCalled()
    finish()
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500)
    expect(reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('serves a signal that arrived during a load with one reload after it', () => {
    const { gate, reload, setBusy, finish } = setup()
    setBusy(true)
    gate.signal()
    finish()
    vi.advanceTimersByTime(1500)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload for echoes when nothing arrived during the window', () => {
    const { reload, finish } = setup()
    finish()
    vi.advanceTimersByTime(5000)
    expect(reload).not.toHaveBeenCalled()
  })

  it('defers a real notification that arrives inside the echo window to the end of the window', () => {
    const { gate, reload, finish } = setup()
    finish()
    vi.advanceTimersByTime(700)
    gate.signal()
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(799)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads immediately again once the window ended quietly', () => {
    const { gate, reload, finish } = setup()
    finish()
    vi.advanceTimersByTime(1500)
    gate.signal()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('waits for a request started during the window and opens a new window when it settles', () => {
    const { gate, reload, setBusy, finish } = setup()
    finish()
    gate.signal()
    setBusy(true)
    vi.advanceTimersByTime(1500)
    expect(reload).not.toHaveBeenCalled()
    finish()
    vi.advanceTimersByTime(1500)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('needs settled() to run after the busy flags are cleared: a call while still busy opens no window', () => {
    const { gate, reload, setBusy } = setup()
    setBusy(true)
    gate.signal()
    gate.settled()
    setBusy(false)
    vi.advanceTimersByTime(10_000)
    expect(reload).not.toHaveBeenCalled()
    gate.settled()
    vi.advanceTimersByTime(1500)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('drops a pending request and the window on clear()', () => {
    const { gate, reload, setBusy, finish } = setup()
    setBusy(true)
    gate.signal()
    finish()
    gate.clear()
    vi.advanceTimersByTime(10_000)
    expect(reload).not.toHaveBeenCalled()
    gate.signal()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('background reload rendering', () => {
  it('keeps existing cards rendered during a background reload but shows the placeholder when there are none', () => {
    expect(showLoadingPlaceholder(true, true, 3)).toBe(false)
    expect(showLoadingPlaceholder(true, true, 0)).toBe(true)
    expect(showLoadingPlaceholder(false, true, 0)).toBe(false)
  })

  it('shows the placeholder for a user-started load', () => {
    expect(showLoadingPlaceholder(true, false, 3)).toBe(true)
    expect(showLoadingPlaceholder(false, false, 3)).toBe(false)
  })

  it('keeps the cards on screen when a background read fails, but empties them for a user-started load', () => {
    const cards = ['a', 'b']
    const failed: PromiseRejectedResult = { status: 'rejected', reason: new Error('offline') }
    const fresh: PromiseFulfilledResult<string[]> = { status: 'fulfilled', value: ['c'] }
    expect(sourceAfterLoad(cards, failed, true, [])).toEqual(cards)
    expect(sourceAfterLoad(cards, failed, false, [])).toEqual([])
    expect(sourceAfterLoad(cards, fresh, true, [])).toEqual(['c'])
  })
})

describe('stale sources and mark-all cut-offs', () => {
  const rows = [{ createdAt: '2026-10-17T08:00:00.000Z' }, { createdAt: '2026-10-17T09:00:00.000Z' }]
  const failed: PromiseRejectedResult = { status: 'rejected', reason: new Error('offline') }
  const fresh: PromiseFulfilledResult<unknown[]> = { status: 'fulfilled', value: [] }

  it('marks a source stale after a failed background read and sends no cut-off for it', () => {
    const stale = staleAfterLoad(failed, true)
    expect(stale).toBe(true)
    expect(markAllCutoffFor(stale, rows, readAllCutoff)).toBeNull()
  })

  it('sends the newest cut-off for a source that is not stale', () => {
    expect(markAllCutoffFor(false, rows, readAllCutoff)).toBe('2026-10-17T09:00:00.000Z')
  })

  it('clears stale on the next successful read of that source', () => {
    expect(staleAfterLoad(failed, true)).toBe(true)
    expect(staleAfterLoad(fresh, true)).toBe(false)
    expect(staleAfterLoad(fresh, false)).toBe(false)
  })

  it('does not mark a source stale after a failed user-started load, which empties it instead', () => {
    expect(staleAfterLoad(failed, false)).toBe(false)
    expect(markAllCutoffFor(false, [], readAllCutoff)).toBeNull()
  })
})
