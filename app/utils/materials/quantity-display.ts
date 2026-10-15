/**
 * Exact decimal-string display helper for material proposal quantities.
 *
 * Strips only trailing fractional zeros and any resulting trailing decimal point
 * from a validated decimal string (e.g., '20.0000' -> '20', '25.5000' -> '25.5', '0.0000' -> '0').
 * Preserves integer digits without using JavaScript Number arithmetic or modifying precision semantics.
 */
export function formatMaterialQuantity(value: string): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed || !trimmed.includes('.')) {
    return trimmed
  }

  return trimmed.replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * Formats a decimal string by stripping trailing fractional zeros and
 * inserting ',' thousands separators into the integer part only.
 * Operates purely on strings to preserve up to 16 integer digits without JS Number precision loss.
 */
export function formatGroupedDecimal(value: string): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) {
    return ''
  }

  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed
  }

  const trimmedDecimal = formatMaterialQuantity(trimmed)
  const isNegative = trimmedDecimal.startsWith('-')
  const unsigned = isNegative ? trimmedDecimal.slice(1) : trimmedDecimal
  const [intPart = '', fracPart] = unsigned.split('.')
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const formatted = fracPart !== undefined ? `${groupedInt}.${fracPart}` : groupedInt
  return isNegative ? `-${formatted}` : formatted
}

/**
 * Strips thousands separators (',') from a formatted number string for raw input parsing.
 */
export function stripGroupSeparators(value: string): string {
  return (value ?? '').replace(/,/g, '')
}
