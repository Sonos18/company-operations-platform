import { describe, expect, it } from 'vitest'
import type { MaterialContractView } from '../../../shared/schemas/costs/material-finance'
import { canPayInCash, currentContractTotal, requestRequiresInvoice } from '../../../app/utils/materials/payment-method'

describe('payment-method utils', () => {
  describe('canPayInCash', () => {
    it('allows cash payment for VND amount strictly below 5,000,000', () => {
      expect(canPayInCash('4999999', 'VND')).toBe(true)
    })

    it('allows cash payment for boundary decimal 4999999.9999 VND', () => {
      expect(canPayInCash('4999999.9999', 'VND')).toBe(true)
    })

    it('disallows cash payment for VND amount strictly above 5,000,000', () => {
      expect(canPayInCash('6000000', 'VND')).toBe(false)
    })

    it('disallows cash payment for exactly 5,000,000 VND (strict less than)', () => {
      expect(canPayInCash('5000000', 'VND')).toBe(false)
    })

    it('disallows cash payment for non-VND currencies', () => {
      expect(canPayInCash('4999999', 'USD')).toBe(false)
    })
  })

  describe('requestRequiresInvoice', () => {
    it('does not require invoice for quotation_only orders even if not advance', () => {
      expect(requestRequiresInvoice('quotation_only', false)).toBe(false)
    })

    it('requires invoice for contract orders when not advance', () => {
      expect(requestRequiresInvoice('contract', false)).toBe(true)
    })

    it('does not require invoice for contract advance installments', () => {
      expect(requestRequiresInvoice('contract', true)).toBe(false)
    })

    it('does not require invoice for quotation_only advance installments', () => {
      expect(requestRequiresInvoice('quotation_only', true)).toBe(false)
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
})
