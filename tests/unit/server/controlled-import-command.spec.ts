import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createControlledImportCommand } from '../../../server/features/costs/imports/controlled-import.command'
import { canonicalizeManifest } from '../../../server/features/costs/imports/import-manifest'

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/costs/controlled-import/manifest.synthetic.json'), 'utf8'))
const manifestDigest = canonicalizeManifest(manifest).digest
const preparation = { companyId: manifest.targetCompanyId, workbookFamily: manifest.workbookFamily, adapter: manifest.adapter, manifestDigest, inputDigests: manifest.inputs.map((input: { sha256: string }) => input.sha256), manifest }
const packet = { environment: 'cloud-dev', authorizationReference: 'P2.4-approved-packet', companyId: preparation.companyId, workbookFamily: preparation.workbookFamily, adapter: preparation.adapter, manifestDigest: preparation.manifestDigest, inputDigests: preparation.inputDigests, runId: '10000000-0000-4000-8000-000000000060', idempotencyKey: '10000000-0000-4000-8000-000000000061' }
const result = { runId: packet.runId, sourceIds: [], versionIds: [], sectionIds: [], figureIds: [], reviewIssueIds: [], replayed: false }

describe('controlled-import command', () => {
  it('requires explicit intent and an exact packet before one dispatch with stable replay identity', async () => {
    const persist = vi.fn().mockResolvedValue(result)
    const command = createControlledImportCommand({ persist, get: vi.fn() })
    await expect(command.execute({ execute: false, packet, preparation })).rejects.toThrow('EXECUTION_INTENT_REQUIRED')
    await expect(command.execute({ execute: true, packet: { ...packet, manifestDigest: 'c'.repeat(64) }, preparation })).rejects.toThrow('EXECUTION_PACKET_MISMATCH')
    await expect(command.execute({ execute: true, packet, preparation })).resolves.toMatchObject({ runId: packet.runId })
    expect(persist).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledWith(preparation.companyId, expect.objectContaining({ runId: packet.runId, idempotencyKey: packet.idempotencyKey }))
  })

  it('does not resubmit an unknown write and reconciles by company/run identity', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('network timeout'))
    const get = vi.fn().mockResolvedValue(result)
    const command = createControlledImportCommand({ persist, get })
    await expect(command.execute({ execute: true, packet, preparation })).rejects.toThrow('WRITE_OUTCOME_UNKNOWN')
    expect(persist).toHaveBeenCalledOnce()
    await expect(command.getResult(packet)).resolves.toMatchObject({ runId: packet.runId })
    expect(get).toHaveBeenCalledWith(packet.companyId, packet.runId)
  })

  it('requires an independent authorization reference and propagates idempotency conflicts', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('IDEMPOTENCY_CONFLICT'))
    const command = createControlledImportCommand({ persist, get: vi.fn() })
    const { authorizationReference: _authorizationReference, ...unapproved } = packet
    await expect(command.execute({ execute: true, packet: unapproved, preparation })).rejects.toThrow()
    expect(persist).not.toHaveBeenCalled()
    await expect(command.execute({ execute: true, packet, preparation })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    expect(persist).toHaveBeenCalledOnce()
  })
})
