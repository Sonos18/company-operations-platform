import { describe, expect, it } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import { createCommandKeyKeeper } from '../../../app/utils/materials/command-key'
import {
  financeErrorMessage,
  isDefinitiveRejection,
  moneyEquals,
  moneySum,
  parseMoneyOrNull,
  resetCommandKeyAfterError,
  uploadErrorMessage,
} from '../../../app/utils/materials/finance-ui'

function clientError(code: ClientError['code'], retryable: boolean, kind: ClientError['kind'] = 'api') {
  return new ClientError({ kind, code, message: 'server text', retryable })
}

describe('parseMoneyOrNull (Vietnamese format)', () => {
  it('reads "." as thousands and "," as decimal and returns the canonical string', () => {
    expect(parseMoneyOrNull('33')).toBe('33')
    expect(parseMoneyOrNull('1.500.000,5')).toBe('1500000.5')
    expect(parseMoneyOrNull(' 12.500,5000 ')).toBe('12500.5')
    expect(parseMoneyOrNull('0,1')).toBe('0.1')
    expect(parseMoneyOrNull('0')).toBe('0')
  })

  it('rejects dot decimals, signs, exponents and too many decimals', () => {
    for (const raw of ['', 'abc', '-1', '1e3', '1.5', '1,23456', '1,2,3', '12345678901234567']) {
      expect(parseMoneyOrNull(raw)).toBeNull()
    }
  })
})

describe('money arithmetic', () => {
  it('does not accumulate floating point error', () => {
    expect(moneySum('0.1', '0.2')).toBe('0.3')
    expect(moneyEquals(moneySum('10000000', '800000.1'), '10800000.1')).toBe(true)
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

  it('uses the client error message for unmapped codes and the fallback for other errors', () => {
    expect(financeErrorMessage(clientError('INTERNAL_ERROR', true), 'fallback')).toBe('server text')
    expect(financeErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })
})

describe('idempotency key after a failed command', () => {
  it('keeps the key when the outcome is unknown and drops it on a definitive rejection', () => {
    const keeper = createCommandKeyKeeper()
    const key = keeper.keyFor({ id: 'a' })

    resetCommandKeyAfterError(keeper, clientError('NETWORK_ERROR', true, 'network'))
    expect(keeper.keyFor({ id: 'a' })).toBe(key)

    resetCommandKeyAfterError(keeper, clientError('MALFORMED_RESPONSE', false, 'unexpected'))
    expect(keeper.keyFor({ id: 'a' })).toBe(key)

    resetCommandKeyAfterError(keeper, new Error('socket closed'))
    expect(keeper.keyFor({ id: 'a' })).toBe(key)

    resetCommandKeyAfterError(keeper, clientError('VERSION_CONFLICT', false))
    expect(keeper.keyFor({ id: 'a' })).not.toBe(key)
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
