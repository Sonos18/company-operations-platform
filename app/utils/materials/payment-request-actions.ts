import type { MaterialPaymentRequestView } from '../../../shared/schemas/costs/material-finance'

type Action = 'resubmit' | 'cancel' | 'approve' | 'return' | 'record_payment'

export function paymentRequestActions(request: Pick<MaterialPaymentRequestView, 'state' | 'submittedBy'>, actorId: string, permissions: readonly string[]): Action[] {
  const can = (permission: string) => permissions.includes(permission)
  const actions: Action[] = []
  if (request.state === 'returned' && can('material.payment.request')) actions.push('resubmit')
  if (request.state === 'submitted' && can('material.payment.approve') && request.submittedBy !== actorId) actions.push('approve', 'return')
  // The accountant who submitted the request records its payment (C4), so there is no submitter rule here.
  if (request.state === 'approved' && can('material.payment.execute')) actions.push('record_payment')
  // Requesters cancel submitted or returned requests; an approved one only an approver may cancel.
  if (['submitted', 'returned'].includes(request.state) && can('material.payment.request')) actions.push('cancel')
  if (request.state === 'approved' && can('material.payment.approve')) actions.push('cancel')
  return actions
}
