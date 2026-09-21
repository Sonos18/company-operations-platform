import AxeBuilder from '@axe-core/playwright'
import { financeItemDetailsSchema, financeOverviewSchema, financeProjectListSchema, financeSubcontractDetailSchema, financeSubcontractorDetailSchema, financeSubcontractorListSchema } from '../../shared/schemas/costs/project-finance'
import { expect, test } from './fixtures/authenticated'
import { createCompany } from './fixtures/auth-routes'

const projectIdAlpha = '10000000-0000-4000-8000-000000000101'
const projectIdBeta = '10000000-0000-4000-8000-000000000102'
const projectIdAdvance = '10000000-0000-4000-8000-000000000103'
const projectIdEmpty = '10000000-0000-4000-8000-000000000104'

const categoryIdMat = '20000000-0000-4000-8000-000000000001'
const categoryIdSub = '20000000-0000-4000-8000-000000000002'

const item1Id = '30000000-0000-4000-8000-000000000001'
const item2Id = '30000000-0000-4000-8000-000000000002'
const item3Id = '30000000-0000-4000-8000-000000000003'

const contractorPartyId = '40000000-0000-4000-8000-000000000001'
const contractIdAlpha = '50000000-0000-4000-8000-000000000001'

const mockProjectAlpha = {
  projectId: projectIdAlpha,
  projectCode: 'C101-P1',
  projectName: 'Synthetic Project Alpha',
  currencyCode: 'VND',
  moneyScale: 0,
  timeZone: 'Asia/Ho_Chi_Minh',
  operationalState: 'active' as const,
}

const mockProjectBeta = {
  projectId: projectIdBeta,
  projectCode: 'C101-P2',
  projectName: 'Synthetic Project Beta',
  currencyCode: 'USD',
  moneyScale: 2,
  timeZone: 'Asia/Ho_Chi_Minh',
  operationalState: 'completed' as const,
}

const mockProjectAdvance = {
  projectId: projectIdAdvance,
  projectCode: 'C101-P3',
  projectName: 'Synthetic Project Advance',
  currencyCode: 'VND',
  moneyScale: 0,
  timeZone: 'Asia/Ho_Chi_Minh',
  operationalState: 'paused' as const,
}

const mockProjectEmpty = {
  projectId: projectIdEmpty,
  projectCode: 'C101-P4',
  projectName: 'Synthetic Project Empty',
  currencyCode: 'VND',
  moneyScale: 0,
  timeZone: 'Asia/Ho_Chi_Minh',
  operationalState: 'unknown' as const,
}

const projectIdProvisional = '10000000-0000-4000-8000-000000000105'
const mockProjectProvisional = {
  projectId: projectIdProvisional,
  projectCode: 'C101-P5',
  projectName: 'Synthetic Project Provisional',
  currencyCode: 'VND',
  moneyScale: 0,
  timeZone: 'Asia/Ho_Chi_Minh',
  operationalState: 'active' as const,
}

const mockSummaryAlpha = {
  budget: { state: 'recorded' as const, amount: '300000000.0000', recordedCount: 1 },
  ownerAdvances: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  cost: { state: 'recorded' as const, amount: '242562376.0000', recordedCount: 4, knownSubtotal: '242562376.0000' },
  warrantyRetention: { state: 'recorded' as const, amount: '15000000.0000', recordedCount: 1 },
  reference: { kind: 'approved_budget' as const, amount: '300000000.0000' },
  margin: { state: 'unavailable' as const, amount: null, reasons: ['COST_INCOMPLETE' as const, 'RETENTION_INCOMPLETE' as const] },
  management: {
    receipts: { state: 'not_recorded' as const, amount: null, recordedCount: 0, origin: 'none' as const, quality: 'not_recorded' as const, coverage: 'none' as const, sourceReferences: [] },
    reference: { kind: 'approved_budget' as const, amount: '300000000.0000', basis: 'unconfirmed_cost_budget' as const },
    result: { state: 'unavailable' as const, amount: null, basis: 'approved_budget_unconfirmed' as const, components: { receipts: null, cost: '242562376.0000', independentlyHeldRetention: null }, reasons: ['BUDGET_BASIS_UNCONFIRMED' as const, 'RETENTION_INCOMPLETE' as const] },
    headline: { kind: 'unavailable' as const, amount: null, basis: 'none' as const },
  },
  issues: [],
}

const mockSummaryBeta = {
  budget: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  ownerAdvances: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  cost: { state: 'recorded' as const, amount: '5641725896.0000', recordedCount: 5, knownSubtotal: '5641725896.0000' },
  warrantyRetention: { state: 'recorded' as const, amount: '0.0000', recordedCount: 1 },
  reference: { kind: 'none' as const, amount: null },
  margin: { state: 'unavailable' as const, amount: null, reasons: ['NO_APPROVED_BUDGET' as const] },
  management: {
    receipts: { state: 'not_recorded' as const, amount: null, recordedCount: 0, origin: 'none' as const, quality: 'not_recorded' as const, coverage: 'none' as const, sourceReferences: [] },
    reference: { kind: 'none' as const, amount: null, basis: 'none' as const },
    result: { state: 'unavailable' as const, amount: null, basis: 'none' as const, components: { receipts: null, cost: '5641725896.0000', independentlyHeldRetention: null }, reasons: ['NO_REFERENCE' as const, 'RETENTION_INCOMPLETE' as const] },
    headline: { kind: 'unavailable' as const, amount: null, basis: 'none' as const },
  },
  issues: [],
}

const mockSummaryAdvance = {
  budget: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  ownerAdvances: { state: 'recorded' as const, amount: '200000000.0000', recordedCount: 2 },
  cost: { state: 'needs_reconciliation' as const, amount: null, recordedCount: 2, knownSubtotal: '50000000.0000' },
  warrantyRetention: { state: 'needs_reconciliation' as const, amount: null, recordedCount: 1 },
  reference: { kind: 'owner_advance' as const, amount: '200000000.0000' },
  margin: { state: 'unavailable' as const, amount: null, reasons: ['NO_APPROVED_BUDGET' as const, 'BUDGET_BASIS_UNCONFIRMED' as const] },
  management: {
    receipts: { state: 'recorded' as const, amount: '200000000.0000', recordedCount: 2, origin: 'canonical_ledger' as const, quality: 'accounting_source_unverified' as const, coverage: 'recorded_rows_only' as const, sourceReferences: ['synthetic/J3', 'synthetic/J4'] },
    reference: { kind: 'owner_receipts' as const, amount: '200000000.0000', basis: 'recorded_owner_receipts' as const },
    result: { state: 'unavailable' as const, amount: null, basis: 'owner_receipts' as const, components: { receipts: '200000000.0000', cost: null, independentlyHeldRetention: null }, reasons: ['COST_INCOMPLETE' as const, 'RETENTION_INCOMPLETE' as const] },
    headline: { kind: 'owner_receipts' as const, amount: '200000000.0000', basis: 'recorded_owner_receipts' as const },
  },
  issues: [],
}

const mockSummaryProvisional = {
  budget: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  ownerAdvances: { state: 'recorded' as const, amount: '200000000.0000', recordedCount: 2 },
  cost: { state: 'recorded' as const, amount: '145000000.0000', recordedCount: 3, knownSubtotal: '145000000.0000' },
  warrantyRetention: { state: 'recorded' as const, amount: '10000000.0000', recordedCount: 1 },
  reference: { kind: 'owner_advance' as const, amount: '200000000.0000' },
  margin: { state: 'unavailable' as const, amount: null, reasons: ['NO_APPROVED_BUDGET' as const, 'BUDGET_BASIS_UNCONFIRMED' as const] },
  management: {
    receipts: { state: 'recorded' as const, amount: '200000000.0000', recordedCount: 2, origin: 'canonical_ledger' as const, quality: 'accounting_source_unverified' as const, coverage: 'recorded_rows_only' as const, sourceReferences: ['synthetic/J5'] },
    reference: { kind: 'owner_receipts' as const, amount: '200000000.0000', basis: 'recorded_owner_receipts' as const },
    result: { state: 'provisional' as const, amount: '45000000.0000', basis: 'owner_receipts' as const, components: { receipts: '200000000.0000', cost: '145000000.0000', independentlyHeldRetention: '10000000.0000' }, reasons: [] },
    headline: { kind: 'provisional_result' as const, amount: '45000000.0000', basis: 'provisional_owner_receipts_result' as const },
  },
  issues: [],
}

