export interface RealtimeReloadGateOptions {
  /** Runs one background reload of the notification list. */
  reload: () => void
  /** True while the bell itself has a load or "mark all read" in flight. */
  isBusy: () => boolean
  /** How long after the bell's own request finishes its realtime signals count as echoes. */
  echoWindowMs?: number
}

export interface RealtimeReloadGate {
  /** A realtime change signal arrived. */
  signal: () => void
  /** A request the bell started has finished (call after clearing the busy state). */
  settled: () => void
  /** Drops the pending request and the echo window (company change, unmount). */
  clear: () => void
}

export const DEFAULT_ECHO_WINDOW_MS = 1500

// The bell's own writes (read_at updates, cost notifications flipping undelivered -> available) come back as realtime
// signals. Reloading for each of them would loop, so signals that arrive while the bell is busy or shortly after it
// finished are remembered instead and served by one background reload when the quiet window ends. A real new
// notification in that period is therefore delayed by at most the window, never lost.
export function createRealtimeReloadGate(options: RealtimeReloadGateOptions): RealtimeReloadGate {
  const echoWindowMs = options.echoWindowMs ?? DEFAULT_ECHO_WINDOW_MS
  let pending = false
  let timer: ReturnType<typeof setTimeout> | null = null

  function stopTimer(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function windowEnded(): void {
    timer = null
    // A request started meanwhile keeps the pending flag; its own settled() opens a new window.
    if (!pending || options.isBusy()) return
    pending = false
    options.reload()
  }

  return {
    signal() {
      if (options.isBusy() || timer !== null) {
        pending = true
        return
      }
      options.reload()
    },
    settled() {
      if (options.isBusy()) return
      stopTimer()
      timer = setTimeout(windowEnded, echoWindowMs)
    },
    clear() {
      pending = false
      stopTimer()
    },
  }
}
