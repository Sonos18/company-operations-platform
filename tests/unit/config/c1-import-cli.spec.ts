import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { run } from '../../../scripts/c1-import'
import { canonicalizeManifest } from '../../../server/features/costs/imports/import-manifest'

const approvedOrigin = 'https://approved.taskovia.example'
function executionFixture(root: string, overrides: Record<string, unknown> = {}) {
  const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/costs/controlled-import/manifest.synthetic.json'), 'utf8'))
  const preparation = { companyId: manifest.targetCompanyId, workbookFamily: manifest.workbookFamily, adapter: manifest.adapter, manifestDigest: canonicalizeManifest(manifest).digest, inputDigests: manifest.inputs.map((input: { sha256: string }) => input.sha256), manifest }
  const packet = { environment: 'cloud-dev', authorizationReference: 'synthetic-test', destination: { applicationOrigin: approvedOrigin, supabaseProjectRef: 'gtgljlnhwvhqdnwrfdfj', associationReference: 'deployment-review:synthetic' }, companyId: preparation.companyId, workbookFamily: preparation.workbookFamily, adapter: preparation.adapter, manifestDigest: preparation.manifestDigest, inputDigests: preparation.inputDigests, runId: '10000000-0000-4000-8000-000000000060', idempotencyKey: '10000000-0000-4000-8000-000000000061', ...overrides }
  const packetPath = resolve(root, 'packet.json'); const preparationPath = resolve(root, 'preparation.json')
  writeFileSync(packetPath, JSON.stringify(packet)); writeFileSync(preparationPath, JSON.stringify(preparation))
  return { packet, packetPath, preparation, preparationPath, outputPath: resolve(root, 'attempt') }
}

