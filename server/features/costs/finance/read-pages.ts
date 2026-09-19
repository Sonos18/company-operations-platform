export class FinanceReadLimitError extends Error {
  constructor() { super('FINANCE_READ_LIMIT_EXCEEDED') }
}

export async function scanUuidRows<T extends { id: string }>(
  fetchPage: (afterId: string | null, requestedSize: number) => Promise<readonly T[]>,
  options: { pageSize?: number, maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 500
  const maxRows = options.maxRows ?? 50_000
  const result: T[] = []
  const seen = new Set<string>()
  let afterId: string | null = null
  for (;;) {
    const page = await fetchPage(afterId, pageSize)
    if (page.length === 0) return result
    let previous: string | null = afterId
    for (const row of page) {
      if (!row.id || seen.has(row.id) || (previous !== null && row.id <= previous)) throw new Error('FINANCE_READ_CURSOR_INVALID')
      seen.add(row.id)
      previous = row.id
      result.push(row)
      if (result.length > maxRows) throw new FinanceReadLimitError()
    }
    afterId = previous
  }
}
