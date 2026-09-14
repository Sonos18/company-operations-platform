import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createApp, createRouter, defineEventHandler, toWebHandler } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { run } from '../../../scripts/c1-import'
import { VQH_ADAPTER, VQH_WORKBOOK_FAMILY } from '../../../server/features/costs/imports/vqh-workbook-family-adapter'
import { createControlledImportRoutes } from '../../../server/features/costs/imports/controlled-import.routes'
import { canonicalizeManifest } from '../../../server/features/costs/imports/import-manifest'
import { AppApiError, runApiRoute } from '../../../server/utils/api-error'

const companyId = 'c1000000-0000-4000-8000-000000000020'
const runId = 'c1000000-0000-4000-8000-000000000060'
const idempotencyKey = 'c1000000-0000-4000-8000-000000000061'
const requestId = 'request-route-integration'
const origin = 'https://approved.taskovia.example'

function fixture(root: string) {
  const source = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/costs/controlled-import/manifest.synthetic.json'), 'utf8'))
  const manifest = { ...source, workbookFamily: VQH_WORKBOOK_FAMILY, adapter: VQH_ADAPTER }
  const manifestDigest = canonicalizeManifest(manifest).digest
  const preparation = { companyId, workbookFamily: manifest.workbookFamily, adapter: manifest.adapter, manifestDigest, inputDigests: manifest.inputs.map((input: { sha256: string }) => input.sha256), manifest }
  const packet = { environment: 'cloud-dev', authorizationReference: 'synthetic-route-review', destination: { applicationOrigin: origin, supabaseProjectRef: 'gtgljlnhwvhqdnwrfdfj', associationReference: 'deployment-review:synthetic' }, companyId, workbookFamily: manifest.workbookFamily, adapter: manifest.adapter, manifestDigest, inputDigests: preparation.inputDigests, runId, idempotencyKey }
  const packetPath = resolve(root, 'packet.json'); const preparationPath = resolve(root, 'preparation.json')
  writeFileSync(packetPath, JSON.stringify(packet)); writeFileSync(preparationPath, JSON.stringify(preparation))
  return { packetPath, preparation, preparationPath }
}

function localFetch(resolveContext: Parameters<typeof createControlledImportRoutes>[0]['resolveContext']) {
  const routes = createControlledImportRoutes({ resolveContext })
  const router = createRouter()
  router.post('/api/companies/:companyId/controlled-imports', defineEventHandler(event => {
    event.context.requestId = requestId
    return runApiRoute(event, () => routes.persist(event))
  }))
  router.get('/api/companies/:companyId/controlled-imports/:runId', defineEventHandler(event => {
    event.context.requestId = requestId
    return runApiRoute(event, () => routes.get(event))
  }))
  const handler = toWebHandler(createApp().use(router.handler))
  return ((input: string | URL | Request, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch
}

describe('controlled-import CLI/HTTP/route integration', () => {
  it('reaches the existing service and exact user-scoped RPC with requestId propagation', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-route-integration-'))
    const { packetPath, preparation, preparationPath } = fixture(root)
    const row = { run_id: runId, source_ids: [], version_ids: [], section_ids: [], figure_ids: [], review_issue_ids: [], replayed: false }
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null })
    const resolveContext = vi.fn().mockResolvedValue({ actorId: 'c1000000-0000-4000-8000-000000000901', tenantId: 'c1000000-0000-4000-8000-000000000010', companyId, permissions: ['cost.source.read', 'cost.prepare'], requestId, db: { rpc } })

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', origin, '--access-token-env', 'TOKEN', '--execute', '--output', resolve(root, 'attempt')], { env: { TOKEN: 'user-token' }, fetch: localFetch(resolveContext), prepare: vi.fn().mockResolvedValue(preparation) })).resolves.toMatchObject({ runId, replayed: false })

    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('c1_persist_controlled_import', expect.objectContaining({ target_company_id: companyId, target_request_id: requestId, target_request: expect.objectContaining({ runId, idempotencyKey }), target_payload_digest: expect.stringMatching(/^[a-f0-9]{64}$/u) }))
  })

  it('preserves authenticated cross-company rejection without touching RPC', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-route-denied-'))
    const { packetPath, preparation, preparationPath } = fixture(root)
    const rpc = vi.fn()
    const resolveContext = vi.fn().mockRejectedValue(new AppApiError(403, 'COMPANY_FORBIDDEN', 'Denied'))

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', origin, '--access-token-env', 'TOKEN', '--execute', '--output', resolve(root, 'attempt')], { env: { TOKEN: 'user-token' }, fetch: localFetch(resolveContext), prepare: vi.fn().mockResolvedValue(preparation) })).rejects.toMatchObject({ phase: 'server_rejection', code: 'COMPANY_FORBIDDEN', statusCode: 403, requestId })
    expect(rpc).not.toHaveBeenCalled()
  })
})
