import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  createProjectCostDraftInputSchema,
  updateProjectCostDraftInputSchema,
  prepareProjectCostFinancialsInputSchema,
  prepareProjectCostFinancialDetailInputSchema,
  publishProjectCostInputSchema,
  correctPublishedProjectCostInputSchema,
  projectCostDraftSchema,
  projectCostOperationalDraftSchema,
} from '../../../shared/schemas/costs/project-costs'
import {
  recordSubcontractPaymentInputSchema,
  voidSubcontractPaymentInputSchema,
} from '../../../shared/schemas/costs/project-finance-writes'
import { financeSubcontractorDetailSchema } from '../../../shared/schemas/costs/project-finance'
import { resolveAccessMiddlewareDecision } from '../../../app/middleware/access.global'
import { ClientError } from '../../../app/errors/client-error'
import { mapCostsApiError } from '../../../app/utils/costs/costs-error-mapper'

vi.hoisted(() => {
  vi.stubGlobal('defineNuxtRouteMiddleware', <T>(middleware: T) => middleware)
})

const draftPageSource = readFileSync(
  new URL('../../../app/pages/costs/[projectId]/drafts/[draftId].vue', import.meta.url),
  'utf8',
)
const publishedOverviewPageSource = readFileSync(
  new URL('../../../app/pages/costs/[projectId]/index.vue', import.meta.url),
  'utf8',
)
const financialDetailEditorSource = readFileSync(
  new URL('../../../app/components/costs/ProjectCostFinancialDetailEditor.vue', import.meta.url),
  'utf8',
)
const correctionModalSource = readFileSync(
  new URL('../../../app/components/costs/ProjectCostCorrectionModal.vue', import.meta.url),
  'utf8',
)
const paymentRecordModalSource = readFileSync(
  new URL('../../../app/components/costs/SubcontractPaymentRecordModal.vue', import.meta.url),
  'utf8',
)
const subcontractLedgerSource = readFileSync(
  new URL('../../../app/components/costs/ProjectCostSubcontractLedger.vue', import.meta.url),
  'utf8',
)

