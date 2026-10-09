import { describe, expect, it } from 'vitest'
import { formatMaterialQuantity } from '../../../app/utils/materials/quantity-display'

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
