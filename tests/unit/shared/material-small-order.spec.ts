import { describe, expect, it } from 'vitest'
import { MATERIAL_SMALL_ORDER_CURRENCY, MATERIAL_SMALL_ORDER_THRESHOLD } from '../../../shared/constants/material-finance'
import { isMaterialSmallAmount } from '../../../shared/utils/material-small-order'
import { materialContractLabel } from '../../../app/utils/materials/contract-label'

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
