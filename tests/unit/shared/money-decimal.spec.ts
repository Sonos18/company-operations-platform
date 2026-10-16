import { describe, expect, it } from 'vitest'
import { MoneyDecimal } from '../../../shared/utils/money-decimal'
import { computeOrderSubtotal } from '../../../app/utils/materials/order-subtotal'
import { formatVnNumber, parseVnMoney } from '../../../app/utils/materials/vn-number'
import { moneyEquals, moneySum } from '../../../app/utils/materials/finance-ui'
import { splitInstallments } from '../../../app/utils/materials/installment-split'

// numeric(20,4) holds 16 integer and 4 decimal digits; decimal.js keeps only 20 significant digits by default.
describe('money decimal precision', () => {
  it('keeps every digit of the largest money values', () => {
    expect(new MoneyDecimal('9999999999999999.9999').plus('0.0001').toFixed()).toBe('10000000000000000')
  })

  it('computes an order subtotal of large quantity x price without rounding', () => {
    expect(computeOrderSubtotal([{ quantity: '123456789.1234', unitPrice: '98765432.4329' }]).toFixed(4))
      .toBe('12193263164549946.3203')
  })

  it('parses, adds, compares and formats 20-digit amounts exactly', () => {
    expect(parseVnMoney('9.999.999.999.999.999,9999')).toEqual({ ok: true, value: '9999999999999999.9999' })
    expect(moneySum('9999999999999999.9999', '0.0001')).toBe('10000000000000000')
    expect(moneyEquals('1234567890123456.7891', '1234567890123456.7892')).toBe(false)
    expect(formatVnNumber('1234567890123456.7891')).toBe('1.234.567.890.123.456,7891')
  })

  it('splits a 20-digit total exactly', () => {
    expect(splitInstallments('9999999999999999.9999', [{ percent: '30' }, { percent: '70' }]))
      .toEqual(['3000000000000000.0000', '6999999999999999.9999'])
  })
})
