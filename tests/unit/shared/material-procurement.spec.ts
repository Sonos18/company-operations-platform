import { describe, expect, it } from 'vitest'
import { permissionCodes } from '../../../shared/constants/permissions'
import {
  chosenSupplierInputSchema,
  commitMaterialContractInputSchema,
  createMaterialOrderInputSchema,
  materialCommandResultSchema,
  materialCommandSchema,
  materialOrderViewSchema,
  materialProjectOptionSchema,
  materialProcurementEndpointManifest,
  materialProposalDecisionInputSchema,
  materialProposalInputSchema,
  materialProposalViewSchema,
  materialQuotationComparisonInputSchema,
  materialQuotationComparisonViewSchema,
} from '../../../shared/schemas/costs/material-procurement'
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
  signed100Paid30,
  signedContractInput,
  split10Of20,
  validLine,
  validProposal,
} from '../material-procurement/fixtures'

describe('material procurement contracts', () => {
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
      approvedRevisionId: null, projectId: ids.project, createdBy: ids.user,
      neededOn: validProposal.neededOn, deliveryAddress: validProposal.deliveryAddress, notes: null,
      lines: [{ ...validLine, materialName: 'Xi mang', specification: 'PCB40', unit: 'bao',
        allocatedQuantity: '0.0000', signedQuantity: '0.0000', remainingQuantity: '20.0000' }],
      orderProgress: { orderCount: 0, signedOrderCount: 0 },
    }
    expect(materialProposalViewSchema.safeParse(returned).success).toBe(true)
    expect(materialProposalViewSchema.safeParse({ ...returned, reviewState: 'draft', returnReason: null }).success).toBe(true)
    const missingReason = { ...returned } as Record<string, unknown>
    delete missingReason.returnReason
    expect(materialProposalViewSchema.safeParse(missingReason).success).toBe(false)
    expect(materialProposalViewSchema.safeParse({ ...returned, returnReason: '  ' }).success).toBe(false)
    expect(materialProposalViewSchema.safeParse({ ...returned, returnReason: null }).success).toBe(false)
    expect(materialProposalViewSchema.safeParse({ ...returned, reviewState: 'submitted' }).success).toBe(false)
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
    expect(commitMaterialContractInputSchema.safeParse(signedContractInput).success).toBe(true)
    expect(commitMaterialContractInputSchema.safeParse({
      ...signedContractInput,
      documentsReviewed: false,
    }).success).toBe(false)
  })

  it('exposes proposal and order progress without turning a signed contract into cash', () => {
    expect(materialProposalViewSchema.safeParse({
      id: ids.proposal,
      version: 3,
      reviewState: 'approved',
      returnReason: null,
      approvedRevisionId: ids.proposalRevision,
      projectId: ids.project,
      createdBy: ids.user,
      neededOn: validProposal.neededOn,
      deliveryAddress: validProposal.deliveryAddress,
      notes: validProposal.notes,
      lines: [{
        ...validLine,
        materialName: 'Thep hop',
        specification: '100 x 100 mm',
        unit: 'cay',
        allocatedQuantity: '20.0000',
        signedQuantity: '10.0000',
        remainingQuantity: '0',
      }],
      orderProgress: { orderCount: 2, signedOrderCount: 1 },
    }).success).toBe(true)

    expect(materialOrderViewSchema.safeParse({
      id: ids.order,
      version: 2,
      proposalId: ids.proposal,
      approvedRevisionId: ids.proposalRevision,
      supplierId: ids.supplier,
      currencyCode: 'VND',
      allocations: [{
        orderLineId: ids.orderLine,
        ...split10Of20.allocations[0],
      }],
      unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
      contract: {
        id: ids.contract,
        signedValue: signed100Paid30.signedValue,
        currencyCode: 'VND',
        authorizationId: ids.authority,
        installmentId: ids.installment,
      },
      cash: {
        grossPaid: signed100Paid30.grossPaid,
        availableToPay: signed100Paid30.availableToPay,
      },
    }).success).toBe(true)
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

  it('registers scoped permissions without inventing proposal-update or manager-approval permissions', () => {
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
    expect(permissionCodes).not.toContain('material.payment.approve')
  })

  it('freezes command keys, receipts, and the endpoint manifest around the canonical payment route', () => {
    expect(materialCommandSchema.safeParse({ idempotencyKey: ids.order }).success).toBe(true)
    expect(materialCommandSchema.safeParse({ idempotencyKey: 'material-order-001' }).success).toBe(false)
    expect(materialCommandSchema.safeParse({ idempotencyKey: '' }).success).toBe(false)

    expect(materialCommandResultSchema.safeParse({
      resourceId: ids.order,
      version: 2,
      replayed: false,
      contractId: ids.contract,
      authorizationId: ids.authority,
      installmentId: ids.installment,
    }).success).toBe(true)

    expect(materialProcurementEndpointManifest.payments).toEqual({
      method: 'POST',
      path: '/api/companies/:companyId/projects/:projectId/cost-workflow/installments/:installmentId/payments',
    })
    expect(Object.values(materialProcurementEndpointManifest).some(endpoint =>
      endpoint.path.includes('material-payments'),
    )).toBe(false)
  })
})
