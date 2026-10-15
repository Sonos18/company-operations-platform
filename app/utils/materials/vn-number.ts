import Decimal from 'decimal.js'

/**
 * Vietnamese number input: "." separates thousands and "," is the decimal mark
 * ("1.000.000" = 1000000, "12.500,5" = 12500.5). Plain digits are accepted too.
 * The parser returns the canonical decimal string the API expects ("12500.5").
 */
export interface VnNumberOptions {
  maxDecimals: number
  maxIntegerDigits: number
}

export type VnNumberParseResult =
  | { ok: true, value: string }
  | { ok: false, message: string }

const thousandsPattern = /^\d{1,3}(\.\d{3})+$/
const formatHint = 'Dấu "." chỉ ngăn cách hàng nghìn (ví dụ 1.000.000) và dấu "," là dấu thập phân (ví dụ 12.500,5).'

function fail(message: string): VnNumberParseResult {
  return { ok: false, message }
}

export function parseVnNumber(raw: string, options: VnNumberOptions): VnNumberParseResult {
  const text = raw.trim()
  if (!text) return fail('Chưa nhập số.')
  if (/[^\d.,]/.test(text)) return fail(`Chỉ nhập chữ số. ${formatHint}`)

  const parts = text.split(',')
  if (parts.length > 2) return fail(`Số có quá nhiều dấu ",". ${formatHint}`)
  const integerPart = parts[0] ?? ''
  const fractionPart = parts[1]

  let integerDigits: string
  if (/^\d+$/.test(integerPart)) integerDigits = integerPart
  else if (thousandsPattern.test(integerPart)) integerDigits = integerPart.replaceAll('.', '')
  else return fail(`Số không đúng định dạng. ${formatHint}`)

  if (fractionPart !== undefined) {
    if (!/^\d+$/.test(fractionPart)) return fail(`Số không đúng định dạng. ${formatHint}`)
    if (fractionPart.length > options.maxDecimals) {
      return fail(`Chỉ được nhập tối đa ${options.maxDecimals} chữ số thập phân.`)
    }
  }

  if (integerDigits.replace(/^0+(?=\d)/, '').length > options.maxIntegerDigits) {
    return fail(`Số quá lớn (tối đa ${options.maxIntegerDigits} chữ số phần nguyên).`)
  }

  const canonical = new Decimal(fractionPart === undefined ? integerDigits : `${integerDigits}.${fractionPart}`).toFixed()
  return { ok: true, value: canonical }
}

export const vnMoneyOptions: VnNumberOptions = { maxDecimals: 4, maxIntegerDigits: 16 }
export const vnPercentOptions: VnNumberOptions = { maxDecimals: 6, maxIntegerDigits: 3 }

export function parseVnMoney(raw: string): VnNumberParseResult {
  return parseVnNumber(raw, vnMoneyOptions)
}

/** The money value as a Decimal, or null when the text is empty or invalid. */
export function parseVnMoneyDecimal(raw: string): Decimal | null {
  const result = parseVnMoney(raw)
  return result.ok ? new Decimal(result.value) : null
}

/** Formats a canonical decimal for display: 12500.5 -> "12.500,5"; "110.0000" -> "110". */
export function formatVnNumber(value: string | Decimal): string {
  const text = new Decimal(value).toFixed()
  const negative = text.startsWith('-')
  const [integerPart = '0', fractionPart] = (negative ? text.slice(1) : text).split('.')
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${grouped}${fractionPart ? `,${fractionPart}` : ''}`
}
