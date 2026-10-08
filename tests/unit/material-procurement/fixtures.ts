export const ids = {
  proposal: '00000000-0000-4000-8000-000000000001',
  proposalRevision: '00000000-0000-4000-8000-000000000002',
  proposalLine: '00000000-0000-4000-8000-000000000003',
  material: '00000000-0000-4000-8000-000000000004',
  supplier: '00000000-0000-4000-8000-000000000005',
  order: '00000000-0000-4000-8000-000000000006',
  orderLine: '00000000-0000-4000-8000-000000000007',
  unsignedQuotation: '00000000-0000-4000-8000-000000000008',
  signedContract: '00000000-0000-4000-8000-000000000009',
  signedQuotation: '00000000-0000-4000-8000-00000000000a',
  contract: '00000000-0000-4000-8000-00000000000b',
  authority: '00000000-0000-4000-8000-00000000000c',
  installment: '00000000-0000-4000-8000-00000000000d',
  project: '00000000-0000-4000-8000-00000000000e',
  user: '00000000-0000-4000-8000-00000000000f',
  invoice: '00000000-0000-4000-8000-000000000010',
  paymentProof: '00000000-0000-4000-8000-000000000011',
} as const

export const validLine = {
  lineId: ids.proposalLine,
  materialId: ids.material,
  quantity: '20.0000',
} as const

export const validProposal = {
  neededOn: '2026-10-30',
  deliveryAddress: 'Cong truong VQH',
  notes: 'Giao buoi sang',
  lines: [validLine],
} as const

export const engineerRoleScope = [
  'material.read',
  'material.proposal.submit',
] as const

export const purchasingRoleScope = [
  'material.read',
  'material.manage',
  'material.proposal.decide',
  'material.order.manage',
  'material.supplier.record',
] as const

export const accountantRoleScope = [
  'material.read',
  'material.contract.record',
  'cost.record_cash',
] as const

export const directorRoleScope = [
  'material.read',
  'cost.notification.read',
] as const

export const split10Of20 = {
  proposalQuantity: '20.0000',
  allocations: [
    {
      proposalLineId: ids.proposalLine,
      quantity: '10.0000',
      unitPrice: '12.5000',
      quotationMaterialName: 'Thep NCC A',
      mappingConfirmed: true,
    },
    {
      proposalLineId: ids.proposalLine,
      quantity: '10.0000',
      unitPrice: '13.0000',
      quotationMaterialName: 'Thep NCC B',
      mappingConfirmed: true,
    },
  ],
} as const

export const quote11ForAllocation10 = {
  proposalLineId: ids.proposalLine,
  allocationQuantity: '10.0000',
  quotedQuantity: '11.0000',
} as const

export const legacyOrder = {
  cap: '100.0000',
  approved: '30.0000',
  paid: '10.0000',
} as const

export const signedContractInput = {
  expectedOrderVersion: 1,
  contractReference: 'HD-VT-001',
  signedValue: '100.0000',
  currencyCode: 'VND',
  signedContractEvidenceFileId: ids.signedContract,
  signedQuotationEvidenceFileId: ids.signedQuotation,
  documentsReviewed: true,
} as const

export const signed100Paid30 = {
  signedValue: '100.0000',
  grossPaid: '30.0000',
  availableToPay: '70.0000',
} as const