const mockSummaryEmpty = {
  budget: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  ownerAdvances: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  cost: { state: 'not_recorded' as const, amount: null, recordedCount: 0, knownSubtotal: '0.0000' },
  warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  reference: { kind: 'none' as const, amount: null },
  margin: { state: 'unavailable' as const, amount: null, reasons: ['NO_APPROVED_BUDGET' as const, 'COST_INCOMPLETE' as const] },
  management: {
    receipts: { state: 'not_recorded' as const, amount: null, recordedCount: 0, origin: 'none' as const, quality: 'not_recorded' as const, coverage: 'none' as const, sourceReferences: [] },
    reference: { kind: 'none' as const, amount: null, basis: 'none' as const },
    result: { state: 'unavailable' as const, amount: null, basis: 'none' as const, components: { receipts: null, cost: null, independentlyHeldRetention: null }, reasons: ['NO_REFERENCE' as const, 'COST_INCOMPLETE' as const, 'RETENTION_INCOMPLETE' as const] },
    headline: { kind: 'unavailable' as const, amount: null, basis: 'none' as const },
  },
  issues: [],
}

const mockProjectListResponse = financeProjectListSchema.parse({
  schemaVersion: 1 as const,
  projects: [
    { project: mockProjectAlpha, summary: mockSummaryAlpha },
    { project: mockProjectBeta, summary: mockSummaryBeta },
    { project: mockProjectAdvance, summary: mockSummaryAdvance },
    { project: mockProjectProvisional, summary: mockSummaryProvisional },
  ],
  nextCursor: null,
})

const mockCompany2ProjectListResponse = financeProjectListSchema.parse({
  schemaVersion: 1,
  projects: [{ project: { ...mockProjectBeta, projectCode: 'BETA-1', projectName: 'Project for Company Beta Only' }, summary: mockSummaryBeta }],
  nextCursor: null,
})

const mockEmptyProjectListResponse = financeProjectListSchema.parse({ schemaVersion: 1, projects: [], nextCursor: null })

const mockCategoryMaterials = {
  categoryId: categoryIdMat,
  code: 'materials',
  name: 'materials',
  displayOrder: 1,
  isActive: true,
  itemId: item1Id,
  description: 'Vật liệu xây dựng phần thô',
  businessReference: 'REF-ALPHA-01',
  cost: { state: 'recorded' as const, amount: '120000000.0000', recordedCount: 2 },
  detailCount: 2,
  latestRecordedDate: '2026-08-15',
  latestRecordedDateSource: 'business_date' as const,
  warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
  recordedPaymentsTotal: null,
  recordedPaymentCount: 0,
  legacyReconciliationRequired: false,
}

const mockCategorySubcontract = {
  categoryId: categoryIdSub,
  code: 'subcontract_labor',
  name: 'subcontract_labor',
  displayOrder: 2,
  isActive: true,
  itemId: null,
  description: 'Gia công lắp dựng kết cấu thép',
  businessReference: 'YM-SUBCONTRACT-01',
  cost: { state: 'needs_reconciliation' as const, amount: null, recordedCount: 1 },
  detailCount: 0,
  latestRecordedDate: '2026-08-20',
  latestRecordedDateSource: 'created_at' as const,
  warrantyRetention: { state: 'recorded' as const, amount: '5376500.0000', recordedCount: 2 },
  recordedPaymentsTotal: '107530000.0000',
  recordedPaymentCount: 2,
  legacyReconciliationRequired: true,
}

const mockOverviewAlpha = financeOverviewSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectAlpha,
  summary: mockSummaryAlpha,
  categories: [mockCategoryMaterials, mockCategorySubcontract],
})

const mockOverviewBeta = financeOverviewSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectBeta,
  summary: mockSummaryBeta,
  categories: [
    {
      categoryId: categoryIdMat,
      code: 'machinery',
      name: 'machinery',
      displayOrder: 1,
      isActive: true,
      itemId: item2Id,
      description: 'Dịch vụ thiết kế hệ thống HVAC',
      businessReference: 'REF-BETA-01',
      cost: { state: 'recorded' as const, amount: '5641725896.0000', recordedCount: 1 },
      detailCount: 1,
      latestRecordedDate: '2026-09-01',
      latestRecordedDateSource: 'business_date' as const,
      warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    },
  ],
})

const mockOverviewAdvance = financeOverviewSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectAdvance,
  summary: mockSummaryAdvance,
  categories: [mockCategorySubcontract],
})

const mockOverviewProvisional = financeOverviewSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectProvisional,
  summary: mockSummaryProvisional,
  categories: [mockCategoryMaterials],
})

const mockOverviewEmpty = financeOverviewSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectEmpty,
  summary: mockSummaryEmpty,
  categories: [],
})

