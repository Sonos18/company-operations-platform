import { describe, expect, it } from 'vitest'
import {
  formatVnNumber,
  parseVnMoney,
  parseVnMoneyDecimal,
  parseVnNumber,
  vnPercentOptions,
} from '../../../app/utils/materials/vn-number'

function value(raw: string) {
  const result = parseVnMoney(raw)
  if (!result.ok) throw new Error(result.message)
  return result.value
}

describe('parseVnMoney', () => {
  it('reads "." as thousands separator and "," as decimal mark', () => {
    expect(value('1.000.000')).toBe('1000000')
    expect(value('12.500,5')).toBe('12500.5')
    expect(value('999')).toBe('999')
    expect(value('0,25')).toBe('0.25')
    expect(value('1.234,5678')).toBe('1234.5678')
  })

  it('accepts plain digits and trims spaces', () => {
    expect(value('1000000')).toBe('1000000')
    expect(value('  110  ')).toBe('110')
    expect(value('007')).toBe('7')
  })

  it('normalizes trailing fraction zeros', () => {
    expect(value('12,50')).toBe('12.5')
    expect(value('100,0000')).toBe('100')
  })

  it.each(['1,000.50', '1.00', '1.5', '1.0000', '12.50', '1.000,5.0', '1,2,3', '12,', ',5', '1.000.00', '-5', '1 000', '12abc', ''])(
    'rejects %j with a Vietnamese message',
    (raw) => {
      const result = parseVnMoney(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toMatch(/Chưa nhập|Chỉ nhập|Số /)
    },
  )

  it.each(['0.500', '0.001', '01.000', '000.000', '00.100', '0.000.000'])(
    'rejects %j: a leading zero group must never read as a 1000x smaller or larger amount',
    (raw) => {
      const result = parseVnMoney(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toContain('Dấu "." chỉ ngăn cách hàng nghìn')
    },
  )

  it('still reads valid thousands groups and a zero before the decimal comma', () => {
    expect(value('1.000')).toBe('1000')
    expect(value('999.999')).toBe('999999')
    expect(value('10.000.000')).toBe('10000000')
    expect(value('0,5')).toBe('0.5')
    expect(value('0')).toBe('0')
  })

  it('allows at most 4 decimals and 16 integer digits', () => {
    expect(parseVnMoney('1,23456').ok).toBe(false)
    expect(parseVnMoney('1234567890123456').ok).toBe(true)
    expect(parseVnMoney('12345678901234567').ok).toBe(false)
  })

  it('returns a Decimal or null', () => {
    expect(parseVnMoneyDecimal('1.000,5')?.toFixed()).toBe('1000.5')
    expect(parseVnMoneyDecimal('abc')).toBeNull()
    expect(parseVnMoneyDecimal('')).toBeNull()
  })
})

describe('parseVnNumber with percent options', () => {
  it('reads decimal commas and caps integer digits at 3', () => {
    expect(parseVnNumber('33,5', vnPercentOptions)).toEqual({ ok: true, value: '33.5' })
    expect(parseVnNumber('100', vnPercentOptions)).toEqual({ ok: true, value: '100' })
    expect(parseVnNumber('1000', vnPercentOptions).ok).toBe(false)
    expect(parseVnNumber('33,1234567', vnPercentOptions).ok).toBe(false)
  })

  it.each(['0.025', '0.100', '33.5', '1.000', '33.'])('rejects any "." in %j with a Vietnamese message', (raw) => {
    const result = parseVnNumber(raw, vnPercentOptions)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('Không dùng dấu "."')
  })
})

describe('formatVnNumber', () => {
  it('groups thousands with "." and uses "," for decimals', () => {
    expect(formatVnNumber('1000000')).toBe('1.000.000')
    expect(formatVnNumber('12500.5')).toBe('12.500,5')
    expect(formatVnNumber('110.0000')).toBe('110')
    expect(formatVnNumber('0.25')).toBe('0,25')
    expect(formatVnNumber('1234567.8900')).toBe('1.234.567,89')
    expect(formatVnNumber('-1500')).toBe('-1.500')
  })

  it('round-trips with the parser', () => {
    for (const canonical of ['0', '7', '1000', '1234567.5', '9999999999999999.9999']) {
      expect(value(formatVnNumber(canonical))).toBe(canonical)
    }
  })
})
