import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import * as schemas from '../../../shared/schemas/costs/cost-workflow-evidence'
import { CostWorkflowEvidenceService } from '../../../server/features/costs/workflow/cost-workflow-evidence.service'
import { SupabaseWorkflowEvidenceRepository } from '../../../server/features/costs/workflow/cost-workflow-evidence.repository'
import { createCostWorkflowRoutes } from '../../../server/features/costs/workflow/cost-workflow.routes'

vi.mock('h3', () => ({ getRouterParam: (e: H3Event, k: string) => e.context.params?.[k], getQuery: (e: H3Event) => e.context.query ?? {}, getHeader: vi.fn(), readBody: vi.fn() }))
const company = 'c1f50000-0000-4000-8000-000000000001'
const project = 'c1f50000-0000-4000-8000-000000000002'
const file = 'c1f50000-0000-4000-8000-000000000003'
const request = 'c1f50000-0000-4000-8000-000000000004'
const actor = 'c1f50000-0000-4000-8000-000000000005'
const tenant = 'c1f50000-0000-4000-8000-000000000006'
const permissions = ['cost.prepare', 'cost.request.submit', 'cost.request.file.read', 'cost.request.read'] as const
const context = { companyId: company, tenantId: tenant, actorId: actor, requestId: file, permissions }
const input = { requestId: null, requestVersion: null }
const finalizedAt = new Date().toISOString()
const item = { id: file, version: 1, originalFilename: 'Synthetic quotation.pdf', mimeType: 'application/pdf', sizeBytes: 123, sha256: 'a'.repeat(64), finalizedAt, kind: 'quotation' }
const row = { id: file, version: 1, original_filename: item.originalFilename, verified_mime_type: item.mimeType, verified_size_bytes: item.sizeBytes, verified_sha256: item.sha256, finalized_at: finalizedAt, tenant_id: tenant, company_id: company, project_id: project, created_by: actor, workflow_origin: true, workflow_target_kind: 'request', workflow_target_id: null, workflow_evidence_kind: 'quotation', status: 'finalized' }
const target = { fileId: file, companyId: company, projectId: project, requestId: null, fileVersion: 1, requestVersion: null, sha256: item.sha256, mimeType: item.mimeType, sizeBytes: item.sizeBytes, documentKind: 'quotation', bucketId: 'c1-accounting-evidence', objectPath: [tenant, company, project, file].join('/') }
const projectContext = { mode: 'document_backed_v1', operationalState: 'active', canSubmit: true, canDecide: false, canAssign: false, manager: null, eligibleManagers: [] }
const requestView = { id: request, version: 2, status: 'working', submittedVersionId: null, partyId: actor, partyKind: 'organization', crewOwnership: null, categoryId: file, contractVersionId: null, latestDecision: null, amount: '1', currencyCode: 'VND', evidenceFileIds: [file], assignmentVersion: null, basis: { kind: 'other', lines: [{ description: 'Synthetic', quantity: '1', unit: 'item', unitPrice: '1' }] }, installment: null, payments: [] }

function fixture(rows: unknown[] = [row], overrides: Record<string, unknown> = {}) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'is', 'in', 'gte', 'lte', 'order']) query[method] = vi.fn(() => query)
  query.limit = vi.fn(async () => ({ data: rows, error: null }))
  const rpc = vi.fn(async (name: string) => ({ data: overrides[name] ?? (name === 'c1_workflow_project_context' ? projectContext : name === 'c1_workflow_read_request' ? requestView : target), error: null }))
  const from = vi.fn(() => query)
  const storage = { from: vi.fn(() => { throw new Error('Recovery must never access storage') }) }
  const client = { from, rpc, storage }
  const repository = new SupabaseWorkflowEvidenceRepository(client as never)
  const service = new CostWorkflowEvidenceService(repository)
  return { client, rpc, from, query, storage, repository, service }
}

describe('strict recovery contracts', () => {
  it('publishes the required strict input and metadata schemas', () => {
    expect(schemas.workflowQuotationRecoveryInputSchema).toBeDefined()
    expect(schemas.workflowRecoverableQuotationSchema).toBeDefined()
    expect(schemas.workflowQuotationRecoveryInputSchema.parse(input)).toEqual(input)
    expect(schemas.workflowRecoverableQuotationSchema.parse(item)).toEqual(item)
  })
  it.each([{ requestId: request, requestVersion: null }, { requestId: null, requestVersion: 0 }, { requestId: request, requestVersion: -1 }, { requestId: request, requestVersion: Number.MAX_SAFE_INTEGER + 1 }, { ...input, actorId: actor }])('rejects unpaired, unsafe or authority-bearing input %j', value => {
    expect(schemas.workflowQuotationRecoveryInputSchema.safeParse(value).success).toBe(false)
  })
  it.each(['bucketId', 'objectPath', 'url', 'raw', 'jobId', 'fileId', 'providerData'])('rejects output field %s', key => {
    expect(schemas.workflowRecoverableQuotationSchema.safeParse({ ...item, [key]: 'private' }).success).toBe(false)
  })
})

