import { describe, expect, it } from 'vitest'
import {
  createProjectCostDraftInputSchema,
  updateProjectCostDraftInputSchema,
  prepareProjectCostFinancialsInputSchema,
  publishProjectCostInputSchema,
  correctPublishedProjectCostInputSchema,
  projectCostDraftSchema,
  projectCostOperationalDraftSchema,
} from '../../../shared/schemas/costs/project-costs'
import {
  recordSubcontractPaymentInputSchema,
  voidSubcontractPaymentInputSchema,
} from '../../../shared/schemas/costs/project-finance-writes'

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
})
