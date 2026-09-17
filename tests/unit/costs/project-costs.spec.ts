import { describe, expect, it } from 'vitest'
import {
  correctProjectCostItemInputSchema,
  createProjectCostItemInputSchema,
  projectCostBreakdownSchema,
  projectCostItemSchema,
  projectCostSummarySchema,
  projectCostWorkStatusSchema,
  updateProjectCostItemInputSchema,
} from '../../../shared/schemas/costs/project-costs'

const ids = {
  tenant: 'c1000000-0000-4000-8000-000000000001',
  company: 'c1000000-0000-4000-8000-000000000002',
  project: 'c1000000-0000-4000-8000-000000000003',
  item: 'c1000000-0000-4000-8000-000000000004',
  party: 'c1000000-0000-4000-8000-000000000005',
  engagement: 'c1000000-0000-4000-8000-000000000006',
  component: 'c1000000-0000-4000-8000-000000000007',
  sourceFigure1: 'c1000000-0000-4000-8000-000000000008',
  sourceFigure2: 'c1000000-0000-4000-8000-000000000009',
}

const createInput = {
  projectId: ids.project,
  description: 'Install roof framing',
  amount: '100.0000',
  currencyCode: 'VND',
  workStatus: 'in_progress' as const,
  nonOverlapConfirmationReference: 'VQH-2026-09-16-001',
}

const summary = {
  acceptedValue: '100.0000',
  acceptedCount: 1,
  inProgressValue: '50.0000',
  inProgressCount: 1,
  unknownStatusValue: '20.0000',
  unknownCount: 1,
  totalTrackedWorkValue: '150.0000',
}