describe('C1 import CLI', () => {
  it('provides runnable help and preserves invalid-command exits', () => {
    const cli = resolve(process.cwd(), 'scripts/c1-import.ts')
    const help = spawnSync(process.execPath, ['--import', 'tsx', cli, '--help'], { encoding: 'utf8' })
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('prepare')
    expect(help.stdout).toContain('execute')
    expect(help.stdout).toContain('get-result')
    const invalid = spawnSync(process.execPath, ['--import', 'tsx', cli, 'invalid'], { encoding: 'utf8' })
    expect(invalid.status).not.toBe(0)
  })

  it('dispatches help and invalid commands without the workbook processor', async () => {
    const adapter = '../../../server/features/costs/imports/vqh-workbook-family-adapter'
    vi.resetModules()
    vi.doMock(adapter, () => { throw new Error('WORKBOOK_PROCESSOR_LOADED') })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const { run: isolatedRun } = await import('../../../scripts/c1-import')
      await expect(isolatedRun(['--help'])).resolves.toBeUndefined()
      await expect(isolatedRun(['invalid'])).rejects.toThrow('UNKNOWN_COMMAND:invalid')
    } finally {
      log.mockRestore()
      vi.doUnmock(adapter)
      vi.resetModules()
    }
  })

  it('has no side effects when imported', () => {
    const cli = resolve(process.cwd(), 'scripts/c1-import.ts')
    const imported = spawnSync(process.execPath, ['--import', 'tsx', '--eval', `import(${JSON.stringify(pathToFileURL(cli).href)}).then(() => console.log('IMPORTED'))`], { encoding: 'utf8' })
    expect(imported.status).toBe(0)
    expect(imported.stdout.trim()).toBe('IMPORTED')
  })

  it('persists reconciliation identity when the write outcome is unknown', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-'))
    const { packet, packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    const fetch = vi.fn().mockRejectedValue(new Error('timeout'))
    const prepare = vi.fn().mockResolvedValue(preparation)

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare })).rejects.toMatchObject({ code: 'WRITE_OUTCOME_UNKNOWN', phase: 'post_dispatch_unknown' })
    expect(prepare).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
    expect(JSON.parse(readFileSync(resolve(outputPath, 'outcome.json'), 'utf8'))).toMatchObject({ status: 'UNKNOWN', runId: packet.runId, idempotencyKey: packet.idempotencyKey, error: { code: 'WRITE_OUTCOME_UNKNOWN' } })
  })

  it('retains safe structured 500 evidence while forbidding a retry', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-structured-500-'))
    const { packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Do not persist this message', requestId: '10000000-0000-4000-8000-000000000500', details: {} } }), { status: 500, headers: { 'content-type': 'application/json' } }))

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare: vi.fn().mockResolvedValue(preparation) })).rejects.toMatchObject({ phase: 'post_dispatch_unknown', code: 'UNUSABLE_ERROR_RESPONSE', statusCode: 500, requestId: '10000000-0000-4000-8000-000000000500', apiCode: 'INTERNAL_ERROR' })
    expect(fetch).toHaveBeenCalledOnce()
    const outcome = JSON.parse(readFileSync(resolve(outputPath, 'outcome.json'), 'utf8'))
    expect(outcome).toMatchObject({ status: 'UNKNOWN', error: { code: 'UNUSABLE_ERROR_RESPONSE', statusCode: 500, requestId: '10000000-0000-4000-8000-000000000500', apiCode: 'INTERNAL_ERROR' } })
    expect(JSON.stringify(outcome)).not.toContain('Do not persist this message')
  })

  it('keeps a malformed 500 unknown without a retry', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-malformed-500-'))
    const { packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    const fetch = vi.fn().mockResolvedValue(new Response('upstream failure', { status: 500, headers: { 'content-type': 'text/plain' } }))

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare: vi.fn().mockResolvedValue(preparation) })).rejects.toMatchObject({ phase: 'post_dispatch_unknown', code: 'MALFORMED_RESPONSE', statusCode: 500 })
    expect(fetch).toHaveBeenCalledOnce()
    expect(JSON.parse(readFileSync(resolve(outputPath, 'outcome.json'), 'utf8'))).toMatchObject({ status: 'UNKNOWN', error: { code: 'MALFORMED_RESPONSE', statusCode: 500 } })
  })

  it.each([
    ['wrong origin', 'https://wrong.taskovia.example', 'gtgljlnhwvhqdnwrfdfj', 'DESTINATION_MISMATCH'],
    ['origin with path/query/fragment', 'https://approved.taskovia.example/path?query=1#fragment', 'gtgljlnhwvhqdnwrfdfj', 'DESTINATION_INVALID'],
    ['origin with credentials', 'https://user:password@approved.taskovia.example', 'gtgljlnhwvhqdnwrfdfj', 'DESTINATION_INVALID'],
    ['wrong Supabase project', 'https://approved.taskovia.example', 'otherprojectref', 'DESTINATION_MISMATCH'],
  ])('refuses %s before preparation or credential dispatch', async (_label, endpoint, supabaseProjectRef, code) => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-destination-'))
    const { packetPath, preparationPath, outputPath } = executionFixture(root, { destination: { applicationOrigin: approvedOrigin, supabaseProjectRef, associationReference: 'deployment-review:synthetic' } })
    const fetch = vi.fn(); const prepare = vi.fn()

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', endpoint, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare })).rejects.toMatchObject({ code, phase: 'pre_dispatch' })
    expect(prepare).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves structured definite rejection evidence without relabeling it unknown', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-rejection-'))
    const { packet, packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'PERMISSION_DENIED', message: 'Denied', requestId: 'request-denied', details: {} } }), { status: 403, headers: { 'content-type': 'application/json' } }))
    const prepare = vi.fn().mockResolvedValue(preparation)

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare })).rejects.toMatchObject({ phase: 'server_rejection', code: 'PERMISSION_DENIED', statusCode: 403, requestId: 'request-denied' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(JSON.parse(readFileSync(resolve(outputPath, 'attempt.json'), 'utf8'))).toMatchObject({ status: 'LAUNCH_INTENDED', serverExecutionProven: false, operation: { runId: packet.runId, idempotencyKey: packet.idempotencyKey }, destination: packet.destination })
    expect(JSON.parse(readFileSync(resolve(outputPath, 'outcome.json'), 'utf8'))).toMatchObject({ status: 'REJECTED', runId: packet.runId, error: { code: 'PERMISSION_DENIED', statusCode: 403, requestId: 'request-denied' } })
  })

  it('rejects redirects and never follows credentials to another origin', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-redirect-'))
    const { packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://unexpected.example/import' } }))

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare: vi.fn().mockResolvedValue(preparation) })).rejects.toMatchObject({ phase: 'post_dispatch_unknown', code: 'UNEXPECTED_REDIRECT', statusCode: 302 })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/approved\.taskovia\.example\/api\//u), expect.objectContaining({ redirect: 'error' }))
    expect(JSON.parse(readFileSync(resolve(outputPath, 'outcome.json'), 'utf8'))).toMatchObject({ status: 'UNKNOWN', error: { code: 'UNEXPECTED_REDIRECT', statusCode: 302 } })
  })

  it('records malformed success as unknown and does not resubmit', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-malformed-'))
    const { packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ unrelated: true }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare: vi.fn().mockResolvedValue(preparation) })).rejects.toMatchObject({ phase: 'post_dispatch_unknown', code: 'WRITE_OUTCOME_UNKNOWN' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(JSON.parse(readFileSync(resolve(outputPath, 'outcome.json'), 'utf8'))).toMatchObject({ status: 'UNKNOWN', error: { code: 'WRITE_OUTCOME_UNKNOWN' } })
  })

  it('preserves a previous attempt directory and makes no request', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-existing-'))
    const { packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    mkdirSync(outputPath)
    writeFileSync(resolve(outputPath, 'outcome.json'), '{"status":"HISTORICAL"}\n')
    const fetch = vi.fn(); const prepare = vi.fn().mockResolvedValue(preparation)

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare })).rejects.toMatchObject({ phase: 'pre_dispatch', code: 'ATTEMPT_DIRECTORY_EXISTS' })
    expect(readFileSync(resolve(outputPath, 'outcome.json'), 'utf8')).toBe('{"status":"HISTORICAL"}\n')
    expect(prepare).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('makes no request when durable evidence cannot be established', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-unwritable-'))
    const { packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    const fetch = vi.fn(); const prepare = vi.fn().mockResolvedValue(preparation)
    const evidence = { open: vi.fn(() => { throw new Error('EACCES') }), finish: vi.fn() }

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare, evidence } as never)).rejects.toMatchObject({ phase: 'pre_dispatch', code: 'EVIDENCE_WRITE_FAILED' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('enforces destination binding for direct get-result invocation', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-get-destination-'))
    const { packetPath, outputPath } = executionFixture(root)
    const fetch = vi.fn()

    await expect(run(['get-result', '--packet', packetPath, '--endpoint', 'https://wrong.taskovia.example', '--access-token-env', 'TOKEN', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare: vi.fn() })).rejects.toMatchObject({ phase: 'pre_dispatch', code: 'DESTINATION_MISMATCH' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not resend when durable success evidence fails after dispatch', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-post-write-evidence-'))
    const { packet, packetPath, preparation, preparationPath, outputPath } = executionFixture(root)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ runId: packet.runId, sourceIds: [], versionIds: [], sectionIds: [], figureIds: [], reviewIssueIds: [], replayed: false }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const evidence = { open: vi.fn(), finish: vi.fn(() => { throw new Error('EACCES') }) }

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', approvedOrigin, '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch, prepare: vi.fn().mockResolvedValue(preparation), evidence })).rejects.toMatchObject({ phase: 'post_dispatch_unknown', code: 'EVIDENCE_WRITE_FAILED_AFTER_DISPATCH' })
    expect(fetch).toHaveBeenCalledOnce()
  })
})