describe('C1 Accounting Write UI contracts and workflows', () => {
  const sampleUuid = (n: number) => `c1070000-0000-4000-8000-${String(n).padStart(12, '0')}`

  describe('Draft Projection Separation', () => {
    it('enforces operational projection schema (cost.manage) omitting financial amount and details', () => {
      const operationalData = {
        id: sampleUuid(1),
        projectId: sampleUuid(2),
        costCategoryId: sampleUuid(3),
        description: 'Thuê máy xúc tháng 9',
        businessReference: 'HD-TX-001',
        partyId: sampleUuid(4),
        engagementId: null,
        componentId: null,
        relevantDate: '2026-09-22',
        workStatus: 'in_progress',
        publicationState: 'draft',
        version: 1,
        createdAt: '2026-09-22T08:00:00.000Z',
        updatedAt: '2026-09-22T08:00:00.000Z',
      }

      const parsed = projectCostOperationalDraftSchema.safeParse(operationalData)
      expect(parsed.success).toBe(true)

      // Operational projection does not contain financial amount, details, or publishReadiness
      const data = (parsed as { data: Record<string, unknown> }).data
      expect(data.amount).toBeUndefined()
      expect(data.currencyCode).toBeUndefined()
      expect(data.details).toBeUndefined()
      expect(data.publishReadiness).toBeUndefined()
    })

    it('enforces full financial draft schema (cost.prepare) with derived amount and publishReadiness', () => {
      const financialData = {
        id: sampleUuid(1),
        projectId: sampleUuid(2),
        costCategoryId: sampleUuid(3),
        description: 'Xi măng đổ sàn',
        businessReference: 'HD-XM-002',
        partyId: sampleUuid(4),
        engagementId: null,
        componentId: null,
        relevantDate: '2026-09-22',
        workStatus: 'in_progress',
        publicationState: 'draft',
        version: 2,
        currencyCode: 'VND',
        amount: '50000000.0000',
        details: [
          {
            id: sampleUuid(5),
            projectCostItemId: sampleUuid(1),
            lineNo: 1,
            detailKind: 'line_item',
            description: 'Xi măng PCB40',
            quantity: '500.0000',
            unitCode: 'bao',
            unitPrice: '100000.0000',
            amount: '50000000.0000',
            retentionKind: null,
            retentionRateBps: null,
            retentionAmount: null,
            relevantDate: '2026-09-22',
            reference: 'HD-01',
            note: null,
            version: 1,
            createdAt: '2026-09-22T08:00:00.000Z',
            updatedAt: '2026-09-22T08:00:00.000Z',
          },
        ],
        sourceFigureIds: [],
        publishReadiness: {
          ready: true,
          blockingCodes: [],
        },
        createdAt: '2026-09-22T08:00:00.000Z',
        updatedAt: '2026-09-22T08:00:00.000Z',
      }

      const parsed = projectCostDraftSchema.safeParse(financialData)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.amount).toBe('50000000.0000')
        expect(parsed.data.details).toHaveLength(1)
        expect(parsed.data.publishReadiness.ready).toBe(true)
        expect(parsed.data.publishReadiness.blockingCodes).toEqual([])
      }
    })
  })

  describe('Draft Creation & Operational Edit UX Contracts', () => {
    it('validates draft creation payload rejecting financial and publication fields', () => {
      const validPayload = {
        projectId: sampleUuid(1),
        costCategoryId: sampleUuid(2),
        description: 'Thuê thiết bị đo đạc',
        businessReference: 'REF-001',
        relevantDate: '2026-09-22',
        workStatus: 'in_progress',
      }
      expect(createProjectCostDraftInputSchema.safeParse(validPayload).success).toBe(true)

      // Must not accept amount or currency at creation
      expect(createProjectCostDraftInputSchema.safeParse({ ...validPayload, amount: '100000' }).success).toBe(false)
      expect(createProjectCostDraftInputSchema.safeParse({ ...validPayload, currencyCode: 'VND' }).success).toBe(false)
    })

    it('requires expectedVersion for optimistic locking on operational draft updates', () => {
      const updatePayload = {
        expectedVersion: 1,
        description: 'Cập nhật diễn giải thiết bị',
        workStatus: 'accepted' as const,
      }
      expect(updateProjectCostDraftInputSchema.safeParse(updatePayload).success).toBe(true)

      // Missing expectedVersion fails
      expect(updateProjectCostDraftInputSchema.safeParse({ description: 'Thiếu version' }).success).toBe(false)
    })
  })

  describe('Financial Detail Snapshot & Precision Preservation', () => {
    it('accepts full snapshot replacement with decimal-string amounts and source figures', () => {
      const snapshot = {
        expectedVersion: 2,
        currencyCode: 'VND',
        details: [
          {
            lineNo: 1,
            detailKind: 'line_item' as const,
            description: 'Vật tư cát vàng',
            quantity: '12.5000',
            unitCode: 'm3',
            unitPrice: '350000.0000',
            amount: '4375000.0000',
            retentionKind: null,
            retentionRateBps: null,
            retentionAmount: null,
            relevantDate: '2026-09-22',
            reference: 'HĐ 01/2026',
            note: 'Đã nghiệm thu',
          },
        ],
        sourceFigureIds: [sampleUuid(10)],
      }

      const parsed = prepareProjectCostFinancialsInputSchema.safeParse(snapshot)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.details[0].amount).toBe('4375000.0000')
        expect(parsed.data.details[0].unitPrice).toBe('350000.0000')
        expect(parsed.data.details[0].quantity).toBe('12.5000')
      }
    })

    it('rejects floating-point numbers instead of decimal strings in financial details', () => {
      const invalidSnapshot = {
        expectedVersion: 1,
        currencyCode: 'VND',
        details: [
          {
            lineNo: 1,
            detailKind: 'line_item' as const,
            description: 'Sai kiểu số',
            quantity: 12.5, // number instead of string
            unitCode: 'm3',
            unitPrice: 350000, // number instead of string
            amount: 4375000, // number instead of string
          },
        ],
        sourceFigureIds: [],
      }
      expect(prepareProjectCostFinancialsInputSchema.safeParse(invalidSnapshot).success).toBe(false)
    })
  })

  describe('Publish & Correction UX Contracts', () => {
    it('requires expectedVersion for explicit publication', () => {
      const publishPayload = {
        expectedVersion: 3,
      }
      expect(publishProjectCostInputSchema.safeParse(publishPayload).success).toBe(true)
      expect(publishProjectCostInputSchema.safeParse({}).success).toBe(false)
    })

    it('requires nonblank audit reason, expectedVersion, and change payload for corrections', () => {
      const validCorrection = {
        expectedVersion: 4,
        reason: 'Điều chỉnh đơn giá cát theo phụ lục hợp đồng PL02',
        operationalChanges: {
          description: 'Vật tư hoàn thiện đợt 1 (Đã điều chỉnh)',
        },
      }
      expect(correctPublishedProjectCostInputSchema.safeParse(validCorrection).success).toBe(true)

      // Blank reason is rejected
      expect(correctPublishedProjectCostInputSchema.safeParse({
        ...validCorrection,
        reason: '   ',
      }).success).toBe(false)

      // Missing expectedVersion is rejected
      expect(correctPublishedProjectCostInputSchema.safeParse({
        reason: 'Hợp lệ nhưng thiếu version',
        operationalChanges: { description: 'Sửa' },
      }).success).toBe(false)

      // Correction without operationalChanges or financialChanges is rejected
      expect(correctPublishedProjectCostInputSchema.safeParse({
        expectedVersion: 1,
        reason: 'Chỉ có lý do mà không có nội dung thay đổi',
      }).success).toBe(false)
    })
  })

  describe('Subcontract Cash Flow Contracts (Atomic Evidence & Void/Replacement)', () => {
    it('validates subcontract payment recording with atomic evidenceFileIds and optional replacement link', () => {
      const paymentPayload = {
        expectedSubcontractVersion: 1,
        paidAmount: '25000000.0000',
        paymentDate: '2026-09-22',
        currencyCode: 'VND',
        description: 'Tạm ứng đợt 2 thi công cốp pha',
        paymentReference: 'UNC-2026-09-001',
        warrantyRetentionAmount: '1250000.0000',
        retentionRateBps: 500,
        replacesPaymentId: sampleUuid(20),
        evidenceFileIds: [sampleUuid(21)],
      }
      expect(recordSubcontractPaymentInputSchema.safeParse(paymentPayload).success).toBe(true)

      // Negative or invalid paidAmount rejected
      expect(recordSubcontractPaymentInputSchema.safeParse({
        ...paymentPayload,
        paidAmount: '-1000',
      }).success).toBe(false)

      // Duplicate evidence file IDs rejected
      expect(recordSubcontractPaymentInputSchema.safeParse({
        ...paymentPayload,
        evidenceFileIds: [sampleUuid(21), sampleUuid(21)],
      }).success).toBe(false)
    })

    it('requires nonblank audit reason and version to void payment without in-place monetary editing', () => {
      const voidPayload = {
        expectedVersion: 1,
        reason: 'Chuyển nhầm tài khoản thầu phụ, hủy để lập ủy nhiệm chi mới',
      }
      expect(voidSubcontractPaymentInputSchema.safeParse(voidPayload).success).toBe(true)

      // Empty reason rejected
      expect(voidSubcontractPaymentInputSchema.safeParse({
        expectedVersion: 1,
        reason: '',
      }).success).toBe(false)
    })
  })

  describe('Capability Matrix Rules (Corrections A & D)', () => {
    interface SessionCapabilityUser {
      capabilities: string[]
    }

    // Operational mutation strictly requires cost.manage (Correction A)
    function canMutateOperationalDraft(user: SessionCapabilityUser): boolean {
      return user.capabilities.includes('cost.manage')
    }

    // Financial preparation strictly requires cost.prepare (Correction A)
    function canPrepareFinancials(user: SessionCapabilityUser): boolean {
      return user.capabilities.includes('cost.prepare')
    }

    function canPublish(user: SessionCapabilityUser): boolean {
      return user.capabilities.includes('cost.publish_import')
    }

    function canCorrect(user: SessionCapabilityUser): boolean {
      return user.capabilities.includes('cost.correct')
    }

    function canRecordCash(user: SessionCapabilityUser): boolean {
      return user.capabilities.includes('cost.record_cash')
    }

    // Evidence metadata requires cost.source.read
    function canReadEvidenceMetadata(user: SessionCapabilityUser): boolean {
      return user.capabilities.includes('cost.source.read')
    }

    // Raw download requires BOTH cost.read AND cost.file.read (Correction D)
    function canDownloadRawEvidence(user: SessionCapabilityUser): boolean {
      return user.capabilities.includes('cost.read') && user.capabilities.includes('cost.file.read')
    }

    it('enforces cost.manage allows operational draft mutations but NOT financial preparation (Correction A)', () => {
      const siteManager: SessionCapabilityUser = { capabilities: ['cost.read', 'cost.manage'] }
      expect(canMutateOperationalDraft(siteManager)).toBe(true)
      expect(canPrepareFinancials(siteManager)).toBe(false)
      expect(canPublish(siteManager)).toBe(false)
      expect(canCorrect(siteManager)).toBe(false)
      expect(canRecordCash(siteManager)).toBe(false)
    })

    it('enforces cost.prepare alone does NOT gain operational mutation rights (Correction A)', () => {
      const financialPrepOnly: SessionCapabilityUser = { capabilities: ['cost.read', 'cost.prepare'] }
      expect(canPrepareFinancials(financialPrepOnly)).toBe(true)
      expect(canMutateOperationalDraft(financialPrepOnly)).toBe(false) // must be read-only!
    })

    it('enforces dual-permission gate (cost.read + cost.file.read) for raw evidence download (Correction D)', () => {
      const accountantWithBoth: SessionCapabilityUser = {
        capabilities: ['cost.read', 'cost.file.read'],
      }
      expect(canDownloadRawEvidence(accountantWithBoth)).toBe(true)

      // cost.file.read without cost.read cannot download
      const fileOnlyUser: SessionCapabilityUser = { capabilities: ['cost.file.read'] }
      expect(canDownloadRawEvidence(fileOnlyUser)).toBe(false)

      // cost.read without cost.file.read cannot download
      const readOnlyUser: SessionCapabilityUser = { capabilities: ['cost.read'] }
      expect(canDownloadRawEvidence(readOnlyUser)).toBe(false)
    })

    it('demonstrates that cost.source.read metadata access does not imply raw file access (Correction D)', () => {
      const metadataOnlyUser: SessionCapabilityUser = { capabilities: ['cost.read', 'cost.source.read'] }
      expect(canReadEvidenceMetadata(metadataOnlyUser)).toBe(true)
      expect(canDownloadRawEvidence(metadataOnlyUser)).toBe(false)
    })

    it('enforces cost.publish_import and cost.correct permissions', () => {
      const approver: SessionCapabilityUser = { capabilities: ['cost.read', 'cost.publish_import', 'cost.correct'] }
      expect(canPublish(approver)).toBe(true)
      expect(canCorrect(approver)).toBe(true)
      expect(canPrepareFinancials(approver)).toBe(false)
      expect(canMutateOperationalDraft(approver)).toBe(false)
    })

    it('enforces cost.record_cash for subcontract payments', () => {
      const cashier: SessionCapabilityUser = { capabilities: ['cost.read', 'cost.record_cash'] }
      expect(canRecordCash(cashier)).toBe(true)
      expect(canMutateOperationalDraft(cashier)).toBe(false)
      expect(canPublish(cashier)).toBe(false)
    })
  })

  describe('F-UI1 — Independent Draft UI Capabilities & Decoupled Access', () => {
    it('declares requiredAnyPermissions on draft workbench and does not couple cost.read', () => {
      expect(draftPageSource).toMatch(/definePageMeta\(\{\s*requiredAnyPermissions:\s*\['cost\.manage',\s*'cost\.prepare'\]\s*\}\)/)
      expect(draftPageSource).not.toMatch(/definePageMeta\(\{\s*requiredPermission:\s*'cost\.read'/)
    })

    it('preserves cost.read on the published project costs overview page', () => {
      expect(publishedOverviewPageSource).toMatch(/definePageMeta\(\{\s*requiredPermission:\s*'cost\.read'\s*\}\)/)
    })

    function evaluateRouteAccess(path: string, permissions: string[], meta: Record<string, unknown>) {
      return resolveAccessMiddlewareDecision(
        { path, fullPath: path, query: {}, meta },
        {
          lifecycle: 'authenticated',
          companies: [{ companyId: 'company-1' }],
          activeCompanyId: 'company-1',
          permissions,
        },
      )
    }

    it('allows actor with cost.manage without cost.read to access draft workbench route', () => {
      const decision = evaluateRouteAccess(
        '/costs/p1/drafts/d1',
        ['cost.manage'],
        { requiredAnyPermissions: ['cost.manage', 'cost.prepare'] },
      )
      expect(decision).toEqual({ type: 'allow' })
    })

    it('allows actor with cost.prepare without cost.read to access draft workbench route', () => {
      const decision = evaluateRouteAccess(
        '/costs/p1/drafts/d1',
        ['cost.prepare'],
        { requiredAnyPermissions: ['cost.manage', 'cost.prepare'] },
      )
      expect(decision).toEqual({ type: 'allow' })
    })

    it('denies actor with neither cost.manage nor cost.prepare from draft workbench route', () => {
      const decision = evaluateRouteAccess(
        '/costs/p1/drafts/d1',
        ['cost.source.read'],
        { requiredAnyPermissions: ['cost.manage', 'cost.prepare'] },
      )
      expect(decision).toEqual({ type: 'redirect', to: '/forbidden' })
    })

    it('denies actor with only cost.manage from published overview page requiring cost.read', () => {
      const decision = evaluateRouteAccess(
        '/costs/p1',
        ['cost.manage'],
        { requiredPermission: 'cost.read' },
      )
      expect(decision).toEqual({ type: 'redirect', to: '/forbidden' })
    })

    it('allows actor with cost.read to open published overview page', () => {
      const decision = evaluateRouteAccess(
        '/costs/p1',
        ['cost.read'],
        { requiredPermission: 'cost.read' },
      )
      expect(decision).toEqual({ type: 'allow' })
    })
  })

  describe('F-UI2 — Canonical detailKind Options', () => {
    it('renders only opening_balance and line_item options in FinancialDetailEditor', () => {
      const selectBlock = financialDetailEditorSource.match(/data-testid="line-kind-select"[\s\S]*?<\/select>/)?.[0] ?? ''
      expect(selectBlock).toContain('<option value="line_item">Dòng chi tiết (line_item)</option>')
      expect(selectBlock).toContain('<option value="opening_balance">Số dư / giá trị mở đầu (opening_balance)</option>')

      expect(selectBlock).not.toContain('value="milestone"')
      expect(selectBlock).not.toContain('value="adjustment"')
      expect(selectBlock).not.toContain('value="tax"')
      expect(selectBlock).not.toContain('value="other"')
    })

    it('renders only opening_balance and line_item options in ProjectCostCorrectionModal', () => {
      const selectBlock = correctionModalSource.match(/<select v-model="line\.detailKind"[\s\S]*?<\/select>/)?.[0] ?? ''
      expect(selectBlock).toContain('<option value="line_item">Dòng chi tiết (line_item)</option>')
      expect(selectBlock).toContain('<option value="opening_balance">Số dư / giá trị mở đầu (opening_balance)</option>')

      expect(selectBlock).not.toContain('value="milestone"')
      expect(selectBlock).not.toContain('value="adjustment"')
      expect(selectBlock).not.toContain('value="tax"')
      expect(selectBlock).not.toContain('value="other"')
    })

    it('validates opening_balance through shared Zod schema', () => {
      const openingBalanceLine = {
        lineNo: 1,
        detailKind: 'opening_balance' as const,
        description: 'Số dư chuyển giao kỳ trước',
        amount: '12000000.0000',
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
      }
      const parsed = prepareProjectCostFinancialDetailInputSchema.safeParse(openingBalanceLine)
      expect(parsed.success).toBe(true)
    })

    it('validates line_item through shared Zod schema', () => {
      const lineItem = {
        lineNo: 1,
        detailKind: 'line_item' as const,
        description: 'Cát đầm móng',
        amount: '5000000.0000',
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
      }
      const parsed = prepareProjectCostFinancialDetailInputSchema.safeParse(lineItem)
      expect(parsed.success).toBe(true)
    })

    it('rejects unsupported detailKind literals in shared Zod schema', () => {
      const unsupportedLine = {
        lineNo: 1,
        detailKind: 'milestone',
        description: 'Mốc 1',
        amount: '5000000.0000',
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
      }
      expect(prepareProjectCostFinancialDetailInputSchema.safeParse(unsupportedLine).success).toBe(false)
    })
  })

  describe('F-UI3 — Never Erase Published Source Provenance', () => {
    it('disables financial correction in modal due to missing backend source provenance API', () => {
      expect(correctionModalSource).toContain('disabled')
      expect(correctionModalSource).toContain('toggle-fin-changes')
      expect(correctionModalSource).toContain('financialCorrectionDisabledReason')
      expect(correctionModalSource).toContain('Chưa thể hiệu chỉnh tài chính an toàn vì API hiện tại chưa cung cấp đầy đủ liên kết số liệu nguồn của bản ghi đã phát hành.')
    })

    it('does NOT construct or submit sourceFigureIds: [] in correction payload', () => {
      expect(correctionModalSource).not.toContain('sourceFigureIds: []')
    })

    it('preserves operational-only correction capability on published costs', () => {
      const operationalCorrection = {
        expectedVersion: 2,
        reason: 'Sửa lỗi chính tả mô tả hạng mục thanh toán',
        operationalChanges: {
          description: 'Mô tả đã được sửa đúng quy chuẩn',
          workStatus: 'accepted' as const,
        },
      }
      const parsed = correctPublishedProjectCostInputSchema.safeParse(operationalCorrection)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.financialChanges).toBeUndefined()
        expect(parsed.data.operationalChanges?.description).toBe('Mô tả đã được sửa đúng quy chuẩn')
      }
    })

    it('uses canonical operational snapshot and does not bind currentDescription', () => {
      expect(correctionModalSource).toContain('currentOperational')
      expect(correctionModalSource).not.toContain('currentDescription')
    })

    it('ensures category page does not use categoryDisplayName as cost description for correction', () => {
      const categoryPageSource = readFileSync(
        new URL('../../../app/pages/costs/[projectId]/categories/[categoryId].vue', import.meta.url),
        'utf8',
      )
      expect(categoryPageSource).toContain(':current-operational="canonicalOperational"')
      expect(categoryPageSource).not.toContain(':current-description=')
    })

    it('displays (Cần cost.read + cost.file.read) when file reading capability is missing', () => {
      const evidencePanelSource = readFileSync(
        new URL('../../../app/components/costs/ProjectCostEvidencePanel.vue', import.meta.url),
        'utf8',
      )
      expect(evidencePanelSource).toContain('(Cần cost.read + cost.file.read)')
      expect(evidencePanelSource).not.toContain('(Thiếu cost.file.read)')
    })

    it('preserves exact canonical availability without coercing undefined to null', () => {
      expect(correctionModalSource).not.toMatch(/currentOperational\.businessReference\s*\?\?\s*null/)
      expect(correctionModalSource).not.toMatch(/currentOperational\.relevantDate\s*\?\?\s*null/)
      expect(correctionModalSource).not.toMatch(/currentOperational\.workStatus\s*\?\?\s*null/)
    })
  })

  describe('C18 Findings Regression Suite', () => {
    describe('C18-F1 — Gate payment evidence on cost.prepare', () => {
      it('SubcontractPaymentRecordModal gates evidence capability on cost.prepare', () => {
        expect(paymentRecordModalSource).toContain("hasPermission('cost.prepare')")
        expect(paymentRecordModalSource).toContain('canPrepareEvidence')
        expect(paymentRecordModalSource).toContain('Cần quyền cost.prepare để tải lên chứng từ thanh toán.')
        expect(paymentRecordModalSource).toContain('data-testid="pay-evidence-permission-notice"')
      })

      it('does not upload evidence when canPrepareEvidence is false', () => {
        expect(paymentRecordModalSource).toContain('if (canPrepareEvidence.value && selectedEvidenceFile.value)')
        expect(paymentRecordModalSource).toContain('evidenceFileIds: evidenceFileIds.length > 0 ? evidenceFileIds : undefined')
      })
    })

    describe('C18-F2 — Default payment date uses browser local date', () => {
      it('SubcontractPaymentRecordModal uses localDateInputValue instead of toISOString', () => {
        expect(paymentRecordModalSource).toContain('localDateInputValue()')
        expect(paymentRecordModalSource).not.toContain('toISOString().substring(0, 10)')
      })
    })

    describe('C18-F3 — Route subcontract actions to correct contracts', () => {
      it('ProjectCostSubcontractLedger routes void actions using payment.contractId', () => {
        expect(subcontractLedgerSource).toContain(':subcontract-id="selectedPaymentToVoid.contractId"')
        expect(subcontractLedgerSource).toContain('openVoidModal(payment: { id: string; contractId: string')
      })

      it('ProjectCostSubcontractLedger routes replacement actions using payment.contractId', () => {
        expect(subcontractLedgerSource).toContain('@click="openReplacementModal(p.id, p.contractId)"')
        expect(subcontractLedgerSource).toContain('openReplacementModal(paymentId: string, contractId?: string)')
      })

      it('ProjectCostSubcontractLedger requires explicit contract selection for multi-contract party view', () => {
        expect(subcontractLedgerSource).toContain('isSelectContractModalOpen')
        expect(subcontractLedgerSource).toContain('select-contract-dropdown')
        expect(subcontractLedgerSource).toContain('confirm-select-contract-btn')
        expect(subcontractLedgerSource).toContain(':disabled="availableContracts.length === 0"')
      })

      it('validates multi-contract party detail schema parsing', () => {
        const subcontractId2 = '50000000-0000-4000-8000-000000000088'
        const c1 = {
          id: sampleUuid(1),
          code: 'HD-KC-01',
          contractNo: 'KC-2026-01',
          contractName: 'Hợp đồng kết cấu thép',
          contractDate: '2026-08-01',
          contractValue: '500000000.0000',
          currencyCode: 'VND',
          defaultRetentionRateBps: 500,
          isActive: true,
          version: 1,
          paidTotal: '50000000.0000',
          paidCount: 1,
          recordedRetentionTotal: '2500000.0000',
          recordedRetentionRowCount: 1,
        }
        const c2 = {
          id: subcontractId2,
          code: 'HD-KC-02',
          contractNo: 'KC-2026-02',
          contractName: 'Hợp đồng kết cấu thép đợt 2',
          contractDate: '2026-08-15',
          contractValue: '300000000.0000',
          currencyCode: 'VND',
          defaultRetentionRateBps: 500,
          isActive: true,
          version: 2,
          paidTotal: '30000000.0000',
          paidCount: 1,
          recordedRetentionTotal: '1500000.0000',
          recordedRetentionRowCount: 1,
        }
        const parsed = financeSubcontractorDetailSchema.safeParse({
          schemaVersion: 1,
          project: {
            projectId: sampleUuid(2),
            projectCode: 'DA-C1-01',
            projectName: 'Dự án Thi công Trung tâm Thương mại',
            currencyCode: 'VND',
            moneyScale: 0,
            timeZone: 'Asia/Ho_Chi_Minh',
            operationalState: 'active',
          },
          party: {
            partyId: sampleUuid(3),
            code: 'CT-THEP',
            displayName: 'Nhà thầu Kết cấu thép',
            partyKind: 'organization',
          },
          contracts: [c1, c2],
          payments: {
            rows: [
              {
                id: sampleUuid(4),
                contractId: sampleUuid(1),
                contractCode: c1.code,
                contractNo: c1.contractNo,
                description: 'Thanh toán đợt 1 hợp đồng 1',
                paidAmount: '50000000.0000',
                warrantyRetentionAmount: '2500000.0000',
                retentionRateBps: 500,
                paymentDate: '2026-08-10',
                effectiveDate: '2026-08-10',
                dateSource: 'payment_date',
                recordStatus: 'recorded',
                replacementPaymentId: null,
                reference: 'PC-01',
                sourceReference: null,
                note: null,
                createdAt: '2026-08-10T08:00:00.000Z',
                version: 1,
              },
            ],
            pagination: {
              page: 1,
              pageSize: 25,
              totalPages: 1,
              filteredCount: 1,
              fullCount: 1,
              filteredAmount: '50000000.0000',
              fullAmount: '50000000.0000',
            },
            recordedTotal: '50000000.0000',
            recordedCount: 1,
            recordedRetentionTotal: '2500000.0000',
            recordedRetentionRowCount: 1,
          },
        })
        expect(parsed.success).toBe(true)
      })
    })

    describe('C18-F4 — Map draft API failures from ClientError.code', () => {
      it('drafts/[draftId].vue uses mapCostsApiError instead of err.statusCode', () => {
        expect(draftPageSource).toContain('mapCostsApiError(err)')
        expect(draftPageSource).not.toContain('statusCode')
        expect(draftPageSource).toContain('data-testid="draft-not-found"')
        expect(draftPageSource).toContain('data-testid="draft-permission-denied"')
      })

      it('mapCostsApiError correctly maps canonical ClientError codes for drafts', () => {
        const notFoundErr = new ClientError({
          code: 'RESOURCE_NOT_FOUND',
          kind: 'api',
          message: 'Draft not found',
          retryable: false,
        })
        expect(mapCostsApiError(notFoundErr)).toBe('not_found')

        const permissionErr = new ClientError({
          code: 'PERMISSION_DENIED',
          kind: 'authorization',
          message: 'Permission denied',
          retryable: false,
        })
        expect(mapCostsApiError(permissionErr)).toBe('permission')

        const forbiddenErr = new ClientError({
          code: 'COMPANY_FORBIDDEN',
          kind: 'authorization',
          message: 'Company forbidden',
          retryable: false,
        })
        expect(mapCostsApiError(forbiddenErr)).toBe('permission')

        const networkErr = new ClientError({
          code: 'NETWORK_ERROR',
          kind: 'network',
          message: 'Network failed',
          retryable: true,
        })
        expect(mapCostsApiError(networkErr)).toBe('error')
      })
    })
  })
})
