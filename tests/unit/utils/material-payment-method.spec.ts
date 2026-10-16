import { describe, expect, it } from 'vitest'
import type { MaterialContractView } from '../../../shared/schemas/costs/material-finance'
import { canPayInCash, currentContractTotal, currentOrderSubtotalSnapshot, requestRequiresInvoice } from '../../../app/utils/materials/payment-method'

describe('payment-method utils', () => {
  describe('canPayInCash', () => {
    it('allows cash payment for VND amount strictly below 5,000,000', () => {
      expect(canPayInCash('4999999', 'VND', '4999999')).toBe(true)
    })

    it('allows cash payment for boundary decimal 4999999.9999 VND', () => {
      expect(canPayInCash('4999999.9999', 'VND', '4999999.9999')).toBe(true)
    })

    it('disallows cash payment for VND amount strictly above 5,000,000', () => {
      expect(canPayInCash('6000000', 'VND', '4000000')).toBe(false)
    })

    it('disallows cash payment for exactly 5,000,000 VND (strict less than)', () => {
      expect(canPayInCash('5000000', 'VND', '4000000')).toBe(false)
    })

    it('disallows cash payment for non-VND currencies', () => {
      expect(canPayInCash('4999999', 'USD', '4999999')).toBe(false)
    })

    it('disallows cash payment when the order subtotal snapshot is not small, even if the contract total is', () => {
      expect(canPayInCash('4900000', 'VND', '48000000')).toBe(false)
    })

    it('disallows cash payment when the order subtotal snapshot is exactly 5,000,000 VND', () => {
      expect(canPayInCash('4900000', 'VND', '5000000')).toBe(false)
    })

    it('allows cash payment when the contract total is above its order subtotal but both are small', () => {
      expect(canPayInCash('4500000', 'VND', '4000000')).toBe(true)
    })
  })

  describe('requestRequiresInvoice', () => {
    it('requires an invoice for every installment that is not an advance payment', () => {
      expect(requestRequiresInvoice(false)).toBe(true)
    })

    it('does not require an invoice for an advance installment', () => {
      expect(requestRequiresInvoice(true)).toBe(false)
    })
  })

  describe('currentContractTotal', () => {
    it('returns the current version total matching currentVersionNo', () => {
      const contract = {
        currentVersionNo: 2,
        versions: [
          { versionNo: 1, total: '3000000.0000' },
          { versionNo: 2, total: '4500000.0000' },
        ],
      } as unknown as MaterialContractView

      expect(currentContractTotal(contract)).toBe('4500000.0000')
    })

    it('returns null when current version is missing in versions array', () => {
      const contract = {
        currentVersionNo: 3,
        versions: [
          { versionNo: 1, total: '3000000.0000' },
          { versionNo: 2, total: '4500000.0000' },
        ],
      } as unknown as MaterialContractView

      expect(currentContractTotal(contract)).toBeNull()
    })

    it('returns null when versions is undefined or empty', () => {
      const contract = {
        currentVersionNo: 1,
        versions: [],
      } as unknown as MaterialContractView

      expect(currentContractTotal(contract)).toBeNull()
    })
  })

  describe('currentOrderSubtotalSnapshot', () => {
    it('returns the order subtotal snapshot of the current version', () => {
      const contract = {
        currentVersionNo: 2,
        versions: [
          { versionNo: 1, total: '3000000.0000', orderSubtotalSnapshot: '3000000.0000' },
          { versionNo: 2, total: '4900000.0000', orderSubtotalSnapshot: '48000000.0000' },
        ],
      } as unknown as MaterialContractView

      expect(currentOrderSubtotalSnapshot(contract)).toBe('48000000.0000')
    })

    it('returns null when the current version is missing', () => {
      const contract = {
        currentVersionNo: 3,
        versions: [{ versionNo: 1, total: '3000000.0000', orderSubtotalSnapshot: '3000000.0000' }],
      } as unknown as MaterialContractView

      expect(currentOrderSubtotalSnapshot(contract)).toBeNull()
    })
  })
})
