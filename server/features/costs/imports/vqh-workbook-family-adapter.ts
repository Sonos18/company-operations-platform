import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import type { ControlledImportManifest } from '../../../../shared/schemas/costs/imports'
import { canonicalizeManifest } from './import-manifest'

export const VQH_WORKBOOK_FAMILY = 'taskovia-vqh-project-cost-workbooks-v1'
export const VQH_ADAPTER = { id: 'taskovia-vqh-project-cost-workbooks', version: '0.1.0-candidate' } as const

interface Binding { fileIdentity: string; path: string }
interface PrepareInput { manifest: unknown; approvedManifestDigest: string; targetCompanyId: string; bindings: Binding[]; outputDirectory: string }

function fail(code: string): never { throw new Error(code) }
function digest(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex') }
function cellCoordinate(value: string) { return value.match(/^([A-Z]+\d+)(?:[=|])/u)?.[1] }
function columnNumber(value: string) { let result = 0; for (const character of value) result = result * 26 + character.charCodeAt(0) - 64; return result }
function bounds(range: string) {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/u)
  if (!match) return fail('WORKBOOK_RANGE_INVALID')
  return { left: columnNumber(match[1]!), top: Number(match[2]!), right: columnNumber(match[3]!), bottom: Number(match[4]!) }
}
function within(coordinate: string, range: ReturnType<typeof bounds>) {
  const match = coordinate.match(/^([A-Z]+)(\d+)$/u)
  return Boolean(match && columnNumber(match[1]!) >= range.left && columnNumber(match[1]!) <= range.right && Number(match[2]!) >= range.top && Number(match[2]!) <= range.bottom)
}
function normalizedCellValue(value: unknown, numberFormat = '', formula?: string): unknown {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()) && formula?.match(/^#.+!$/u)) return formula
    return /h/iu.test(numberFormat) && !/[dy]/iu.test(numberFormat) ? value.toISOString().slice(11, 19) : value.toISOString().replace(/\.000Z$/u, '')
  }
  if (value && typeof value === 'object' && 'result' in value) return normalizedCellValue(value.result, numberFormat, 'formula' in value && typeof value.formula === 'string' ? value.formula : formula)
  if (value && typeof value === 'object' && 'error' in value) return value.error
  return value
}
function reviewedValue(value: unknown) { return typeof value === 'string' ? JSON.stringify(value) : String(value) }

async function verifyWorkbook(bytes: Buffer, manifest: ControlledImportManifest, inputIdentity: string) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as never)
  const versions = new Map(manifest.sourceVersions.map(version => [version.id, version]))
  let referencedCells = 0
  for (const section of manifest.sections) {
    const version = versions.get(section.sourceVersionId)
    if (!version || version.inputFileIdentity !== inputIdentity) continue
    if (section.locator.kind !== 'cell_range') continue
    const worksheet = workbook.getWorksheet(section.locator.sheetName)
    if (!worksheet) return fail(`WORKBOOK_SHEET_MISSING:${section.locator.sheetName}`)
    const range = bounds(section.locator.range)
    const evidence = [...section.observedLabels, ...section.rawValues]
    for (const item of evidence) {
      const coordinate = cellCoordinate(item)
      if (!coordinate) continue
      if (!within(coordinate, range)) return fail(`WORKBOOK_EVIDENCE_OUTSIDE_RANGE:${section.id}:${coordinate}`)
      const cell = worksheet.getCell(coordinate)
      const actual = normalizedCellValue(cell.value, cell.numFmt, cell.formula)
      if ((actual === null || actual === undefined || actual === '') && !cell.formula) return fail(`WORKBOOK_CELL_MISSING:${section.id}:${coordinate}`)
      const expectedLabel = item.match(/^[A-Z]+\d+=(.*)$/u)?.[1]
      if (expectedLabel !== undefined && reviewedValue(actual) !== JSON.stringify(expectedLabel) && String(actual) !== expectedLabel) return fail(`WORKBOOK_VALUE_MISMATCH:${section.id}:${coordinate}`)
      const expectedFormula = item.match(/\|formula=(=[^|]*)/u)?.[1]
      if (expectedFormula && (!cell.formula || `=${cell.formula}` !== expectedFormula)) return fail(`WORKBOOK_FORMULA_MISMATCH:${section.id}:${coordinate}`)
      const expectedCached = item.match(/\|cached=([^|]*)/u)?.[1]
      const cached = cell.result === undefined ? null : normalizedCellValue(cell.result, cell.numFmt, cell.formula)
      if (expectedCached !== undefined && reviewedValue(cached) !== expectedCached && String(cached) !== expectedCached) return fail(`WORKBOOK_CACHED_VALUE_MISMATCH:${section.id}:${coordinate}`)
      referencedCells++
    }
  }
  return referencedCells
}

