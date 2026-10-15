import { describe, expect, it } from 'vitest'
import { createInstallmentRow, MAX_INSTALLMENT_ROWS } from '../../../app/utils/materials/installment-rows'

describe('createInstallmentRow', () => {
  it('creates an empty percent row with its own installment key', () => {
    const a = createInstallmentRow()
    const b = createInstallmentRow()
    expect(a).toMatchObject({ name: '', mode: 'percent', percent: '', amount: '', dueOn: '', isAdvance: false })
    expect(a.installmentKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(a.installmentKey).not.toBe(b.installmentKey)
  })

  it('applies overrides, including an explicit key', () => {
    const row = createInstallmentRow({ installmentKey: 'fixed-key', name: 'Tạm ứng', mode: 'amount', amount: '33', isAdvance: true })
    expect(row).toMatchObject({ installmentKey: 'fixed-key', name: 'Tạm ứng', mode: 'amount', amount: '33', isAdvance: true })
  })

  it('caps rows at the schema maximum', () => {
    expect(MAX_INSTALLMENT_ROWS).toBe(50)
  })
})
