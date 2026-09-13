import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { controlledImportManifestSchema, controlledImportRequestSchema, decimalSourceAmountSchema } from '../../../shared/schemas/costs/imports'

const ids = { company: 'c1000000-0000-4000-8000-000000000020', source: 'c1000000-0000-4000-8000-000000000050', run: 'c1000000-0000-4000-8000-000000000060', key: 'c1000000-0000-4000-8000-000000000061' }
const manifest = { schemaVersion: '1.2', workbookFamily: 'synthetic-ledger-v1', adapter: { id: 'synthetic-ledger', version: '1.0.0' }, targetCompanyId: ids.company, inputs: [{ fileIdentity: 'synthetic-ledger.xlsx', sha256: 'a'.repeat(64), originalFilename: 'synthetic-ledger.xlsx' }], sections: [{ id: 'section-01', inputSha256: 'a'.repeat(64), locator: { kind: 'cell_range', sheetName: ' Nhật ký ', range: 'B2:A1' }, mappingState: 'pending', observedLabels: ['Balance'], rawValues: ['9007199254740992.0000'], unresolvedIssues: ['scope uncertain'] }], expected: { sources: 1, versions: 1, sections: 1, figures: 1, reviewIssues: 1 } }

describe('controlled-import schemas', () => {
  it('preserves unscoped pending provenance and exact decimal source truth', () => {
    expect(controlledImportManifestSchema.parse(manifest).sections[0]?.mappingState).toBe('pending')
    expect(decimalSourceAmountSchema.parse('9007199254740992.0000')).toBe('9007199254740992.0000')
    expect(decimalSourceAmountSchema.safeParse(1).success).toBe(false)
    expect(decimalSourceAmountSchema.safeParse('1e3').success).toBe(false)
  })
  it('rejects executable and financial activation fields', () => {
    expect(controlledImportManifestSchema.safeParse({ ...manifest, financialActivation: false }).success).toBe(false)
    expect(controlledImportManifestSchema.safeParse({ ...manifest, operations: [{ createProject: true }] }).success).toBe(false)
  })
  it('keeps reviewed identity separate from the candidate manifest', () => {
    expect(controlledImportRequestSchema.safeParse({ runId: ids.run, idempotencyKey: ids.key, approvedManifestDigest: 'b'.repeat(64), actualInputDigests: ['a'.repeat(64),], manifest }).success).toBe(true)
    expect(controlledImportRequestSchema.safeParse({ runId: ids.run, idempotencyKey: ids.key, approved: true, actualInputDigests: ['a'.repeat(64)], manifest }).success).toBe(false)
  })
  it('parses the committed synthetic example through the exported schema', () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/costs/controlled-import/manifest.synthetic.json'), 'utf8'))
    expect(controlledImportManifestSchema.parse(fixture).sections).toHaveLength(2)
  })
})
