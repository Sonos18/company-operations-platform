import { describe, expect, it } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import {
  contractEvidenceScope,
  createCommandKeyTracker,
  financeErrorMessage,
  formatDate,
  formatMoney,
  isDefinitiveRejection,
  moneyEquals,
  moneySum,
  parseMoneyInput,
  uploadErrorMessage,
} from '../../../app/utils/materials/finance-ui'

function clientError(code: ClientError['code'], retryable: boolean, kind: ClientError['kind'] = 'api') {
  return new ClientError({ kind, code, message: 'server text', retryable })
}

describe('parseMoneyInput', () => {
  it('returns a canonical decimal string without trailing zeros', () => {
    expect(parseMoneyInput('33')).toBe('33')
    expect(parseMoneyInput(' 1500000.5000 ')).toBe('1500000.5')
    expect(parseMoneyInput('0.1')).toBe('0.1')
    expect(parseMoneyInput('007')).toBe('7')
    expect(parseMoneyInput('0')).toBe('0')
  })

  it('rejects anything that is not a plain decimal with at most four places', () => {
    for (const raw of ['', 'abc', '-1', '1e3', '1,000', '1.23456', '1.', '.5', '12345678901234567']) {
      expect(parseMoneyInput(raw)).toBeNull()
    }
  })
})

describe('money arithmetic', () => {
  it('does not accumulate floating point error', () => {
    expect(moneySum('0.1', '0.2')).toBe('0.3')
    expect(moneyEquals(moneySum('10000000', '800000.1'), '10800000.1')).toBe(true)
    expect(moneyEquals('0.3', moneySum('0.1', '0.2'))).toBe(true)
  })
})

describe('display formatting', () => {
  it('groups thousands and trims zeros', () => {
    expect(formatMoney('1500000.5000')).toBe('1,500,000.5')
    expect(formatMoney('0.0000')).toBe('0')
    expect(formatMoney(null)).toBe('0')
  })

  it('formats date-only values without a timezone shift', () => {
    expect(formatDate('2026-10-15')).toBe('15/10/2026')
  })
})

describe('financeErrorMessage', () => {
  it.each([
    'INSTALLMENT_CAPACITY_EXCEEDED',
    'INVOICE_REQUIRED',
    'SELF_DECISION_FORBIDDEN',
    'PROOF_ALREADY_USED',
    'INVOICE_IN_USE',
    'INSTALLMENT_NOT_FOUND',
    'INVOICE_TOTAL_EXCEEDED',
    'INVOICE_DUPLICATE',
    'VERSION_CONFLICT',
  ] as const)('maps %s to a Vietnamese sentence instead of the server text', (code) => {
    const message = financeErrorMessage(clientError(code, false), 'fallback')
    expect(message).not.toBe('server text')
    expect(message).not.toBe('fallback')
    expect(message).toMatch(/[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệỉịọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳỵỷỹđ]/i)
  })

  it('falls back to the client error message, then to the fallback text', () => {
    expect(financeErrorMessage(clientError('INTERNAL_ERROR', true), 'fallback')).toBe('server text')
    expect(financeErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })
})

describe('createCommandKeyTracker', () => {
  it('reuses the key for an identical payload and changes it when the payload changes', () => {
    const tracker = createCommandKeyTracker()
    const first = tracker.keyFor({ id: 'a', reason: 'x' })
    expect(tracker.keyFor({ id: 'a', reason: 'x' })).toBe(first)
    expect(tracker.keyFor({ id: 'a', reason: 'y' })).not.toBe(first)
  })

  it('keeps the key when the outcome is unknown and drops it on a definitive rejection', () => {
    const tracker = createCommandKeyTracker()
    const key = tracker.keyFor({ id: 'a' })

    tracker.settleAfterError(clientError('NETWORK_ERROR', true, 'network'))
    expect(tracker.keyFor({ id: 'a' })).toBe(key)

    tracker.settleAfterError(clientError('MALFORMED_RESPONSE', false, 'unexpected'))
    expect(tracker.keyFor({ id: 'a' })).toBe(key)

    tracker.settleAfterError(new Error('socket closed'))
    expect(tracker.keyFor({ id: 'a' })).toBe(key)

    tracker.settleAfterError(clientError('VERSION_CONFLICT', false))
    expect(tracker.keyFor({ id: 'a' })).not.toBe(key)
  })

  it('drops the key after success', () => {
    const tracker = createCommandKeyTracker()
    const key = tracker.keyFor({ id: 'a' })
    tracker.settle()
    expect(tracker.keyFor({ id: 'a' })).not.toBe(key)
  })
})

describe('isDefinitiveRejection', () => {
  it('is true only for non-retryable, readable API refusals', () => {
    expect(isDefinitiveRejection(clientError('PROOF_ALREADY_USED', false))).toBe(true)
    expect(isDefinitiveRejection(clientError('INTERNAL_ERROR', true))).toBe(false)
    expect(isDefinitiveRejection(clientError('MALFORMED_RESPONSE', false, 'unexpected'))).toBe(false)
    expect(isDefinitiveRejection(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('uploadErrorMessage', () => {
  it('shows uploader sentences but hides schema errors and raw codes', () => {
    expect(uploadErrorMessage(new Error('Định dạng tệp không được hỗ trợ cho loại chứng từ này.'), 'fallback'))
      .toBe('Định dạng tệp không được hỗ trợ cho loại chứng từ này.')
    expect(uploadErrorMessage(new Error('EVIDENCE_SCOPE_MISMATCH'), 'fallback')).toBe('fallback')
    const zodLike = new Error('[ { "code": "invalid_value" } ]')
    zodLike.name = 'ZodError'
    expect(uploadErrorMessage(zodLike, 'fallback')).toBe('fallback')
    expect(uploadErrorMessage('boom', 'fallback')).toBe('fallback')
  })
})

describe('contractEvidenceScope', () => {
  it('targets the contract with the requested role', () => {
    expect(contractEvidenceScope('payment_proof', 'c1')).toEqual({
      evidenceRole: 'payment_proof',
      target: { kind: 'material_contract', contractId: 'c1' },
    })
  })
})