describe('project cost contracts', () => {
  it('accepts only the approved work statuses', () => {
    for (const status of ['unknown', 'in_progress', 'accepted']) {
      expect(projectCostWorkStatusSchema.safeParse(status).success).toBe(true)
    }
    expect(projectCostWorkStatusSchema.safeParse('paid').success).toBe(false)
  })

  it('accepts known nonnegative decimal amounts including zero', () => {
    for (const amount of ['0', '0.0000', '100', '100.0000']) {
      expect(createProjectCostItemInputSchema.safeParse({ ...createInput, amount }).success).toBe(true)
    }
  })

  it('rejects negative amounts and precision beyond four decimal places', () => {
    expect(createProjectCostItemInputSchema.safeParse({ ...createInput, amount: '-1.0000' }).success).toBe(false)
    expect(createProjectCostItemInputSchema.safeParse({ ...createInput, amount: '1.00001' }).success).toBe(false)
  })

  it('requires project and approved business fields', () => {
    for (const field of ['projectId', 'description', 'amount', 'currencyCode', 'workStatus'] as const) {
      const input = Object.fromEntries(Object.entries(createInput).filter(([key]) => key !== field))
      expect(createProjectCostItemInputSchema.safeParse(input).success).toBe(false)
    }
  })

  it('keeps business reference and hierarchy context optional', () => {
    expect(createProjectCostItemInputSchema.safeParse(createInput).success).toBe(true)
    expect(createProjectCostItemInputSchema.safeParse({
      ...createInput,
      businessReference: 'RF-01',
      partyId: ids.party,
      engagementId: ids.engagement,
      componentId: ids.component,
      relevantDate: '2026-09-16',
    }).success).toBe(true)
  })

  it('accepts optional unique source figure provenance IDs without exposing them on items', () => {
    expect(createProjectCostItemInputSchema.safeParse({ ...createInput, sourceFigureIds: [ids.sourceFigure1, ids.sourceFigure2] }).success).toBe(true)
    expect(createProjectCostItemInputSchema.safeParse(createInput).success).toBe(true)
    expect(projectCostItemSchema.safeParse({
      id: ids.item, tenantId: ids.tenant, companyId: ids.company, projectId: ids.project,
      description: createInput.description, amount: createInput.amount, currencyCode: createInput.currencyCode,
      workStatus: createInput.workStatus, businessReference: null, partyId: null, engagementId: null,
      componentId: null, relevantDate: null, version: 0, createdAt: '2026-09-16T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z', sourceFigureIds: [ids.sourceFigure1],
    }).success).toBe(false)
  })

  it.each([{ sourceFigureIds: [] }, { sourceFigureIds: ['not-a-uuid'] }, { sourceFigureIds: [ids.sourceFigure1, ids.sourceFigure1] }])('rejects invalid source figure provenance IDs: $sourceFigureIds', ({ sourceFigureIds }) => {
    expect(createProjectCostItemInputSchema.safeParse({ ...createInput, sourceFigureIds }).success).toBe(false)
  })

  it('requires a non-overlap confirmation reference when creating an item', () => {
    const input: Record<string, unknown> = { ...createInput }
    delete input.nonOverlapConfirmationReference
    expect(createProjectCostItemInputSchema.safeParse(input).success).toBe(false)
  })

  it('rejects empty or whitespace-only non-overlap confirmation references', () => {
    expect(createProjectCostItemInputSchema.safeParse({ ...createInput, nonOverlapConfirmationReference: '' }).success).toBe(false)
    expect(createProjectCostItemInputSchema.safeParse({ ...createInput, nonOverlapConfirmationReference: '   ' }).success).toBe(false)
  })

  it('accepts a non-empty non-overlap confirmation reference', () => {
    expect(createProjectCostItemInputSchema.safeParse(createInput).success).toBe(true)
  })

  it('requires expected version for updates', () => {
    expect(updateProjectCostItemInputSchema.safeParse({ description: 'Corrected framing' }).success).toBe(false)
    expect(updateProjectCostItemInputSchema.safeParse({
      description: 'Corrected framing',
      workStatus: 'accepted',
      partyId: ids.party,
      engagementId: ids.engagement,
      componentId: ids.component,
      relevantDate: '2026-09-16',
      expectedVersion: 0,
    }).success).toBe(true)
  })

  it('rejects an ordinary update with no mutable field', () => {
    expect(updateProjectCostItemInputSchema.safeParse({ expectedVersion: 0 }).success).toBe(false)
  })

  it('accepts each allowed ordinary update field with an expected version', () => {
    for (const update of [
      { description: 'Corrected framing' },
      { partyId: ids.party },
      { engagementId: ids.engagement },
      { componentId: ids.component },
      { relevantDate: '2026-09-16' },
      { workStatus: 'accepted' },
    ]) expect(updateProjectCostItemInputSchema.safeParse({ ...update, expectedVersion: 0 }).success).toBe(true)
  })

  it('accepts an explicit nullable hierarchy clear as an ordinary update', () => {
    expect(updateProjectCostItemInputSchema.safeParse({ partyId: null, expectedVersion: 0 }).success).toBe(true)
  })

  it('rejects amount from the ordinary management update contract', () => {
    expect(updateProjectCostItemInputSchema.safeParse({ amount: '125.0000', expectedVersion: 0 }).success).toBe(false)
  })

  it('rejects currency from the ordinary management update contract', () => {
    expect(updateProjectCostItemInputSchema.safeParse({ currencyCode: 'USD', expectedVersion: 0 }).success).toBe(false)
  })

  it('requires expected version for corrections', () => {
    expect(correctProjectCostItemInputSchema.safeParse({ reason: 'Correct source transcription', amount: '125.0000' }).success).toBe(false)
  })

  it('requires a non-empty correction reason', () => {
    expect(correctProjectCostItemInputSchema.safeParse({ expectedVersion: 0, reason: '', amount: '125.0000' }).success).toBe(false)
    expect(correctProjectCostItemInputSchema.safeParse({ expectedVersion: 0, reason: '   ', amount: '125.0000' }).success).toBe(false)
  })

  it('rejects a correction with no material field', () => {
    expect(correctProjectCostItemInputSchema.safeParse({ expectedVersion: 0, reason: 'Correction requested' }).success).toBe(false)
  })

  it('accepts a material amount correction', () => {
    expect(correctProjectCostItemInputSchema.safeParse({ expectedVersion: 0, reason: 'Correct source transcription', amount: '125.0000' }).success).toBe(true)
  })

  it('accepts a material work-status correction', () => {
    expect(correctProjectCostItemInputSchema.safeParse({ expectedVersion: 0, reason: 'Acceptance confirmed', workStatus: 'accepted' }).success).toBe(true)
  })

  it('rejects unsupported accounting fields from corrections', () => {
    expect(correctProjectCostItemInputSchema.safeParse({ expectedVersion: 0, reason: 'Correct source transcription', amount: '125.0000', paidAmount: '125.0000' }).success).toBe(false)
  })

  it('accepts F06 totals from accepted and in-progress values only', () => {
    expect(projectCostSummarySchema.safeParse(summary).success).toBe(true)
    expect(projectCostSummarySchema.safeParse({ ...summary, unknownStatusValue: '999.0000' }).success).toBe(true)
  })

  it('rejects a total that includes unknown status value', () => {
    expect(projectCostSummarySchema.safeParse({ ...summary, totalTrackedWorkValue: '170.0000' }).success).toBe(false)
  })

  it('rejects unsupported accounting and source semantics', () => {
    expect(createProjectCostItemInputSchema.safeParse({ ...createInput, paidAmount: '100.0000' }).success).toBe(false)
    expect(projectCostSummarySchema.safeParse({ ...summary, payableValue: '0' }).success).toBe(false)
    expect(projectCostItemSchema.safeParse({
      id: ids.item,
      tenantId: ids.tenant,
      companyId: ids.company,
      projectId: ids.project,
      description: createInput.description,
      amount: createInput.amount,
      currencyCode: createInput.currencyCode,
      workStatus: createInput.workStatus,
      businessReference: null,
      partyId: null,
      engagementId: null,
      componentId: null,
      relevantDate: null,
      version: 0,
      createdAt: '2026-09-16T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z',
      paymentStatus: 'paid',
    }).success).toBe(false)
  })

  it('requires strict Project metadata on Project Cost summary entries and breakdowns', async () => {
    const model = await import('../../../shared/schemas/costs/project-costs') as Record<string, { safeParse(value: unknown): { success: boolean } }>
    const metadata = { projectId: ids.project, projectCode: 'C101-P1', projectName: 'C101 project one' }
    const entry = { ...metadata, summary }
    const breakdown = { ...metadata, summary, items: [] }

    expect(model.projectCostSummaryEntrySchema.safeParse({ projectId: ids.project, summary }).success).toBe(false)
    expect(model.projectCostSummaryEntrySchema.safeParse(entry).success).toBe(true)
    expect(projectCostBreakdownSchema.safeParse({ projectId: ids.project, summary, items: [] }).success).toBe(false)
    expect(projectCostBreakdownSchema.safeParse(breakdown).success).toBe(true)
    expect(projectCostBreakdownSchema.safeParse({ ...breakdown, sourceFigureIds: [ids.sourceFigure1] }).success).toBe(false)
  })
})
