import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { controlledImportManifestSchema, controlledImportRequestSchema, decimalSourceAmountSchema } from '../../../shared/schemas/costs/imports'
import { accountingSourceVersionSchema } from '../../../shared/schemas/costs/sources'

const ids = { company: 'c1000000-0000-4000-8000-000000000020', source: 'c1000000-0000-4000-8000-000000000050', run: 'c1000000-0000-4000-8000-000000000060', key: 'c1000000-0000-4000-8000-000000000061' }
const manifest = { schemaVersion: '1.2', workbookFamily: 'synthetic-ledger-v1', adapter: { id: 'synthetic-ledger', version: '1.0.0' }, targetCompanyId: ids.company, inputs: [{ fileIdentity: 'synthetic-ledger.xlsx', sha256: 'a'.repeat(64), originalFilename: 'synthetic-ledger.xlsx' }], sources: [{ id: 'source-1', code: 'S1', title: 'Synthetic', sourceSystem: 'synthetic' }], sourceVersions: [{ id: 'source-1-v1', sourceId: 'source-1', inputFileIdentity: 'synthetic-ledger.xlsx', inputFileSha256: 'a'.repeat(64), originalFilename: 'synthetic-ledger.xlsx', rawFileReference: null, sourceVersionLabel: null, sourcePeriodText: null, sourceAsOfText: null }], sections: [{ id: 'section-01', sourceVersionId: 'source-1-v1', inputSha256: 'a'.repeat(64), locator: { kind: 'cell_range', sheetName: ' Nhật ký ', range: 'B2:A1' }, mapping: { state: 'pending' }, observedLabels: ['Balance'], rawValues: ['9007199254740992.0000'], unresolvedIssues: ['scope uncertain'] }], figures: [], reviewIssues: [], duplicateCandidates: [], expected: { sources: 1, versions: 1, sections: 1, figures: 0, reviewIssues: 0 } }

describe('controlled-import schemas', () => {
  it('preserves unscoped pending provenance and exact decimal source truth', () => {
    expect(controlledImportManifestSchema.parse(manifest).sections[0]?.mapping.state).toBe('pending')
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
  it('preserves structured mapping, figures, review issues, and duplicate candidates', () => {
    const structured = controlledImportManifestSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/costs/controlled-import/manifest.synthetic.json'), 'utf8')))
    expect(structured.sections[0]?.mapping).toEqual({ state: 'pending' })
    expect(structured.figures[0]?.amount).toBe('0')
    expect(structured.reviewIssues[0]?.impact).toBe('blocks_normalization')
    expect(structured.duplicateCandidates[0]?.sectionId).toBe('opening-balance')
    expect(controlledImportManifestSchema.safeParse({ ...structured, figures: [{ ...structured.figures[0], valueState: 'blank', amount: '1' }] }).success).toBe(false)
  })
  it('uses input provenance instead of a mandatory runtime file object', () => {
    expect(accountingSourceVersionSchema.safeParse({ id: ids.source, sourceId: ids.source, versionNo: 1, inputFileIdentity: 'source', inputFileSha256: 'a'.repeat(64), originalFilename: 'source.xlsx', rawFileReference: null, status: 'draft', sourceVersionLabel: null, sourcePeriodText: null, sourceAsOfText: null, version: 0, createdAt: '2026-09-13T00:00:00.000Z', sharedAt: null }).success).toBe(true)
  })
  it('enforces source/version hierarchy and declared counts', () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/costs/controlled-import/manifest.synthetic.json'), 'utf8'))
    expect(controlledImportManifestSchema.parse(fixture).sourceVersions).toHaveLength(2)
    for (const invalid of [
      { ...fixture, sourceVersions: [{ ...fixture.sourceVersions[0], sourceId: 'missing' }] },
      { ...fixture, sourceVersions: [{ ...fixture.sourceVersions[0], inputFileIdentity: 'missing' }] },
      { ...fixture, sections: [{ ...fixture.sections[0], sourceVersionId: 'missing' }] },
      { ...fixture, figures: [{ ...fixture.figures[0], sectionId: 'missing' }] },
      { ...fixture, reviewIssues: [{ ...fixture.reviewIssues[0], sectionId: 'missing' }] },
      { ...fixture, duplicateCandidates: [{ ...fixture.duplicateCandidates[0], candidateSectionId: 'missing' }] },
      { ...fixture, sources: [fixture.sources[0], fixture.sources[0]] },
      { ...fixture, expected: { ...fixture.expected, figures: 2 } },
      { ...fixture, expected: { ...fixture.expected, sources: 2 } },
      { ...fixture, expected: { ...fixture.expected, versions: 3 } },
      { ...fixture, expected: { ...fixture.expected, sections: 3 } },
      { ...fixture, expected: { ...fixture.expected, reviewIssues: 2 } },
    ]) expect(controlledImportManifestSchema.safeParse(invalid).success).toBe(false)
  })
})
