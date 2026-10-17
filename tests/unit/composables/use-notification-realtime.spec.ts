import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  useNotificationRealtime,
  type NotificationRealtimeOptions,
} from '../../../app/composables/useNotificationRealtime'

type RealtimeClient = NotificationRealtimeOptions['client']
type SubscribeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
type SubscribeCallback = (status: SubscribeStatus) => void

interface Binding {
  type: string
  filter: { event: string, schema: string, table: string, filter?: string }
  callback: () => void
}

interface FakeChannel {
  index: number
  bindings: Binding[]
  subscribe: SubscribeCallback | null
  removed: boolean
}

interface FakeClient {
  client: RealtimeClient
  channels: FakeChannel[]
  calls: string[]
}

/** Records every channel the composable opens, and the order of channel/removeChannel calls. */
function createFakeClient(): FakeClient {
  const channels: FakeChannel[] = []
  const calls: string[] = []
  const records = new Map<RealtimeChannel, FakeChannel>()

  const channel = vi.fn((): RealtimeChannel => {
    const record: FakeChannel = { index: channels.length + 1, bindings: [], subscribe: null, removed: false }
    channels.push(record)
    calls.push(`channel#${record.index}`)
    const handle = {
      on(type: string, filter: Binding['filter'], callback: () => void) {
        record.bindings.push({ type, filter, callback })
        return handle
      },
      subscribe(callback: SubscribeCallback) {
        record.subscribe = callback
        return handle
      },
    } as unknown as RealtimeChannel
    records.set(handle, record)
    return handle
  })

  const removeChannel = vi.fn((target: RealtimeChannel) => {
    const record = records.get(target)
    if (record) {
      record.removed = true
      calls.push(`remove#${record.index}`)
    }
    return Promise.resolve('ok' as const)
  })

  return { client: { channel, removeChannel } as unknown as RealtimeClient, channels, calls }
}

interface Harness {
  fake: FakeClient
  userId: { value: string | null }
  key: { value: string }
  material: { value: boolean }
  cost: { value: boolean }
  onChange: ReturnType<typeof vi.fn>
  stop: () => void
  dispose: () => void
}

function mount(overrides: { userId?: string | null, material?: boolean, cost?: boolean } = {}): Harness {
  const fake = createFakeClient()
  const userId = ref<string | null>(overrides.userId === undefined ? 'u1' : overrides.userId)
  const key = ref('company-a::perm')
  const material = ref(overrides.material ?? true)
  const cost = ref(overrides.cost ?? true)
  const onChange = vi.fn()
  const scope = effectScope()
  const handle = scope.run(() => useNotificationRealtime({
    client: fake.client,
    userId: () => userId.value,
    sources: () => ({ material: material.value, cost: cost.value }),
    key: () => key.value,
    onChange,
  }))
  if (!handle) throw new Error('scope did not run')
  return { fake, userId, key, material, cost, onChange, stop: handle.stop, dispose: () => scope.stop() }
}

function bindingsOf(channel: FakeChannel | undefined): string[] {
  return (channel?.bindings ?? []).map(b => `${b.filter.event}:${b.filter.schema}.${b.filter.table}`).sort()
}

function firstChannel(fake: FakeClient): FakeChannel {
  const channel = fake.channels[0]
  if (!channel) throw new Error('no channel was opened')
  return channel
}

function emit(channel: FakeChannel): void {
  const binding = channel.bindings[0]
  if (!binding) throw new Error('channel has no binding')
  binding.callback()
}

function subscriber(channel: FakeChannel): SubscribeCallback {
  if (!channel.subscribe) throw new Error('channel was not subscribed')
  return channel.subscribe
}

