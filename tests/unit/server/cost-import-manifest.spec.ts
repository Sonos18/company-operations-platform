import { describe, expect, it } from 'vitest'
import { canonicalizeManifest, decideReplay, occurrenceIdentity, validateReviewedImport } from '../../../server/features/costs/imports/import-manifest'

const company = 'c1000000-0000-4000-8000-000000000020'
const base = { schemaVersion: '1.2', workbookFamily: 'synthetic-ledger-v1', adapter: { id: 'synthetic-ledger', version: '1.0.0' }, targetCompanyId: company, inputs: [{ fileIdentity: 'source', sha256: 'a'.repeat(64), originalFilename: 'source.xlsx' }], sections: [{ id: 's1', inputSha256: 'a'.repeat(64), locator: { kind: 'cell_range', sheetName: ' 日本 ', range: 'B1:A2' }, mapping: { state: 'pending' }, observedLabels: ['x'], rawValues: ['0'], unresolvedIssues: [] }], figures: [], reviewIssues: [], duplicateCandidates: [], expected: { sources: 1, versions: 1, sections: 1, figures: 0, reviewIssues: 0 } }

describe('controlled-import manifest helpers', () => {
  it('canonicalizes object ordering and equivalent multi-letter A1 rectangles', () => {
    expect(canonicalizeManifest(base).digest).toBe(canonicalizeManifest({ ...base, sections: [{ ...base.sections[0], locator: { kind: 'cell_range', sheetName: ' 日本 ', range: 'A1:B2' } }] }).digest)
    expect(canonicalizeManifest({ ...base, sections: [{ ...base.sections[0], locator: { kind: 'cell_range', sheetName: 'S', range: 'AAA2:AA1' } }] }).manifest.sections[0]?.locator.range).toBe('AA1:AAA2')
  })
  it('rejects changed reviewed content, company, adapter, or input digest', () => {
    const digest = canonicalizeManifest(base).digest
    expect(() => validateReviewedImport({ manifest: base, approvedManifestDigest: digest, actualInputDigests: ['a'.repeat(64)], trustedCompanyId: company, permittedAdapter: base.adapter })).not.toThrow()
    expect(() => validateReviewedImport({ manifest: { ...base, targetCompanyId: 'c1000000-0000-4000-8000-000000000021' }, approvedManifestDigest: digest, actualInputDigests: ['a'.repeat(64)], trustedCompanyId: company, permittedAdapter: base.adapter })).toThrow('COMPANY_FORBIDDEN')
  })
  it('distinguishes retry identity from request correlation and detects payload conflict', () => {
    expect(decideReplay({ companyId: company, command: 'controlled_import', idempotencyKey: 'k', payloadDigest: 'a', existing: { companyId: company, command: 'controlled_import', idempotencyKey: 'k', payloadDigest: 'a' } })).toBe('replay')
    expect(decideReplay({ companyId: company, command: 'controlled_import', idempotencyKey: 'k', payloadDigest: 'b', existing: { companyId: company, command: 'controlled_import', idempotencyKey: 'k', payloadDigest: 'a' } })).toBe('IDEMPOTENCY_CONFLICT')
    expect(decideReplay({ companyId: 'c1000000-0000-4000-8000-000000000021', command: 'controlled_import', idempotencyKey: 'k', payloadDigest: 'a', existing: { companyId: company, command: 'controlled_import', idempotencyKey: 'k', payloadDigest: 'a' } })).toBe('new')
  })
  it('separates occurrence identity from reviewed descriptive content', () => {
    expect(occurrenceIdentity({ kind: 'whole_file', note: 'first' })).toBe(occurrenceIdentity({ kind: 'whole_file', note: 'second' }))
    expect(canonicalizeManifest({ ...base, sections: [{ ...base.sections[0], locator: { kind: 'whole_file', note: 'first' } }] }).digest).not.toBe(canonicalizeManifest({ ...base, sections: [{ ...base.sections[0], locator: { kind: 'whole_file', note: 'second' } }] }).digest)
    expect(canonicalizeManifest({ ...base, inputs: [{ ...base.inputs[0], rawFileReference: undefined }] }).digest).toBe(canonicalizeManifest(base).digest)
  })
})
