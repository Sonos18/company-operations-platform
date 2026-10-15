import type { MaterialPaymentRequestView } from '../../../shared/schemas/costs/material-finance'

type Action = 'resubmit' | 'cancel' | 'approve' | 'return' | 'record_payment'

export function paymentRequestActions(request: Pick<MaterialPaymentRequestView, 'state' | 'submittedBy'>, actorId: string, permissions: readonly string[]): Action[] {
  const can = (permission: string) => permissions.includes(permission)
  const notSubmitter = request.submittedBy !== actorId
  const actions: Action[] = []
  if (request.state === 'returned' && can('material.payment.request')) actions.push('resubmit')
  if (request.state === 'submitted' && can('material.payment.approve') && notSubmitter) actions.push('approve', 'return')
  if (request.state === 'approved' && can('material.payment.execute') && notSubmitter) actions.push('record_payment')
  if (['submitted', 'returned', 'approved'].includes(request.state) && can('material.payment.request')) actions.push('cancel')
  return actions
}
