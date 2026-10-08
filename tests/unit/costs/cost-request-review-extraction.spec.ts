import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { parse, compileScript } from 'vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import * as workflow from '../../../shared/schemas/costs/cost-workflow'
import * as extraction from '../../../shared/schemas/costs/cost-extraction'
import * as session from '../../../app/utils/costs/cost-extraction-session'
import * as polling from '../../../app/utils/costs/cost-extraction-polling'
import * as review from '../../../app/utils/costs/cost-extraction-review'
import * as submission from '../../../app/utils/costs/cost-request-submission'
import * as tracker from '../../../app/utils/costs/async-request-tracker'
import type { CostExtractionView, ExtractionResult } from '../../../shared/schemas/costs/cost-extraction'

type TestNode = { tag: string; text: string; props: Record<string, unknown>; children: TestNode[]; parent: TestNode | null }
const node = (tag: string, text = ''): TestNode => ({ tag, text, props: {}, children: [], parent: null })
const id = 'c1f80000-0000-4000-8000-000000000001'
const mounted: Array<() => void> = []
afterEach(() => { mounted.splice(0).forEach(unmount => unmount()); vi.useRealTimers() })
const pending: ExtractionResult = {
  status: 'unavailable', reviewRequired: true, fields: {}, warnings: ['OCR_PENDING'],
  sourceLocations: [], methodVersion: 'azure-f0-v1',
  azurePdfCoverage: {
    kind: 'azure-pdf-scope-v1', sourceSha256: 'a'.repeat(64), sourceByteLength: 100,
    requestedPages: [1, 2], returnedPages: [], requestedPagesMatched: false,
    sourcePageCount: { kind: 'unknown' }, wholeDocumentComplete: false, reviewRequired: true,
  },
}
const view = (result: ExtractionResult): CostExtractionView => ({ extractionId: id, fileId: id, requestId: id, replayed: false, result })

function materialSourceReviewResult(): ExtractionResult {
  const first = { description: 'Source material A', quantity: '0.12', unit: 'box', unitPrice: '10' }
  const second = { description: 'Source material B', quantity: '0.21', unit: 'box', unitPrice: '10' }
  const third = { description: 'Source material C', quantity: '2', unit: 'box', unitPrice: '3' }
  return extraction.costExtractionResultSchema.parse({
    status: 'needs_review', reviewRequired: true, methodVersion: 'azure-f0-v1', warnings: ['TOTAL_REQUIRES_REVIEW', 'NUMBER_FORMAT_REQUIRES_REVIEW'], sourceLocations: [],
    fields: { amount: '8.64', currencyCode: 'VND', basis: {
      kind: 'materials', lines: [first, second], sourceLines: [
        { ...first, printedLineAmount: '1', calculatedLineAmount: '1', status: 'reconciled', pageNumber: 1, tableIndex: 0, rowIndex: 1 },
        { ...second, printedLineAmount: '2', calculatedLineAmount: '2', status: 'reconciled', pageNumber: 1, tableIndex: 0, rowIndex: 2 },
        { ...third, printedLineAmount: '5', calculatedLineAmount: '6', status: 'printed_amount_mismatch', pageNumber: 2, tableIndex: 1, rowIndex: 1 },
      ],
    } },
    providerLocations: [0, 1, 2].flatMap(index => ['description', 'quantity', 'unit', 'unitPrice', 'printedLineAmount'].map(field => ({ field: `basis.sourceLines.${index}.${field}`, pageNumber: index === 2 ? 2 : 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1], confidence: 0.991 }))),
  })
}

