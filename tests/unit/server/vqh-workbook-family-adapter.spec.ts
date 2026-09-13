import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { canonicalizeManifest } from '../../../server/features/costs/imports/import-manifest'
import { prepareVqhWorkbookImport, VQH_ADAPTER, VQH_WORKBOOK_FAMILY } from '../../../server/features/costs/imports/vqh-workbook-family-adapter'

const companyId = '10000000-0000-4000-8000-000000000020'

async function workbook(path: string, sheetName = ' Nhật ký ') {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet(sheetName)
  sheet.getCell('A1').value = 'Tổng'
  sheet.getCell('A2').value = new Date(Date.UTC(1899, 11, 30, 5))
  sheet.getCell('A2').numFmt = 'h:mm'
  sheet.getCell('B1').value = { formula: 'TIME(2,30,0)', result: new Date(Date.UTC(1899, 11, 30, 2, 30)) }
  sheet.getCell('B1').numFmt = 'h:mm;@'
  sheet.getCell('C1').value = { formula: '#REF!', result: { error: '#REF!' } }
  sheet.getCell('C1').numFmt = 'mm-dd-yy'
  sheet.getCell('C2').value = { formula: 'A1' }
  sheet.getCell('B2').value = { formula: '1+1', result: 2 }
  writeFileSync(path, Buffer.from(await book.xlsx.writeBuffer()))
}

function manifest(path: string) {
  const bytes = readFileSync(path)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const fileIdentity = `input-${sha256.slice(0, 16)}`
  return {
    schemaVersion: '1.2', workbookFamily: VQH_WORKBOOK_FAMILY, adapter: VQH_ADAPTER, targetCompanyId: companyId,
    inputs: [{ fileIdentity, sha256, originalFilename: 'Sổ tổng hợp.xlsx', rawFileReference: 'historical/private/path.xlsx' }],
    sources: [{ id: 'source-1', code: 'S1', title: 'Synthetic', sourceSystem: 'workbook' }],
    sourceVersions: [{ id: 'version-1', sourceId: 'source-1', inputFileIdentity: fileIdentity, inputFileSha256: sha256, originalFilename: 'Sổ tổng hợp.xlsx', rawFileReference: 'historical/private/path.xlsx', sourceVersionLabel: null, sourcePeriodText: null, sourceAsOfText: null }],
    sections: [{ id: 'section-1', sourceVersionId: 'version-1', inputSha256: sha256, locator: { kind: 'cell_range', sheetName: ' Nhật ký ', range: 'A1:C2' }, mapping: { state: 'pending' }, observedLabels: ['A1=Tổng', 'A2=05:00:00'], rawValues: ['B1|formula==TIME(2,30,0)|cached="02:30:00"|raw="0.104166666666667"|format=h:mm;@', 'B2|formula==1+1|cached=2|raw="2"|format=General', 'C1|formula==#REF!|cached="#REF!"|raw="#REF!"|format=mm-dd-yy', 'C2|formula==A1|cached=null|raw=null|format=General'], unresolvedIssues: ['meaning pending'] }],
    figures: [{ id: 'figure-1', sectionId: 'section-1', label: 'Source total', rawValueText: '9007199254740992.0000', valueState: 'known', amount: '9007199254740992.0000', currencyCode: null, metricKind: 'unclassified', basis: 'unknown', balanceKind: null, roundingBasis: 'exact', roundingNote: null, periodBasis: 'unknown', periodFrom: null, periodTo: null, asOfDate: null, mapping: { state: 'pending' }, scopeKind: 'unknown', scopeDescription: 'Synthetic', confirmation: 'unverified', confirmationReference: null }],
    reviewIssues: [], duplicateCandidates: [], expected: { sources: 1, versions: 1, sections: 1, figures: 1, reviewIssues: 0 },
  }
}

describe('VQH workbook-family adapter', () => {
  it('prepares deterministically from explicit Unicode-path workbook bytes without rewriting provenance', async () => {
    const root = mkdtempSync(join(tmpdir(), 'c1 adapter '))
    const path = join(root, 'Sổ tổng hợp.xlsx')
    await workbook(path)
    const reviewed = manifest(path)
    const digest = canonicalizeManifest(reviewed).digest
    const first = await prepareVqhWorkbookImport({ manifest: reviewed, approvedManifestDigest: digest, targetCompanyId: companyId, bindings: [{ fileIdentity: reviewed.inputs[0].fileIdentity, path }], outputDirectory: join(root, 'out-1') })
    const second = await prepareVqhWorkbookImport({ manifest: reviewed, approvedManifestDigest: digest, targetCompanyId: companyId, bindings: [{ fileIdentity: reviewed.inputs[0].fileIdentity, path }], outputDirectory: join(root, 'out-2') })

    expect(first).toEqual(second)
    expect(first.manifest.sourceVersions[0].rawFileReference).toBe('historical/private/path.xlsx')
    expect(first.manifest.figures[0].amount).toBe('9007199254740992.0000')
    expect(first.provenance).toEqual({ sections: 1, cellRanges: 1, referencedCells: 6 })
    expect(JSON.parse(readFileSync(join(root, 'out-1', 'preparation.json'), 'utf8'))).toMatchObject({ manifestDigest: digest, networkCalls: 0 })
  })

  it('rejects changed bytes, swapped identity, wrong filename, missing sheet, and unsupported family before output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'c1-adapter-'))
    const path = join(root, 'Sổ tổng hợp.xlsx')
    await workbook(path)
    const reviewed = manifest(path)
    const digest = canonicalizeManifest(reviewed).digest
    const base = { manifest: reviewed, approvedManifestDigest: digest, targetCompanyId: companyId, bindings: [{ fileIdentity: reviewed.inputs[0].fileIdentity, path }], outputDirectory: join(root, randomUUID()) }

    await expect(prepareVqhWorkbookImport({ ...base, bindings: [{ fileIdentity: 'other', path }] })).rejects.toThrow('INPUT_BINDING_MISMATCH')
    const renamed = { ...reviewed, inputs: [{ ...reviewed.inputs[0], originalFilename: 'other.xlsx' }], sourceVersions: [{ ...reviewed.sourceVersions[0], originalFilename: 'other.xlsx' }] }
    await expect(prepareVqhWorkbookImport({ ...base, manifest: renamed, approvedManifestDigest: canonicalizeManifest(renamed).digest })).rejects.toThrow('INPUT_BINDING_MISMATCH')
    await expect(prepareVqhWorkbookImport({ ...base, manifest: { ...reviewed, workbookFamily: 'other' } })).rejects.toThrow('WORKBOOK_FAMILY_UNSUPPORTED')
    const otherPath = join(root, 'Other.xlsx')
    await workbook(otherPath, 'Other')
    const otherManifest = manifest(otherPath)
    const missingSheet = { ...otherManifest, inputs: [{ ...otherManifest.inputs[0], originalFilename: 'Other.xlsx' }], sourceVersions: [{ ...otherManifest.sourceVersions[0], originalFilename: 'Other.xlsx' }] }
    await expect(prepareVqhWorkbookImport({ ...base, manifest: missingSheet, approvedManifestDigest: canonicalizeManifest(missingSheet).digest, bindings: [{ fileIdentity: missingSheet.inputs[0].fileIdentity, path: otherPath }] })).rejects.toThrow('WORKBOOK_SHEET_MISSING')
  })
})
