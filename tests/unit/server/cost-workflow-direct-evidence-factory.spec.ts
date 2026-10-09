import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCostWorkflowRoutes } from '../../../server/features/costs/workflow/cost-workflow.routes'

const { getHeader, getRouterParam, readBody } = vi.hoisted(() => ({
  getHeader: vi.fn(), getRouterParam: vi.fn(), readBody: vi.fn(),
}))
vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(), getHeader, getRouterParam, readBody,
}))

const id = 'a1260000-0000-4000-8000-000000000001'
const project = 'a1260000-0000-4000-8000-000000000002'
const file = 'a1260000-0000-4000-8000-000000000003'
const key = 'a1260000-0000-4000-8000-000000000004'
const bytes = new TextEncoder().encode('%PDF-1.7 direct payment evidence')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const objectPath = [id, id, project, file].join('/')
const finalized = {
  id: file, status: 'finalized', originalFilename: 'invoice.pdf',
  mimeType: 'application/pdf', sizeBytes: bytes.byteLength, sha256,
  version: 1, finalizedAt: '2026-10-09T02:00:00.000Z', replayed: false,
}

function route(permissions: readonly string[], source: { data: unknown, error: unknown }) {
  const rpc = vi.fn(async () => source)
  const maybeSingle = vi.fn(async () => ({
    data: { bucket_id: 'c1-accounting-evidence', object_path: objectPath,
      declared_mime_type: 'application/pdf', declared_size_bytes: bytes.byteLength, declared_sha256: sha256 },
    error: null,
  }))
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  const download = vi.fn(async () => ({ data: new Blob([bytes], { type: 'application/pdf' }), error: null }))
  const client = { rpc, from: vi.fn(() => query), storage: { from: vi.fn(() => ({ download })) } }
  const finalizer = { finalize: vi.fn(async () => ({ data: finalized, error: null })) }
  const directFinalizerFactory = vi.fn(() => finalizer)
  const finalizerFactory = vi.fn(() => finalizer)
  const context = { actorId: id, tenantId: id, companyId: id, requestId: key, permissions, db: client }
  const routes = createCostWorkflowRoutes({
    resolveContext: vi.fn(async () => context) as never,
    service: {} as never, extractionService: {} as never, reportingService: {} as never, cashService: {} as never,
    finalizerFactory, directFinalizerFactory,
  })
  return { routes, rpc, maybeSingle, download, finalizer, finalizerFactory, directFinalizerFactory }
}

describe('canonical direct evidence finalizer authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeader.mockReturnValue(key)
    getRouterParam.mockImplementation((_event, name) => ({
      companyId: id, projectId: project, evidenceFileId: file,
    } as Record<string, string>)[String(name)])
    readBody.mockResolvedValue({ expectedVersion: 0 })
  })

  it('does not construct a privileged finalizer when cash authority is absent', async () => {
    const fixture = route([], { data: true, error: null })
    await expect(fixture.routes.finalizeEvidence({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(fixture.rpc).not.toHaveBeenCalled()
    expect(fixture.finalizerFactory).not.toHaveBeenCalled()
    expect(fixture.directFinalizerFactory).not.toHaveBeenCalled()
  })

  it('does not construct a privileged finalizer when the scoped creator/status preflight denies', async () => {
    const fixture = route(['cost.record_cash'], { data: null, error: { message: 'PERMISSION_DENIED' } })
    await expect(fixture.routes.finalizeEvidence({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(fixture.rpc).toHaveBeenCalledWith('c1_material_payment_evidence_source', {
      target_company_id: id, target_project_id: project, target_id: file,
    })
    expect(fixture.maybeSingle).not.toHaveBeenCalled()
    expect(fixture.directFinalizerFactory).not.toHaveBeenCalled()
  })

  it('creates direct service authority only after user scope and verified blob identity', async () => {
    const fixture = route(['cost.record_cash'], { data: true, error: null })
    await expect(fixture.routes.finalizeEvidence({} as never)).resolves.toEqual(finalized)
    expect(fixture.finalizerFactory).not.toHaveBeenCalled()
    expect(fixture.directFinalizerFactory).toHaveBeenCalledOnce()
    expect(fixture.finalizer.finalize).toHaveBeenCalledWith({
      target_actor_id: id, target_company_id: id, target_id: file,
      target_input: { expectedVersion: 0, mimeType: 'application/pdf', sizeBytes: bytes.byteLength, sha256 },
      target_idempotency_key: key, target_request_id: key,
    })
    expect(fixture.rpc.mock.invocationCallOrder[0]).toBeLessThan(fixture.maybeSingle.mock.invocationCallOrder[0]!)
    expect(fixture.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(fixture.download.mock.invocationCallOrder[0]!)
    expect(fixture.download.mock.invocationCallOrder[0]).toBeLessThan(fixture.directFinalizerFactory.mock.invocationCallOrder[0]!)
    expect(fixture.directFinalizerFactory.mock.invocationCallOrder[0]).toBeLessThan(fixture.finalizer.finalize.mock.invocationCallOrder[0]!)
  })
})