describe('useNotificationRealtime', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('subscribes to INSERT and UPDATE on both tables filtered by the recipient', () => {
    const { fake } = mount()
    expect(fake.channels).toHaveLength(1)
    const channel = firstChannel(fake)
    expect(channel.bindings.every(b => b.type === 'postgres_changes')).toBe(true)
    expect(channel.bindings.every(b => b.filter.filter === 'recipient_id=eq.u1')).toBe(true)
    expect(bindingsOf(channel)).toEqual([
      'INSERT:public.app_notifications',
      'INSERT:public.cost_workflow_notifications',
      'UPDATE:public.app_notifications',
      'UPDATE:public.cost_workflow_notifications',
    ])
    expect(channel.subscribe).toBeTypeOf('function')
  })

  it('does not listen to cost notifications without cost read access', () => {
    const { fake } = mount({ material: true, cost: false })
    expect(bindingsOf(firstChannel(fake))).toEqual([
      'INSERT:public.app_notifications',
      'UPDATE:public.app_notifications',
    ])
  })

  it('does not listen to material notifications without material read access', () => {
    const { fake } = mount({ material: false, cost: true })
    expect(bindingsOf(firstChannel(fake))).toEqual([
      'INSERT:public.cost_workflow_notifications',
      'UPDATE:public.cost_workflow_notifications',
    ])
  })

  it('creates no channel without a user', () => {
    const { fake } = mount({ userId: null })
    expect(fake.channels).toHaveLength(0)
  })

  it('creates no channel when no source is readable', () => {
    const { fake } = mount({ material: false, cost: false })
    expect(fake.channels).toHaveLength(0)
  })

  it('coalesces ten signals within 200 ms into a single onChange after 1000 ms', () => {
    const { fake, onChange } = mount()
    const channel = firstChannel(fake)
    for (let i = 0; i < 10; i += 1) {
      emit(channel)
      vi.advanceTimersByTime(20)
    }
    expect(onChange).not.toHaveBeenCalled()
    // The last signal arrived 20 ms before the loop ended, so the quiet period ends 980 ms from here.
    vi.advanceTimersByTime(979)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reloads at least every 3000 ms while signals keep arriving', () => {
    const { fake, onChange } = mount()
    const channel = firstChannel(fake)
    // A signal every 400 ms never leaves a 1000 ms quiet period, so only the max-wait can fire.
    for (let elapsed = 0; elapsed < 2800; elapsed += 400) {
      emit(channel)
      vi.advanceTimersByTime(400)
    }
    expect(onChange).not.toHaveBeenCalled()
    emit(channel)
    vi.advanceTimersByTime(399)
    expect(onChange).toHaveBeenCalledTimes(1)
    // The next burst starts a fresh max-wait window.
    for (let elapsed = 0; elapsed < 2800; elapsed += 400) {
      emit(channel)
      vi.advanceTimersByTime(400)
    }
    expect(onChange).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(400)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('removes the old channel before opening a new one when the key changes', async () => {
    const { fake, key } = mount()
    key.value = 'company-b::perm'
    await nextTick()
    expect(fake.channels).toHaveLength(2)
    expect(fake.calls).toEqual(['channel#1', 'remove#1', 'channel#2'])
  })

  it('removes the channel when the user signs out', async () => {
    const { fake, userId } = mount()
    userId.value = null
    await nextTick()
    expect(fake.channels).toHaveLength(1)
    expect(firstChannel(fake).removed).toBe(true)
  })

  it('removes the channel when the last readable source disappears', async () => {
    const { fake, material, cost } = mount()
    material.value = false
    cost.value = false
    await nextTick()
    expect(firstChannel(fake).removed).toBe(true)
    expect(fake.channels).toHaveLength(1)
  })

  it('drops a pending signal when the channel is replaced', async () => {
    const { fake, key, onChange } = mount()
    emit(firstChannel(fake))
    key.value = 'company-b::perm'
    await nextTick()
    vi.advanceTimersByTime(5000)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stop() removes the channel and silences pending and future signals', () => {
    const { fake, onChange, stop } = mount()
    const channel = firstChannel(fake)
    emit(channel)
    stop()
    expect(channel.removed).toBe(true)
    emit(channel)
    vi.advanceTimersByTime(5000)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes the channel when the owning scope is disposed', () => {
    const { fake, onChange, dispose } = mount()
    const channel = firstChannel(fake)
    emit(channel)
    dispose()
    expect(channel.removed).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not reload on the first SUBSCRIBED', () => {
    const { fake, onChange } = mount()
    subscriber(firstChannel(fake))('SUBSCRIBED')
    vi.advanceTimersByTime(5000)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reloads once when the channel is SUBSCRIBED again after CHANNEL_ERROR', () => {
    const { fake, onChange } = mount()
    const subscribe = subscriber(firstChannel(fake))
    subscribe('SUBSCRIBED')
    subscribe('CHANNEL_ERROR')
    expect(onChange).not.toHaveBeenCalled()
    subscribe('SUBSCRIBED')
    vi.advanceTimersByTime(1000)
    expect(onChange).toHaveBeenCalledTimes(1)
    subscribe('SUBSCRIBED')
    vi.advanceTimersByTime(5000)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reloads after an error that happens before the first SUBSCRIBED', () => {
    const { fake, onChange } = mount()
    const subscribe = subscriber(firstChannel(fake))
    subscribe('TIMED_OUT')
    subscribe('SUBSCRIBED')
    vi.advanceTimersByTime(1000)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('ignores status callbacks from a channel that was already replaced', async () => {
    const { fake, key, onChange } = mount()
    const stale = subscriber(firstChannel(fake))
    key.value = 'company-b::perm'
    await nextTick()
    stale('CHANNEL_ERROR')
    stale('SUBSCRIBED')
    vi.advanceTimersByTime(5000)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not throw when the client fails to create a channel', () => {
    const client = {
      channel: vi.fn(() => { throw new Error('boom') }),
      removeChannel: vi.fn(() => Promise.resolve('ok' as const)),
    } as unknown as RealtimeClient
    const scope = effectScope()
    expect(() => scope.run(() => useNotificationRealtime({
      client,
      userId: () => 'u1',
      sources: () => ({ material: true, cost: true }),
      key: () => 'k',
      onChange: vi.fn(),
    }))).not.toThrow()
    scope.stop()
  })
})
