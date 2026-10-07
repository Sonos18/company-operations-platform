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
type Column = 'description' | 'quantity' | 'unit' | 'unitPrice' | 'lineTotal'
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
  function location(field: string, source: Located): boolean {
    if (!source.boundingRegions?.length) return false
    const { score, low } = confidence(source)
    if (low) return false
    for (const r of source.boundingRegions) hints.providerLocations!.push({ field, ...r, ...(score === undefined ? {} : { confidence: score }) })
    return true
  }
  const candidates = new Map<'subtotal' | 'tax' | 'total', Array<{ amount: string; label: string; labelSource: Located; source: Located }>>()
  for (const table of tables) {
    for (const row of new Set(table.cells.map(c => c.rowIndex))) {
      const cells = table.cells.filter(c => c.rowIndex === row).sort((a, b) => a.columnIndex - b.columnIndex)
      const label = cells.find(c => summary(c.content)), kind = label && summary(label.content)
      if (!kind) continue
      const amounts = cells.filter(c => c !== label).map(c => ({ amount: decimal(c.content, true), source: c })).filter(c => c.amount !== null)
      if (amounts.length === 1) candidates.set(kind, [...(candidates.get(kind) ?? []), { amount: amounts[0]!.amount!, label: label!.content, labelSource: label!, source: amounts[0]!.source }])
    }
  }
  const unique = (kind: 'subtotal' | 'tax' | 'total') => { const found = candidates.get(kind) ?? []; return found.length === 1 ? found[0] : undefined }
  const subtotal = unique('subtotal'), tax = unique('tax'), total = unique('total')
  const lines: Array<{ description: string; quantity: string; unit: string; unitPrice: string }> = []
  let sum = new Money(0), valid = true, recognized = 0
  for (const table of tables) {
    let headerRow = -1, columns: Partial<Record<Column, number>> = {}
    for (const row of new Set(table.cells.map(c => c.rowIndex))) {
      const mapping: Partial<Record<Column, number>> = {}, seen = new Set<Column>()
      for (const c of table.cells.filter(c => c.rowIndex === row)) { const key = column(c.content); if (key) { if (seen.has(key)) valid = false; seen.add(key); mapping[key] = c.columnIndex } }
      if (['description', 'quantity', 'unit', 'unitPrice'].every(k => mapping[k as Column] !== undefined)) { headerRow = row; columns = mapping; break }
    }
    if (headerRow < 0) {
      // Do not silently omit a continuation table whose numeric rows lack a repeated header.
      for (const row of new Set(table.cells.map(c => c.rowIndex))) {
        const cells = table.cells.filter(c => c.rowIndex === row)
        if (cells.some(c => decimal(c.content, true) !== null) && !cells.some(c => summary(c.content))) valid = false
      }
      continue
    }
    recognized++
    for (const row of [...new Set(table.cells.map(c => c.rowIndex))].sort((a, b) => a - b)) {
      if (row <= headerRow) continue
      const cells = table.cells.filter(c => c.rowIndex === row)
      if (cells.every(c => !c.content.trim()) || cells.some(c => summary(c.content))) continue
      if (cells.some(c => column(c.content) && c.kind === 'columnHeader')) continue
      const get = (key: Column) => cells.find(c => c.columnIndex === columns[key])
      const description = get('description'), quantity = get('quantity'), unit = get('unit'), price = get('unitPrice'), printed = get('lineTotal')
      const q = quantity && decimal(quantity.content, false), p = price && decimal(price.content, true)
      if (!description?.content.trim() || !unit?.content.trim() || !q || !p || new Money(q).lte(0) || cells.some(c => (c.rowSpan ?? 1) !== 1 || (c.columnSpan ?? 1) !== 1) || lines.length >= 1000) { valid = false; continue }
      const computed = new Money(q).mul(p).toDecimalPlaces(0)
      if (columns.lineTotal !== undefined && (!printed || decimal(printed.content, true) === null || !computed.eq(decimal(printed.content, true)!))) { valid = false; continue }
      const index = lines.length
      if (![description, quantity!, unit, price!].every((c, i) => location(`basis.lines.${index}.${['description', 'quantity', 'unit', 'unitPrice'][i]}`, c))) { valid = false; continue }
      lines.push({ description: description.content.trim(), quantity: q, unit: unit.content.trim(), unitPrice: p })
      sum = sum.plus(computed)
    }
  }
  const reconciled = valid && recognized > 0 && lines.length > 0 && subtotal && sum.eq(subtotal.amount) && tax && total && new Money(subtotal.amount).plus(tax.amount).eq(total.amount)
  const rate = tax?.label.match(/(\d+(?:[.,]\d+)?)\s*%/)
  const vatMatches = reconciled && rate && new Money(rate[1]!.replace(',', '.')).lte(100) && new Money(subtotal.amount).mul(rate[1]!.replace(',', '.')).div(100).toDecimalPlaces(0).eq(tax.amount)
  if (vatMatches && location('amount', total.source) && location('currencyCode', currencySources[0]!) && location('accountingBasis.vatBasis', tax.labelSource) && location('accountingBasis.vatBasis', tax.source) && location('accountingBasis.vatBasis', subtotal.source)) {
    hints.fields = { amount: total.amount, currencyCode: 'VND', basis: { kind: 'materials', lines }, accountingBasis: { vatBasis: `${tax.label}: ${tax.amount} VND; tiền hàng ${subtotal.amount} VND; tổng ${total.amount} VND. Đối chiếu bản gốc.`, roundingBasis: 'Đối chiếu dòng hàng và VAT sau làm tròn đến một đồng; cần người kiểm tra xác nhận.' } }
  } else {
    hints.providerLocations = []
    hints.warnings.push('NUMBER_FORMAT_REQUIRES_REVIEW')
  }
  const suppliers = paragraphs.filter(p => /^(?:supplier|vendor|seller|đơn vị cung cấp|bên bán)\s*:/iu.test(p.content.trim()))
  if (suppliers.length === 1 && location('partyHint', suppliers[0]!)) hints.fields.partyHint = suppliers[0]!.content.replace(/^[^:]+:\s*/, '').trim()
  return hints
}