async function panel(result: ExtractionResult, following: ExtractionResult[] = [], submitting = false, beforeScan?: (nodes: () => TestNode[]) => void) {
  let call = 0
  const extractEvidence = vi.fn(async () => view(call++ === 0 ? result : following.shift() ?? result))
  const permissions = ['cost.request.read', 'cost.request.submit', 'cost.request.file.read', 'cost.prepare']
  const access = vue.reactive({ activeCompanyId: id, permissions, hasPermission: (permission: string) => permissions.includes(permission) })
  const auth = vue.reactive({ user: { id }, lifecycle: 'authenticated' })
  const originalSource = readFileSync(new URL('../../../app/components/costs/CostRequestReviewPanel.vue', import.meta.url), 'utf8')
  const source = submitting ? originalSource.replace('const isSubmitting = ref(false)', 'const isSubmitting = ref(true)') : originalSource
  const compiled = compileScript(parse(source).descriptor, { id: 'ocr-unit-panel', inlineTemplate: true, templateOptions: { compilerOptions: { hoistStatic: false } } })
  const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const modules: Record<string, unknown> = {
    vue: { ...vue, withDirectives: (vnode: vue.VNode, directives: vue.DirectiveArguments) => {
      vnode.props = { ...vnode.props, modelValue: directives[0]?.[1] }
      // The real DOM directive updates input values on every render. Mirror that
      // update in this host renderer, even when compiler dynamic props omit value.
      vnode.patchFlag |= 8
      vnode.dynamicProps = [...new Set([...(vnode.dynamicProps ?? []), 'modelValue'])]
      return vnode
    } },
    '../../../shared/schemas/costs/cost-workflow': workflow,
    '../../../shared/schemas/costs/cost-extraction': extraction,
    '../../utils/costs/cost-extraction-session': session,
    '../../utils/costs/cost-extraction-polling': polling,
    '../../utils/costs/cost-extraction-review': review,
    '../../utils/costs/cost-request-submission': submission,
    '../../utils/costs/async-request-tracker': tracker,
    './CostWorkflowOriginalUpload.vue': { default: { render: () => null } },
  }
  const exports: { default?: vue.Component } = {}
  new Function('require', 'exports', 'useRepositories', 'useNuxtApp', js)(
    (path: string) => { if (!(path in modules)) throw new Error(`Unexpected unit import: ${path}`); return modules[path] },
    exports, () => ({ costWorkflow: { extractEvidence } }), () => ({ $companyAccessStore: access, $authStore: auth }),
  )
  const renderer = vue.createRenderer<TestNode, TestNode>({
    createElement: tag => node(tag), createText: text => node('#text', text), createComment: text => node('#comment', text),
    setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.text = text; el.children = [] },
    patchProp: (el, key, _previous, value) => { el.props[key] = value },
    parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
    insert: (el, parent, anchor) => {
      if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
      el.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, el)
    },
    remove: el => { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  })
  const root = node('root')
  const app = renderer.createApp(exports.default!, {
    companyId: id, projectId: id, context: { canSubmit: true, operationalState: 'active' },
    parties: [], categories: [], contracts: [],
    initial: { id, version: 0, status: 'draft', evidenceFileIds: [id], basis: { kind: 'materials', deliverySite: '', lines: [] } },
  })
  app.mount(root); mounted.push(() => app.unmount())
  const nodes = (current = root): TestNode[] => [current, ...current.children.flatMap(child => nodes(child))]
  const text = (current = root): string => current.tag === '#comment' ? '' : current.text + current.children.map(child => text(child)).join('')
  const select = nodes().find(el => el.tag === 'select' && el.children.some(child => child.props.value === '1-2'))!
  ;(select.props['onUpdate:modelValue'] as (value: string) => void)('1-2')
  await vue.nextTick()
  beforeScan?.(nodes)
  await vue.nextTick()
  const scan = nodes().find(el => el.tag === 'button' && typeof el.props.onClick === 'function' && String(el.props.onClick).includes('scanEvidence'))!
  await (scan.props.onClick as () => Promise<void>)()
  await vue.nextTick()
  return { nodes, text, extractEvidence, access, auth }
}

