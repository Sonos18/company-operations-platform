import { describe, expect, it } from 'vitest'
import { computeOrderSubtotal } from '../../../app/utils/materials/order-subtotal'

describe('computeOrderSubtotal', () => {
  it('sums quantity x unit price', () => {
    expect(computeOrderSubtotal([
      { quantity: '10.0000', unitPrice: '10.0000' },
      { quantity: '2.5000', unitPrice: '4.0000' },
    ]).toFixed(4)).toBe('110.0000')
  })

  it('rounds the sum once, not each line', () => {
    // Each line is 0.00004 (0.0001 x 0.4): rounding per line would give 0.0000 + 0.0000, the sum rounds to 0.0001.
    const lines = [
      { quantity: '0.0001', unitPrice: '0.4000' },
      { quantity: '0.0001', unitPrice: '0.4000' },
      { quantity: '0.0001', unitPrice: '0.4000' },
    ]
    expect(computeOrderSubtotal(lines).toFixed(4)).toBe('0.0001')
  })

  it('rounds half up and is zero for no lines', () => {
    expect(computeOrderSubtotal([{ quantity: '0.0001', unitPrice: '0.5000' }]).toFixed(4)).toBe('0.0001')
    expect(computeOrderSubtotal([]).toFixed(4)).toBe('0.0000')
  })
})