export async function prepareVqhWorkbookImport(input: PrepareInput) {
  const untrusted = input.manifest as Record<string, unknown>
  if (untrusted.workbookFamily !== VQH_WORKBOOK_FAMILY) return fail('WORKBOOK_FAMILY_UNSUPPORTED')
  const reviewed = canonicalizeManifest(input.manifest)
  if (reviewed.digest !== input.approvedManifestDigest) return fail('MANIFEST_DIGEST_MISMATCH')
  if (reviewed.manifest.targetCompanyId !== input.targetCompanyId) return fail('COMPANY_FORBIDDEN')
  if (reviewed.manifest.adapter.id !== VQH_ADAPTER.id || reviewed.manifest.adapter.version !== VQH_ADAPTER.version) return fail('ADAPTER_NOT_PERMITTED')
  const bindings = new Map(input.bindings.map(binding => [binding.fileIdentity, binding.path]))
  if (bindings.size !== reviewed.manifest.inputs.length || input.bindings.length !== bindings.size) return fail('INPUT_BINDING_MISMATCH')
  let referencedCells = 0
  for (const manifestInput of reviewed.manifest.inputs) {
    const path = bindings.get(manifestInput.fileIdentity)
    if (!path || basename(path) !== manifestInput.originalFilename) return fail('INPUT_BINDING_MISMATCH')
    let bytes: Buffer
    try { bytes = readFileSync(path) } catch { return fail(`INPUT_FILE_MISSING:${manifestInput.fileIdentity}`) }
    if (digest(bytes) !== manifestInput.sha256) return fail(`INPUT_DIGEST_MISMATCH:${manifestInput.fileIdentity}`)
    referencedCells += await verifyWorkbook(bytes, reviewed.manifest, manifestInput.fileIdentity)
  }
  const result = {
    companyId: input.targetCompanyId, workbookFamily: VQH_WORKBOOK_FAMILY, adapter: { ...VQH_ADAPTER }, manifestDigest: reviewed.digest,
    inputDigests: reviewed.manifest.inputs.map(value => value.sha256), manifest: reviewed.manifest,
    counts: { inputs: reviewed.manifest.inputs.length, sources: reviewed.manifest.sources.length, versions: reviewed.manifest.sourceVersions.length, sections: reviewed.manifest.sections.length, figures: reviewed.manifest.figures.length, reviewIssues: reviewed.manifest.reviewIssues.length, duplicateCandidates: reviewed.manifest.duplicateCandidates.length },
    unresolved: { pendingSections: reviewed.manifest.sections.filter(value => value.mapping.state === 'pending').length, pendingFigures: reviewed.manifest.figures.filter(value => value.mapping.state === 'pending').length, reviewIssues: reviewed.manifest.reviewIssues.length },
    provenance: { sections: reviewed.manifest.sections.length, cellRanges: reviewed.manifest.sections.filter(value => value.locator.kind === 'cell_range').length, referencedCells }, networkCalls: 0,
  }
  mkdirSync(input.outputDirectory, { recursive: true })
  writeFileSync(resolve(input.outputDirectory, 'canonical-manifest.json'), `${JSON.stringify(reviewed.manifest, null, 2)}\n`)
  writeFileSync(resolve(input.outputDirectory, 'preparation.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}
