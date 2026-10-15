/**
 * Keeps one idempotency key per distinct payload: a retry of the same payload
 * reuses the key, a changed payload gets a new one.
 */
export function createCommandKeyKeeper() {
  let last: { signature: string, key: string } | null = null
  return {
    keyFor(payload: unknown): string {
      const signature = JSON.stringify(payload)
      if (!last || last.signature !== signature) last = { signature, key: crypto.randomUUID() }
      return last.key
    },
    reset() {
      last = null
    },
  }
}
