import { describe, expect, it } from 'vitest'
import { canPayInCash, requestRequiresInvoice } from '../../../app/utils/materials/payment-method'

describe('payment-method utils', () => {
  describe('canPayInCash', () => {
    it('allows cash payment for VND amount strictly below 5,000,000', () => {
      expect(canPayInCash('4999999', 'VND')).toBe(true)
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
})
