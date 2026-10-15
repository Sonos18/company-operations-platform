import { describe, expect, it } from 'vitest'
import { permissionCodes } from '../../../shared/constants/permissions'
import {
  cancelMaterialOrderInputSchema,
  chosenSupplierInputSchema,
  createMaterialOrderInputSchema,
  materialEvidenceIntentInputSchema,
  materialCommandResultSchema,
  materialCommandSchema,
  materialOrderViewSchema,
  materialProjectOptionSchema,
  materialProcurementEndpointManifest,
  materialProposalDecisionInputSchema,
  materialProposalInputSchema,
  materialProposalLineInputSchema,
  setBuyerInvoiceNameInputSchema,
  materialProposalViewSchema,
  materialQuotationComparisonInputSchema,
  materialQuotationComparisonViewSchema,
} from '../../../shared/schemas/costs/material-procurement'
import { costEvidenceCreateIntentInputSchema } from '../../../shared/schemas/costs/cost-evidence'
import {
  canonicalMaterialPaymentInputSchema,
  directContractAuthorityViewSchema,
} from '../../../shared/schemas/costs/direct-contract-authority'
import {
  accountantRoleScope,
  directorRoleScope,
  engineerRoleScope,
  ids,
  purchasingRoleScope,
  quote11ForAllocation10,
  split10Of20,
  validLine,
  validProposal,
} from '../material-procurement/fixtures'

