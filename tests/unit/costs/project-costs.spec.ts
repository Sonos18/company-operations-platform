import { describe, expect, it } from 'vitest'
import {
  createProjectCostItemInputSchema,
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
}

const createInput = {
  projectId: ids.project,
  description: 'Install roof framing',
  amount: '100.0000',
  currencyCode: 'VND',
  workStatus: 'in_progress' as const,
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
      const input: Record<string, unknown> = { ...createInput }
      delete input[field]
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

  it('requires expected version for updates', () => {
    expect(updateProjectCostItemInputSchema.safeParse({ description: 'Corrected framing' }).success).toBe(false)
    expect(updateProjectCostItemInputSchema.safeParse({ description: 'Corrected framing', expectedVersion: 0 }).success).toBe(true)
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
})
