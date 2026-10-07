import { describe, expect, it } from 'vitest'
import { sumMaterialReviewLines } from '../../../app/utils/costs/cost-extraction-review'

describe('material extraction review sums', () => {
  it('rounds each VND line half-up to the same integer amount as the reviewed source contract', () => {
    expect(sumMaterialReviewLines([{ quantity: '1.125', unitPrice: '300' }], 'VND')).toBe('338')
    expect(sumMaterialReviewLines([
      { quantity: '0.12', unitPrice: '10' },
      { quantity: '0.21', unitPrice: '10' },
    ], 'VND')).toBe('3')
  })

  it('keeps exact fractional line sums instead of binary rounding', () => {
    expect(sumMaterialReviewLines([
      { quantity: '0.1', unitPrice: '0.2' },
      { quantity: '3', unitPrice: '0.1' },
    ], 'USD')).toBe('0.32')
  })

  it('retains valid money precision when products exceed the default Decimal precision', () => {
    expect(sumMaterialReviewLines([
      { quantity: '9999999999999999', unitPrice: '9999999999999999' },
      { quantity: '0.0001', unitPrice: '0.0001' },
    ], 'USD')).toBe('99999999999999980000000000000001.00000001')
  })

  it.each(['', 'not-a-number', '-1', '1e2', '1,000', '01'])('does not present a guessed sum for an invalid current form quantity %j', quantity => {
    expect(sumMaterialReviewLines([{ quantity, unitPrice: '2' }], 'VND')).toBeNull()
  })

  it('does not present a guessed sum for an incomplete unit price', () => {
    expect(sumMaterialReviewLines([{ quantity: '1', unitPrice: '' }], 'VND')).toBeNull()
  })
})
