import { describe, expect, it } from 'vitest'
import { paymentRequestActions } from '../../../app/utils/materials/payment-request-actions'

const base = { state: 'submitted', submittedBy: 'u1' } as never
const r = (state: string, submittedBy = 'u1') => ({ ...(base as object), state, submittedBy }) as never

describe('paymentRequestActions', () => {
  it('lets a different approver approve or return a submitted request', () => {
    expect(paymentRequestActions(r('submitted'), 'u2', ['material.payment.approve'])).toEqual(['approve', 'return'])
  })
  it('hides approve for the submitter even with approve permission', () => {
    expect(paymentRequestActions(r('submitted'), 'u1', ['material.payment.approve', 'material.payment.request'])).toEqual(['cancel'])
  })
  it('offers resubmit and cancel on returned requests to requesters', () => {
    expect(paymentRequestActions(r('returned'), 'u3', ['material.payment.request'])).toEqual(['resubmit', 'cancel'])
  })
  it('offers record_payment on approved requests to an executor who did not submit', () => {
    expect(paymentRequestActions(r('approved'), 'u2', ['material.payment.execute'])).toEqual(['record_payment'])
    expect(paymentRequestActions(r('approved'), 'u1', ['material.payment.execute'])).toEqual([])
  })
  it('offers nothing on paid or cancelled', () => {
    expect(paymentRequestActions(r('paid'), 'u2', ['material.payment.execute', 'material.payment.request'])).toEqual([])
    expect(paymentRequestActions(r('cancelled'), 'u2', ['material.payment.request'])).toEqual([])
  })
})