describe('material procurement contracts', () => {
  it('normalizes optional engineer invoice names and validates Buyer override input', () => {
    expect(materialProposalLineInputSchema.parse(validLine)).not.toHaveProperty('proposedInvoiceName')
    expect(materialProposalLineInputSchema.parse(validLine)).not.toHaveProperty('notes')
    expect(materialProposalLineInputSchema.parse({ ...validLine, notes: null }).notes).toBeNull()
    expect(materialProposalLineInputSchema.parse({ ...validLine, notes: '   ' }).notes).toBeNull()
    expect(materialProposalLineInputSchema.parse({ ...validLine, notes: '  Keep dry  ' }).notes).toBe('Keep dry')
    expect(materialProposalLineInputSchema.safeParse({ ...validLine, notes: 'x'.repeat(2001) }).success).toBe(false)
    expect(materialProposalLineInputSchema.parse({ ...validLine, proposedInvoiceName: null }).proposedInvoiceName).toBeNull()
    expect(materialProposalLineInputSchema.parse({ ...validLine, proposedInvoiceName: '   ' }).proposedInvoiceName).toBeNull()
    expect(materialProposalLineInputSchema.parse({ ...validLine, proposedInvoiceName: '  Steel invoice  ' }).proposedInvoiceName).toBe('Steel invoice')
    expect(materialProposalLineInputSchema.safeParse({ ...validLine, proposedInvoiceName: 'x'.repeat(201) }).success).toBe(false)

    const buyer = { revisionId: ids.proposalRevision, proposedInvoiceName: '  Buyer label  ', expectedOverrideVersion: 0 }
    expect(setBuyerInvoiceNameInputSchema.parse(buyer)).toEqual({ ...buyer, proposedInvoiceName: 'Buyer label' })
    expect(setBuyerInvoiceNameInputSchema.parse({ ...buyer, proposedInvoiceName: null }).proposedInvoiceName).toBeNull()
    expect(setBuyerInvoiceNameInputSchema.safeParse({ ...buyer, proposedInvoiceName: '   ' }).success).toBe(false)
    expect(setBuyerInvoiceNameInputSchema.safeParse({ ...buyer, proposedInvoiceName: 'x'.repeat(201) }).success).toBe(false)
    expect(materialProcurementEndpointManifest.setBuyerInvoiceName).toEqual({ method: 'PATCH', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals/:proposalId/lines/:lineId/invoice-name' })
  })

  it('keeps engineer proposals owner-authored and validates positive decimal quantities', () => {
    expect(materialProposalInputSchema.safeParse(validProposal).success).toBe(true)
    expect(materialProposalInputSchema.safeParse({
      ...validProposal,
      lines: [{ ...validLine, quantity: '0' }],
    }).success).toBe(false)
    expect(materialProposalInputSchema.safeParse({
      ...validProposal,
      supplierId: ids.supplier,
      lines: [{ ...validLine, unitPrice: '12.5000' }],
    }).success).toBe(false)
  })

  it('requires expectedVersion and a non-empty reason when purchasing returns a proposal', () => {
    expect(materialProposalDecisionInputSchema.safeParse({
      expectedVersion: 2,
      decision: 'approve',
    }).success).toBe(true)
    expect(materialProposalDecisionInputSchema.safeParse({
      expectedVersion: 2,
      decision: 'return',
      reason: '',
    }).success).toBe(false)
    expect(materialProposalDecisionInputSchema.safeParse({
      decision: 'return',
      reason: '',
    }).success).toBe(false)
  })

  it('exposes the buyer return reason to engineers and rejects missing or blank reason fields', () => {
    const returned = {
      id: ids.proposal, version: 3, reviewState: 'returned', returnReason: 'Kiem tra lai quy cach xi mang',
      approvedRevisionId: null, currentRevisionId: ids.proposalRevision, projectId: ids.project, createdBy: ids.user,
      neededOn: validProposal.neededOn, deliveryAddress: validProposal.deliveryAddress, notes: null,
      lines: [{ ...validLine, materialName: 'Xi mang', specification: 'PCB40', unit: 'bao', notes: null,
        engineerProposedInvoiceName: null, buyerProposedInvoiceName: null, effectiveInvoiceDisplayName: 'Xi mang', invoiceDisplayNameSource: 'canonical', buyerOverrideVersion: 0, buyerInvoiceNameEditable: false,
        allocatedQuantity: '0.0000', signedQuantity: '0.0000', remainingQuantity: '20.0000' }],
      orderProgress: { orderCount: 0, signedOrderCount: 0 },
    }
    expect(materialProposalViewSchema.safeParse(returned).success).toBe(true)
    for (const field of ['engineerProposedInvoiceName', 'buyerProposedInvoiceName', 'effectiveInvoiceDisplayName', 'invoiceDisplayNameSource', 'buyerOverrideVersion']) {
      const line = { ...returned.lines[0] } as Record<string, unknown>
      delete line[field]
      expect(materialProposalViewSchema.safeParse({ ...returned, lines: [line] }).success).toBe(false)
    }
    expect(materialProposalViewSchema.safeParse({ ...returned, reviewState: 'draft', returnReason: null }).success).toBe(true)
    const missingReason = { ...returned } as Record<string, unknown>
    delete missingReason.returnReason
    expect(materialProposalViewSchema.safeParse(missingReason).success).toBe(false)
    expect(materialProposalViewSchema.safeParse({ ...returned, returnReason: '  ' }).success).toBe(false)
    expect(materialProposalViewSchema.safeParse({ ...returned, returnReason: null }).success).toBe(false)
    expect(materialProposalViewSchema.safeParse({ ...returned, reviewState: 'submitted' }).success).toBe(false)

    // Optional, money-free contract status per order of the proposal (T8 I1).
    const approved = { ...returned, reviewState: 'approved', returnReason: null }
    const status = { orderId: ids.order, contractNo: 'HD-01', signedOn: '2026-10-10' }
    expect(materialProposalViewSchema.safeParse(approved).success).toBe(true)
    expect(materialProposalViewSchema.parse({ ...approved, contractStatus: [status] }).contractStatus).toEqual([status])
    expect(materialProposalViewSchema.safeParse({ ...approved, contractStatus: [{ ...status, total: '110.0000' }] }).success).toBe(false)
    expect(materialProposalViewSchema.safeParse({ ...approved, contractStatus: [{ ...status, signedOn: '10/10/2026' }] }).success).toBe(false)
  })

  it('freezes split-order allocation and signed-contract inputs', () => {
    const order = {
      approvedRevisionId: ids.proposalRevision,
      supplierId: ids.supplier,
      currencyCode: 'VND',
      unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
      allocations: [split10Of20.allocations[0]],
    }

    expect(createMaterialOrderInputSchema.safeParse(order).success).toBe(true)
    expect(createMaterialOrderInputSchema.safeParse({
      ...order,
      allocations: [split10Of20.allocations[1]],
    }).success).toBe(true)
    expect(createMaterialOrderInputSchema.safeParse({
      ...order,
      allocations: [{ ...split10Of20.allocations[0], mappingConfirmed: false }],
    }).success).toBe(false)
  })

  it('exposes proposal and order progress without turning a signed contract into cash', () => {
    expect(materialProposalViewSchema.safeParse({
      id: ids.proposal,
      version: 3,
      reviewState: 'approved',
      returnReason: null,
      approvedRevisionId: ids.proposalRevision,
      currentRevisionId: ids.proposalRevision,
      projectId: ids.project,
      createdBy: ids.user,
      neededOn: validProposal.neededOn,
      deliveryAddress: validProposal.deliveryAddress,
      notes: validProposal.notes,
      lines: [{
        ...validLine,
        materialName: 'Thep hop',
        notes: null,
        engineerProposedInvoiceName: null,
        buyerProposedInvoiceName: 'Thep tren hoa don',
        effectiveInvoiceDisplayName: 'Thep tren hoa don',
        invoiceDisplayNameSource: 'buyer',
        buyerOverrideVersion: 1,
        buyerInvoiceNameEditable: true,
        specification: '100 x 100 mm',
        unit: 'cay',
        allocatedQuantity: '20.0000',
        signedQuantity: '10.0000',
        remainingQuantity: '0',
      }],
      orderProgress: { orderCount: 2, signedOrderCount: 1 },
    }).success).toBe(true)

    const orderView = {
      id: ids.order,
      version: 2,
      orderState: 'active',
      proposalId: ids.proposal,
      approvedRevisionId: ids.proposalRevision,
      supplierId: ids.supplier,
      supplierName: 'Nha cung cap A',
      currencyCode: 'VND',
      allocations: [{
        orderLineId: ids.orderLine,
        ...split10Of20.allocations[0],
        materialId: ids.material,
        materialName: 'Thep hop',
        specification: '100 x 100 mm',
        unit: 'cay',
      }],
      unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
      contract: {
        id: ids.contract,
        contractNo: 'HD-VT-001',
        signedOn: '2026-10-10',
        currentVersionNo: 1,
        total: '100.0000',
      },
      cash: {
        committed: '100.0000',
        paid: '30.0000',
        pending: '20.0000',
        remaining: '70.0000',
      },
    }
    expect(materialOrderViewSchema.safeParse(orderView).success).toBe(true)
    expect(materialOrderViewSchema.safeParse({
      ...orderView,
      contract: { ...orderView.contract, total: null },
      cash: null,
    }).success).toBe(true)
    expect(materialOrderViewSchema.safeParse({ ...orderView, contract: null, cash: null }).success).toBe(true)
    expect(materialOrderViewSchema.safeParse({
      ...orderView,
      contract: { ...orderView.contract, signedValue: '100.0000' },
    }).success).toBe(false)
    expect(materialOrderViewSchema.safeParse({
      ...orderView,
      cash: { grossPaid: '30.0000', availableToPay: '70.0000' },
    }).success).toBe(false)
  })

  it('freezes buyer cancellation and material PDF role/target pairs without narrowing canonical evidence', () => {
    expect(cancelMaterialOrderInputSchema.safeParse({
      expectedOrderVersion: 2,
      reason: 'Nha cung cap khong con kha nang giao hang',
    }).success).toBe(true)
    expect(cancelMaterialOrderInputSchema.safeParse({ expectedOrderVersion: 2, reason: '  ' }).success).toBe(false)

    const evidence = {
      originalFilename: 'bao-gia.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128,
      sha256: 'a'.repeat(64),
    } as const
    expect(materialEvidenceIntentInputSchema.safeParse({
      ...evidence,
      evidenceRole: 'unsigned_quotation',
      target: { kind: 'material_proposal', proposalId: ids.proposal, revisionId: ids.proposalRevision },
    }).success).toBe(true)
    expect(materialEvidenceIntentInputSchema.safeParse({
      ...evidence,
      evidenceRole: 'signed_contract',
      target: { kind: 'material_proposal', proposalId: ids.proposal, revisionId: ids.proposalRevision },
    }).success).toBe(false)
    expect(materialEvidenceIntentInputSchema.safeParse({
      ...evidence,
      evidenceRole: 'signed_quotation',
      target: { kind: 'material_order', orderId: ids.order },
    }).success).toBe(true)
    expect(materialEvidenceIntentInputSchema.safeParse({
      ...evidence,
      evidenceRole: 'unsigned_quotation',
      target: { kind: 'material_order', orderId: ids.order },
    }).success).toBe(false)
    expect(materialEvidenceIntentInputSchema.safeParse({
      ...evidence,
      mimeType: 'image/png',
      evidenceRole: 'unsigned_quotation',
      target: { kind: 'material_proposal', proposalId: ids.proposal, revisionId: ids.proposalRevision },
    }).success).toBe(false)
    expect(costEvidenceCreateIntentInputSchema.safeParse({
      ...evidence,
      originalFilename: 'invoice.png',
      mimeType: 'image/png',
    }).success).toBe(true)

    expect(materialProcurementEndpointManifest.cancelOrder).toEqual({
      method: 'POST',
      path: '/api/companies/:companyId/projects/:projectId/material-procurement/orders/:orderId/cancellations',
    })
  })

  it('accepts contract-level finance evidence roles with allowed MIME types', () => {
    const base = { originalFilename: 'hd.xml', sizeBytes: 100, sha256: 'a'.repeat(64) }
    const target = { kind: 'material_contract' as const, contractId: '00000000-0000-4000-8000-000000000001' }
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/xml', evidenceRole: 'invoice', target }).success).toBe(true)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'text/xml', evidenceRole: 'invoice', target }).success).toBe(true)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'image/png', evidenceRole: 'payment_proof', target }).success).toBe(true)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/pdf', evidenceRole: 'contract_amendment', target }).success).toBe(true)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/xml', evidenceRole: 'payment_proof', target }).success).toBe(false)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'image/png', evidenceRole: 'invoice', target }).success).toBe(false)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/xml', evidenceRole: 'contract_amendment', target }).success).toBe(false)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/pdf', evidenceRole: 'signed_contract', target }).success).toBe(false)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/pdf', evidenceRole: 'invoice', target: { kind: 'material_order', orderId: target.contractId } }).success).toBe(false)
    expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/xml', evidenceRole: 'signed_quotation', target: { kind: 'material_order', orderId: target.contractId } }).success).toBe(false)
  })

  it('compares a quotation against its allocation and keeps the mismatch explicit', () => {
    expect(materialQuotationComparisonInputSchema.safeParse(quote11ForAllocation10).success).toBe(true)
    expect(materialQuotationComparisonViewSchema.safeParse({
      ...quote11ForAllocation10,
      varianceQuantity: '1.0000',
      matchesAllocation: false,
    }).success).toBe(true)
  })

  it('records only signed-contract direct authority and requires invoice-specific payment facts', () => {
    expect(directContractAuthorityViewSchema.safeParse({
      id: ids.authority,
      version: 1,
      authoritySource: 'signed_contract',
      projectId: ids.project,
      orderId: ids.order,
      contractId: ids.contract,
      signedValue: '100.0000',
      currencyCode: 'VND',
      signedContractEvidenceFileId: ids.signedContract,
      signedQuotationEvidenceFileId: ids.signedQuotation,
      installmentId: ids.installment,
      recordedBy: ids.user,
      recordedAt: '2026-10-08T08:00:00.000Z',
    }).success).toBe(true)
    expect(directContractAuthorityViewSchema.safeParse({
      id: ids.authority,
      version: 1,
      authoritySource: 'manager_decision',
      projectId: ids.project,
      orderId: ids.order,
      contractId: ids.contract,
      signedValue: '100.0000',
      currencyCode: 'VND',
      signedContractEvidenceFileId: ids.signedContract,
      signedQuotationEvidenceFileId: ids.signedQuotation,
      installmentId: ids.installment,
      recordedBy: ids.user,
      recordedAt: '2026-10-08T08:00:00.000Z',
    }).success).toBe(false)

    const payment = {
      amount: '30.0000',
      currencyCode: 'VND',
      paymentDate: '2026-10-08',
      reference: 'BANK-001',
      evidenceFileIds: [ids.paymentProof],
      expectedVersion: 1,
      invoiceEvidenceFileId: ids.invoice,
      invoiceNames: [{ orderLineId: ids.orderLine, name: 'Thep tren hoa don' }],
    }
    expect(canonicalMaterialPaymentInputSchema.safeParse(payment).success).toBe(true)
    expect(canonicalMaterialPaymentInputSchema.safeParse({
      ...payment,
      invoiceEvidenceFileId: undefined,
    }).success).toBe(false)
  })

  it('uses projectId for project choices bound to the active company', () => {
    expect(materialProjectOptionSchema.safeParse({
      projectId: ids.project,
      code: 'P-001',
      name: 'Cong trinh A',
      locationText: null,
    }).success).toBe(true)
  })

  it('reuses organization party input only for an already chosen supplier', () => {
    const supplier = {
      code: 'NCC-001',
      displayName: 'Nha cung cap A',
      partyKind: 'organization',
      supplierAlreadyChosen: true,
    }
    expect(chosenSupplierInputSchema.safeParse(supplier).success).toBe(true)
    expect(chosenSupplierInputSchema.safeParse({
      ...supplier,
      supplierAlreadyChosen: false,
    }).success).toBe(false)
  })

  it('registers scoped material and payment permissions without inventing a proposal-update permission', () => {
    for (const code of [
      'material.read',
      'material.manage',
      'material.proposal.submit',
      'material.proposal.decide',
      'material.order.manage',
      'material.supplier.record',
      'material.contract.record',
    ]) expect(permissionCodes).toContain(code)

    expect(purchasingRoleScope).not.toContain('material.proposal.submit')
    expect(accountantRoleScope).toContain('cost.record_cash')
    expect(directorRoleScope).toContain('cost.notification.read')
    expect(engineerRoleScope).not.toContain('material.order.manage')
    expect(permissionCodes).not.toContain('material.proposal.update')
    for (const code of [
      'material.payment.request',
      'material.payment.approve',
      'material.payment.execute',
      'material.finance.read',
    ]) expect(permissionCodes).toContain(code)
  })

  it('freezes command keys, receipts, and the endpoint manifest without legacy contract or payment routes', () => {
    expect(materialCommandSchema.safeParse({ idempotencyKey: ids.order }).success).toBe(true)
    expect(materialCommandSchema.safeParse({ idempotencyKey: 'material-order-001' }).success).toBe(false)
    expect(materialCommandSchema.safeParse({ idempotencyKey: '' }).success).toBe(false)

    expect(materialCommandResultSchema.safeParse({
      resourceId: ids.order,
      version: 2,
      replayed: false,
    }).success).toBe(true)
    for (const legacyKey of ['contractId', 'authorizationId', 'installmentId']) {
      expect(materialCommandResultSchema.safeParse({
        resourceId: ids.order,
        version: 2,
        replayed: false,
        [legacyKey]: ids.contract,
      }).success).toBe(false)
    }

    expect(materialProcurementEndpointManifest).not.toHaveProperty('payments')
    expect(materialProcurementEndpointManifest).not.toHaveProperty('recordContract')
    expect(Object.values(materialProcurementEndpointManifest).some(endpoint =>
      endpoint.path.includes('material-payments'),
    )).toBe(false)
  })
})
