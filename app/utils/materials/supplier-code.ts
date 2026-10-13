/**
 * Pure deterministic supplier code derivation helper.
 *
 * The backend uses `code` as the supplier identity key (same code => reuses existing supplier),
 * so the generated code must be deterministic for the same supplier.
 */

const MAX_SUPPLIER_CODE_LENGTH = 30

// Legal-form and business-type words that most Vietnamese supplier names share.
// Multi-word phrases are removed before single tokens; matching is on whole tokens only.
const COMMON_NAME_PHRASES: readonly (readonly string[])[] = [
  ['CONG', 'TY'],
  ['CO', 'PHAN'],
  ['TRACH', 'NHIEM', 'HUU', 'HAN'],
  ['MOT', 'THANH', 'VIEN'],
  ['HAI', 'THANH', 'VIEN', 'TRO', 'LEN'],
  ['DOANH', 'NGHIEP', 'TU', 'NHAN'],
  ['HOP', 'TAC', 'XA'],
  ['SAN', 'XUAT'],
  ['THUONG', 'MAI'],
  ['DICH', 'VU'],
  ['XUAT', 'NHAP', 'KHAU'],
]

const COMMON_NAME_TOKENS = new Set([
  'CTY', 'TNHH', 'CP', 'CTCP', 'MTV', 'DNTN', 'HTX', 'SX', 'TM', 'DV', 'XNK', 'SXTM', 'TMDV',
])

function toAsciiTokens(value: string): string[] {
  return value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(token => token.length > 0)
}

function removeCommonNameWords(tokens: string[]): string[] {
  const kept: string[] = []
  let index = 0
  while (index < tokens.length) {
    const phrase = COMMON_NAME_PHRASES.find(words =>
      words.every((word, offset) => tokens[index + offset] === word),
    )
    if (phrase) {
      index += phrase.length
      continue
    }
    const token = tokens[index]
    if (token !== undefined && !COMMON_NAME_TOKENS.has(token)) {
      kept.push(token)
    }
    index += 1
  }
  return kept
}

function joinWithinLimit(tokens: string[]): string {
  let code = 'NCC'
  for (const token of tokens) {
    const next = `${code}-${token}`
    if (next.length > MAX_SUPPLIER_CODE_LENGTH) {
      // Always keep at least one name token, truncated if a single token is very long.
      return code === 'NCC' ? next.slice(0, MAX_SUPPLIER_CODE_LENGTH) : code
    }
    code = next
  }
  return code
}

export function deriveSupplierCode(taxIdentifier: string, displayName: string): string {
  const cleanTax = taxIdentifier.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (cleanTax.length > 0) {
    return `NCC-${cleanTax}`
  }

  const tokens = toAsciiTokens(displayName)
  if (tokens.length === 0) {
    return ''
  }

  const distinctive = removeCommonNameWords(tokens)
  // A name made only of common words keeps its full tokens rather than collapsing to "NCC".
  return joinWithinLimit(distinctive.length > 0 ? distinctive : tokens)
}
