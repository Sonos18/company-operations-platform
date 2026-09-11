import { describe, expect, it, vi } from 'vitest'
import { createSupabaseProjectRegisterRepository } from '../../../server/features/project-register/project-register.repository'
import { createProjectRegisterService } from '../../../server/features/project-register/project-register.service'

const companyId = 'c1000000-0000-4000-8000-000000000020'
const projectId = 'c1000000-0000-4000-8000-000000000030'
const context = { actorId: 'c1000000-0000-4000-8000-000000000901', tenantId: 'c1000000-0000-4000-8000-000000000010', companyId, permissions: ['project.register.manage'] as const, requestId: 'c1000000-0000-4000-8000-000000000099' }

describe('C1 project master-data server path', () => {
  it('reads only the requested tenant/company scope and rejects malformed rows', async () => {
    const eq = vi.fn()
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => Promise.resolve({
      data: [{ id: projectId, tenant_id: context.tenantId, company_id: companyId, code: 'P-01', name: 'Project', origin: 'manual', operational_state: 'active', client_display_name: null, location_text: null, version: 0, created_at: '2026-09-11T00:00:00.000Z', updated_at: '2026-09-11T00:00:00.000Z' }], error: null,
    })), }
    query.eq.mockImplementation((...args) => { eq(...args); return query })
    const repository = createSupabaseProjectRegisterRepository({ from: vi.fn(() => query) } as never)

    await expect(repository.list(companyId, context.tenantId)).resolves.toMatchObject([{ id: projectId, code: 'P-01' }])
    expect(eq.mock.calls).toEqual(expect.arrayContaining([['company_id', companyId], ['tenant_id', context.tenantId]]))
  })

  it('enforces the approved project capability before reads', async () => {
    const list = vi.fn()
    const service = createProjectRegisterService({ list } as never)
    await expect(service.list({ ...context, permissions: [] })).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(list).not.toHaveBeenCalled()
  })
})
