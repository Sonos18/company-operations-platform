import Decimal from 'decimal.js'
import { z } from 'zod'
import { workflowMoneySchema } from '../../../../shared/schemas/costs/cost-workflow'
import type { ExtractionResult } from '../../../../shared/schemas/costs/cost-extraction'

const Money = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP })
const span = z.object({ offset: z.number().int().min(0).max(4_000_000), length: z.number().int().positive().max(4_000_000) })
const region = z.object({ pageNumber: z.number().int().min(1).max(2), polygon: z.array(z.number().finite().nonnegative()).min(8).max(32).refine(p => p.length % 2 === 0) })
const located = z.object({ content: z.string().max(2000), boundingRegions: z.array(region).max(2).optional(), spans: z.array(span).max(100).optional() })
const cell = located.extend({ rowIndex: z.number().int().min(0).max(1000), columnIndex: z.number().int().min(0).max(31), rowSpan: z.number().int().positive().max(1001).optional(), columnSpan: z.number().int().positive().max(32).optional(), kind: z.string().max(40).optional() })
const layout = z.object({
  content: z.string().max(300_000).optional(),
  tables: z.array(z.object({ rowCount: z.number().int().positive().max(1001), columnCount: z.number().int().positive().max(32), cells: z.array(cell).max(10_000) })).max(100).refine(tables => tables.reduce((count, table) => count + table.cells.length, 0) <= 10_000).optional(),
  paragraphs: z.array(located).max(2000).optional(),
  pages: z.array(z.object({ pageNumber: z.number().int().min(1).max(2), words: z.array(z.object({ content: z.string().max(2000), confidence: z.number().finite().min(0).max(1).optional(), span: span.optional() })).max(20_000).optional() })).max(2),
})
type Located = z.infer<typeof located>
type Cell = z.infer<typeof cell>
type Table = NonNullable<z.infer<typeof layout>['tables']>[number]
type Column = 'description' | 'quantity' | 'unit' | 'unitPrice' | 'lineTotal'
type Columns = Partial<Record<Column, number>>
type Bounds = { page: number; left: number; right: number; top: number; bottom: number }
type SourceLine = { description: string; quantity: string; unit: string; unitPrice: string; printedLineAmount: string; calculatedLineAmount: string; status: 'reconciled' | 'printed_amount_mismatch'; pageNumber: 1 | 2; tableIndex: number; rowIndex: number }
type Hints = Pick<ExtractionResult, 'fields' | 'warnings' | 'providerLocations'>
function normalized(value: string) { return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim() }
function column(value: string): Column | undefined {
  const text = normalized(value)
  if (/^(?:ten (?:vat tu|hang|san pham|thiet bi)|hang hoa|mo ta|dien giai|noi dung|description|item description|product)/.test(text)) return 'description'
  if (/^(?:so luong|sl|quantity|qty)(?: |$)/.test(text)) return 'quantity'
  if (/^(?:don vi tinh|don vi|dvt|unit)(?: |$)/.test(text) && !/^unit price/.test(text)) return 'unit'
  if (/^(?:don gia|unit price|price)(?: |$)/.test(text)) return 'unitPrice'
  if (/^(?:thanh tien|line total|amount)(?: |$)/.test(text)) return 'lineTotal'
}
function summary(value: string): 'subtotal' | 'tax' | 'total' | undefined {
  const text = normalized(value)
  if (/^(?:cong tien hang|tong tien hang|tien hang|cong truoc thue|subtotal|sub total)(?: |$)/.test(text)) return 'subtotal'
  if (/^(?:thue gtgt|thue vat|vat|tax)(?: |$)/.test(text)) return 'tax'
  if (/^(?:tong cong|tong thanh toan|tong tien thanh toan|grand total|total including vat)(?: |$)/.test(text)) return 'total'
}
function decimal(text: string, money: boolean): string | null {
  let value = text.trim().replace(/\s+/g, '').replace(/(?:VND|VNĐ|đồng|₫)$/iu, '')
  if (money && /^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/.test(value)) value = value.replace(/[.,]/g, '')
  else if (/^\d{1,3}(?:\.\d{3})+,\d{1,4}$/.test(value)) value = value.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(?:,\d{3})+\.\d{1,4}$/.test(value)) value = value.replace(/,/g, '')
  else if (/^\d+,\d{1,4}$/.test(value) && !/^\d{1,3},\d{3}$/.test(value)) value = value.replace(',', '.')
  // A quantity such as 1.000 or 1,000 is ambiguous without a declared locale.
  else if (!money && /^\d{1,3}[.,]\d{3}$/.test(value)) return null
  if (!workflowMoneySchema.safeParse(value).success) return null
  const parsed = new Money(value)
  if (money && parsed.decimalPlaces() !== 0) return null // Current supported currency: explicitly stated VND.
  return parsed.toFixed()
}

