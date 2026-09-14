import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip, { type JSZipObject } from 'jszip'
import type { ControlledImportManifest } from '../../../../shared/schemas/costs/imports'
import { canonicalizeManifest } from './import-manifest'

export const VQH_WORKBOOK_FAMILY = 'taskovia-vqh-project-cost-workbooks-v1'
export const VQH_ADAPTER = { id: 'taskovia-vqh-project-cost-workbooks', version: '0.1.0-candidate' } as const

interface Binding { fileIdentity: string; path: string }
interface PrepareInput { manifest: unknown; approvedManifestDigest: string; targetCompanyId: string; bindings: Binding[]; outputDirectory: string }

function fail(code: string): never { throw new Error(code) }
function digest(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex') }
const maximumWorkbookBytes = 50 * 1024 * 1024
const maximumArchiveEntries = 512
const maximumXmlBytes = 32 * 1024 * 1024
interface RawCell { hasFormula: boolean; rawValue: string | null; rawInlineText: string | null; type: string | null; style: string | null }

function xmlText(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}
function attribute(value: string, name: string) { return value.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'u'))?.[1] }
async function xml(entry: JSZipObject | null, code: string) {
  if (!entry) return fail(code)
  const size = (entry as JSZipObject & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
  if (typeof size === 'number' && size > maximumXmlBytes) return fail('WORKBOOK_ARCHIVE_LIMIT_EXCEEDED')
  const value = await entry.async('string')
  if (Buffer.byteLength(value) > maximumXmlBytes) return fail('WORKBOOK_ARCHIVE_LIMIT_EXCEEDED')
  return value
}
function sheetTargets(workbookXml: string, relationshipsXml: string) {
  const relationships = new Map<string, string>()
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gu)) {
    const id = attribute(match[1]!, 'Id'); const target = attribute(match[1]!, 'Target')
    if (id && target) relationships.set(id, target)
  }
  const result = new Map<string, string>()
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/gu)) {
    const name = attribute(match[1]!, 'name'); const relationship = attribute(match[1]!, 'r:id'); const target = relationship && relationships.get(relationship)
    if (!name || !target || target.includes('..') || target.includes('\\')) return fail('WORKBOOK_STRUCTURE_UNSUPPORTED')
    const path = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`
    result.set(xmlText(name), path)
  }
  return result
}
function sharedStringCount(value: string | undefined) { return value ? [...value.matchAll(/<si\b[^>]*>/gu)].length : 0 }
const builtInFormats: Record<string, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 5: '"$"#,##0_);("$"#,##0)', 6: '"$"#,##0_);[Red]("$"#,##0)', 7: '"$"#,##0.00_);("$"#,##0.00)', 8: '"$"#,##0.00_);[Red]("$"#,##0.00)', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'mm-dd-yy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yy h:mm',
  37: '#,##0_);(#,##0)', 38: '#,##0_);[Red](#,##0)', 39: '#,##0.00_);(#,##0.00)', 40: '#,##0.00_);[Red](#,##0.00)', 41: '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)', 42: '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"_);_(@_)', 43: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)', 44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
}
function customFormats(value: string) {
  const formats = new Map(Object.entries(builtInFormats))
  for (const match of value.matchAll(/<numFmt\b([^>]*)\/?\s*>/gu)) {
    const id = attribute(match[1]!, 'numFmtId'); const code = attribute(match[1]!, 'formatCode')
    if (id && code !== undefined) formats.set(id, xmlText(code))
  }
  const cellXfs = value.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/u)?.[1]
  if (!cellXfs) return fail('WORKBOOK_STRUCTURE_UNSUPPORTED')
  return [...cellXfs.matchAll(/<xf\b([^>]*)\/?\s*>/gu)].map(match => formats.get(attribute(match[1]!, 'numFmtId') ?? ''))
}
function rawCells(value: string) {
  const result = new Map<string, RawCell>()
  for (const match of value.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
    const coordinate = attribute(match[1]!, 'r')
    if (!coordinate) return fail('WORKBOOK_STRUCTURE_UNSUPPORTED')
    const body = match[2] ?? ''
    const rawValue = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1]
    const inline = body.match(/<is\b[^>]*>\s*<t\b[^>]*>([\s\S]*?)<\/t>\s*<\/is>/u)?.[1]
    result.set(coordinate, { hasFormula: /<f\b/u.test(body), rawValue: rawValue === undefined ? null : xmlText(rawValue), rawInlineText: inline === undefined ? null : xmlText(inline), type: attribute(match[1]!, 't') ?? null, style: attribute(match[1]!, 's') ?? null })
  }
  return result
}
async function rawWorkbook(bytes: Buffer) {
  if (bytes.length > maximumWorkbookBytes) return fail('WORKBOOK_ARCHIVE_LIMIT_EXCEEDED')
  let zip: JSZip
  try { zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false }) } catch { return fail('WORKBOOK_ARCHIVE_INVALID') }
  if (Object.keys(zip.files).length > maximumArchiveEntries) return fail('WORKBOOK_ARCHIVE_LIMIT_EXCEEDED')
  const workbookXml = await xml(zip.file('xl/workbook.xml'), 'WORKBOOK_STRUCTURE_UNSUPPORTED')
  const relationshipsXml = await xml(zip.file('xl/_rels/workbook.xml.rels'), 'WORKBOOK_STRUCTURE_UNSUPPORTED')
  const stylesXml = await xml(zip.file('xl/styles.xml'), 'WORKBOOK_STRUCTURE_UNSUPPORTED')
  const stringsEntry = zip.file('xl/sharedStrings.xml')
  return { zip, targets: sheetTargets(workbookXml, relationshipsXml), sharedStrings: sharedStringCount(stringsEntry ? await xml(stringsEntry, 'WORKBOOK_STRUCTURE_UNSUPPORTED') : undefined), formats: customFormats(stylesXml) }
}
function splitEvidence(value: string) {
  const result: string[] = []; let current = ''; let quoted = false; let escaped = false
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!
    if (escaped) { current += character; escaped = false; continue }
    if (quoted && character === '\\') { current += character; escaped = true; continue }
    if (character === '"') {
      if (quoted && value[index + 1] === '"') { current += '""'; index++; continue }
      quoted = !quoted; current += character; continue
    }
    if (character === '|' && !quoted) { result.push(current); current = ''; continue }
    current += character
  }
  if (quoted || escaped) return fail('WORKBOOK_EVIDENCE_UNSUPPORTED')
  result.push(current)
  return result
}
function parseRawEvidence(value: string, sectionId: string) {
  const parts = splitEvidence(value); const coordinate = parts.shift()
  if (!coordinate?.match(/^[A-Z]+[1-9]\d*$/u)) return fail(`WORKBOOK_EVIDENCE_UNSUPPORTED:${sectionId}`)
  const fields = new Map<string, string>()
  for (const part of parts) {
    const separator = part.indexOf('='); const key = part.slice(0, separator); const fieldValue = part.slice(separator + 1)
    if (separator < 1 || fields.has(key)) return fail(`WORKBOOK_EVIDENCE_UNSUPPORTED:${sectionId}:${coordinate}`)
    fields.set(key, fieldValue)
  }
  const keys = [...fields.keys()].join('|')
  if (keys !== 'value|raw|format' && keys !== 'formula|cached|raw|format') return fail(`WORKBOOK_EVIDENCE_UNSUPPORTED:${sectionId}:${coordinate}`)
  return { coordinate, fields, formula: keys.startsWith('formula') }
}
function parseScalar(value: string, sectionId: string, coordinate: string) {
  try { return JSON.parse(value) as unknown } catch { return fail(`WORKBOOK_EVIDENCE_UNSUPPORTED:${sectionId}:${coordinate}`) }
}
function sameValue(actual: unknown, expected: unknown) { return Object.is(actual, expected) }
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
async function verifyWorkbook(bytes: Buffer, manifest: ControlledImportManifest, inputIdentity: string) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as never)
  const raw = await rawWorkbook(bytes)
  const versions = new Map(manifest.sourceVersions.map(version => [version.id, version]))
  let evidenceOccurrences = 0
  const distinctSourceCells = new Set<string>()
  for (const section of manifest.sections) {
    const version = versions.get(section.sourceVersionId)
    if (!version || version.inputFileIdentity !== inputIdentity) continue
    if (section.locator.kind !== 'cell_range') continue
    const worksheet = workbook.getWorksheet(section.locator.sheetName)
    if (!worksheet) return fail(`WORKBOOK_SHEET_MISSING:${section.locator.sheetName}`)
    const target = raw.targets.get(section.locator.sheetName)
    if (!target) return fail(`WORKBOOK_SHEET_MISSING:${section.locator.sheetName}`)
    const sourceCells = rawCells(await xml(raw.zip.file(target), 'WORKBOOK_STRUCTURE_UNSUPPORTED'))
    const range = bounds(section.locator.range)
    for (const item of section.observedLabels) {
      const match = item.match(/^([A-Z]+[1-9]\d*)=/u)
      if (!match) return fail(`WORKBOOK_EVIDENCE_UNSUPPORTED:${section.id}`)
      const coordinate = match[1]!
      if (!within(coordinate, range)) return fail(`WORKBOOK_EVIDENCE_OUTSIDE_RANGE:${section.id}:${coordinate}`)
      const cell = worksheet.getCell(coordinate)
      const actual = normalizedCellValue(cell.value, cell.numFmt, cell.formula)
      if ((actual === null || actual === undefined || actual === '') && !cell.formula) return fail(`WORKBOOK_CELL_MISSING:${section.id}:${coordinate}`)
      if (!sameValue(actual, item.slice(item.indexOf('=') + 1))) return fail(`WORKBOOK_VALUE_MISMATCH:${section.id}:${coordinate}`)
      evidenceOccurrences++; distinctSourceCells.add(`${section.locator.sheetName}|${coordinate}`)
    }
    for (const item of section.rawValues) {
      const evidence = parseRawEvidence(item, section.id); const { coordinate, fields } = evidence
      if (!within(coordinate, range)) return fail(`WORKBOOK_EVIDENCE_OUTSIDE_RANGE:${section.id}:${coordinate}`)
      const cell = worksheet.getCell(coordinate); const source = sourceCells.get(coordinate)
      if (!source) return fail(`WORKBOOK_CELL_MISSING:${section.id}:${coordinate}`)
      if (evidence.formula) {
        if (!source.hasFormula || !cell.formula || fields.get('formula') !== `=${cell.formula}`) return fail(`WORKBOOK_FORMULA_MISMATCH:${section.id}:${coordinate}`)
        const cachedToken = fields.get('cached')!
        const expectedCached = parseScalar(cachedToken, section.id, coordinate)
        const actualCached = cell.result === undefined ? null : normalizedCellValue(cell.result, cell.numFmt, cell.formula)
        if (!sameValue(actualCached, expectedCached)) return fail(`WORKBOOK_CACHED_VALUE_MISMATCH:${section.id}:${coordinate}`)
      } else {
        if (source.hasFormula) return fail(`WORKBOOK_VALUE_MISMATCH:${section.id}:${coordinate}`)
        const valueToken = fields.get('value')!
        const expectedValue = parseScalar(valueToken, section.id, coordinate)
        const actualValue = normalizedCellValue(cell.value, cell.numFmt, cell.formula)
        if (!sameValue(actualValue, expectedValue)) return fail(`WORKBOOK_VALUE_MISMATCH:${section.id}:${coordinate}`)
      }
      const expectedRaw = parseScalar(fields.get('raw')!, section.id, coordinate)
      const actualRaw = source.rawValue ?? source.rawInlineText
      if (!sameValue(actualRaw, expectedRaw)) return fail(`WORKBOOK_RAW_VALUE_MISMATCH:${section.id}:${coordinate}`)
      const exactFormat = source.style === null ? undefined : raw.formats[Number(source.style)]
      if ((exactFormat ?? cell.numFmt ?? 'General') !== fields.get('format')) return fail(`WORKBOOK_FORMAT_MISMATCH:${section.id}:${coordinate}`)
      if (source.type === 's' && (source.rawValue === null || !Number.isInteger(Number(source.rawValue)) || Number(source.rawValue) < 0 || Number(source.rawValue) >= raw.sharedStrings)) return fail(`WORKBOOK_SHARED_STRING_MISMATCH:${section.id}:${coordinate}`)
      evidenceOccurrences++; distinctSourceCells.add(`${section.locator.sheetName}|${coordinate}`)
    }
  }
  return { evidenceOccurrences, distinctSourceCells }
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
  let evidenceOccurrences = 0
  const distinctSourceCells = new Set<string>()
  for (const manifestInput of reviewed.manifest.inputs) {
    const path = bindings.get(manifestInput.fileIdentity)
    if (!path || basename(path) !== manifestInput.originalFilename) return fail('INPUT_BINDING_MISMATCH')
    let bytes: Buffer
    try { bytes = readFileSync(path) } catch { return fail(`INPUT_FILE_MISSING:${manifestInput.fileIdentity}`) }
    if (digest(bytes) !== manifestInput.sha256) return fail(`INPUT_DIGEST_MISMATCH:${manifestInput.fileIdentity}`)
    const verified = await verifyWorkbook(bytes, reviewed.manifest, manifestInput.fileIdentity)
    evidenceOccurrences += verified.evidenceOccurrences
    for (const cell of verified.distinctSourceCells) distinctSourceCells.add(`${manifestInput.fileIdentity}|${cell}`)
  }
  const result = {
    companyId: input.targetCompanyId, workbookFamily: VQH_WORKBOOK_FAMILY, adapter: { ...VQH_ADAPTER }, manifestDigest: reviewed.digest,
    inputDigests: reviewed.manifest.inputs.map(value => value.sha256), manifest: reviewed.manifest,
    counts: { inputs: reviewed.manifest.inputs.length, sources: reviewed.manifest.sources.length, versions: reviewed.manifest.sourceVersions.length, sections: reviewed.manifest.sections.length, figures: reviewed.manifest.figures.length, reviewIssues: reviewed.manifest.reviewIssues.length, duplicateCandidates: reviewed.manifest.duplicateCandidates.length },
    unresolved: { pendingSections: reviewed.manifest.sections.filter(value => value.mapping.state === 'pending').length, pendingFigures: reviewed.manifest.figures.filter(value => value.mapping.state === 'pending').length, reviewIssues: reviewed.manifest.reviewIssues.length },
    provenance: { sections: reviewed.manifest.sections.length, cellRanges: reviewed.manifest.sections.filter(value => value.locator.kind === 'cell_range').length, evidenceOccurrences, distinctSourceCells: distinctSourceCells.size }, networkCalls: 0,
  }
  mkdirSync(input.outputDirectory, { recursive: true })
  writeFileSync(resolve(input.outputDirectory, 'canonical-manifest.json'), `${JSON.stringify(reviewed.manifest, null, 2)}\n`)
  writeFileSync(resolve(input.outputDirectory, 'preparation.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}
