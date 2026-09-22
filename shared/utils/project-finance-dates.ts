import { z } from 'zod'

export type FinanceDateRow = { effectiveDate: string, createdAt: string, lineNo?: number, id: string }

export function deriveFinanceDate(businessDate: string | null, createdAt: string, timeZone: string): { effectiveDate: string, usedFallback: boolean } {
  if (businessDate !== null) return { effectiveDate: z.string().date().parse(businessDate), usedFallback: false }
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    throw new Error('INVALID_FINANCE_TIME_ZONE')
  }
  const instant = new Date(createdAt)
  if (Number.isNaN(instant.getTime())) throw new Error('INVALID_FINANCE_TIMESTAMP')
  const parts = formatter.formatToParts(instant)
  const value = (type: string) => parts.find(part => part.type === type)?.value
  const year = value('year'), month = value('month'), day = value('day')
  if (!year || !month || !day) throw new Error('Unable to derive finance date')
  return { effectiveDate: `${year}-${month}-${day}`, usedFallback: true }
}

export function compareFinanceRows(left: FinanceDateRow, right: FinanceDateRow, sort: 'newest' | 'oldest'): number {
  const direction = sort === 'newest' ? -1 : 1
  const date = left.effectiveDate.localeCompare(right.effectiveDate) * direction
  if (date !== 0) return date
  const instant = (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * direction
  if (instant !== 0) return instant
  const line = (left.lineNo ?? Number.MAX_SAFE_INTEGER) - (right.lineNo ?? Number.MAX_SAFE_INTEGER)
  if (line !== 0) return line
  return left.id.localeCompare(right.id)
}