function bounds(source: Located): Bounds | undefined {
  if (source.boundingRegions?.length !== 1) return
  const region = source.boundingRegions[0]!, xs = region.polygon.filter((_, index) => index % 2 === 0), ys = region.polygon.filter((_, index) => index % 2 === 1)
  const result = { page: region.pageNumber, left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
  return result.left < result.right && result.top < result.bottom ? result : undefined
}
function tableBounds(table: Table): Bounds | undefined {
  const regions = table.cells.map(bounds)
  if (!regions.length || regions.some(region => !region || region.page !== regions[0]!.page)) return
  const located = regions as Bounds[]
  return { page: located[0]!.page, left: Math.min(...located.map(r => r.left)), right: Math.max(...located.map(r => r.right)), top: Math.min(...located.map(r => r.top)), bottom: Math.max(...located.map(r => r.bottom)) }
}
function rows(table: Table) { return [...new Set(table.cells.map(c => c.rowIndex))].sort((a, b) => a - b) }
function header(cells: Cell[]): Columns | undefined {
  const mapping: Columns = {}
  for (const cell of cells) {
    const key = column(cell.content)
    if (!key) continue
    if (mapping[key] !== undefined || (cell.rowSpan ?? 1) !== 1 || (cell.columnSpan ?? 1) !== 1) return
    mapping[key] = cell.columnIndex
  }
  return ['description', 'quantity', 'unit', 'unitPrice'].every(key => mapping[key as Column] !== undefined) ? mapping : undefined
}
function orderedGeometry(table: Table): boolean {
  let top = -1
  for (const row of rows(table)) {
    const cells = table.cells.filter(cell => cell.rowIndex === row), regions = cells.map(bounds)
    if (regions.some(region => !region)) return false
    const next = Math.min(...(regions as Bounds[]).map(region => region.top))
    if (next <= top) return false
    top = next
  }
  return true
}
function continuation(previous: Table, table: Table): boolean {
  const before = tableBounds(previous), after = tableBounds(table)
  if (!before || !after || after.page !== before.page + 1 || previous.columnCount !== table.columnCount || !orderedGeometry(previous) || !orderedGeometry(table) || previous.cells.some(cell => summary(cell.content))) return false
  const tolerance = Math.min(before.right - before.left, after.right - after.left) * 0.02
  function edges(table: Table, index: number) {
    const cells = table.cells.filter(cell => cell.columnIndex === index && (cell.columnSpan ?? 1) === 1).map(cell => bounds(cell)!)
    if (!cells.length) return
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!
    return { left: median(cells.map(cell => cell.left)), right: median(cells.map(cell => cell.right)) }
  }
  for (let index = 0; index < table.columnCount; index++) {
    const left = edges(previous, index), right = edges(table, index)
    if (!left || !right || Math.abs(left.left - right.left) > tolerance || Math.abs(left.right - right.right) > tolerance) return false
    const ratio = (right.right - right.left) / (left.right - left.left)
    if (ratio < 0.85 || ratio > 1.15) return false
  }
  return true
}
function section(cells: Cell[], columns: Columns): boolean {
  const nonempty = cells.filter(cell => cell.content.trim())
  if (!nonempty.length || nonempty.length > 3 || cells.some(cell => (cell.rowSpan ?? 1) !== 1) || nonempty.some(cell => /\d/.test(cell.content) || summary(cell.content) || column(cell.content))) return false
  const contains = (cell: Cell, index: number) => cell.columnIndex <= index && index < cell.columnIndex + (cell.columnSpan ?? 1)
  if (!nonempty.some(cell => (cell.columnSpan ?? 1) > 1 && contains(cell, columns.description!))) return false
  return ['quantity', 'unitPrice', 'lineTotal'].every(key => {
    const index = columns[key as Column]
    return index === undefined || cells.some(cell => contains(cell, index) && (!cell.content.trim() || (cell.columnSpan ?? 1) > 1))
  })
}

/** Generic quotation tables only. No company templates, inferred parties, or accounting commands. */
export function mapQuotationLayout(value: unknown): Hints {
  const hints: Hints = { fields: {}, warnings: ['PARTY_MATCH_REQUIRES_REVIEW', 'TOTAL_REQUIRES_REVIEW'], providerLocations: [] }
  const parsed = layout.safeParse(value)
  if (!parsed.success) { hints.warnings.push('EXTRACTION_RESULT_INVALID'); return hints }
  const data = parsed.data, tables = data.tables ?? [], paragraphs = data.paragraphs ?? []
  const texts = [...paragraphs.map(p => p.content), ...tables.flatMap(t => t.cells.map(c => c.content)), data.content ?? '']
  const vnd = /(?:^|[^\p{L}\p{N}])(?:VND|VNĐ|₫)(?=$|[^\p{L}\p{N}])/iu
  const currencySources = [
    ...tables.flatMap(t => t.cells.filter(c => (column(c.content) === 'unitPrice' || column(c.content) === 'lineTotal' || summary(c.content) || decimal(c.content, true) !== null) && (vnd.test(c.content) || /(?:\(\s*đồng\s*\)|\d\s*(?:VND|VNĐ|đồng|₫)\s*$)/iu.test(c.content)))),
    ...paragraphs.filter(p => /^(?:don vi tien te|currency)(?: |$)/.test(normalized(p.content)) && (vnd.test(p.content) || /:\s*đồng\s*$/iu.test(p.content))),
  ]
  if (!currencySources.length || texts.some(t => /(?:^|[^\p{L}\p{N}])(?:USD|EUR|GBP|JPY|CNY|RMB|THB|SGD|AUD|CAD|KRW)(?=$|[^\p{L}\p{N}])|[$€£¥]/iu.test(t))) { hints.warnings.push('NUMBER_FORMAT_REQUIRES_REVIEW'); return hints }
  const words = data.pages.flatMap(p => p.words ?? [])
  function confidence(source: Located): { score: number | undefined; low: boolean } {
    const selected = words.filter(w => w.span && source.spans?.some(s => w.span!.offset < s.offset + s.length && s.offset < w.span!.offset + w.span!.length))
    return {
      score: selected.length && selected.every(w => w.confidence !== undefined) ? Math.min(...selected.map(w => w.confidence!)) : undefined,
      low: selected.some(w => w.confidence !== undefined && w.confidence < 0.8),
    }
  }
  function location(field: string, source: Located, reconciledReview = false): boolean {
    if (!source.boundingRegions?.length) return false
    const { score, low } = confidence(source)
    if (low && !reconciledReview) return false
    for (const r of source.boundingRegions) hints.providerLocations!.push({ field, ...r, ...(score === undefined ? {} : { confidence: score }) })
    return true
  }
  const candidates = new Map<'subtotal' | 'tax' | 'total', Array<{ amount: string; label: string; labelSource: Located; source: Located }>>()
  let summaryValid = true
  for (const table of tables) {
    for (const row of new Set(table.cells.map(c => c.rowIndex))) {
      const cells = table.cells.filter(c => c.rowIndex === row).sort((a, b) => a.columnIndex - b.columnIndex)
      const labels = cells.filter(c => summary(c.content)), label = labels[0], kind = label && summary(label.content)
      if (!kind) continue
      const amounts = cells.filter(c => c !== label).map(c => ({ amount: decimal(c.content, true), source: c })).filter(c => c.amount !== null)
      if (labels.length === 1 && amounts.length === 1) candidates.set(kind, [...(candidates.get(kind) ?? []), { amount: amounts[0]!.amount!, label: label!.content, labelSource: label!, source: amounts[0]!.source }])
      else summaryValid = false
    }
  }
  const lastTable = tables[tables.length - 1], lastBounds = lastTable && tableBounds(lastTable)
  function belowTable(source: Located): boolean {
    const sourceBounds = bounds(source)
    if (!lastBounds || !sourceBounds || sourceBounds.page !== lastBounds.page) return false
    const rowHeight = Math.max(...lastTable!.cells.map(cell => { const region = bounds(cell)!; return region.bottom - region.top }))
    const tolerance = (lastBounds.right - lastBounds.left) * 0.02
    return sourceBounds.top >= lastBounds.bottom - rowHeight * 0.25 && sourceBounds.top <= lastBounds.bottom + rowHeight * 4 && sourceBounds.left >= lastBounds.left - tolerance && sourceBounds.right <= lastBounds.right + tolerance
  }
  function insideTable(source: Located): boolean {
    const region = bounds(source)
    return !!region && tables.some(table => { const tableRegion = tableBounds(table); return tableRegion && region.page === tableRegion.page && region.top >= tableRegion.top && region.bottom <= tableRegion.bottom && region.left >= tableRegion.left && region.right <= tableRegion.right })
  }
  for (const label of paragraphs.filter(paragraph => summary(paragraph.content) === 'total' && !insideTable(paragraph))) {
    if (!belowTable(label)) { summaryValid = false; continue }
    const match = label.content.trim().match(/(?:^|[:：\s])([0-9]+(?:[.,][0-9]+)*)(?:\s*(?:VND|VNĐ|đồng|₫))?\s*$/iu)
    if (match) {
      const prefix = label.content.trim().slice(0, match.index), amount = decimal(match[1]!, true)
      if (amount === null || /\d/.test(prefix.replace(/\d+(?:[.,]\d+)?\s*%/g, ''))) { summaryValid = false; continue }
      candidates.set('total', [...(candidates.get('total') ?? []), { amount, label: label.content, labelSource: label, source: label }])
    } else {
      if (/\d/.test(label.content.replace(/\d+(?:[.,]\d+)?\s*%/g, ''))) { summaryValid = false; continue }
      const labelBounds = bounds(label)!
      const amounts = paragraphs.filter(source => source !== label && belowTable(source) && decimal(source.content, true) !== null).filter(source => {
        const amountBounds = bounds(source)!, overlap = Math.min(labelBounds.bottom, amountBounds.bottom) - Math.max(labelBounds.top, amountBounds.top)
        return amountBounds.left >= labelBounds.right && overlap >= Math.min(labelBounds.bottom - labelBounds.top, amountBounds.bottom - amountBounds.top) * 0.5
      })
      if (amounts.length !== 1) { summaryValid = false; continue }
      candidates.set('total', [...(candidates.get('total') ?? []), { amount: decimal(amounts[0]!.content, true)!, label: label.content, labelSource: label, source: amounts[0]! }])
    }
  }
  const unique = (kind: 'subtotal' | 'tax' | 'total') => { const found = candidates.get(kind) ?? []; return found.length === 1 ? found[0] : undefined }
  const subtotal = unique('subtotal'), tax = unique('tax'), total = unique('total')
  const lines: Array<{ description: string; quantity: string; unit: string; unitPrice: string }> = []
  const sourceLines: SourceLine[] = []
  let sum = new Money(0), valid = summaryValid, recognized = 0
  let printedLinesPresent = true, independentFinancialConfidence = true
  let printedSum = new Money(0), multiplicationMismatch = false, positiveFinancialLines = true, fallbackStructure = true
  const lineEvidence: Located[][] = []
  const returnedPages = new Set(data.pages.map(page => page.pageNumber))
  const pagesLocated = returnedPages.size === data.pages.length && tables.every(table => table.cells.every(cell => cell.boundingRegions?.length && cell.boundingRegions.every(region => returnedPages.has(region.pageNumber))))
  let previous: { table: Table; columns: Columns } | undefined
  for (const [tableIndex, table] of tables.entries()) {
    let headerRow = -1, columns: Columns = {}
    const occupied = new Set<string>()
    let gridValid = true
    for (const cell of table.cells) {
      if (cell.rowIndex + (cell.rowSpan ?? 1) > table.rowCount || cell.columnIndex + (cell.columnSpan ?? 1) > table.columnCount) { gridValid = false; break }
      cellRows: for (let row = cell.rowIndex; row < cell.rowIndex + (cell.rowSpan ?? 1); row++) for (let col = cell.columnIndex; col < cell.columnIndex + (cell.columnSpan ?? 1); col++) {
        const position = `${row}:${col}`
        if (occupied.has(position)) { gridValid = false; break cellRows }
        occupied.add(position)
      }
      if (!gridValid) break
    }
    if (!gridValid) { valid = false; previous = undefined; continue }
    for (const row of rows(table)) {
      const mapping = header(table.cells.filter(c => c.rowIndex === row))
      if (mapping) { headerRow = row; columns = mapping; break }
    }
    if (headerRow < 0) {
      if (previous && continuation(previous.table, table)) columns = previous.columns
      else {
        // A headerless numeric table must be accounted for, never silently omitted.
        if (table.cells.some(cell => decimal(cell.content, true) !== null)) valid = false
        previous = undefined
        continue
      }
    }
    recognized++
    if (columns.lineTotal === undefined) printedLinesPresent = false
    if (!tableBounds(table) || !orderedGeometry(table) || rows(table).length !== table.rowCount || table.cells.some(cell => cell.rowIndex < headerRow && decimal(cell.content, true) !== null)) fallbackStructure = false
    previous = { table, columns }
    for (const row of rows(table)) {
      if (row <= headerRow) continue
      const cells = table.cells.filter(c => c.rowIndex === row)
      if (cells.every(c => !c.content.trim()) || cells.some(c => summary(c.content))) continue
      const repeatedHeader = header(cells)
      if (repeatedHeader) {
        if (Object.keys(columns).some(key => columns[key as Column] !== repeatedHeader[key as Column])) valid = false
        continue
      }
      if (section(cells, columns)) {
        if (cells.some(cell => cell.content.trim() && !bounds(cell))) valid = false
        continue
      }
      const get = (key: Column) => cells.find(c => c.columnIndex === columns[key])
      const description = get('description'), quantity = get('quantity'), unit = get('unit'), price = get('unitPrice'), printed = get('lineTotal')
      const q = quantity && decimal(quantity.content, false), p = price && decimal(price.content, true)
      if (!description?.content.trim() || !unit?.content.trim() || !q || !p || new Money(q).lte(0) || cells.some(c => (c.rowSpan ?? 1) !== 1 || (c.columnSpan ?? 1) !== 1) || lines.length >= 1000) { valid = false; continue }
      const computed = new Money(q).mul(p).toDecimalPlaces(0)
      if (!workflowMoneySchema.safeParse(computed.toFixed()).success) { valid = false; continue }
      const printedAmount = printed && decimal(printed.content, true)
      if (columns.lineTotal !== undefined && (!printed || printedAmount === null)) { valid = false; continue }
      if (printedAmount !== undefined && printedAmount !== null) {
        printedSum = printedSum.plus(printedAmount)
        if (!computed.eq(printedAmount)) multiplicationMismatch = true
        if (new Money(p).lte(0) || new Money(printedAmount).lte(0)) positiveFinancialLines = false
      }
      if (printed && !location('accountingBasis.roundingBasis', printed)) { valid = false; continue }
      if (![quantity!, price!, printed].every(source => source && confidence(source).score !== undefined && confidence(source).score! >= 0.8)) independentFinancialConfidence = false
      const index = lines.length
      if (![description, quantity!, unit, price!].every((c, i) => location(`basis.lines.${index}.${['description', 'quantity', 'unit', 'unitPrice'][i]}`, c, i === 0))) { valid = false; continue }
      const line = { description: description.content.trim(), quantity: q, unit: unit.content.trim(), unitPrice: p }
      if (printed && printedAmount !== undefined && printedAmount !== null && bounds(description)) {
        lineEvidence.push([description, quantity!, unit, price!, printed])
        sourceLines.push({ ...line, printedLineAmount: printedAmount, calculatedLineAmount: computed.toFixed(), status: computed.eq(printedAmount) ? 'reconciled' : 'printed_amount_mismatch', pageNumber: bounds(description)!.page as 1 | 2, tableIndex, rowIndex: row })
      }
      lines.push(line)
      sum = sum.plus(computed)
    }
  }
  // Low OCR scores remain visible for review only when every independent printed line is trusted.
  const reconciledReview = printedLinesPresent && independentFinancialConfidence
  const reconciled = valid && reconciledReview && !multiplicationMismatch && recognized > 0 && lines.length > 0 && subtotal && sum.eq(subtotal.amount) && tax && total && new Money(subtotal.amount).plus(tax.amount).eq(total.amount)
  const rate = tax?.label.match(/(\d+(?:[.,]\d+)?)\s*%/)
  const vatMatches = reconciled && rate && new Money(rate[1]!.replace(',', '.')).lte(100) && new Money(subtotal.amount).mul(rate[1]!.replace(',', '.')).div(100).toDecimalPlaces(0).eq(tax.amount)
  const safeLines = sourceLines.filter(line => line.status === 'reconciled').map(({ description, quantity, unit, unitPrice }) => ({ description, quantity, unit, unitPrice }))
  function summaryLocations(review: boolean) {
    return !!total && !!tax && !!subtotal && location('amount', total.source, review) && (total.source === total.labelSource || location('amount', total.labelSource, review)) && location('currencyCode', currencySources[0]!) && location('accountingBasis.vatBasis', tax.labelSource, review) && location('accountingBasis.vatBasis', tax.source) && location('accountingBasis.vatBasis', subtotal.labelSource, review) && location('accountingBasis.vatBasis', subtotal.source, review)
  }
  function candidateLocations() {
    hints.providerLocations = []
    if (sourceLines.length !== lines.length || lineEvidence.length !== lines.length || !subtotal || !tax || !total || ![subtotal.labelSource, subtotal.source, tax.labelSource, tax.source, total.labelSource, total.source].every(source => bounds(source)) || !summaryLocations(true)) return false
    let safeIndex = 0
    return lineEvidence.every((sources, sourceIndex) => {
      if (!sources.every((source, index) => !!bounds(source) && location(`basis.sourceLines.${sourceIndex}.${['description', 'quantity', 'unit', 'unitPrice', 'printedLineAmount'][index]}`, source, index === 0))) return false
      if (sourceLines[sourceIndex]!.status !== 'reconciled') return true
      const index = safeIndex++
      return sources.slice(0, 4).every((source, field) => location(`basis.lines.${index}.${['description', 'quantity', 'unit', 'unitPrice'][field]}`, source, field === 0))
    })
  }
  if (vatMatches && fallbackStructure && pagesLocated && candidateLocations()) {
    hints.fields = { amount: total.amount, currencyCode: 'VND', basis: { kind: 'materials', lines: safeLines, sourceLines }, accountingBasis: { vatBasis: `${tax.label}: ${tax.amount} VND; tiền hàng ${subtotal.amount} VND; tổng ${total.amount} VND. Đối chiếu bản gốc.`, roundingBasis: 'Đối chiếu dòng hàng và VAT sau làm tròn đến một đồng; cần người kiểm tra xác nhận.' } }
  } else {
    hints.providerLocations = []
    hints.warnings.push('NUMBER_FORMAT_REQUIRES_REVIEW')
    // Keep every source row visible; only rows with matching multiplication may enter the line basis.
    const printedTotalsReconcile = valid && multiplicationMismatch && fallbackStructure && pagesLocated && positiveFinancialLines && reconciledReview && lines.length > 0 && lineEvidence.length === lines.length && subtotal && tax && total && rate && printedSum.eq(subtotal.amount) && new Money(subtotal.amount).plus(tax.amount).eq(total.amount) && new Money(rate[1]!.replace(',', '.')).lte(100) && new Money(subtotal.amount).mul(rate[1]!.replace(',', '.')).div(100).toDecimalPlaces(0).eq(tax.amount) && (confidence(tax.source).score ?? 0) >= 0.8 && [subtotal.labelSource, subtotal.source, tax.labelSource, tax.source, total.labelSource, total.source].every(source => bounds(source))
    if (printedTotalsReconcile && candidateLocations()) {
      hints.fields = { amount: total.amount, currencyCode: 'VND', basis: { kind: 'materials', lines: safeLines, sourceLines }, accountingBasis: { vatBasis: `${tax.label}: ${tax.amount} VND; tiền hàng in trên chứng từ ${subtotal.amount} VND; tổng tiền in trên chứng từ ${total.amount} VND. Cần đối chiếu bản gốc.`, roundingBasis: `Tổng các thành tiền in trên chứng từ khớp tiền hàng, VAT và tổng cộng. ${safeLines.length} dòng khớp số lượng × đơn giá; ${sourceLines.length - safeLines.length} dòng khác thành tiền in được giữ để kiểm tra và chưa áp dụng vào cơ sở vật tư. Cần đối chiếu bản gốc.` } }
    } else hints.providerLocations = []
  }
  const suppliers = paragraphs.filter(p => /^(?:supplier|vendor|seller|đơn vị cung cấp|bên bán)\s*:/iu.test(p.content.trim()))
  if (suppliers.length === 1 && location('partyHint', suppliers[0]!)) hints.fields.partyHint = suppliers[0]!.content.replace(/^[^:]+:\s*/, '').trim()
  return hints
}
