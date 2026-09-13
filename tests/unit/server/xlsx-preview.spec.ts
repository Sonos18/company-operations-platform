import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { assertXlsxArchiveBudget, previewXlsx } from '../../../server/features/files/xlsx-preview.service'

function workbookBytes() {
  const sheet = XLSX.utils.aoa_to_sheet([['<tag>', 7], ['cached', '#REF!']])
  sheet.C1 = { t: 'n', v: 3, f: '1+2' }
  sheet.D1 = { t: 'n', f: 'SUM(B1:C1)' }
  sheet['!ref'] = 'A1:D2'
  sheet['!rows'] = [{ hidden: true }]
  sheet['!cols'] = [{ hidden: true }]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, ' Nhật ký ')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['hidden']]), 'Ẩn')
  book.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 2 }] }
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
}

describe('static XLSX preview', () => {
  it('rejects a small compressed ZIP whose central directory declares more than 100 MiB expanded data', () => {
    const archive = Buffer.alloc(70)
    archive.writeUInt32LE(0x02014b50, 0)
    archive.writeUInt32LE(1024, 20)
    archive.writeUInt32LE(101 * 1024 * 1024, 24)
    archive.writeUInt32LE(0x06054b50, 46)
    archive.writeUInt16LE(1, 54); archive.writeUInt16LE(1, 56); archive.writeUInt32LE(46, 58); archive.writeUInt32LE(0, 62)
    expect(() => assertXlsxArchiveBudget(archive)).toThrow('PREVIEW_LIMIT_EXCEEDED')
  })
  it('preserves cached/formula/error/hidden metadata without evaluating or rendering HTML', () => {
    const result = previewXlsx(workbookBytes(), { sheet: ' Nhật ký ', offset: 0 })
    expect(result.state).toBe('available')
    expect(result.sheets).toEqual(expect.arrayContaining([{ name: ' Nhật ký ', visibility: 'visible' }, { name: 'Ẩn', visibility: 'veryHidden' }]))
    expect(result.rows[0]?.cells[0]).toMatchObject({ text: '&lt;tag&gt;' })
    expect(result.rows[0]?.cells[2]).toMatchObject({ formula: '1+2', valueState: 'cached', text: '3' })
    expect(result.rows[1]?.cells[1]).toMatchObject({ valueState: 'formula_error', text: '#REF!' })
    expect(result.rows[0]?.hidden).toBe(true)
    expect(result.columns[0]?.hidden).toBe(true)
  })

  it('reports missing cached formulas and limits rather than inventing a value or reading unbounded data', () => {
    const full = previewXlsx(workbookBytes(), { sheet: ' Nhật ký ', offset: 0 })
    const limited = previewXlsx(workbookBytes(), { sheet: ' Nhật ký ', offset: 0, maxRows: 1, maxColumns: 2 })
    expect(full.rows[0]?.cells[3]).toMatchObject({ valueState: 'missing_cached' })
    expect(limited.state).toBe('limited')
    expect(() => previewXlsx(Buffer.alloc(20 * 1024 * 1024 + 1), {})).toThrow('FILE_TOO_LARGE')
  })

  it('rejects macro-enabled input and limits sheet/cell/decompressed page exposure', () => {
    expect(() => previewXlsx(workbookBytes(), { filename: 'source.xlsm' })).toThrow('FILE_TYPE_UNSUPPORTED')
    const oversized = XLSX.utils.book_new()
    for (let index = 0; index < 21; index += 1) XLSX.utils.book_append_sheet(oversized, XLSX.utils.aoa_to_sheet([[index]]), `S${index}`)
    expect(() => previewXlsx(Buffer.from(XLSX.write(oversized, { type: 'buffer', bookType: 'xlsx' })), {})).toThrow('PREVIEW_LIMIT_EXCEEDED')
  })
})
