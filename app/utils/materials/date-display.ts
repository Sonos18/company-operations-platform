/** dd/MM/yyyy from a YYYY-MM-DD date string, by string split (no Date, so no timezone shift). */
export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${match[3]}/${match[2]}/${match[1]}`
}

/** Short date and time in Vietnam time (Asia/Ho_Chi_Minh), independent of the browser timezone. */
export function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })
}
