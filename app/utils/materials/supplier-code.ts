/**
 * Pure deterministic supplier code derivation helper.
 *
 * The backend uses `code` as the supplier identity key (same code => reuses existing supplier),
 * so the generated code must be deterministic for the same supplier.
 */
export function deriveSupplierCode(taxIdentifier: string, displayName: string): string {
  const cleanTax = (taxIdentifier ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (cleanTax.length > 0) {
    return `NCC-${cleanTax}`
  }

  const trimmedName = (displayName ?? '').trim()
  if (!trimmedName) {
    return ''
  }

  const normalized = trimmedName
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  const slug = normalized.replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug) {
    return ''
  }

  let code = `NCC-${slug}`
  if (code.length > 60) {
    code = code.slice(0, 60).replace(/-+$/, '')
  }

  return code
}
