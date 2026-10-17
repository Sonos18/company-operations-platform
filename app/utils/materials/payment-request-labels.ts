import type { MaterialInvoiceStage, MaterialPaymentRequestState } from '../../../shared/schemas/costs/material-finance'

/**
 * Status label of a payment request (C5). A paid request still waits for the official invoice
 * while any invoice linked to it is a draft.
 */
export function paymentRequestStateLabel(
  state: MaterialPaymentRequestState,
  linkedInvoiceStages: readonly MaterialInvoiceStage[],
): string {
  switch (state) {
    case 'submitted': return 'Chờ lập UNC'
    case 'approved': return 'Đã lập UNC – chờ giám đốc duyệt'
    case 'paid': return linkedInvoiceStages.includes('draft') ? 'Đã chi – chờ hóa đơn chính thức' : 'Đã chi'
    case 'returned': return 'Bị trả lại'
    case 'cancelled': return 'Đã hủy'
  }
}

/** Treasurer button label; cash is possible only for small orders, so the label then names it too. */
export function approveActionLabel(allowCash: boolean): string {
  return allowCash ? 'Xác nhận đã lập UNC / đã chi tiền mặt' : 'Xác nhận đã lập UNC'
}

/**
 * Computes the stages of recorded invoices linked to a payment request.
 * Only invoices with state === 'recorded' are used (voided invoices are ignored).
 */
export function invoiceStagesForRequest(
  request: { invoiceIds?: readonly string[] | null } | null | undefined,
  invoices: readonly { id: string; state: string; stage?: MaterialInvoiceStage | null }[],
): MaterialInvoiceStage[] {
  if (!request?.invoiceIds || request.invoiceIds.length === 0) return []
  const recordedStagesById = new Map<string, MaterialInvoiceStage>()
  for (const inv of invoices) {
    if (inv.state === 'recorded') {
      recordedStagesById.set(inv.id, inv.stage ?? 'official')
    }
  }
  const stages: MaterialInvoiceStage[] = []
  for (const id of request.invoiceIds) {
    const stage = recordedStagesById.get(id)
    if (stage) {
      stages.push(stage)
    }
  }
  return stages
}