describe('OCR review panel result handling', () => {
  it('explains an internal DEV quota rejection without claiming Azure F0 quota exhaustion', async () => {
    const rendered = await panel({ ...pending, warnings: ['OCR_FREE_QUOTA_EXHAUSTED'] })
    expect(rendered.text()).toContain('trần OCR nội bộ')
    expect(rendered.text()).toContain('môi trường DEV')
    expect(rendered.text()).not.toContain('Chưa có dữ liệu nhận dạng hợp lệ')
    expect(rendered.text()).not.toContain('Azure F0 đã hết')
    expect(rendered.extractEvidence).toHaveBeenCalledTimes(1)
    expect(rendered.nodes().find(el => el.tag === 'button' && el.props.type === 'submit')!.props.disabled).toBe(true)
  })

  it.each([
    ['OCR_PROVIDER_NOT_CONFIGURED', 'Dịch vụ OCR chưa được cấu hình'],
    ['OCR_RESPONSE_UNCERTAIN', 'Chưa xác định kết quả OCR trước đó'],
  ] as const)('keeps %s ahead of an internal quota warning', async (warning, notice) => {
    const rendered = await panel({ ...pending, warnings: [warning, 'OCR_FREE_QUOTA_EXHAUSTED'] })
    expect(rendered.text()).toContain(notice)
    expect(rendered.text()).not.toContain('trần OCR nội bộ')
  })

  it.each(['unavailable', 'failed'] as const)('preserves the manual-review fallback for %s without quota', async status => {
    const rendered = await panel({ ...pending, status, warnings: ['EXTRACTION_RESULT_INVALID'] })
    expect(rendered.text()).toContain('Chưa có dữ liệu nhận dạng hợp lệ')
    expect(rendered.text()).not.toContain('trần OCR nội bộ')
  })

  it.each(['quota', 'config', 'failed', 'pending'] as const)('retains entered values and the selected file/PDF scope after %s', async scenario => {
    if (scenario === 'pending') vi.useFakeTimers()
    const result: ExtractionResult = { ...pending,
      status: scenario === 'failed' ? 'failed' : 'unavailable',
      warnings: [scenario === 'quota' ? 'OCR_FREE_QUOTA_EXHAUSTED' : scenario === 'config' ? 'OCR_PROVIDER_NOT_CONFIGURED' : scenario === 'failed' ? 'EXTRACTION_RESULT_INVALID' : 'OCR_PENDING'],
    }
    const rendered = await panel(result, [], false, nodes => {
      const amount = nodes().find(el => el.tag === 'input' && el.props.placeholder === '1000000')!
      ;(amount.props['onUpdate:modelValue'] as (value: string) => void)('123456')
      const notes = nodes().find(el => el.tag === 'input' && el.props.placeholder === 'Tùy chọn')!
      ;(notes.props['onUpdate:modelValue'] as (value: string) => void)('Reviewed note')
    })
    expect(rendered.nodes().find(el => el.tag === 'input' && el.props.placeholder === '1000000')!.props.modelValue).toBe('123456')
    expect(rendered.nodes().find(el => el.tag === 'input' && el.props.placeholder === 'Tùy chọn')!.props.modelValue).toBe('Reviewed note')
    expect(rendered.nodes().filter(el => el.props.class === 'evidence-row')).toHaveLength(1)
    expect(rendered.nodes().find(el => el.tag === 'select' && el.children.some(child => child.props.value === '1-2'))!.props.modelValue).toBe('1-2')
    expect(rendered.extractEvidence).toHaveBeenCalledTimes(1)
    expect(rendered.extractEvidence).toHaveBeenCalledWith(id, id, expect.objectContaining({ pdfPageScope: '1-2', requestId: id }), expect.objectContaining({ idempotencyKey: expect.any(String) }))
    expect(rendered.nodes().find(el => el.tag === 'input' && el.props.type === 'checkbox')!.props.modelValue).toBe(false)
    expect(rendered.nodes().find(el => el.tag === 'button' && el.props.type === 'submit')!.props.disabled).toBe(true)
  })

  it('renders the active form inputs and selectors with the existing Cockpit control primitives', async () => {
    const rendered = await panel({ ...pending, warnings: ['OCR_FREE_QUOTA_EXHAUSTED'] })
    const controls = rendered.nodes().filter(el => (el.tag === 'input' && el.props.type !== 'checkbox') || el.tag === 'select')
    expect(controls.length).toBeGreaterThan(10)
    for (const control of controls) expect(String(control.props.class)).toContain(control.tag === 'select' ? 'cockpit-select' : 'cockpit-input')
  })

  it('shows every original material candidate and distinguishes printed total from the partial applicable sum', async () => {
    const rendered = await panel(materialSourceReviewResult())
    expect(rendered.text()).toContain('3 dòng nguồn: 2 dòng có thể áp dụng; 1 dòng giữ lại để rà soát')
    expect(rendered.text()).toContain('Cơ sở vật tư chưa đầy đủ')
    expect(rendered.text()).toContain('Tổng tiền in trên tài liệu: 8.64 VND')
    expect(rendered.text()).toContain('Tổng các dòng có thể áp dụng (chưa VAT): 3 VND')
    const sourceRows = rendered.nodes().filter(el => el.tag === 'tr' && rendered.text(el).includes('Source material'))
    expect(sourceRows).toHaveLength(3)
    expect(rendered.text(sourceRows[2]!)).toContain('5')
    expect(rendered.text(sourceRows[2]!)).toContain('6')
    expect(rendered.text(sourceRows[2]!)).toContain('Giữ lại để rà soát')
    expect(rendered.text(sourceRows[2]!)).toContain('Trang 2; độ tin cậy OCR 99%')
  })

  it('applies only reconciled financial fields while retaining withheld originals and unchecked review', async () => {
    const rendered = await panel(materialSourceReviewResult())
    const review = rendered.nodes().find(el => el.tag === 'input' && el.props.type === 'checkbox')!
    ;(review.props['onUpdate:modelValue'] as (value: boolean) => void)(true)
    await vue.nextTick()
    const apply = rendered.nodes().find(el => el.tag === 'button' && String(el.props.onClick).includes('applySuggestion'))!
    ;(apply.props.onClick as () => void)()
    await vue.nextTick()
    const inputs = rendered.nodes().filter(el => el.tag === 'input')
    expect(inputs.filter(el => String(el.props.modelValue).startsWith('Source material')).map(el => el.props.modelValue)).toEqual(['Source material A', 'Source material B'])
    expect(rendered.text()).toContain('Source material C')
    expect(rendered.text()).toContain('Tổng tiền in trên tài liệu: 8.64 VND')
    expect(rendered.text()).toContain('Tổng các dòng vật tư hiện trong biểu mẫu (chưa VAT): 3 VND')
    expect(rendered.nodes().find(el => el.tag === 'input' && el.props.type === 'checkbox')!.props.modelValue).toBe(false)
    expect(rendered.nodes().find(el => el.tag === 'button' && el.props.type === 'submit')!.props.disabled).toBe(true)
  })

  it('does not start extraction while a financial submission is in flight', async () => {
    const rendered = await panel(pending, [], true)
    expect(rendered.extractEvidence).not.toHaveBeenCalled()
    expect(rendered.nodes().filter(el => el.tag === 'button' && String(el.props.onClick).includes('scanEvidence')).every(el => el.props.disabled)).toBe(true)
  })
  it('shows processing and result retrieval for confirmed pending Azure PDF results', async () => {
    vi.useFakeTimers()
    const rendered = await panel(pending)
    expect(rendered.text()).toContain('Đang xử lý OCR')
    expect(rendered.text()).not.toContain('nhập và rà soát thủ công')
    expect(rendered.nodes().some(el => el.tag === 'button' && rendered.text(el) === 'Lấy kết quả')).toBe(true)
    expect(rendered.nodes().filter(el => el.tag === 'button' && rendered.text(el) === 'Gỡ').every(el => el.props.disabled)).toBe(true)
  })

  it('continues the captured pending request and exposes a completed result without submission', async () => {
    vi.useFakeTimers()
    const complete: ExtractionResult = { ...pending, status: 'needs_review', warnings: ['TOTAL_REQUIRES_REVIEW'], fields: { amount: '10', currencyCode: 'VND' }, azurePdfCoverage: { ...pending.azurePdfCoverage!, returnedPages: [1, 2], requestedPagesMatched: true } }
    const rendered = await panel(pending, [complete])
    await vi.advanceTimersByTimeAsync(5000)
    await vue.nextTick()
    expect(rendered.extractEvidence).toHaveBeenCalledTimes(2)
    expect(rendered.text()).toContain('10 VND')
    expect(rendered.nodes().some(el => el.tag === 'button' && rendered.text(el).includes('Áp dụng') && !el.props.disabled)).toBe(true)
    expect(rendered.nodes().find(el => el.tag === 'button' && el.props.type === 'submit')!.props.disabled).toBe(true)
  })

  it('invalidates pending evidence and scheduled requests when the authenticated account changes', async () => {
    vi.useFakeTimers()
    const rendered = await panel(pending)
    rendered.auth.user.id = 'c1f80000-0000-4000-8000-000000000002'
    await vi.advanceTimersByTimeAsync(100_000)
    await vue.nextTick()
    expect(rendered.extractEvidence).toHaveBeenCalledTimes(1)
    expect(rendered.nodes().filter(el => el.props.class === 'evidence-row')).toHaveLength(0)
  })
  it('keeps a party-only hint visible for manual selection without offering Apply', async () => {
    const rendered = await panel({ status: 'needs_review', reviewRequired: true, fields: { partyHint: 'Unit fixture' }, warnings: ['PARTY_MATCH_REQUIRES_REVIEW'], sourceLocations: [], methodVersion: 'azure-f0-v1' })
    expect(rendered.text()).toContain('Unit fixture')
    expect(rendered.nodes().some(el => el.tag === 'button' && rendered.text(el).includes('Áp dụng') && !el.props.disabled)).toBe(false)
  })
  it('shows an empty mapping diagnostic without an enabled Apply action', async () => {
    const rendered = await panel({ status: 'needs_review', reviewRequired: true, fields: {}, warnings: ['TOTAL_REQUIRES_REVIEW'], sourceLocations: [], methodVersion: 'azure-f0-v1' })
    expect(rendered.text()).toContain('Chưa có dữ liệu gợi ý có thể áp dụng')
    expect(rendered.nodes().some(el => el.tag === 'button' && rendered.text(el).includes('Áp dụng') && !el.props.disabled)).toBe(false)
  })
})
