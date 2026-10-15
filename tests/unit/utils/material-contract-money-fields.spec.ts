import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { useContractMoneyFields } from '../../../app/utils/materials/contract-money-fields'

const orderSubtotal = new Decimal('1000000')

function fields() {
  return useContractMoneyFields(() => orderSubtotal)
}

describe('useContractMoneyFields', () => {
  it('computes the total from subtotal and VAT until the user edits it', () => {
    const form = fields()
    form.setSubtotal('1.000.000')
    form.setVatAmount('100.000')
    expect(form.total.value).toBe('1.100.000')
    expect(form.totalCanonical.value).toBe('1100000')

    form.setTotal('1.200.000')
    form.setVatAmount('90.000')
    expect(form.total.value).toBe('1.200.000')
    expect(form.totalMismatch.value).toBe(true)
    expect(form.issues.value).toContain('Tổng giá trị phải bằng giá trị trước VAT cộng VAT.')

    form.resetTotal()
    expect(form.total.value).toBe('1.090.000')
    expect(form.totalMismatch.value).toBe(false)
  })

  it('requires a variance reason only when the subtotal differs from the order subtotal', () => {
    const form = fields()
    form.setSubtotal('1.000.000')
    form.setVatAmount('0')
    expect(form.varianceNeeded.value).toBe(false)
    expect(form.toPayload()?.varianceReason).toBeNull()

    form.setSubtotal('900.000')
    expect(form.varianceNeeded.value).toBe(true)
    expect(form.issues.value).toContain('Cần nhập lý do chênh lệch so với tổng đơn.')

    form.varianceReason.value = '  NCC giảm giá  '
    expect(form.issues.value).toEqual([])
    expect(form.toPayload()).toEqual({
      subtotal: '900000.0000',
      vatAmount: '0.0000',
      total: '900000.0000',
      varianceReason: 'NCC giảm giá',
    })
  })

  it('reports Vietnamese format errors and refuses to build a payload', () => {
    const form = fields()
    form.setSubtotal('1,000.50')
    form.setVatAmount('')
    expect(form.issues.value.some(issue => issue.startsWith('Trước VAT: '))).toBe(true)
    expect(form.issues.value).toContain('Chưa nhập VAT (nhập 0 nếu không có).')
    expect(form.toPayload()).toBeNull()
  })

  it('reset clears every field so no stale value survives', () => {
    const form = fields()
    form.load({ subtotal: '900000', vatAmount: '90000', total: '990000' }, 'Lý do cũ')
    form.setTotal('5')
    form.reset()
    expect([form.subtotal.value, form.vatAmount.value, form.total.value, form.varianceReason.value]).toEqual(['', '', '', ''])
    expect(form.totalTouched.value).toBe(false)
    expect(form.toPayload()).toBeNull()
  })

  it('loads canonical server values in Vietnamese format', () => {
    const form = fields()
    form.load({ subtotal: '1000000.0000', vatAmount: '100000.0000', total: '1100000.0000' }, 'Lý do cũ')
    expect(form.subtotal.value).toBe('1.000.000')
    expect(form.vatAmount.value).toBe('100.000')
    expect(form.total.value).toBe('1.100.000')
    expect(form.varianceReason.value).toBe('Lý do cũ')
    expect(form.totalTouched.value).toBe(false)
  })
})
