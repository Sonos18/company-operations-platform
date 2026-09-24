/**
 * Returns a date string formatted as YYYY-MM-DD in the local calendar timezone.
 *
 * Avoids toISOString().substring(0, 10) which converts to UTC and can produce
 * the incorrect date near midnight in non-UTC timezones (e.g. UTC+7 Vietnam).
 */
export function localDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
