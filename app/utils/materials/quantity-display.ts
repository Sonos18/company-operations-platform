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