const mockItem1Details = financeItemDetailsSchema.parse({
  schemaVersion: 1 as const,
  kind: 'ordinary' as const,
  project: mockProjectAlpha,
  category: mockCategoryMaterials,
  item: {
    id: item1Id,
    description: 'Thi công cọc khoan nhồi D800',
    businessReference: 'REF-ALPHA-01',
    parentAmount: '120000000.0000',
    currencyCode: 'VND',
    version: 1,
  },
  details: {
    rows: [
      {
        id: '60000000-0000-4000-8000-000000000001',
        lineNo: 1,
        detailKind: 'opening_balance' as const,
        description: 'Số dư đầu kỳ cọc khoan nhồi',
        quantity: null,
        unitCode: null,
        unitPrice: null,
        amount: '50000000.0000',
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
        relevantDate: '2026-08-01',
        effectiveDate: '2026-08-01',
        dateSource: 'relevant_date' as const,
        reference: 'OB-01',
        note: 'Chuyển giao từ kỳ trước',
        createdAt: '2026-08-01T00:00:00.000Z',
        version: 0,
      },
      {
        id: '60000000-0000-4000-8000-000000000002',
        lineNo: 2,
        detailKind: 'line_item' as const,
        description: 'Khoan cọc thí nghiệm D800',
        quantity: '2.0000',
        unitCode: 'tim',
        unitPrice: '35000000.0000',
        amount: '70000000.0000',
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
        relevantDate: '2026-08-15',
        effectiveDate: '2026-08-15',
        dateSource: 'relevant_date' as const,
        reference: 'BB-01',
        note: null,
        createdAt: '2026-08-15T00:00:00.000Z',
        version: 0,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 25 as const,
      totalPages: 1,
      filteredCount: 2,
      fullCount: 2,
      filteredAmount: '120000000.0000',
      fullAmount: '120000000.0000',
    },
  },
})

const mockItem2Details = financeItemDetailsSchema.parse({
  schemaVersion: 1 as const,
  kind: 'ordinary' as const,
  project: mockProjectBeta,
  category: {
    categoryId: categoryIdMat,
    code: 'machinery',
    name: 'machinery',
    displayOrder: 1,
    isActive: true,
    itemId: item2Id,
    description: 'Dịch vụ thiết kế hệ thống HVAC',
    businessReference: 'REF-BETA-01',
    cost: { state: 'recorded' as const, amount: '5641725896.0000', recordedCount: 1 },
    detailCount: 1,
    latestRecordedDate: '2026-09-01',
    latestRecordedDateSource: 'business_date' as const,
    warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
    recordedPaymentsTotal: null,
    recordedPaymentCount: 0,
    legacyReconciliationRequired: false,
  },
  item: {
    id: item2Id,
    description: 'Dịch vụ thiết kế hệ thống HVAC',
    businessReference: 'REF-BETA-01',
    parentAmount: '5641725896.0000',
    currencyCode: 'USD',
    version: 1,
  },
  details: {
    rows: [
      {
        id: '50000000-0000-4000-8000-000000000002',
        lineNo: 1,
        detailKind: 'line_item' as const,
        description: 'Thiết kế hệ thống HVAC tầng 1-5',
        quantity: '1.0000',
        unitCode: 'gói',
        unitPrice: '5641725896.0000',
        amount: '5641725896.0000',
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
        relevantDate: '2026-09-01',
        effectiveDate: '2026-09-01',
        dateSource: 'relevant_date' as const,
        reference: 'HVAC-01',
        note: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        version: 0,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 25 as const,
      totalPages: 1,
      filteredCount: 1,
      fullCount: 1,
      filteredAmount: '5641725896.0000',
      fullAmount: '5641725896.0000',
    },
  },
})

const _mockItem3Details = financeItemDetailsSchema.parse({
  schemaVersion: 1 as const,
  kind: 'ordinary' as const,
  project: mockProjectAlpha,
  category: mockCategoryMaterials,
  item: {
    id: item3Id,
    description: 'Chi phí khoan mẫu địa chất',
    businessReference: 'REF-ALPHA-03',
    parentAmount: '15000000.0000',
    currencyCode: 'VND',
    version: 1,
  },
  details: {
    rows: [
      {
        id: '60000000-0000-4000-8000-000000000003',
        lineNo: 1,
        detailKind: 'line_item' as const,
        description: 'Chi phí khoan mẫu địa chất',
        quantity: '1.0000',
        unitCode: 'gói',
        unitPrice: '15000000.0000',
        amount: '15000000.0000',
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
        relevantDate: '2026-08-25',
        effectiveDate: '2026-08-25',
        dateSource: 'relevant_date' as const,
        reference: null,
        note: null,
        createdAt: '2026-08-25T10:00:00.000Z',
        version: 0,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 25 as const,
      totalPages: 1,
      filteredCount: 1,
      fullCount: 1,
      filteredAmount: '15000000.0000',
      fullAmount: '15000000.0000',
    },
  },
})

const unresolvedContractorPartyId = '40000000-0000-4000-8000-000000000002'
const unresolvedContractorPartyId2 = '40000000-0000-4000-8000-000000000003'
const contractIdThauNgoai1 = '50000000-0000-4000-8000-000000000002'
const contractIdThauNgoai2 = '50000000-0000-4000-8000-000000000003'
const multiDossierPartyId = '40000000-0000-4000-8000-000000000004'
const multiDossierContractId1 = '50000000-0000-4000-8000-000000000004'
const multiDossierContractId2 = '50000000-0000-4000-8000-000000000005'

const mockSubcontractorsList = financeSubcontractorListSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectAlpha,
  coverage: 'needs_reconciliation' as const,
  parties: [
    {
      party: {
        partyId: contractorPartyId,
        code: 'CT-YM',
        displayName: 'Nhà thầu kết cấu thép Yong Mei',
        partyKind: 'organization' as const,
      },
      contracts: [
        {
          id: contractIdAlpha,
          code: 'HD-YM-01',
          contractNo: 'YM-2026-01',
          contractName: 'Gia công lắp dựng kết cấu thép Yong Mei',
          contractDate: '2026-08-01',
          contractValue: '150000000.0000',
          currencyCode: 'VND',
          defaultRetentionRateBps: 500,
          isActive: true,
          version: 1,
          paidTotal: '107530000.0000',
          paidCount: 2,
          recordedRetentionTotal: '5376500.0000',
          recordedRetentionRowCount: 2,
        },
      ],
    },
    {
      party: {
        partyId: unresolvedContractorPartyId,
        code: 'CT-UNRESOLVED',
        displayName: 'Thầu ngoài',
        partyKind: 'crew' as const,
      },
      contracts: [
        {
          id: contractIdThauNgoai1,
          code: 'HD-UNRESOLVED-01',
          contractNo: null,
          contractName: 'Sửa tủ điện MPE',
          contractDate: null,
          contractValue: null,
          currencyCode: 'VND',
          defaultRetentionRateBps: null,
          isActive: true,
          version: 1,
          paidTotal: '45000000.0000',
          paidCount: 1,
          recordedRetentionTotal: null,
          recordedRetentionRowCount: 0,
        },
      ],
    },
    {
      party: {
        partyId: unresolvedContractorPartyId2,
        code: 'CT-TN-02',
        displayName: 'Thầu ngoài',
        partyKind: 'crew' as const,
      },
      contracts: [
        {
          id: contractIdThauNgoai2,
          code: 'HD-TN-02',
          contractNo: null,
          contractName: 'Lắp đặt đèn chiếu sáng sự cố',
          contractDate: null,
          contractValue: null,
          currencyCode: 'VND',
          defaultRetentionRateBps: null,
          isActive: true,
          version: 1,
          paidTotal: '18000000.0000',
          paidCount: 1,
          recordedRetentionTotal: null,
          recordedRetentionRowCount: 0,
        },
      ],
    },
    {
      party: {
        partyId: multiDossierPartyId,
        code: 'CT-MULTI',
        displayName: 'Đội thi công hoàn thiện Minh Long',
        partyKind: 'organization' as const,
      },
      contracts: [
        {
          id: multiDossierContractId1,
          code: 'HD-ML-01',
          contractNo: 'ML-2026-01',
          contractName: 'Ốp lát gạch men tầng 1-3',
          contractDate: '2026-07-15',
          contractValue: '60000000.0000',
          currencyCode: 'VND',
          defaultRetentionRateBps: null,
          isActive: true,
          version: 1,
          paidTotal: '25000000.0000',
          paidCount: 1,
          recordedRetentionTotal: null,
          recordedRetentionRowCount: 0,
        },
        {
          id: multiDossierContractId2,
          code: 'HD-ML-02',
          contractNo: null,
          contractName: 'Sơn bả tường ngoài trời',
          contractDate: null,
          contractValue: null,
          currencyCode: 'VND',
          defaultRetentionRateBps: null,
          isActive: true,
          version: 1,
          paidTotal: '15000000.0000',
          paidCount: 1,
          recordedRetentionTotal: null,
          recordedRetentionRowCount: 0,
        },
      ],
    },
  ],
})

const mockSubcontractorDetail = financeSubcontractorDetailSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectAlpha,
  party: {
    partyId: contractorPartyId,
    code: 'CT-YM',
    displayName: 'Nhà thầu kết cấu thép Yong Mei',
    partyKind: 'organization' as const,
  },
  contracts: [
    {
      id: contractIdAlpha,
      code: 'HD-YM-01',
      contractNo: 'YM-2026-01',
      contractName: 'Gia công lắp dựng kết cấu thép Yong Mei',
      contractDate: '2026-08-01',
      contractValue: '150000000.0000',
      currencyCode: 'VND',
      defaultRetentionRateBps: 500,
      isActive: true,
      version: 1,
      paidTotal: '107530000.0000',
      paidCount: 2,
      recordedRetentionTotal: '5376500.0000',
      recordedRetentionRowCount: 2,
    },
  ],
  payments: {
    rows: [
      {
        id: '70000000-0000-4000-8000-000000000001',
        contractId: contractIdAlpha,
        contractCode: 'HD-YM-01',
        contractNo: 'YM-2026-01',
        description: 'Gia công lắp dựng kết cấu thép đợt 1',
        paidAmount: '31200000.0000',
        warrantyRetentionAmount: '1560000.0000',
        retentionRateBps: 500,
        paymentDate: '2026-08-10',
        effectiveDate: '2026-08-10',
        dateSource: 'payment_date' as const,
        recordStatus: 'recorded' as const,
        reference: 'YM-01',
        sourceReference: null,
        note: 'Bảo hành 5%',
        createdAt: '2026-08-10T00:00:00.000Z',
        version: 0,
      },
      {
        id: '70000000-0000-4000-8000-000000000002',
        contractId: contractIdAlpha,
        contractCode: 'HD-YM-01',
        contractNo: 'YM-2026-01',
        description: 'Gia công lắp dựng kết cấu thép đợt 2',
        paidAmount: '76330000.0000',
        warrantyRetentionAmount: '3816500.0000',
        retentionRateBps: 500,
        paymentDate: null,
        effectiveDate: '2026-08-20',
        dateSource: 'created_at' as const,
        recordStatus: 'recorded' as const,
        reference: 'YM-02',
        sourceReference: null,
        note: 'Bảo hành 5%',
        createdAt: '2026-08-20T00:00:00.000Z',
        version: 0,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 25 as const,
      totalPages: 1,
      filteredCount: 2,
      fullCount: 2,
      filteredAmount: '107530000.0000',
      fullAmount: '107530000.0000',
    },
    recordedTotal: '107530000.0000',
    recordedCount: 2,
    recordedRetentionTotal: '5376500.0000',
    recordedRetentionRowCount: 2,
  },
})

