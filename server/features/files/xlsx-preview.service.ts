import * as XLSX from 'xlsx'
import { maxSourceFileBytes } from '../../../shared/schemas/files'

const maxSheets = 20
const maxCells = 200_000
const maxDecompressedBytes = 100 * 1024 * 1024
const defaultRows = 200
const defaultColumns = 50
const errorToken = /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)$/

function escape(value: unknown) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;') }
function range(ref: string | undefined) { return ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } } }
export function assertXlsxArchiveBudget(bytes: Buffer) {
  let eocd = -1
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) if (bytes.readUInt32LE(index) === 0x06054b50) { eocd = index; break }
  if (eocd < 0) throw new Error('PREVIEW_UNSUPPORTED')
  const entries = bytes.readUInt16LE(eocd + 10); let offset = bytes.readUInt32LE(eocd + 16); let total = 0
  for (let index = 0; index < entries; index += 1) { if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('PREVIEW_UNSUPPORTED'); total += bytes.readUInt32LE(offset + 24); if (total > maxDecompressedBytes) throw new Error('PREVIEW_LIMIT_EXCEEDED'); offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32) }
}
export function previewXlsx(bytes: Buffer, query: { filename?: string; sheet?: string; offset?: number; maxRows?: number; maxColumns?: number }) {
  if (bytes.byteLength > maxSourceFileBytes) throw new Error('FILE_TOO_LARGE')
  if (query.filename?.toLowerCase().endsWith('.xlsm')) throw new Error('FILE_TYPE_UNSUPPORTED')
  assertXlsxArchiveBudget(bytes)
  let workbook: XLSX.WorkBook
  try { workbook = XLSX.read(bytes, { type: 'buffer', cellFormula: true, cellNF: false, cellStyles: true, bookVBA: false, WTF: false }) } catch { throw new Error('PREVIEW_UNSUPPORTED') }
  if (workbook.SheetNames.length > maxSheets) throw new Error('PREVIEW_LIMIT_EXCEEDED')
  const sheets = workbook.SheetNames.map((name, index) => ({ name, visibility: workbook.Workbook?.Sheets?.[index]?.Hidden === 2 ? 'veryHidden' : workbook.Workbook?.Sheets?.[index]?.Hidden === 1 ? 'hidden' : 'visible' as const }))
  const name = query.sheet ?? workbook.SheetNames[0]
  const sheet = name ? workbook.Sheets[name] : undefined
  if (!sheet) throw new Error('PREVIEW_UNSUPPORTED')
  const bounds = range(sheet['!ref'])
  const cells = (bounds.e.r - bounds.s.r + 1) * (bounds.e.c - bounds.s.c + 1)
  if (cells > maxCells) throw new Error('PREVIEW_LIMIT_EXCEEDED')
  const maxRows = Math.min(query.maxRows ?? defaultRows, defaultRows)
  const maxColumns = Math.min(query.maxColumns ?? defaultColumns, defaultColumns)
  const start = bounds.s.r + (query.offset ?? 0)
  const endRow = Math.min(bounds.e.r, start + maxRows - 1)
  const endColumn = Math.min(bounds.e.c, bounds.s.c + maxColumns - 1)
  const rows = [] as Array<{ index: number; hidden: boolean; cells: Array<Record<string, unknown>> }>
  for (let row = start; row <= endRow; row += 1) {
    const cells = [] as Array<Record<string, unknown>>
    for (let column = bounds.s.c; column <= endColumn; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]
      const raw = cell?.v
      const formula = cell?.f
      const text = escape(raw)
      const valueState = formula && raw === undefined ? 'missing_cached' : errorToken.test(String(raw ?? '')) ? 'formula_error' : formula ? 'cached' : 'known'
      cells.push({ text, formula, valueState })
    }
    rows.push({ index: row + 1, hidden: sheet['!rows']?.[row]?.hidden === true, cells })
  }
  const columns = Array.from({ length: endColumn - bounds.s.c + 1 }, (_, index) => ({ index: bounds.s.c + index + 1, hidden: sheet['!cols']?.[bounds.s.c + index]?.hidden === true }))
  return { state: endRow < bounds.e.r || endColumn < bounds.e.c ? 'limited' : 'available', sheets, rows, columns, nextOffset: endRow < bounds.e.r ? endRow + 1 - bounds.s.r : null }
}
