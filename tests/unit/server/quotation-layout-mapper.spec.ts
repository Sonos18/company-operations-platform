import { describe, expect, it } from 'vitest'
import { mapQuotationLayout } from '../../../server/features/costs/extraction/quotation-layout-mapper'

type Cell = {
  content: string
  rowIndex: number
  columnIndex: number
  columnSpan?: number
  rowSpan?: number
  kind?: string
  boundingRegions: Array<{ pageNumber: number; polygon: number[] }>
  spans: Array<{ offset: number; length: number }>
}

// Invented labels and amounts: only the provider's two-page, six-column structure is reproduced.
function fixture(options: { sections?: boolean; paragraphTotal?: boolean; continuation?: boolean } = {}) {
  let offset = 0
  const pages = [1, 2].map(pageNumber => ({ pageNumber, words: [] as Array<{ content: string; confidence: number; span: { offset: number; length: number } }> }))
  const edges = [0, 0.5, 3.5, 4.1, 4.8, 6, 7.3]
  function source(content: string, pageNumber: number, left: number, right: number, top: number) {
    const span = { offset, length: Math.max(1, content.length) }
    offset += span.length + 1
    pages[pageNumber - 1]!.words.push({ content, confidence: 0.97, span })
    return { content, boundingRegions: [{ pageNumber, polygon: [left, top, right, top, right, top + 0.2, left, top + 0.2] }], spans: [span] }
  }
  function row(content: string[], rowIndex: number, pageNumber: number, top: number): Cell[] {
    return content.map((text, columnIndex) => ({ ...source(text, pageNumber, edges[columnIndex]!, edges[columnIndex + 1]!, top), rowIndex, columnIndex }))
  }
  const first: Cell[] = row(['STT', 'TÊN SẢN PHẨM / HẠNG MỤC', 'ĐVT', 'SỐ LƯỢNG YÊU CẦU', 'ĐƠN GIÁ (VNĐ)', 'THÀNH TIỀN (VNĐ)'], 0, 1, 1)
  let next = 1
  if (options.sections) {
    first.push({ ...source('I. Synthetic section', 1, edges[0]!, edges[6]!, 1.3), rowIndex: next++, columnIndex: 0, columnSpan: 6 })
  }
  first.push(...row(['1', 'Synthetic item A', 'piece', '2', '100', '200'], next++, 1, 1.6))
  const continuation: Cell[] = row(['2', 'Synthetic item B', 'piece', '3', '200', '600'], 0, 2, 0.6)
  const tables = [{ rowCount: next, columnCount: 6, cells: first }]
  const totalsTable = options.continuation ? { rowCount: 3, columnCount: 6, cells: continuation } : tables[0]!
  if (options.continuation) tables.push(totalsTable)
  else totalsTable.cells.push(...row(['2', 'Synthetic item B', 'piece', '3', '200', '600'], next++, 1, 2))
  const page = options.continuation ? 2 : 1
  const summaryStart = options.continuation ? 1 : next
  totalsTable.cells.push(...row(['', 'Subtotal', '', '', '', '800'], summaryStart, page, 2.4))
  totalsTable.cells.push(...row(['', 'VAT 10%', '', '', '', '80'], summaryStart + 1, page, 2.8))
  const paragraphs = options.paragraphTotal ? [source('Grand total: 880 VND', page, 4.8, 7.3, 3.2)] : []
  if (!options.paragraphTotal) totalsTable.cells.push(...row(['', 'Grand total', '', '', '', '880'], summaryStart + 2, page, 3.2))
  totalsTable.rowCount = summaryStart + (options.paragraphTotal ? 2 : 3)
  return { tables, paragraphs, pages, row, source }
}