const mockSubcontractAlphaDetail = financeSubcontractDetailSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectAlpha,
  party: {
    partyId: contractorPartyId,
    code: 'CT-YM',
    displayName: 'Nhà thầu kết cấu thép Yong Mei',
    partyKind: 'organization' as const,
  },
  contract: {
    id: contractIdAlpha,
    code: 'HD-YM-01',
    contractNo: 'YM-2026-01',
    contractName: 'Gia công lắp dựng kết cấu thép Yong Mei',
    contractDate: '2026-08-01',
    contractValue: '150000000.0000',
    currencyCode: 'VND',
    defaultRetentionRateBps: 500,
    isActive: true,
    version: 1,
    reference: 'REF-HD-01',
    sourceReference: null,
    note: 'Hợp đồng trọn gói',
    paidTotal: '107530000.0000',
    paidCount: 2,
    recordedRetentionTotal: '5376500.0000',
    recordedRetentionRowCount: 2,
    referenceHeadroom: '37093500.0000',
    referenceHeadroomReason: null,
  },
  payments: {
    rows: [
      {
        id: '70000000-0000-4000-8000-000000000001',
        contractId: contractIdAlpha,
        contractCode: 'HD-YM-01',
        contractNo: 'YM-2026-01',
        description: 'Gia công lắp dựng kết cấu thép đợt 1',
        paidAmount: '31200000.0000',
        warrantyRetentionAmount: '1560000.0000',
        retentionRateBps: 500,
        paymentDate: '2026-08-10',
        effectiveDate: '2026-08-10',
        dateSource: 'payment_date' as const,
        recordStatus: 'recorded' as const,
        reference: 'YM-01',
        sourceReference: null,
        note: 'Bảo hành 5%',
        createdAt: '2026-08-10T00:00:00.000Z',
        version: 0,
      },
      {
        id: '70000000-0000-4000-8000-000000000002',
        contractId: contractIdAlpha,
        contractCode: 'HD-YM-01',
        contractNo: 'YM-2026-01',
        description: 'Gia công lắp dựng kết cấu thép đợt 2',
        paidAmount: '76330000.0000',
        warrantyRetentionAmount: '3816500.0000',
        retentionRateBps: 500,
        paymentDate: null,
        effectiveDate: '2026-08-20',
        dateSource: 'created_at' as const,
        recordStatus: 'recorded' as const,
        reference: 'YM-02',
        sourceReference: null,
        note: 'Bảo hành 5%',
        createdAt: '2026-08-20T00:00:00.000Z',
        version: 0,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 25 as const,
      totalPages: 1,
      filteredCount: 2,
      fullCount: 2,
      filteredAmount: '107530000.0000',
      fullAmount: '107530000.0000',
    },
    recordedTotal: '107530000.0000',
    recordedCount: 2,
    recordedRetentionTotal: '5376500.0000',
    recordedRetentionRowCount: 2,
  },
})