describe('authorized quotation recovery', () => {
  it('returns only metadata after a scoped authenticated SELECT and fresh target authorization', async () => {
    const f = fixture()
    expect(await f.service.listRecoverableQuotations(context, project, input)).toEqual([item])
    expect(f.from).toHaveBeenCalledWith('cost_evidence_files')
    for (const [key, value] of Object.entries({ tenant_id: tenant, company_id: company, project_id: project, created_by: actor, workflow_origin: true, workflow_target_kind: 'request', workflow_evidence_kind: 'quotation', status: 'finalized' })) expect(f.query.eq).toHaveBeenCalledWith(key, value)
    expect(f.query.is).toHaveBeenCalledWith('workflow_target_id', null)
    expect(f.query.in).toHaveBeenCalledWith('verified_mime_type', ['application/pdf', 'image/png', 'image/jpeg'])
    expect(f.query.gte).toHaveBeenCalledWith('verified_size_bytes', 1)
    expect(f.query.lte).toHaveBeenCalledWith('verified_size_bytes', 4000000)
    expect(f.query.gte).toHaveBeenCalledWith('finalized_at', expect.any(String))
    expect(f.query.lte).toHaveBeenCalledWith('finalized_at', expect.any(String))
    expect(f.query.order.mock.calls).toEqual([['finalized_at', { ascending: false }], ['id', { ascending: true }]])
    expect(f.query.limit).toHaveBeenCalledWith(20)
    expect(f.query.select.mock.calls[0]?.[0]).not.toMatch(/bucket|object_path|raw|job|provider/)
    expect(f.rpc).toHaveBeenCalledWith('c1_workflow_extraction_target', { target_company_id: company, target_project_id: project, target_request_id: null, target_id: file })
    expect(f.rpc.mock.calls.map(c => c[0])).toEqual(['c1_workflow_project_context', 'c1_workflow_extraction_target'])
    expect(f.storage.from).not.toHaveBeenCalled()
  })
  it.each(permissions)('requires %s before querying', async missing => {
    const f = fixture()
    await expect(f.service.listRecoverableQuotations({ ...context, permissions: permissions.filter(p => p !== missing) }, project, input)).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(f.from).not.toHaveBeenCalled()
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it.each([{ tenant_id: company }, { company_id: tenant }, { project_id: company }, { created_by: company }, { workflow_origin: false }, { workflow_target_kind: 'payment' }, { workflow_target_id: request }, { workflow_evidence_kind: 'invoice' }, { status: 'pending' }, { verified_mime_type: 'text/plain' }, { verified_size_bytes: 4000001 }, { verified_size_bytes: 0 }, { finalized_at: '2020-01-01T00:00:00Z' }, { finalized_at: '2099-01-01T00:00:00Z' }, { verified_sha256: 'invalid' }, { object_path: 'private' }])('fails closed on an out-of-scope or ineligible row %j', async delta => {
    const f = fixture([{ ...row, ...delta }])
    await expect(f.service.listRecoverableQuotations(context, project, input)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
    expect(f.storage.from).not.toHaveBeenCalled()
  })
  it.each([{ mode: 'legacy' }, { operationalState: 'completed' }, { operationalState: 'paused' }, { canSubmit: false }])('rejects unavailable project even without candidates %j', async delta => {
    const f = fixture([], { c1_workflow_project_context: { ...projectContext, ...delta } })
    await expect(f.service.listRecoverableQuotations(context, project, input)).rejects.toHaveProperty('statusCode')
    expect(f.from).not.toHaveBeenCalled()
  })
  it('preserves project authorization denial', async () => {
    const f = fixture([]); f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } } as never)
    await expect(f.service.listRecoverableQuotations(context, project, input)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.from).not.toHaveBeenCalled()
  })
  it.each([{ version: 3 }, { status: 'submitted' }, { status: 'approved' }, { id: file }])('checks request identity/state/revision before an empty candidate list %j', async delta => {
    const f = fixture([], { c1_workflow_read_request: { ...requestView, ...delta } })
    await expect(f.service.listRecoverableQuotations(context, project, { requestId: request, requestVersion: 2 })).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' })
    expect(f.from).not.toHaveBeenCalled()
  })
  it('propagates noninstallment/unreadable request rejection even for an empty list', async () => {
    const f = fixture([]); f.rpc.mockImplementation(async name => name === 'c1_workflow_read_request' ? { data: null, error: { message: 'RESOURCE_NOT_FOUND' } } as never : { data: projectContext, error: null })
    await expect(f.service.listRecoverableQuotations(context, project, { requestId: request, requestVersion: 2 })).rejects.toMatchObject({ statusCode: 404 })
    expect(f.from).not.toHaveBeenCalled()
  })
  it('recovers exactly the returned editable request target', async () => {
    const f = fixture([{ ...row, workflow_target_id: request }], { c1_workflow_read_request: { ...requestView, status: 'returned' }, c1_workflow_extraction_target: { ...target, requestId: request, requestVersion: 2 } })
    expect(await f.service.listRecoverableQuotations(context, project, { requestId: request, requestVersion: 2 })).toEqual([item])
    expect(f.query.eq).toHaveBeenCalledWith('workflow_target_id', request)
    expect(f.rpc).toHaveBeenCalledWith('c1_workflow_read_request', { target_company_id: company, target_project_id: project, target_id: request })
  })
  it('rejects staged null candidates for an existing request', async () => {
    const f = fixture()
    await expect(f.service.listRecoverableQuotations(context, project, { requestId: request, requestVersion: 2 })).rejects.toMatchObject({ statusCode: 500 })
  })
  it.each([{ fileVersion: 2 }, { sha256: 'b'.repeat(64) }, { mimeType: 'image/png' }, { sizeBytes: 124 }, { documentKind: 'invoice' }, { requestVersion: 2 }, { requestId: request }, { fileId: request }, { companyId: tenant }, { projectId: company }])('rejects changed fresh target identity %j', async delta => {
    const f = fixture([row], { c1_workflow_extraction_target: { ...target, ...delta } })
    await expect(f.service.listRecoverableQuotations(context, project, input)).rejects.toHaveProperty('statusCode')
  })
  it('fails the entire list if a later candidate loses authorization', async () => {
    const second = { ...row, id: request }
    const f = fixture([row, second])
    f.rpc.mockImplementation(async (name, args?: Record<string, unknown>) => name === 'c1_workflow_extraction_target' && args?.target_id === request ? { data: null, error: { message: 'PERMISSION_DENIED' } } as never : { data: name === 'c1_workflow_project_context' ? projectContext : target, error: null })
    await expect(f.service.listRecoverableQuotations(context, project, input)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.storage.from).not.toHaveBeenCalled()
  })
  it.each([[row, row], Array.from({ length: 21 }, () => row)].map(rows => [rows]))('rejects duplicate/over-limit result batches', async rows => {
    const f = fixture(rows)
    await expect(f.service.listRecoverableQuotations(context, project, input)).rejects.toMatchObject({ statusCode: 500 })
  })
})

