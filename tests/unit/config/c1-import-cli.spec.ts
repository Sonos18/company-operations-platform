import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { run } from '../../../scripts/c1-import'
import { canonicalizeManifest } from '../../../server/features/costs/imports/import-manifest'

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

  it('has no side effects when imported', () => {
    const cli = resolve(process.cwd(), 'scripts/c1-import.ts')
    const imported = spawnSync(process.execPath, ['--import', 'tsx', '--eval', `import(${JSON.stringify(pathToFileURL(cli).href)}).then(() => console.log('IMPORTED'))`], { encoding: 'utf8' })
    expect(imported.status).toBe(0)
    expect(imported.stdout.trim()).toBe('IMPORTED')
  })

  it('persists reconciliation identity when the write outcome is unknown', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'c1-cli-'))
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/costs/controlled-import/manifest.synthetic.json'), 'utf8'))
    const preparation = { companyId: manifest.targetCompanyId, workbookFamily: manifest.workbookFamily, adapter: manifest.adapter, manifestDigest: canonicalizeManifest(manifest).digest, inputDigests: manifest.inputs.map((input: { sha256: string }) => input.sha256), manifest }
    const packet = { environment: 'cloud-dev', authorizationReference: 'synthetic-test', companyId: preparation.companyId, workbookFamily: preparation.workbookFamily, adapter: preparation.adapter, manifestDigest: preparation.manifestDigest, inputDigests: preparation.inputDigests, runId: '10000000-0000-4000-8000-000000000060', idempotencyKey: '10000000-0000-4000-8000-000000000061' }
    const packetPath = resolve(root, 'packet.json')
    const preparationPath = resolve(root, 'preparation.json')
    const outputPath = resolve(root, 'out')
    writeFileSync(packetPath, JSON.stringify(packet))
    writeFileSync(preparationPath, JSON.stringify(preparation))
    const fetch = vi.fn().mockRejectedValue(new Error('timeout'))

    await expect(run(['execute', '--packet', packetPath, '--preparation', preparationPath, '--endpoint', 'https://example.invalid', '--access-token-env', 'TOKEN', '--execute', '--output', outputPath], { env: { TOKEN: 'secret' }, fetch })).rejects.toThrow('WRITE_OUTCOME_UNKNOWN')
    expect(fetch).toHaveBeenCalledOnce()
    expect(JSON.parse(readFileSync(resolve(outputPath, 'outcome.json'), 'utf8'))).toEqual({ status: 'UNKNOWN', runId: packet.runId, idempotencyKey: packet.idempotencyKey, error: 'WRITE_OUTCOME_UNKNOWN' })
  })
})