test.describe('Director Project Finance UI', () => {
  test('renders Project Cost overview on /costs with four field mappings, reasons, and owner-advance disclosure', async ({ page }) => {
    let requestedFinances = false

    await page.route('**/api/companies/**/project-finances*', async (route) => {
      requestedFinances = true
      await route.fulfill({ json: mockProjectListResponse })
    })

    await page.goto('/costs')

    // Header copywriting
    await expect(page.getByRole('heading', { level: 1, name: 'Chi phí dự án' })).toBeVisible()
    await expect(page.getByText('Theo dõi giá trị công việc theo từng dự án.')).toBeVisible()
    expect(requestedFinances).toBe(true)

    // Alpha card: Active operational state (amber badge on right)
    const alphaCard = page.getByTestId(`project-cost-card-${projectIdAlpha}`)
    await expect(alphaCard).toBeVisible()
    await expect(alphaCard.getByText('Synthetic Project Alpha')).toBeVisible()
    await expect(alphaCard.getByText('C101-P1')).toBeVisible()
    await expect(alphaCard.getByTestId('project-operational-state')).toHaveText('Đang thực hiện')
    await expect(alphaCard.getByTestId('project-operational-state')).toHaveClass(/cockpit-badge--warning/)

    // 1. Position 1: Lợi nhuận tạm tính -> Chưa đủ dữ liệu + reasons
    await expect(alphaCard.getByText('Lợi nhuận tạm tính')).toBeVisible()
    await expect(alphaCard.getByTestId('total-tracked-value')).toContainText('Chưa đủ dữ liệu')
    await expect(alphaCard.getByTestId('margin-reasons')).toContainText('Cơ sở dự toán chưa xác nhận')

    // 2. Position 2: Dự toán được duyệt -> 300,000,000 VND
    await expect(alphaCard.getByText('Dự toán được duyệt')).toBeVisible()
    await expect(alphaCard.getByTestId('accepted-value')).toContainText('300,000,000 VND')

    // 3. Position 3: Chi phí -> 242,562,376 VND
    await expect(alphaCard.getByText('Chi phí', { exact: true })).toBeVisible()
    await expect(alphaCard.getByTestId('in-progress-value')).toContainText('242,562,376 VND')

    // 4. Position 4: Bảo hành đã ghi nhận -> 15,000,000 VND (1 khoản)
    await expect(alphaCard.getByText('Bảo hành đã ghi nhận')).toBeVisible()
    await expect(alphaCard.getByTestId('unknown-value')).toContainText('15,000,000 VND')
    await expect(alphaCard.getByTestId('unknown-count')).toContainText('(1 khoản)')

    // Beta card: USD summary currency verification and Completed operational state (green badge)
    const betaCard = page.getByTestId(`project-cost-card-${projectIdBeta}`)
    await expect(betaCard).toBeVisible()
    await expect(betaCard.getByText('Synthetic Project Beta')).toBeVisible()
    await expect(betaCard.getByTestId('project-operational-state')).toHaveText('Hoàn thành')
    await expect(betaCard.getByTestId('project-operational-state')).toHaveClass(/cockpit-badge--success/)
    await expect(betaCard.getByTestId('in-progress-value')).toContainText('USD')
    await expect(betaCard.getByTestId('in-progress-value')).not.toContainText('VND')
    // Recorded zero warranty retention: "0 USD (1 khoản)"
    await expect(betaCard.getByTestId('unknown-value')).toContainText('0 USD')
    await expect(betaCard.getByTestId('unknown-count')).toContainText('(1 khoản)')

    // Advance card: Paused operational state, distinct receipts card and provisional profit unavailable
    const advanceCard = page.getByTestId(`project-cost-card-${projectIdAdvance}`)
    await expect(advanceCard).toBeVisible()
    await expect(advanceCard.getByTestId('project-operational-state')).toHaveText('Tạm dừng')
    // Position 1 shows "Lợi nhuận tạm tính" with "Chưa đủ dữ liệu"
    await expect(advanceCard.getByText('Lợi nhuận tạm tính')).toBeVisible()
    await expect(advanceCard.getByTestId('total-tracked-value')).toContainText('Chưa đủ dữ liệu')
    // Position 2 shows "Thu từ chủ đầu tư" with receipt amount without persistent notice paragraph
    await expect(advanceCard.getByTestId('accepted-value')).toContainText('200,000,000 VND')
    await expect(advanceCard.getByTestId('owner-advance-notice')).toBeHidden()
    // Cost is needs_reconciliation -> "Chưa đối soát" concise badge + known subtotal amount without prefix
    await expect(advanceCard.getByTestId('cost-state-badge')).toHaveText('Chưa đối soát')
    await expect(advanceCard.getByTestId('in-progress-value')).toContainText('50,000,000 VND')
    await expect(page.getByText('Phần đã ghi nhận · Chưa đối soát:')).toBeHidden()

    // Provisional card: Provisional result headline verification
    const provisionalCard = page.getByTestId(`project-cost-card-${projectIdProvisional}`)
    await expect(provisionalCard).toBeVisible()
    await expect(provisionalCard.getByText('Lợi nhuận tạm tính')).toBeVisible()
    await expect(provisionalCard.getByTestId('total-tracked-value')).toContainText('45,000,000 VND')
    await expect(provisionalCard.getByTestId('headline-caption')).toContainText('Theo số đã thu')

    // Navigation to detail via card click
    await alphaCard.click()
    await expect(page).toHaveURL(`/costs/${projectIdAlpha}`)
  })

  test('accessible info disclosure with hover, keyboard focus, click toggle, and dismissibility without triggering card navigation', async ({ page }) => {
    await page.route('**/api/companies/**/project-finances*', async (route) => {
      await route.fulfill({ json: mockProjectListResponse })
    })

    await page.goto('/costs')

    const advanceCard = page.getByTestId(`project-cost-card-${projectIdAdvance}`)
    await expect(advanceCard).toBeVisible()

    const infoBtn = advanceCard.getByTestId('info-disclosure-btn')
    const popover = advanceCard.getByTestId('info-tooltip-popover')
    await expect(infoBtn).toBeVisible()
    await expect(popover).toBeHidden()

    // 1. Pointer hover shows compact tooltip only
    await infoBtn.hover()
    await expect(popover).toBeVisible()
    await expect(popover).toContainText('Số tham chiếu là khoản thu từ chủ đầu tư, không phải dự toán.')
    await expect(popover).not.toContainText('Theo sổ thu kế toán · Chưa đối soát ngân hàng')
    await page.screenshot({ path: 'test-results/gate-g-tooltip-active.png' })

    // Pointer leave hides explanation
    await page.mouse.move(0, 0)
    await expect(popover).toBeHidden()

    // 2. Keyboard focus shows explanation
    await infoBtn.focus()
    await expect(popover).toBeVisible()

    // Escape dismisses
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()

    // 3. Touch / Click toggles explanation without triggering card navigation
    await infoBtn.click()
    await expect(popover).toBeVisible()
    await expect(page).toHaveURL(/\/costs$/)

    // Clicking outside dismisses
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await expect(popover).toBeHidden()
  })

  test('renders Project Cost overview on /costs/:projectId with vertical column chart and category list', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewAlpha })
    })

    await page.goto(`/costs/${projectIdAlpha}`)

    // Header & metadata
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Alpha')
    await expect(page.getByText('C101-P1')).toBeVisible()
    await expect(page.getByTestId('detail-operational-state')).toHaveText('Đang thực hiện')

    // Summary metrics in detail: exactly 4 distinct KPI cards
    await expect(page.getByTestId('detail-provisional-profit-card')).toBeVisible()
    await expect(page.getByTestId('detail-total-tracked')).toContainText('Chưa đủ dữ liệu')
    await expect(page.getByTestId('detail-margin-reasons')).toContainText('Cơ sở dự toán chưa xác nhận')
    await expect(page.getByTestId('detail-accepted')).toContainText('300,000,000 VND')
    await expect(page.getByTestId('detail-in-progress')).toContainText('242,562,376 VND')
    await expect(page.getByTestId('detail-unknown')).toContainText('15,000,000 VND')
    await expect(page.getByTestId('detail-warranty-count')).toContainText('(1 khoản)')

    // Dual-chart and accessible categories table
    await expect(page.getByTestId('category-chart-wrapper')).toBeVisible()
    await expect(page.getByTestId('dual-chart-grid')).toBeVisible()
    await expect(page.getByTestId('category-chart-canvas')).toBeVisible()
    await expect(page.getByTestId('category-donut-canvas')).toBeVisible()
    await expect(page.getByText('Tỷ trọng số liệu hiển thị')).toBeVisible()
    await expect(page.getByTestId('category-chart-count-badge')).toHaveText('2 danh mục có số liệu')
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Danh mục' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Số tiền ghi nhận' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Trạng thái' })).toBeVisible()

    // Chart direct click on column navigates to category detail page
    const chartBar = page.locator('[data-testid="category-chart-canvas"] .echarts-wrapper svg path[stroke="#2563eb"]').last()
    await chartBar.click({ force: true })
    await expect(page).toHaveURL(new RegExp(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`))

    // Back link on category page navigates back to project
    await page.getByTestId('back-to-project-link').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectIdAlpha}$`))

    // Real link in table navigates to category detail page
    const catLink = page.getByTestId(`category-link-${categoryIdSub}`)
    await expect(catLink).toBeVisible()
    await catLink.click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectIdAlpha}/categories/${categoryIdSub}`))

    // Back link on category page navigates back to project
    await page.getByTestId('back-to-project-link').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectIdAlpha}$`))

    // Back link on project navigates to /costs
    const backLink = page.getByTestId('project-cost-detail').getByRole('link', { name: 'Quay lại danh sách chi phí dự án' })
    await expect(backLink).toHaveAttribute('href', '/costs')
  })

  test('renders four distinct KPI cards on detail for owner receipts project without collapsing', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAdvance}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewAdvance })
    })

    await page.goto(`/costs/${projectIdAdvance}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Advance')
    await expect(page.getByTestId('detail-operational-state')).toHaveText('Tạm dừng')

    // Always four distinct KPI cards in grid: Lợi nhuận tạm tính | Thu từ chủ đầu tư | Chi phí | Bảo hành
    await expect(page.getByTestId('detail-provisional-profit-card')).toBeVisible()
    await expect(page.getByTestId('detail-receipts-card')).toBeVisible()
    await expect(page.getByTestId('detail-cost-card')).toBeVisible()
    await expect(page.getByTestId('detail-warranty-card')).toBeVisible()

    // Position 1 shows "Lợi nhuận tạm tính" with "Chưa đủ dữ liệu"
    await expect(page.getByTestId('detail-total-tracked')).toContainText('Chưa đủ dữ liệu')

    // Position 2 shows "Thu từ chủ đầu tư" with receipt amount
    await expect(page.getByTestId('detail-accepted')).toContainText('200,000,000 VND')

    // Position 3 shows "Chi phí" with no duplicate subline
    await expect(page.getByTestId('detail-in-progress')).toContainText('50,000,000 VND')
    await expect(page.getByTestId('detail-known-subtotal')).toHaveCount(0)

    // Position 4 shows "Bảo hành đã ghi nhận"
    await expect(page.getByTestId('detail-unknown')).toContainText('Chưa đối soát')

    // Detail info disclosure button shows compact tooltip
    const detailInfoBtn = page.getByTestId('detail-info-disclosure-btn')
    const detailPopover = page.getByTestId('detail-info-tooltip-popover')
    await expect(detailInfoBtn).toBeVisible()
    await expect(detailPopover).toBeHidden()

    await detailInfoBtn.click()
    await expect(detailPopover).toBeVisible()
    await expect(detailPopover).toContainText('Số tham chiếu là khoản thu từ chủ đầu tư, không phải dự toán.')
    await expect(detailPopover).not.toContainText('Theo sổ thu kế toán · Chưa đối soát ngân hàng')

    await page.keyboard.press('Escape')
    await expect(detailPopover).toBeHidden()
  })

  test('renders provisional result headline and displayed basis on detail page', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdProvisional}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewProvisional })
    })

    await page.goto(`/costs/${projectIdProvisional}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Provisional')
    await expect(page.getByTestId('detail-operational-state')).toHaveText('Đang thực hiện')
    await expect(page.getByText('Lợi nhuận tạm tính')).toBeVisible()
    await expect(page.getByTestId('detail-total-tracked')).toContainText('45,000,000 VND')
    await expect(page.getByTestId('detail-headline-caption')).toContainText('Theo số đã thu')
  })

  test('renders Project Cost detail for USD project with correct summary currency', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdBeta}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewBeta })
    })

    await page.goto(`/costs/${projectIdBeta}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Beta')
    const detailCost = page.getByTestId('detail-in-progress')
    await expect(detailCost).toContainText('USD')
    await expect(detailCost).not.toContainText('VND')
  })

  test('preserves Cost Source overview on /costs/sources', async ({ page }) => {
    await page.route('**/api/companies/**/cost-sources', async (route) => {
      await route.fulfill({
        json: {
          projects: [{ project: { id: projectIdAlpha, code: 'P-1', name: 'Dự án nguồn mẫu' }, engagements: [], sourceCount: 2, figureCount: 3, latestObservedAt: '2026-09-14T00:00:00.000Z', openIssueCount: 1, mappingState: 'pending' }],
          unassigned: { sourceCount: 0, figureCount: 0, latestObservedAt: null },
          sourceCount: 2,
          figureCount: 3,
          openIssueCount: 1,
        },
      })
    })

    await page.goto('/costs/sources')
    await expect(page.getByRole('heading', { level: 1, name: 'Dữ liệu nguồn chi phí' })).toBeVisible()
    await expect(page.getByText('Dự án nguồn mẫu')).toBeVisible()
    await expect(page.getByRole('link', { name: /Dự án nguồn mẫu/i })).toHaveAttribute('href', `/costs/projects/${projectIdAlpha}`)
  })

  test('Cost Source detail has back link returning to /costs/sources', async ({ page }) => {
    await page.route('**/api/companies/**/cost-sources/projects/**', async (route) => {
      await route.fulfill({
        json: {
          project: { id: projectIdAlpha, code: 'P-1', name: 'Dự án nguồn mẫu' },
          engagements: [],
        },
      })
    })
    await page.route('**/api/companies/**/cost-sources/projects/**/figures**', async (route) => {
      await route.fulfill({ json: { items: [], nextCursor: null } })
    })

    await page.goto(`/costs/projects/${projectIdAlpha}`)
    const backLink = page.getByRole('link', { name: /Dữ liệu nguồn chi phí/i })
    await expect(backLink).toHaveAttribute('href', '/costs/sources')
  })

  test('handles company switching and cancels stale in-flight response', async ({ page, authState }) => {
    const company1Id = '10000000-0000-4000-8000-000000000002'
    const company2Id = '10000000-0000-4000-8000-000000000003'

    authState.sessionCompanies = [
      createCompany({ companyId: company1Id, companyName: 'Công ty Alpha' }),
      createCompany({ companyId: company2Id, companyName: 'Công ty Beta' }),
    ]

    let resolveCompany1: ((value: unknown) => void) | null = null

    await page.route(`**/api/companies/${company1Id}/project-finances*`, async (route) => {
      await new Promise(resolve => { resolveCompany1 = resolve })
      await route.fulfill({ json: mockProjectListResponse })
    })

    await page.route(`**/api/companies/${company2Id}/project-finances*`, async (route) => {
      await route.fulfill({ json: mockCompany2ProjectListResponse })
    })

    await page.goto('/costs')
    // While company 1 is pending, switch to company 2
    const companySelect = page.getByLabel('Chuyển công ty')
    await companySelect.selectOption(company2Id)
    await expect(page).toHaveURL(/\/projects$/)
    resolveCompany1?.(null)

    await page.goto('/costs')
    await expect(page.getByText('Project for Company Beta Only')).toBeVisible()
    await expect(page.getByText('Synthetic Project Alpha')).toHaveCount(0)
  })

  test('renders error, permission, and empty states gracefully', async ({ page }) => {
    // Empty state
    await page.route('**/api/companies/**/project-finances*', async (route) => {
      await route.fulfill({ json: mockEmptyProjectListResponse })
    })
    await page.goto('/costs')
    await expect(page.getByText('Chưa có chi phí dự án')).toBeVisible()

    // Error / retry state
    await page.route('**/api/companies/**/project-finances*', async (route) => {
      await route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống' } })
    })
    await page.reload()
    await expect(page.getByText('Không thể tải dữ liệu')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
  })

  test('detail handles 404 RESOURCE_NOT_FOUND gracefully', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Không tìm thấy chi phí dự án',
            requestId: '10000000-0000-4000-8000-000000000999',
            details: {},
          },
        }),
      })
    })
    await page.goto(`/costs/${projectIdAlpha}`)
    await expect(page.getByText('Không tìm thấy dữ liệu chi phí dự án')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Quay lại danh sách chi phí dự án' })).toBeVisible()
  })

  test('responsive and accessibility checks on desktop and mobile for project and category pages', async ({ page }) => {
    await page.route('**/api/companies/**/project-finances*', async (route) => {
      await route.fulfill({ json: mockProjectListResponse })
    })
    await page.route(`**/api/companies/**/projects/${projectIdBeta}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewBeta })
    })
    await page.route(`**/api/companies/**/projects/${projectIdBeta}/finance/items/${item2Id}/details*`, async (route) => {
      await route.fulfill({ json: mockItem2Details })
    })

    // Directory Desktop 1440
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/costs')
    await expect(page.getByRole('heading', { level: 1, name: 'Chi phí dự án' })).toBeVisible()
    await page.screenshot({ path: 'test-results/gate-g-overview-1440.png', fullPage: true })
    let violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Directory Mobile 390
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/gate-g-overview-390.png', fullPage: true })
    violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Detail Desktop 1440
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/costs/${projectIdBeta}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('category-chart-wrapper')).toBeVisible()
    await page.screenshot({ path: 'test-results/gate-g-detail-1440.png', fullPage: true })
    violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Detail Mobile 390
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/gate-g-detail-390.png', fullPage: true })
    violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Category Desktop 1440
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/costs/${projectIdBeta}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('category-heading')).toBeVisible()
    await page.screenshot({ path: 'test-results/gate-g-category-1440.png', fullPage: true })
    violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Category Mobile 390
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/gate-g-category-390.png', fullPage: true })
    violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])
  })

  test('renders ordinary category page with breadcrumbs, detail rows, and back navigation', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewAlpha })
    })
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      await route.fulfill({ json: mockItem1Details })
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)

    // Breadcrumbs
    await expect(page.getByTestId('breadcrumb-project-link')).toHaveText('Synthetic Project Alpha')
    await expect(page.getByTestId('breadcrumb-category-current')).toHaveText('Vật liệu')

    // Heading
    await expect(page.getByTestId('category-heading')).toHaveText('Vật liệu')
    await expect(page.getByTestId('category-subtotal-value')).toContainText('120,000,000 VND')

    // Details table
    const detailTable = page.getByTestId('ordinary-detail-table')
    await expect(detailTable).toBeVisible()

    // Opening balance row
    await expect(detailTable.getByText('Số liệu ban đầu')).toBeVisible()
    await expect(detailTable.getByText('Số dư đầu kỳ cọc khoan nhồi')).toBeVisible()
    await expect(detailTable.getByText('OB-01')).toBeVisible()

    // Line item row
    await expect(detailTable.getByText('Khoan cọc thí nghiệm D800')).toBeVisible()
    await expect(detailTable.getByText('70,000,000 VND')).toBeVisible()
    await expect(detailTable.getByText('15/08/2026')).toBeVisible()

    // Back link navigates to project
    await page.getByTestId('back-to-project-link').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectIdAlpha}$`))
  })

  test('ordinary category detail error allows retry', async ({ page }) => {
    let attempt = 0
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewAlpha })
    })
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      attempt++
      if (attempt === 1) {
        await route.fulfill({ status: 500, json: { message: 'Internal error' } })
      }
      else {
        await route.fulfill({ json: mockItem1Details })
      }
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)

    const retryBtn = page.getByTestId(`retry-details-${item1Id}`)
    await expect(retryBtn).toBeVisible()
    await retryBtn.click()

    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()
    await expect(page.getByText('Khoan cọc thí nghiệm D800')).toBeVisible()
  })

  test('subcontract labor category renders contractor list, null-contract display, and payment ledger', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewAlpha })
    })
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/subcontractors`, async (route) => {
      await route.fulfill({ json: mockSubcontractorsList })
    })
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/subcontractors/${contractorPartyId}*`, async (route) => {
      await route.fulfill({ json: mockSubcontractorDetail })
    })
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/subcontracts/${contractIdAlpha}*`, async (route) => {
      await route.fulfill({ json: mockSubcontractAlphaDetail })
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdSub}`)

    // Heading and metric
    await expect(page.getByTestId('category-heading')).toHaveText('Nhân công thầu phụ')
    await expect(page.getByTestId('category-subtotal-value')).toContainText('107,530,000 VND')

    // Subcontractors table and distinct contractor count
    const table = page.getByTestId('subcontractor-table')
    await expect(table).toBeVisible()
    await expect(page.getByText('4 nhà thầu')).toBeVisible()

    // Verify 6 column headers and their text alignment
    const ths = table.locator('thead th')
    await expect(ths).toHaveCount(6)
    await expect(ths.nth(0)).toContainText('Thầu')
    await expect(ths.nth(1)).toContainText('Nội dung')
    await expect(ths.nth(2)).toContainText('Hợp đồng')
    await expect(ths.nth(3)).toContainText('Chi/ứng đã ghi nhận')
    await expect(ths.nth(4)).toContainText('Bảo hành')
    await expect(ths.nth(5)).toContainText('Xem chi tiết')

    await expect(ths.nth(0)).toHaveCSS('text-align', 'left')
    await expect(ths.nth(1)).toHaveCSS('text-align', 'left')
    await expect(ths.nth(2)).toHaveCSS('text-align', 'left')
    await expect(ths.nth(3)).toHaveCSS('text-align', 'right')
    await expect(ths.nth(4)).toHaveCSS('text-align', 'right')
    await expect(ths.nth(5)).toHaveCSS('text-align', 'center')

    // 1. Yong Mei contractor with contract
    const ymRow = page.getByTestId(`contractor-row-${contractIdAlpha}`)
    await expect(ymRow).toBeVisible()
    const ymCells = ymRow.locator('td')
    await expect(ymCells.nth(0)).toContainText('Nhà thầu kết cấu thép Yong Mei')
    await expect(ymCells.nth(0)).toContainText('CT-YM')
    await expect(ymCells.nth(1)).toContainText('Gia công lắp dựng kết cấu thép Yong Mei')
    await expect(ymCells.nth(2)).toContainText('YM-2026-01')
    await expect(ymCells.nth(2)).toContainText('(150,000,000 VND)')
    await expect(ymCells.nth(3)).toContainText('107,530,000 VND')
    await expect(ymCells.nth(4)).toContainText('5,376,500 VND')
    await expect(ymCells.nth(0)).toHaveCSS('text-align', 'left')
    await expect(ymCells.nth(1)).toHaveCSS('text-align', 'left')
    await expect(ymCells.nth(2)).toHaveCSS('text-align', 'left')
    await expect(ymCells.nth(3)).toHaveCSS('text-align', 'right')
    await expect(ymCells.nth(4)).toHaveCSS('text-align', 'right')
    await expect(ymCells.nth(5)).toHaveCSS('text-align', 'center')

    // 2. Unresolved contractor 1: "Thầu ngoài", work content in separate column, null contract metadata
    const unresRow1 = page.getByTestId(`contractor-row-${contractIdThauNgoai1}`)
    await expect(unresRow1).toBeVisible()
    const unresCells1 = unresRow1.locator('td')
    await expect(unresCells1.nth(0)).toContainText('Thầu ngoài')
    await expect(unresCells1.nth(0)).toContainText('CT-UNRESOLVED')
    await expect(unresCells1.nth(1)).toContainText('Sửa tủ điện MPE')
    await expect(unresCells1.nth(2)).toContainText('Chưa nhập hợp đồng')
    await expect(unresCells1.nth(2)).toContainText('(—)')
    await expect(unresCells1.nth(3)).toContainText('45,000,000 VND')
    await expect(unresCells1.nth(4)).toContainText('—')
    await expect(unresCells1.nth(4)).toHaveCSS('text-align', 'right')

    // 3. Unresolved contractor 2: Second "Thầu ngoài" remains independent row
    const unresRow2 = page.getByTestId(`contractor-row-${contractIdThauNgoai2}`)
    await expect(unresRow2).toBeVisible()
    const unresCells2 = unresRow2.locator('td')
    await expect(unresCells2.nth(0)).toContainText('Thầu ngoài')
    await expect(unresCells2.nth(0)).toContainText('CT-TN-02')
    await expect(unresCells2.nth(1)).toContainText('Lắp đặt đèn chiếu sáng sự cố')
    await expect(unresCells2.nth(2)).toContainText('Chưa nhập hợp đồng')
    await expect(unresCells2.nth(3)).toContainText('18,000,000 VND')

    // 4. Multi-dossier contractor: Two dossiers rendered on separate rows with individual totals
    const multiRow1 = page.getByTestId(`contractor-row-${multiDossierContractId1}`)
    await expect(multiRow1).toBeVisible()
    await expect(multiRow1.locator('td').nth(0)).toContainText('Đội thi công hoàn thiện Minh Long')
    await expect(multiRow1.locator('td').nth(1)).toContainText('Ốp lát gạch men tầng 1-3')
    await expect(multiRow1.locator('td').nth(2)).toContainText('ML-2026-01')
    await expect(multiRow1.locator('td').nth(3)).toContainText('25,000,000 VND')

    const multiRow2 = page.getByTestId(`contractor-row-${multiDossierContractId2}`)
    await expect(multiRow2).toBeVisible()
    await expect(multiRow2.locator('td').nth(0)).toContainText('Đội thi công hoàn thiện Minh Long')
    await expect(multiRow2.locator('td').nth(1)).toContainText('Sơn bả tường ngoài trời')
    await expect(multiRow2.locator('td').nth(2)).toContainText('Chưa nhập hợp đồng')
    await expect(multiRow2.locator('td').nth(3)).toContainText('15,000,000 VND')

    // Screenshot desktop category table
    await page.screenshot({ path: 'test-results/gate-g-subcontract-category-1440.png', fullPage: true })

    // Click "Xem đợt thanh toán" on Yong Mei
    await page.getByTestId(`view-contractor-btn-${contractIdAlpha}`).click()
    await expect(page).toHaveURL(new RegExp(`contractId=${contractIdAlpha}`))

    // Reconciliation banner is visible
    await expect(page.getByTestId('subcontract-reconciliation-banner')).toBeVisible()
    await expect(page.getByText('Chưa đối soát đầy đủ:')).toBeVisible()

    // Payment vouchers table is rendered
    const paymentsTable = page.getByTestId('payments-table')
    await expect(paymentsTable.getByText('Gia công lắp dựng kết cấu thép đợt 1')).toBeVisible()
    await expect(paymentsTable.getByText('31,200,000 VND')).toBeVisible()
    await expect(paymentsTable.getByText('1,560,000 VND')).toBeVisible()
    await expect(paymentsTable.getByText('(5%)').first()).toBeVisible()
    await expect(paymentsTable.getByText('Gia công lắp dựng kết cấu thép đợt 2')).toBeVisible()
    await expect(paymentsTable.getByText('76,330,000 VND')).toBeVisible()
    await expect(paymentsTable.getByText('Ngày nhập hệ thống')).toBeVisible()

    // Back to contractors clears contractId/partyId query
    await page.getByTestId('back-to-contractors-btn').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectIdAlpha}/categories/${categoryIdSub}$`))
    await expect(page.getByTestId('subcontractor-table')).toBeVisible()

    // Responsive Mobile 390px view verification
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('subcontractor-desktop-table')).not.toBeVisible()
    const mobileCards = page.getByTestId('subcontractor-mobile-cards')
    await expect(mobileCards).toBeVisible()

    // Check mobile card for unresolved contractor with "Nội dung" field
    const mobileCardThauNgoai = page.getByTestId(`contractor-card-${contractIdThauNgoai1}`)
    await expect(mobileCardThauNgoai).toBeVisible()
    await expect(mobileCardThauNgoai.getByText('Thầu ngoài')).toBeVisible()
    await expect(mobileCardThauNgoai.getByText('Sửa tủ điện MPE')).toBeVisible()
    await expect(mobileCardThauNgoai.getByText('Chưa nhập hợp đồng')).toBeVisible()
    await expect(mobileCardThauNgoai.getByText('45,000,000 VND')).toBeVisible()

    // Check no horizontal page-level overflow
    await expect.poll(() => page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)

    // Screenshot mobile category cards
    await page.screenshot({ path: 'test-results/gate-g-subcontract-category-390.png', fullPage: true })

    // Restore desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('valid empty project renders 200 with honest empty and not_recorded states', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdEmpty}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewEmpty })
    })

    await page.goto(`/costs/${projectIdEmpty}`)

    // Project is valid and rendered
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Empty')

    // Empty project shows not_recorded metrics
    await expect(page.getByTestId('detail-total-tracked')).toContainText('Chưa đủ dữ liệu')
    await expect(page.getByTestId('detail-accepted')).toContainText('Chưa ghi nhận')
    await expect(page.getByTestId('detail-in-progress')).toContainText('Chưa ghi nhận')
    await expect(page.getByTestId('detail-unknown')).toContainText('Chưa ghi nhận')

    // Empty categories message
    await expect(page.getByText('Chưa có hạng mục chi phí')).toBeVisible()
  })

  test('honest empty state for category with itemId null, and 404 for unknown category', async ({ page }) => {
    const mockOverviewWithEmptyCat = {
      ...mockOverviewAlpha,
      categories: [
        ...mockOverviewAlpha.categories,
        {
          categoryId: '77777777-7777-4777-8777-777777777777',
          code: 'other',
          name: 'Chi phí khác',
          displayOrder: 3,
          isActive: true,
          itemId: null,
          description: null,
          businessReference: null,
          cost: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
          detailCount: 0,
          latestRecordedDate: null,
          latestRecordedDateSource: null,
          warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
          recordedPaymentsTotal: null,
          recordedPaymentCount: 0,
          legacyReconciliationRequired: false,
        },
      ],
    }

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewWithEmptyCat })
    })

    // Category with itemId null: honest empty state, not false 404
    await page.goto(`/costs/${projectIdAlpha}/categories/77777777-7777-4777-8777-777777777777`)
    await expect(page.getByTestId('category-empty-panel')).toBeVisible()
    await expect(page.getByText('Chưa có hạng mục chi phí')).toBeVisible()

    // Unknown category: 404 state
    await page.goto(`/costs/${projectIdAlpha}/categories/00000000-0000-4000-8000-000000000999`)
    await expect(page.getByText('Không tìm thấy danh mục chi phí')).toBeVisible()
  })

  test('vertical column chart excludes exact-zero category from chart and table, while preserving direct URL navigation to hidden zero category', async ({ page }) => {
    const zeroCategoryId = '88888888-8888-4888-8888-888888888888'
    const mockOverviewWithZero = {
      ...mockOverviewAlpha,
      categories: [
        ...mockOverviewAlpha.categories,
        {
          categoryId: zeroCategoryId,
          code: 'machinery',
          name: 'Máy thi công',
          displayOrder: 3,
          isActive: true,
          itemId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          description: null,
          businessReference: null,
          cost: { state: 'recorded' as const, amount: '0.0000', recordedCount: 1 },
          detailCount: 1,
          latestRecordedDate: '2026-09-05',
          latestRecordedDateSource: 'business_date' as const,
          warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
          recordedPaymentsTotal: null,
          recordedPaymentCount: 0,
          legacyReconciliationRequired: false,
        },
      ],
    }

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewWithZero })
    })

    await page.goto(`/costs/${projectIdAlpha}`)

    // Only the 2 non-zero categories plotted
    await expect(page.getByTestId('category-chart-count-badge')).toHaveText('2 danh mục có số liệu')

    // Table has rows for Materials and Subcontract, but NOT for zero category
    await expect(page.getByTestId(`category-list-row-${categoryIdMat}`)).toBeVisible()
    await expect(page.getByTestId(`category-list-row-${categoryIdSub}`)).toBeVisible()
    await expect(page.getByTestId(`category-list-row-${zeroCategoryId}`)).toHaveCount(0)

    // Direct navigation to the hidden zero category still works
    await page.goto(`/costs/${projectIdAlpha}/categories/${zeroCategoryId}`)
    await expect(page.getByTestId('category-heading')).toHaveText('Máy thi công')
    await expect(page.getByTestId('category-subtotal-value')).toContainText('0 VND')
  })

  test('all categories exact zero displays compact empty state on project overview', async ({ page }) => {
    const mockAllZeroOverview = {
      ...mockOverviewAlpha,
      categories: [
        {
          categoryId: '88888888-8888-4888-8888-888888888881',
          code: 'materials',
          name: 'Vật liệu',
          displayOrder: 1,
          isActive: true,
          itemId: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
          description: null,
          businessReference: null,
          cost: { state: 'recorded' as const, amount: '0.0000', recordedCount: 1 },
          detailCount: 1,
          latestRecordedDate: null,
          latestRecordedDateSource: null,
          warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
          recordedPaymentsTotal: null,
          recordedPaymentCount: 0,
          legacyReconciliationRequired: false,
        },
        {
          categoryId: '88888888-8888-4888-8888-888888888882',
          code: 'machinery',
          name: 'Máy thi công',
          displayOrder: 2,
          isActive: true,
          itemId: 'ffffffff-ffff-4fff-8fff-fffffffffff2',
          description: null,
          businessReference: null,
          cost: { state: 'recorded' as const, amount: '0.0000', recordedCount: 1 },
          detailCount: 1,
          latestRecordedDate: null,
          latestRecordedDateSource: null,
          warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
          recordedPaymentsTotal: null,
          recordedPaymentCount: 0,
          legacyReconciliationRequired: false,
        },
      ],
    }

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockAllZeroOverview })
    })

    await page.goto(`/costs/${projectIdAlpha}`)

    // Shows compact empty state "Chưa có danh mục chi phí khác 0."
    await expect(page.getByTestId('chart-all-zero-state')).toBeVisible()
    await expect(page.getByText('Chưa có danh mục chi phí khác 0.')).toBeVisible()

    // Table is not rendered
    await expect(page.locator('.category-list-table')).toHaveCount(0)
  })

  test('synthetic profit arithmetic: 1000 - 600 - 50 = 350, negative profit stays negative and red', async ({ page }) => {
    const projectIdSynth = '10000000-0000-4000-8000-000000000199'
    const mockOverviewSynth = financeOverviewSchema.parse({
      schemaVersion: 1 as const,
      project: {
        projectId: projectIdSynth,
        projectCode: 'SYNTH-01',
        projectName: 'Synthetic Profit Arithmetic Project',
        currencyCode: 'VND',
        moneyScale: 0,
        timeZone: 'Asia/Ho_Chi_Minh',
        operationalState: 'active' as const,
      },
      summary: {
        budget: { state: 'recorded' as const, amount: '1000.0000', recordedCount: 1 },
        ownerAdvances: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
        cost: { state: 'recorded' as const, amount: '600.0000', recordedCount: 1, knownSubtotal: '600.0000' },
        warrantyRetention: { state: 'recorded' as const, amount: '50.0000', recordedCount: 1 },
        reference: { kind: 'approved_budget' as const, amount: '1000.0000' },
        margin: { state: 'unavailable' as const, amount: null, reasons: [] },
        management: {
          receipts: { state: 'recorded' as const, amount: '1000.0000', recordedCount: 1, origin: 'canonical_ledger' as const, quality: 'accounting_source_unverified' as const, coverage: 'recorded_rows_only' as const, sourceReferences: [] },
          reference: { kind: 'owner_receipts' as const, amount: '1000.0000', basis: 'recorded_owner_receipts' as const },
          result: {
            state: 'provisional' as const,
            amount: '350.0000',
            basis: 'owner_receipts' as const,
            components: { receipts: '1000.0000', cost: '600.0000', independentlyHeldRetention: '50.0000' },
            reasons: [],
          },
          headline: { kind: 'provisional_result' as const, amount: '350.0000', basis: 'provisional_owner_receipts_result' as const },
        },
        issues: [],
      },
      categories: [
        {
          categoryId: '33333333-3333-4333-8333-333333333331',
          code: 'materials',
          name: 'Vật liệu',
          displayOrder: 1,
          isActive: true,
          itemId: '33333333-3333-4333-8333-333333333332',
          description: null,
          businessReference: null,
          cost: { state: 'recorded' as const, amount: '600.0000', recordedCount: 1 },
          detailCount: 1,
          latestRecordedDate: null,
          latestRecordedDateSource: null,
          warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
          recordedPaymentsTotal: null,
          recordedPaymentCount: 0,
          legacyReconciliationRequired: false,
        },
      ],
    })

    await page.route(`**/api/companies/**/projects/${projectIdSynth}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewSynth })
    })

    await page.goto(`/costs/${projectIdSynth}`)
    const profitCard = page.getByTestId('detail-provisional-profit-card')
    await expect(profitCard).toBeVisible()
    await expect(profitCard.getByText('Lợi nhuận tạm tính')).toBeVisible()
    await expect(profitCard.getByTestId('detail-total-tracked')).toContainText('350 VND')

    // Now test negative profit: 500 - 600 - 50 = -150
    const mockOverviewNegative = {
      ...mockOverviewSynth,
      summary: {
        ...mockOverviewSynth.summary,
        management: {
          ...mockOverviewSynth.summary.management,
          result: {
            state: 'provisional' as const,
            amount: '-150.0000',
            basis: 'owner_receipts' as const,
            components: { receipts: '500.0000', cost: '600.0000', independentlyHeldRetention: '50.0000' },
            reasons: [],
          },
        },
      },
    }

    await page.route(`**/api/companies/**/projects/${projectIdSynth}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewNegative })
    })

    await page.reload()
    const negProfitCard = page.getByTestId('detail-provisional-profit-card')
    await expect(negProfitCard.getByTestId('detail-total-tracked')).toContainText('-150 VND')
    await expect(negProfitCard.getByTestId('detail-total-tracked')).toHaveClass(/is-negative-value/)
  })

  test('donut chart renders and navigates to category detail on slice click', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewAlpha })
    })

    await page.goto(`/costs/${projectIdAlpha}`)
    await expect(page.getByTestId('category-donut-canvas')).toBeVisible()
    await expect(page.getByText('Tỷ trọng số liệu hiển thị')).toBeVisible()

    // Click on top layer of Materials donut slice
    const donutSlice = page.locator('[data-testid="category-donut-canvas"] .echarts-wrapper svg path[stroke="#2563eb"][d*="A"]').last()
    await donutSlice.click({ force: true })
    await expect(page).toHaveURL(new RegExp(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`))
  })
})
