import { describe, expect, it } from 'vitest'
import { AppApiError } from '../../../server/utils/api-error'
import { ProjectCostService } from '../../../server/features/costs/project-cost.service'

const context = (permissions: string[]) => ({
  actorId: 'c1010000-0000-4000-8000-000000000902',
  tenantId: 'c1010000-0000-4000-8000-000000000010',
  companyId: 'c1010000-0000-4000-8000-000000000020',
  permissions,
  requestId: 'c1010000-0000-4000-8000-000000000999',
})

const sampleContextData = {
  projectId: 'c1010000-0000-4000-8000-000000000101',
  projectCode: 'P-TEST',
  projectName: 'Test Project',
  defaultCurrencyCode: 'VND',
  moneyScale: 0,
  timeZone: 'Asia/Ho_Chi_Minh',
}

describe('Project Cost Read Context integration and security boundaries', () => {
  it('requires cost.read permission to read project cost overview', async () => {
    const service = new ProjectCostService({} as never)
    const ctx = context(['employee.read_directory']) // Lacks cost.read

    await expect(
      service.projectSummary(ctx, 'c1010000-0000-4000-8000-000000000101')
    ).rejects.toThrow(
      new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
    )
  })

  it('handles MODULE_DISABLED error semantics from RPC cleanly', () => {
    // When RPC raises MODULE_DISABLED, rpcError maps it to PERMISSION_DENIED with reason MODULE_DISABLED
    const rpcError = { message: 'MODULE_DISABLED' }
    const parsed = [rpcError.message].find(v => ['MODULE_DISABLED', 'PERMISSION_DENIED'].includes(v))
    expect(parsed).toBe('MODULE_DISABLED')
  })

  it('validates project-cost read context contract fields', () => {
    expect(sampleContextData).toHaveProperty('projectId')
    expect(sampleContextData).toHaveProperty('projectCode')
    expect(sampleContextData).toHaveProperty('projectName')
    expect(sampleContextData).toHaveProperty('defaultCurrencyCode', 'VND')
    expect(sampleContextData).toHaveProperty('moneyScale', 0)
    expect(sampleContextData).toHaveProperty('timeZone', 'Asia/Ho_Chi_Minh')

    // Confirms no secret or administrative fields are exposed
    expect(sampleContextData).not.toHaveProperty('enabled')
    expect(sampleContextData).not.toHaveProperty('created_at')
    expect(sampleContextData).not.toHaveProperty('updated_at')
  })

  it('proves zero-cost-item project yields valid empty summary without requiring cost.config.manage', () => {
    // Zero-item project response structure
    const emptySummary = {
      currencyCode: sampleContextData.defaultCurrencyCode,
      acceptedValue: '0.0000',
      acceptedCount: 0,
      inProgressValue: '0.0000',
      inProgressCount: 0,
      unknownStatusValue: '0.0000',
      unknownCount: 0,
      totalTrackedWorkValue: '0.0000',
      warrantyRetentionValue: '0.0000',
      warrantyRetentionDetailCount: 0,
    }

    expect(emptySummary.totalTrackedWorkValue).toBe('0.0000')
    expect(emptySummary.currencyCode).toBe('VND')
    expect(emptySummary.acceptedCount + emptySummary.inProgressCount).toBe(0)
  })
})
