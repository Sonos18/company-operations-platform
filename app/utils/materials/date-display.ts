/** dd/MM/yyyy from a YYYY-MM-DD date string, by string split (no Date, so no timezone shift). */
export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${match[3]}/${match[2]}/${match[1]}`
}