describe('generic quotation layout mapping', () => {
  it('maps a conventional reconciled quotation with exact amounts and provenance', () => {
    const result = mapQuotationLayout(fixture())
    expect(result.fields).toMatchObject({ amount: '880', currencyCode: 'VND', basis: { kind: 'materials', lines: [{ quantity: '2', unitPrice: '100' }, { quantity: '3', unitPrice: '200' }] } })
    expect(result.providerLocations?.find(location => location.field === 'amount')).toMatchObject({ pageNumber: 1, confidence: 0.97 })
  })

  it('maps headerless next-page rows when the preceding header and column geometry prove continuity', () => {
    const result = mapQuotationLayout(fixture({ continuation: true }))
    expect(result.fields.amount).toBe('880')
    expect(result.fields.basis).toMatchObject({ lines: [{ description: 'Synthetic item A' }, { description: 'Synthetic item B' }] })
    expect(result.providerLocations?.find(location => location.field === 'basis.lines.1.quantity')).toMatchObject({ pageNumber: 2, confidence: 0.97 })
  })

  it('ignores a bounded merged section row with no financial item content', () => {
    const result = mapQuotationLayout(fixture({ sections: true }))
    expect(result.fields.amount).toBe('880')
    expect(result.fields.basis).toMatchObject({ lines: [{ description: 'Synthetic item A' }, { description: 'Synthetic item B' }] })
  })

  it('reconciles a unique located paragraph total below the table', () => {
    const result = mapQuotationLayout(fixture({ paragraphTotal: true }))
    expect(result.fields.amount).toBe('880')
    expect(result.providerLocations?.find(location => location.field === 'amount')).toMatchObject({ pageNumber: 1, confidence: 0.97 })
  })

  it('maps the combined sanitized two-page quotation structure', () => {
    expect(mapQuotationLayout(fixture({ continuation: true, sections: true, paragraphTotal: true })).fields.amount).toBe('880')
  })

  it('maps the sanitized 31-row tables with three sections and 56 reconciled item lines', () => {
    const input = fixture()
    const first = input.tables[0]!.cells.filter(cell => cell.rowIndex === 0)
    const second: Cell[] = []
    let item = 0
    for (let index = 1; index < 31; index++) {
      const top = 1.3 + index * 0.25
      if ([1, 5, 26].includes(index)) {
        first.push({ ...input.source('I.', 1, 0, 3.5, top), rowIndex: index, columnIndex: 0, columnSpan: 2 })
        if (index === 26) first.push(input.row(['', '', '', '', '', ''], index, 1, top)[2]!)
        const column = index === 26 ? 3 : 2
        first.push({ ...input.source('Synthetic section', 1, column === 2 ? 3.5 : 4.1, 7.3, top), rowIndex: index, columnIndex: column, columnSpan: 6 - column })
      } else first.push(...input.row([String(++item), 'Invented item', 'piece', '1', '100', '100'], index, 1, top))
    }
    for (let index = 0; index < 29; index++) second.push(...input.row([String(++item), 'Invented item', 'piece', '1', '100', '100'], index, 2, 0.6 + index * 0.25))
    for (const [rowIndex, label, amount] of [[29, 'Subtotal', '5600'], [30, 'VAT 10%', '560']] as const) {
      const top = 0.6 + rowIndex * 0.25
      second.push({ ...input.source(label, 2, 0, 4.8, top), rowIndex, columnIndex: 0, columnSpan: 4 }, ...input.row(['', '', '', '', '', amount], rowIndex, 2, top).slice(4))
    }
    input.tables = [{ rowCount: 31, columnCount: 6, cells: first }, { rowCount: 31, columnCount: 6, cells: second }]
    input.paragraphs = [input.source('Grand total: 6160 VND', 2, 4.8, 7.3, 8.4)]
    expect(input.tables.map(table => table.cells.length)).toEqual([175, 180])
    const result = mapQuotationLayout(input)
    expect(result.fields.amount).toBe('6160')
    expect(result.fields.basis && 'lines' in result.fields.basis && result.fields.basis.lines).toHaveLength(56)
    expect(result.providerLocations?.find(location => location.field === 'basis.lines.55.quantity')).toMatchObject({ pageNumber: 2, confidence: 0.97 })
  })

  it.each([2, 3])('ignores a section split into merged nonfinancial cells at column %i', splitColumn => {
    const input = fixture({ sections: true })
    const section = input.tables[0]!.cells.find(cell => cell.columnSpan === 6)!
    section.content = 'I.'
    section.columnSpan = 2
    section.boundingRegions[0]!.polygon = [0, 1.3, 3.5, 1.3, 3.5, 1.5, 0, 1.5]
    if (splitColumn === 3) input.tables[0]!.cells.push(input.row(['', '', '', '', '', ''], 1, 1, 1.3)[2]!)
    input.tables[0]!.cells.push({ ...input.source('Synthetic section', 1, splitColumn === 2 ? 3.5 : 4.1, 7.3, 1.3), rowIndex: 1, columnIndex: splitColumn, columnSpan: 6 - splitColumn })
    expect(mapQuotationLayout(input).fields.amount).toBe('880')
  })

  it('maps a separately located paragraph amount aligned to its unique total label', () => {
    const input = fixture({ paragraphTotal: true })
    input.paragraphs[0]!.content = 'Grand total'
    input.paragraphs[0]!.boundingRegions[0]!.polygon = [3.5, 3.2, 5.5, 3.2, 5.5, 3.4, 3.5, 3.4]
    input.paragraphs.push(input.source('880 VND', 1, 6, 7.3, 3.2))
    const result = mapQuotationLayout(input)
    expect(result.fields.amount).toBe('880')
    expect(result.providerLocations?.filter(location => location.field === 'amount')).toHaveLength(2)
  })

  it('keeps Decimal precision for amounts above the JavaScript safe integer', () => {
    const input = fixture({ continuation: true, paragraphTotal: true })
    const set = (table: number, row: number, column: number, content: string) => { input.tables[table]!.cells.find(cell => cell.rowIndex === row && cell.columnIndex === column)!.content = content }
    set(0, 1, 3, '1'); set(0, 1, 4, '9007199254740993'); set(0, 1, 5, '9007199254740993')
    set(1, 0, 4, '0'); set(1, 0, 5, '0')
    set(1, 1, 5, '9007199254740993'); set(1, 2, 5, '900719925474099')
    input.paragraphs[0]!.content = 'Grand total: 9907919180215092 VND'
    expect(mapQuotationLayout(input).fields.amount).toBe('9907919180215092')
  })

  it('rejects a low-confidence printed line amount used as independent reconciliation evidence', () => {
    const input = fixture({ sections: true })
    const cell = input.tables[0]!.cells.find(cell => cell.rowIndex === 2 && cell.columnIndex === 5)!
    input.pages[0]!.words.find(word => word.span.offset === cell.spans[0]!.offset)!.confidence = 0.79
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it('retains reconciled low-confidence descriptions and summaries as located review hints', () => {
    const input = fixture({ sections: true, continuation: true, paragraphTotal: true })
    const setConfidence = (source: { spans: Array<{ offset: number }> }, value: number) => {
      input.pages.flatMap(page => page.words).find(word => word.span.offset === source.spans[0]!.offset)!.confidence = value
    }
    setConfidence(input.tables[0]!.cells.find(cell => cell.columnSpan === 6)!, 0.6)
    setConfidence(input.tables[0]!.cells.find(cell => cell.rowIndex === 2 && cell.columnIndex === 1)!, 0.57)
    setConfidence(input.tables[1]!.cells.find(cell => cell.content === 'Subtotal')!, 0.767)
    setConfidence(input.tables[1]!.cells.find(cell => cell.content === '800')!, 0.665)
    setConfidence(input.tables[1]!.cells.find(cell => cell.content === 'VAT 10%')!, 0.767)
    input.paragraphs[0]!.content = 'Grand total'
    input.paragraphs[0]!.boundingRegions[0]!.polygon = [3.5, 3.2, 5.5, 3.2, 5.5, 3.4, 3.5, 3.4]
    setConfidence(input.paragraphs[0]!, 0.758)
    input.paragraphs.push(input.source('880 VND', 2, 6, 7.3, 3.2))
    setConfidence(input.paragraphs[1]!, 0.618)
    const result = mapQuotationLayout(input)
    expect(result.fields.amount).toBe('880')
    expect(result.providerLocations?.find(location => location.field === 'basis.lines.0.description')?.confidence).toBe(0.57)
    expect(result.providerLocations?.filter(location => location.field === 'amount').map(location => location.confidence)).toEqual([0.618, 0.758])
    expect(result.warnings).toContain('TOTAL_REQUIRES_REVIEW')
    expect(result.warnings).not.toContain('NUMBER_FORMAT_REQUIRES_REVIEW')
  })

  it.each(['quantity', 'unit price'])('rejects low-confidence %s even if its arithmetic would reconcile', evidence => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    const cell = input.tables[1]!.cells.find(cell => cell.rowIndex === 0 && cell.columnIndex === (evidence === 'quantity' ? 3 : 4))!
    input.pages[1]!.words.find(word => word.span.offset === cell.spans[0]!.offset)!.confidence = 0.79
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it('retains all source rows and only reconciled applyable lines when printed totals reconcile', () => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    input.tables[0]!.cells.find(cell => cell.rowIndex === 2 && cell.columnIndex === 4)!.content = '101'
    input.pages[1]!.words.find(word => word.span.offset === input.paragraphs[0]!.spans[0]!.offset)!.confidence = 0.618
    const result = mapQuotationLayout(input)
    expect(result.fields.amount).toBe('880')
    expect(result.fields.currencyCode).toBe('VND')
    expect(result.fields.basis).toMatchObject({ kind: 'materials', lines: [{ description: 'Synthetic item B', quantity: '3', unit: 'piece', unitPrice: '200' }], sourceLines: [
      { description: 'Synthetic item A', quantity: '2', unit: 'piece', unitPrice: '101', printedLineAmount: '200', calculatedLineAmount: '202', status: 'printed_amount_mismatch', pageNumber: 1, tableIndex: 0, rowIndex: 2 },
      { description: 'Synthetic item B', quantity: '3', unit: 'piece', unitPrice: '200', printedLineAmount: '600', calculatedLineAmount: '600', status: 'reconciled', pageNumber: 2, tableIndex: 1, rowIndex: 0 },
    ] })
    expect(result.fields.accountingBasis?.roundingBasis).toMatch(/quantity|số lượng/iu)
    expect(result.warnings).toContain('NUMBER_FORMAT_REQUIRES_REVIEW')
    expect(result.warnings).toContain('TOTAL_REQUIRES_REVIEW')
    expect(result.providerLocations?.some(location => location.field === 'basis.lines.0.quantity')).toBe(true)
    expect(result.providerLocations?.some(location => location.field === 'basis.lines.1.quantity')).toBe(false)
    expect(result.providerLocations?.find(location => location.field === 'basis.sourceLines.0.printedLineAmount')).toMatchObject({ pageNumber: 1, confidence: 0.97 })
    expect(result.providerLocations?.find(location => location.field === 'basis.sourceLines.1.quantity')).toMatchObject({ pageNumber: 2, confidence: 0.97 })
    expect(result.providerLocations?.find(location => location.field === 'amount')?.confidence).toBe(0.618)
  })

  it('rejects a calculated source amount outside the extraction money bounds', () => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    input.tables[0]!.cells.find(cell => cell.rowIndex === 2 && cell.columnIndex === 3)!.content = '9007199254740993'
    input.tables[0]!.cells.find(cell => cell.rowIndex === 2 && cell.columnIndex === 4)!.content = '9007199254740993'
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it.each(['printed sum', 'VAT', 'financial confidence', 'missing financial location', 'ambiguous geometry', 'missing declared row', 'missing page', 'zero price'])('refuses printed-total-only hints with %s', reason => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    const price = input.tables[0]!.cells.find(cell => cell.rowIndex === 2 && cell.columnIndex === 4)!
    price.content = reason === 'zero price' ? '0' : '101'
    if (reason === 'printed sum') input.tables[1]!.cells.find(cell => cell.rowIndex === 0 && cell.columnIndex === 5)!.content = '601'
    if (reason === 'VAT') input.tables[1]!.cells.find(cell => cell.content === 'VAT 10%')!.content = 'VAT 8%'
    if (reason === 'financial confidence') input.pages[0]!.words.find(word => word.span.offset === price.spans[0]!.offset)!.confidence = 0.79
    if (reason === 'missing financial location') price.boundingRegions = []
    if (reason === 'ambiguous geometry') input.tables[1]!.cells.forEach(cell => { cell.boundingRegions[0]!.polygon = cell.boundingRegions[0]!.polygon.map((coordinate, index) => coordinate + (index % 2 === 0 ? 1 : 0)) })
    if (reason === 'missing declared row') input.tables[0]!.rowCount++
    if (reason === 'missing page') input.pages = input.pages.slice(0, 1)
    const result = mapQuotationLayout(input)
    expect(result.fields).toEqual({})
    expect(result.providerLocations).toEqual([])
  })

  it('withholds an applyable basis when independent financial confidence is absent', () => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    input.pages.forEach(page => { page.words = [] })
    const result = mapQuotationLayout(input)
    expect(result.fields.basis).toBeUndefined()
    expect(result.fields.amount).toBeUndefined()
    expect(result.providerLocations).toEqual([])
  })

  it.each(['overlapping cells', 'out of range cells', 'missing financial cell', 'ambiguous quantity'])('rejects %s instead of losing a line', reason => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    const second = input.tables[1]!
    if (reason === 'overlapping cells') second.cells.push({ ...second.cells[0]! })
    if (reason === 'out of range cells') second.cells[0]!.columnIndex = 6
    if (reason === 'missing financial cell') second.cells = second.cells.filter(cell => !(cell.rowIndex === 0 && cell.columnIndex === 4))
    if (reason === 'ambiguous quantity') second.cells.find(cell => cell.rowIndex === 0 && cell.columnIndex === 3)!.content = '1.000'
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it('rejects unordered continuation row geometry', () => {
    const input = fixture({ continuation: true })
    input.tables[1]!.cells.filter(cell => cell.rowIndex === 1).forEach(cell => { cell.boundingRegions[0]!.polygon = cell.boundingRegions[0]!.polygon.map((coordinate, index) => coordinate - (index % 2 === 1 ? 2 : 0)) })
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it('rejects two paragraph amounts aligned to the total label', () => {
    const input = fixture({ paragraphTotal: true })
    input.paragraphs[0]!.content = 'Grand total'
    input.paragraphs[0]!.boundingRegions[0]!.polygon = [3.5, 3.2, 5.5, 3.2, 5.5, 3.4, 3.5, 3.4]
    input.paragraphs.push(input.source('880', 1, 5.6, 6.3, 3.2), input.source('880', 1, 6.4, 7.3, 3.2))
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it.each(['columns', 'same page', 'table order', 'column geometry', 'missing geometry'])('rejects headerless continuation with ambiguous %s', reason => {
    const input = fixture({ continuation: true })
    const second = input.tables[1]!
    if (reason === 'columns') second.columnCount = 7
    if (reason === 'same page') second.cells.forEach(cell => { cell.boundingRegions[0]!.pageNumber = 1 })
    if (reason === 'table order') input.tables.reverse()
    if (reason === 'column geometry') second.cells.forEach(cell => { cell.boundingRegions[0]!.polygon = cell.boundingRegions[0]!.polygon.map((coordinate, index) => coordinate + (index % 2 === 0 ? 1 : 0)) })
    if (reason === 'missing geometry') second.cells[0]!.boundingRegions = []
    const result = mapQuotationLayout(input)
    expect(result.fields).toEqual({})
    expect(result.providerLocations).toEqual([])
  })

  it('rejects a merged row containing financial item values', () => {
    const input = fixture({ sections: true })
    input.tables[0]!.cells.find(cell => cell.columnSpan === 6)!.content = 'Synthetic section 2 x 100 = 200'
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it('rejects a section-shaped row with a standalone quantity', () => {
    const input = fixture({ sections: true })
    input.tables[0]!.cells.find(cell => cell.columnSpan === 6)!.columnSpan = 3
    input.tables[0]!.cells.push(...input.row(['', '', '', '2', '', ''], 1, 1, 1.3).slice(3))
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it.each(['duplicate', 'unlocated', 'before table', 'different page', 'multiple amounts', 'low confidence without corroboration'])('rejects an ambiguous paragraph total: %s', reason => {
    const input = fixture({ paragraphTotal: true })
    const total = input.paragraphs[0]!
    if (reason === 'duplicate') input.paragraphs.push(input.source('Grand total: 880 VND', 1, 4.8, 7.3, 3.6))
    if (reason === 'unlocated') total.boundingRegions = []
    if (reason === 'before table') total.boundingRegions[0]!.polygon = [4.8, 0.2, 7.3, 0.2, 7.3, 0.4, 4.8, 0.4]
    if (reason === 'different page') total.boundingRegions[0]!.pageNumber = 2
    if (reason === 'multiple amounts') total.content = 'Grand total: 880 VND; 800 VND'
    if (reason === 'low confidence without corroboration') {
      input.pages[0]!.words.find(word => word.span.offset === total.spans[0]!.offset)!.confidence = 0.79
      const quantity = input.tables[0]!.cells.find(cell => cell.rowIndex === 1 && cell.columnIndex === 3)!
      input.pages[0]!.words = input.pages[0]!.words.filter(word => word.span.offset !== quantity.spans[0]!.offset)
    }
    const result = mapQuotationLayout(input)
    expect(result.fields).toEqual({})
    expect(result.providerLocations).toEqual([])
  })

  it('rejects a printed line amount that fails exact multiplication', () => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    input.tables[1]!.cells.find(cell => cell.rowIndex === 0 && cell.columnIndex === 5)!.content = '601'
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it('rejects VAT that fails the printed rate without forcing a total', () => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    input.tables[1]!.cells.find(cell => cell.content === 'VAT 10%')!.content = 'VAT 8%'
    expect(mapQuotationLayout(input).fields).toEqual({})
  })

  it('rejects a conflicting foreign currency', () => {
    const input = fixture({ continuation: true, sections: true, paragraphTotal: true })
    input.paragraphs.push(input.source('USD', 2, 0, 1, 4))
    expect(mapQuotationLayout(input).fields).toEqual({})
  })
})
