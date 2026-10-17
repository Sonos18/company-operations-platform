import { getCurrentScope, onScopeDispose, watch } from 'vue'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

export interface NotificationRealtimeOptions {
  client: Pick<SupabaseClient, 'channel' | 'removeChannel'>
  userId: () => string | null
  sources: () => { material: boolean, cost: boolean }
  /** A new key closes the current channel and opens a fresh one (the bell passes its access fingerprint). */
  key: () => string
  /** Called once per burst of changes: after `debounceMs` of quiet, or at the latest `maxWaitMs` after the burst began. */
  onChange: () => void
  debounceMs?: number
  maxWaitMs?: number
}

const DEFAULT_DEBOUNCE_MS = 1000
// A steady stream of signals would keep postponing a pure trailing debounce, so a reload is forced at this age.
const DEFAULT_MAX_WAIT_MS = 3000
const NOTIFICATION_TABLES = {
  material: 'app_notifications',
  cost: 'cost_workflow_notifications',
} as const
const CHANGE_EVENTS = ['INSERT', 'UPDATE'] as const
const FAILURE_STATUSES: ReadonlySet<string> = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])

let channelCounter = 0

// Realtime is only a "something changed" signal. Failures stay in the dev console and never reach the UI.
function reportRealtimeProblem(message: string, error?: unknown): void {
  if (import.meta.dev) console.warn(`[notification-realtime] ${message}`, error ?? '')
}

export function useNotificationRealtime(options: NotificationRealtimeOptions): { stop: () => void } {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  let activeChannel: RealtimeChannel | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  // When the first signal of the current burst arrived; null while nothing is pending.
  let burstStartedAt: number | null = null
  // Bumped whenever a channel is closed so late callbacks from that channel are ignored.
  let generation = 0
  let stopped = false

  function clearTimer(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    burstStartedAt = null
  }

  function scheduleChange(channelGeneration: number): void {
    if (stopped || channelGeneration !== generation) return
    const startedAt = burstStartedAt ?? Date.now()
    clearTimer()
    burstStartedAt = startedAt
    const delay = Math.max(0, Math.min(debounceMs, startedAt + maxWaitMs - Date.now()))
    timer = setTimeout(() => {
      timer = null
      burstStartedAt = null
      if (stopped || channelGeneration !== generation) return
      options.onChange()
    }, delay)
  }

  function closeChannel(): void {
    generation += 1
    clearTimer()
    const channel = activeChannel
    activeChannel = null
    if (!channel) return
    try {
      void Promise.resolve(options.client.removeChannel(channel)).catch((error: unknown) => {
        reportRealtimeProblem('could not remove the channel', error)
      })
    } catch (error) {
      reportRealtimeProblem('could not remove the channel', error)
    }
  }

  function openChannel(userId: string, sources: { material: boolean, cost: boolean }): void {
    const channelGeneration = generation
    const filter = `recipient_id=eq.${userId}`
    let hadFailure = false
    try {
      channelCounter += 1
      let channel = options.client.channel(`notifications:${userId}:${channelCounter}`)
      for (const source of ['material', 'cost'] as const) {
        if (!sources[source]) continue
        for (const event of CHANGE_EVENTS) {
          channel = channel.on(
            'postgres_changes',
            { event, schema: 'public', table: NOTIFICATION_TABLES[source], filter },
            () => scheduleChange(channelGeneration),
          )
        }
      }
      activeChannel = channel
      channel.subscribe((status: string) => {
        if (stopped || channelGeneration !== generation) return
        if (FAILURE_STATUSES.has(status)) {
          hadFailure = true
          reportRealtimeProblem(`channel status ${status}`)
          return
        }
        if (status === 'SUBSCRIBED' && hadFailure) {
          // Events may have been missed while the connection was down, so catch up once.
          hadFailure = false
          scheduleChange(channelGeneration)
        }
      })
    } catch (error) {
      reportRealtimeProblem('could not open the channel', error)
    }
  }

  function sync(): void {
    closeChannel()
    if (stopped) return
    const userId = options.userId()
    const sources = options.sources()
    if (!userId || (!sources.material && !sources.cost)) return
    openChannel(userId, sources)
  }

  const stopWatching = watch(
    () => {
      const sources = options.sources()
      return `${options.userId() ?? ''}|${options.key()}|${sources.material ? 1 : 0}${sources.cost ? 1 : 0}`
    },
    sync,
    { immediate: true },
  )

  function stop(): void {
    if (stopped) return
    stopped = true
    stopWatching()
    closeChannel()
  }

  if (getCurrentScope()) onScopeDispose(stop)

  return { stop }
}