describe('recovery GET route through the real service/repository', () => {
  function event(query: unknown) { return { context: { params: { companyId: company, projectId: project }, query } } as unknown as H3Event }
  it('maps absent query parameters to paired null and returns metadata', async () => {
    const f = fixture()
    const routes = createCostWorkflowRoutes({ resolveContext: vi.fn(async () => ({ ...context, db: f.client as never })) })
    expect(await routes.listRecoverableQuotations(event({}))).toEqual([item])
  })
  it.each([{ fileId: file }, { requestId: request }, { requestVersion: '2' }, { requestId: 'null', requestVersion: 'null' }, { requestId: request, requestVersion: '' }, { requestId: request, requestVersion: '2.0' }, { requestId: request, requestVersion: '9007199254740992' }, { requestId: [request, request], requestVersion: '2' }])('rejects extra or invalid query %j', async query => {
    const f = fixture(); const routes = createCostWorkflowRoutes({ resolveContext: vi.fn(async () => ({ ...context, db: f.client as never })) })
    await expect(routes.listRecoverableQuotations(event(query))).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(f.rpc).not.toHaveBeenCalled()
    expect(f.from).not.toHaveBeenCalled()
  })
  it('parses the paired string request revision', async () => {
    const f = fixture([], { c1_workflow_read_request: requestView }); const routes = createCostWorkflowRoutes({ resolveContext: vi.fn(async () => ({ ...context, db: f.client as never })) })
    expect(await routes.listRecoverableQuotations(event({ requestId: request, requestVersion: '2' }))).toEqual([])
    expect(f.query.eq).toHaveBeenCalledWith('workflow_target_id', request)
  })
})
