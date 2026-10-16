import { describe, expect, it } from 'vitest'
import { MATERIAL_SMALL_ORDER_CURRENCY, MATERIAL_SMALL_ORDER_THRESHOLD } from '../../../shared/constants/material-finance'
import { isMaterialSmallAmount } from '../../../shared/utils/material-small-order'
import { materialContractLabel, materialContractNumberText, materialRecordedOrdersText } from '../../../app/utils/materials/contract-label'

describe('isMaterialSmallAmount', () => {
  it('exposes the agreed threshold and currency', () => {
    expect(MATERIAL_SMALL_ORDER_THRESHOLD).toBe('5000000')
    expect(MATERIAL_SMALL_ORDER_CURRENCY).toBe('VND')
  })

  it('is true strictly below the threshold, down to the last representable amount', () => {
    expect(isMaterialSmallAmount('4999999.9999', 'VND')).toBe(true)
    expect(isMaterialSmallAmount('0.0001', 'VND')).toBe(true)
  })

  it('is false at exactly the threshold, with or without decimals', () => {
    expect(isMaterialSmallAmount('5000000', 'VND')).toBe(false)
    expect(isMaterialSmallAmount('5000000.0000', 'VND')).toBe(false)
    expect(isMaterialSmallAmount('5000000.0001', 'VND')).toBe(false)
  })

  it('is false for any currency other than VND', () => {
    expect(isMaterialSmallAmount('1000', 'USD')).toBe(false)
    expect(isMaterialSmallAmount('1000', 'vnd')).toBe(false)
  })
})

describe('materialContractLabel', () => {
  it('names a contract by its number and a quotation-only order as having no contract', () => {
    expect(materialContractLabel({ documentation: 'contract', contractNo: 'HD-01' })).toBe('Hợp đồng HD-01')
    expect(materialContractLabel({ documentation: 'quotation_only', contractNo: null })).toBe('Không hợp đồng')
  })
})

describe('materialContractNumberText', () => {
  it('shows the contract number, or "Không hợp đồng" when there is none', () => {
    expect(materialContractNumberText({ contractNo: 'HD-01' })).toBe('HD-01')
    expect(materialContractNumberText({ contractNo: null })).toBe('Không hợp đồng')
  })
})

describe('materialRecordedOrdersText', () => {
  it('counts signed contracts and quotation-only records separately', () => {
    const status = [{ documentation: 'contract' as const }, { documentation: 'quotation_only' as const }, { documentation: 'quotation_only' as const }]
    expect(materialRecordedOrdersText(3, status)).toBe('1 hợp đồng đã ký kết, 2 đơn không hợp đồng đã ghi nhận')
  })

  it('never calls a quotation-only record a signed contract', () => {
    expect(materialRecordedOrdersText(1, [{ documentation: 'quotation_only' }])).toBe('1 đơn không hợp đồng đã ghi nhận')
  })

  it('keeps the contract wording when every order has a contract or none is recorded', () => {
    expect(materialRecordedOrdersText(2, [{ documentation: 'contract' }, { documentation: 'contract' }])).toBe('2 hợp đồng đã ký kết')
    expect(materialRecordedOrdersText(0, undefined)).toBe('0 hợp đồng đã ký kết')
  })
})
