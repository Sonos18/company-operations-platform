import { describe, expect, it } from 'vitest'
import {
  formatGroupedDecimal,
  formatMaterialQuantity,
  stripGroupSeparators,
} from '../../../app/utils/materials/quantity-display'

describe('formatMaterialQuantity', () => {
  it('strips trailing fractional zeros and dot from canonical decimal values', () => {
    expect(formatMaterialQuantity('20.0000')).toBe('20')
    expect(formatMaterialQuantity('25.5000')).toBe('25.5')
    expect(formatMaterialQuantity('0.0000')).toBe('0')
    expect(formatMaterialQuantity('1000')).toBe('1000')
    expect(formatMaterialQuantity('0.1250')).toBe('0.125')
  })

  it('preserves other decimal precision without trailing zeros', () => {
    expect(formatMaterialQuantity('10.0500')).toBe('10.05')
    expect(formatMaterialQuantity('0.0001')).toBe('0.0001')
    expect(formatMaterialQuantity('123.4560')).toBe('123.456')
    expect(formatMaterialQuantity('0')).toBe('0')
  })

  it('handles empty or whitespace values gracefully', () => {
    expect(formatMaterialQuantity('')).toBe('')
    expect(formatMaterialQuantity('   ')).toBe('')
  })
})

describe('formatGroupedDecimal', () => {
  it('groups integer digits with commas and trims trailing fractional zeros', () => {
    expect(formatGroupedDecimal('1000')).toBe('1,000')
    expect(formatGroupedDecimal('1000000')).toBe('1,000,000')
    expect(formatGroupedDecimal('430000.0000')).toBe('430,000')
    expect(formatGroupedDecimal('1234567.5000')).toBe('1,234,567.5')
    expect(formatGroupedDecimal('430')).toBe('430')
    expect(formatGroupedDecimal('0.0000')).toBe('0')
  })

  it('keeps 16-digit integers exact and preserves the sign', () => {
    expect(formatGroupedDecimal('9999999999999999.0001')).toBe('9,999,999,999,999,999.0001')
    expect(formatGroupedDecimal('-1500.2500')).toBe('-1,500.25')
  })

  it('returns non-decimal input trimmed and unchanged', () => {
    expect(formatGroupedDecimal('')).toBe('')
    expect(formatGroupedDecimal('  ')).toBe('')
    expect(formatGroupedDecimal('1,000')).toBe('1,000')
    expect(formatGroupedDecimal(' abc ')).toBe('abc')
  })
})

describe('stripGroupSeparators', () => {
  it('removes every comma so validation and API payloads never see one', () => {
    expect(stripGroupSeparators('1,000')).toBe('1000')
    expect(stripGroupSeparators('1,234,567.5')).toBe('1234567.5')
    expect(stripGroupSeparators('430')).toBe('430')
  })
})
