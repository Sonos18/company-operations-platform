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
