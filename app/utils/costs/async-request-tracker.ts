export interface RequestToken<TIdentity = Record<string, unknown>> {
  readonly generation: number
  readonly identity: Readonly<TIdentity>
  isCurrent(): boolean
}

/**
 * Tracks independent async request streams to prevent race conditions and stale response pollution.
 *
 * Requirements (R02, R03):
 * 1. Independent generations per stream.
 * 2. Captures immutable request inputs (identity).
 * 3. Immediate invalidation on query/selection/context changes, clearing, and unmount.
 * 4. Accepts success, error, and finally updates only when token.isCurrent() is true.
 */
export class AsyncRequestTracker<TIdentity extends Record<string, unknown> = Record<string, unknown>> {
  private currentGeneration = 0
  private currentIdentity: TIdentity | null = null

  /**
   * Starts a new request with the captured immutable identity.
   * Increments generation so any previous in-flight request becomes stale immediately.
   */
  start(identity: TIdentity): RequestToken<TIdentity> {
    const generation = ++this.currentGeneration
    this.currentIdentity = { ...identity }

    return {
      generation,
      identity: Object.freeze({ ...identity }),
      isCurrent: () => this.isCurrent(generation),
    }
  }

  /**
   * Checks whether the given generation is still current.
   */
  isCurrent(generation: number): boolean {
    return generation === this.currentGeneration
  }

  /**
   * Immediately invalidates any in-flight requests without starting a new one.
   * Useful when selection clears, during debounce waiting, or on unmount.
   */
  invalidate(): void {
    this.currentGeneration++
    this.currentIdentity = null
  }

  /**
   * Gets the active generation number.
   */
  get generation(): number {
    return this.currentGeneration
  }

  /**
   * Gets the currently active request identity.
   */
  get identity(): Readonly<TIdentity> | null {
    return this.currentIdentity ? Object.freeze({ ...this.currentIdentity }) : null
  }
}

export function createAsyncRequestTracker<TIdentity extends Record<string, unknown> = Record<string, unknown>>(): AsyncRequestTracker<TIdentity> {
  return new AsyncRequestTracker<TIdentity>()
}
