/**
 * The placeholder shows for a user-started load, and for any load while there is nothing to show.
 * A background (realtime) reload never blanks cards already on screen.
 */
export function showLoadingPlaceholder(loading: boolean, background: boolean, entryCount: number): boolean {
  return loading && (!background || entryCount === 0)
}

/**
 * Value of one source after a load. A user-started load shows what the server said, an empty list when the read failed.
 * A background (realtime) load keeps what is on screen when its read failed, so a hiccup never empties the list.
 */
export function sourceAfterLoad<T>(previous: T, result: PromiseSettledResult<T>, background: boolean, empty: T): T {
  if (result.status === 'fulfilled') return result.value
  return background ? previous : empty
}

/**
 * Whether a source's cards are stale: its last read failed in the background and the cards are older than the server.
 * The next successful read clears it; a user-started failed load empties the source, so nothing stale is left.
 */
export function staleAfterLoad(result: PromiseSettledResult<unknown>, background: boolean): boolean {
  return result.status === 'rejected' && background
}

/**
 * Cut-off sent to "mark all read" for one source. A stale source sends null, so the server marks nothing for cards the
 * user may not have seen in full (a row can have become readable while the source kept failing to load).
 */
export function markAllCutoffFor<T extends { createdAt: string }>(
  stale: boolean,
  items: readonly T[],
  cutoff: (items: readonly T[]) => string | null,
): string | null {
  return stale ? null : cutoff(items)
}
