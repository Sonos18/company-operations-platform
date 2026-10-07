import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import * as workflow from '../../../shared/schemas/costs/cost-workflow'
import * as extraction from '../../../shared/schemas/costs/cost-extraction'
import * as session from '../../../app/utils/costs/cost-extraction-session'
import * as polling from '../../../app/utils/costs/cost-extraction-polling'
import * as review from '../../../app/utils/costs/cost-extraction-review'
import * as submission from '../../../app/utils/costs/cost-request-submission'
import * as tracker from '../../../app/utils/costs/async-request-tracker'
import type { WorkflowRecoverableQuotation } from '../../../shared/schemas/costs/cost-workflow-evidence'
import type { CostExtractionView } from '../../../shared/schemas/costs/cost-extraction'

type TestNode = { tag: string; text: string; props: Record<string, unknown>; children: TestNode[]; parent: TestNode | null }
const node = (tag: string, text = ''): TestNode => ({ tag, text, props: {}, children: [], parent: null })
const id = 'c1f80000-0000-4000-8000-000000000001'
const otherId = 'c1f80000-0000-4000-8000-000000000002'
const quotation: WorkflowRecoverableQuotation = {
  id: otherId, version: 1, originalFilename: 'Synthetic quotation.pdf', mimeType: 'application/pdf',
  sizeBytes: 1234, sha256: 'a'.repeat(64), finalizedAt: '2026-10-07T09:00:00.000Z', kind: 'quotation',
}
const initial = () => ({
  id, version: 3, status: 'working', partyId: id, categoryId: id, amount: '10', currencyCode: 'VND',
  evidenceFileIds: [id], basis: { kind: 'materials', deliverySite: 'Synthetic site', lines: [{ description: 'Unit fixture', quantity: '1', unit: 'box', unitPrice: '10' }] },
})
const pending: CostExtractionView = {
  extractionId: id, fileId: id, requestId: id, replayed: false,
  result: { status: 'unavailable', reviewRequired: true, fields: {}, warnings: ['OCR_PENDING'], sourceLocations: [], methodVersion: 'azure-f0-v1', azurePdfCoverage: {
    kind: 'azure-pdf-scope-v1', sourceSha256: 'a'.repeat(64), sourceByteLength: 100,
    requestedPages: [1, 2], returnedPages: [], requestedPagesMatched: false,
    sourcePageCount: { kind: 'unknown' }, wholeDocumentComplete: false, reviewRequired: true,
  } },
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
const mounted: Array<() => void> = []
afterEach(() => { mounted.splice(0).forEach(unmount => unmount()); vi.useRealTimers() })

// Real SFC and render events; only external repository and uploader boundaries are substituted.
function panel(saved = false, savedInitial = initial()) {
  const repo = {
    listRecoverableQuotations: vi.fn(async () => [quotation]), extractEvidence: vi.fn(async () => pending),
    createRequest: vi.fn(), updateRequest: vi.fn(), submitRequest: vi.fn(), linkEvidence: vi.fn(), readEvidenceUrl: vi.fn(),
  }
  const access = vue.reactive({ activeCompanyId: id, permissions: ['cost.request.read', 'cost.request.submit', 'cost.request.file.read', 'cost.prepare'], hasPermission(permission: string) { return this.permissions.includes(permission) } })
  const auth = vue.reactive({ user: { id }, lifecycle: 'authenticated' })
  const props = vue.reactive({
    companyId: id, projectId: id, context: { mode: 'document_backed_v1', canSubmit: true, operationalState: 'active' },
    parties: [{ id, name: 'Synthetic supplier', kind: 'organization', crewOwnership: null }], categories: [{ id, name: 'Synthetic category' }], contracts: [],
    initial: saved ? savedInitial : undefined,
  })
  const source = readFileSync(new URL('../../../app/components/costs/CostRequestReviewPanel.vue', import.meta.url), 'utf8')
  const compiled = compileScript(parse(source).descriptor, { id: 'quotation-unit-panel', inlineTemplate: true, templateOptions: { compilerOptions: { hoistStatic: false } } })
  const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const modules: Record<string, unknown> = {
    vue: { ...vue, withDirectives: (vnode: vue.VNode, directives: vue.DirectiveArguments) => { vnode.props = { ...vnode.props, modelValue: directives[0]?.[1] }; return vnode } },
    '../../../shared/schemas/costs/cost-workflow': workflow, '../../../shared/schemas/costs/cost-extraction': extraction,
    '../../utils/costs/cost-extraction-session': session, '../../utils/costs/cost-extraction-polling': polling,
    '../../utils/costs/cost-extraction-review': review, '../../utils/costs/cost-request-submission': submission,
    '../../utils/costs/async-request-tracker': tracker,
    './CostWorkflowOriginalUpload.vue': { default: vue.defineComponent({ emits: ['busy', 'finalized'], setup(_, { emit }) { return () => vue.h('button', { type: 'button', 'data-upload-busy': true, onClick: () => emit('busy', true) }, 'Synthetic upload boundary') } }) },
  }
  const exports: { default?: vue.Component } = {}
  new Function('require', 'exports', 'useRepositories', 'useNuxtApp', js)(
    (path: string) => { if (!(path in modules)) throw new Error(`Unexpected unit import: ${path}`); return modules[path] },
    exports, () => ({ costWorkflow: repo }), () => ({ $companyAccessStore: access, $authStore: auth }),
  )
  const renderer = vue.createRenderer<TestNode, TestNode>({
    createElement: tag => node(tag), createText: text => node('#text', text), createComment: text => node('#comment', text),
    setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.text = text; el.children = [] },
    patchProp: (el, key, _previous, value) => { el.props[key] = value }, parentNode: el => el.parent,
    nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
    insert: (el, parent, anchor) => { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = parent; const index = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(index < 0 ? parent.children.length : index, 0, el) },
    remove: el => { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  })
  const root = node('root')
  const app = renderer.createApp({ render: () => vue.h(exports.default!, props) })
  app.mount(root)
  let active = true
  const unmount = () => { if (active) { app.unmount(); active = false } }
  mounted.push(unmount)
  const nodes = (current = root): TestNode[] => [current, ...current.children.flatMap(child => nodes(child))]
  const text = (current = root): string => current.tag === '#comment' ? '' : current.text + current.children.map(child => text(child)).join('')
  const button = (label: string) => nodes().find(el => el.tag === 'button' && text(el) === label)
  const evidence = () => nodes().filter(el => el.props.class === 'evidence-row')
  const click = async (el: TestNode) => { const result = (el.props.onClick as () => unknown)(); await vue.nextTick(); return result }
  const list = () => { const action = button('Chọn báo giá đã tải lên'); expect(action, 'visible explicit quotation picker').toBeDefined(); return action! }
  const choice = () => nodes().find(el => el.tag === 'button' && el.props['data-quotation-id'] === quotation.id)!
  return { repo, access, auth, props, nodes, text, evidence, click, list, choice, unmount }
}

describe('rendered existing quotation picker', () => {
  it('explicitly recovers on a fresh form, shows metadata, attaches once with blank PDF controls and never starts work', async () => {
    const p = panel()
    expect(p.list()).toBeDefined()
    expect(p.repo.listRecoverableQuotations).not.toHaveBeenCalled()
    await p.click(p.list())
    expect(p.repo.listRecoverableQuotations).toHaveBeenCalledWith(id, { requestId: null, requestVersion: null })
    expect(p.text()).toContain(quotation.originalFilename)
    expect(p.text()).toContain(quotation.finalizedAt)
    expect(p.text()).toContain('1234')
    const oldChoice = p.choice()
    await p.click(oldChoice)
    await p.click(oldChoice)
    expect(p.evidence()).toHaveLength(1)
    expect(p.text(p.evidence()[0]!)).toContain(quotation.originalFilename)
    const scope = p.nodes().find(el => el.tag === 'select' && el.children.some(child => child.props.value === '1-2'))!
    expect(scope.props.modelValue).toBe('')
    ;(scope.props['onUpdate:modelValue'] as (value: string) => void)('1-2')
    await vue.nextTick()
    expect(p.nodes().find(el => el.tag === 'input' && el.props.type === 'number')!.props.modelValue).toBeUndefined()
    expect(p.nodes().find(el => el.tag === 'input' && el.props.type === 'checkbox')!.props.modelValue).toBe(false)
    for (const call of [p.repo.extractEvidence, p.repo.createRequest, p.repo.updateRequest, p.repo.submitRequest, p.repo.linkEvidence, p.repo.readEvidenceUrl]) expect(call).not.toHaveBeenCalled()
    p.unmount()
    const refreshed = panel()
    await refreshed.click(refreshed.list())
    await refreshed.click(refreshed.choice())
    expect(refreshed.evidence()).toHaveLength(1)
  })

  it('uses the saved request revision and exposes loading, empty and safe retryable error states', async () => {
    const p = panel(true)
    const response = deferred<WorkflowRecoverableQuotation[]>()
    p.repo.listRecoverableQuotations.mockReturnValueOnce(response.promise)
    const listing = p.click(p.list())
    await vue.nextTick()
    expect(p.list().props.disabled).toBe(true)
    expect(p.text()).toContain('Đang tải báo giá')
    response.resolve([])
    await listing
    expect(p.repo.listRecoverableQuotations).toHaveBeenCalledWith(id, { requestId: id, requestVersion: 3 })
    expect(p.text()).toContain('Không có báo giá')
    p.repo.listRecoverableQuotations.mockRejectedValueOnce(new Error('PRIVATE_BACKEND_DETAILS'))
    await p.click(p.list())
    expect(p.text()).toContain('Không thể tải báo giá')
    expect(p.text()).not.toContain('PRIVATE_BACKEND_DETAILS')
    expect(p.list().props.disabled).toBe(false)
    await p.click(p.list())
    expect(p.choice()).toBeDefined()
  })

  it('preserves revision zero for an existing request', async () => {
    const zero = initial()
    zero.version = 0
    const refreshed = panel(true, zero)
    await refreshed.click(refreshed.list())
    expect(refreshed.repo.listRecoverableQuotations).toHaveBeenCalledWith(id, { requestId: id, requestVersion: 0 })
  })

  const scopeRaces: Array<[string, (p: ReturnType<typeof panel>) => void]> = [
    ['actor', p => { p.auth.user.id = otherId }], ['auth lifecycle', p => { p.auth.lifecycle = 'anonymous' }],
    ['active company', p => { p.access.activeCompanyId = otherId }], ['company prop', p => { p.props.companyId = otherId }],
    ['project', p => { p.props.projectId = otherId }], ['permission', p => { p.access.permissions.pop() }],
    ['request revision', p => { p.props.initial!.version++ }], ['request ID', p => { p.props.initial!.id = otherId }],
    ['readonly request', p => { p.props.initial!.status = 'submitted' }], ['project lifecycle', p => { p.props.context.operationalState = 'completed' }],
    ['unmount', p => p.unmount()],
  ]
  it.each(scopeRaces)('clears rendered choices and rejects retained row selection after %s changes', async (_name, change) => {
    const p = panel(true)
    await p.click(p.list())
    const oldChoice = p.choice()
    change(p)
    await vue.nextTick()
    await p.click(oldChoice)
    expect(p.choice()).toBeUndefined()
    expect(p.evidence().some(el => p.text(el).includes(quotation.originalFilename))).toBe(false)
  })
  it.each(scopeRaces)('rejects late listing after %s changes', async (_name, change) => {
    const p = panel(true)
    await p.click(p.list())
    const oldChoice = p.choice()
    const oldList = p.list()
    const response = deferred<WorkflowRecoverableQuotation[]>()
    p.repo.listRecoverableQuotations.mockReturnValueOnce(response.promise)
    const listing = p.click(oldList)
    change(p)
    response.resolve([quotation])
    await listing
    await p.click(oldChoice)
    expect(p.choice()).toBeUndefined()
    expect(p.evidence().some(el => p.text(el).includes(quotation.originalFilename))).toBe(false)
    expect(p.repo.extractEvidence).not.toHaveBeenCalled()
  })

  it('rejects stale choice closures even when a later list returns the same file ID', async () => {
    const p = panel()
    await p.click(p.list())
    const oldChoice = p.choice()
    p.repo.listRecoverableQuotations.mockResolvedValueOnce([{ ...quotation }])
    await p.click(p.list())
    await p.click(oldChoice)
    expect(p.evidence()).toHaveLength(0)
    await p.click(p.choice())
    expect(p.evidence()).toHaveLength(1)
  })

  it.each(['upload', 'scanning', 'pending', 'scan retry', 'submission', 'submission retry'])('invalidates choices and runtime guards list/select during %s', async busy => {
    vi.useFakeTimers()
    const p = panel(true)
    await p.click(p.list())
    const oldChoice = p.choice(), oldList = p.list()
    const listResponse = deferred<WorkflowRecoverableQuotation[]>()
    p.repo.listRecoverableQuotations.mockReturnValueOnce(listResponse.promise)
    const listing = p.click(oldList)
    let action: unknown
    const extractionResponse = deferred<typeof pending>()
    const submitResponse = deferred<never>()
    if (busy === 'upload') await p.click(p.nodes().find(el => el.props['data-upload-busy'])!)
    else if (busy === 'scanning' || busy === 'pending' || busy === 'scan retry') {
      if (busy === 'scanning') p.repo.extractEvidence.mockReturnValueOnce(extractionResponse.promise)
      if (busy === 'scan retry') p.repo.extractEvidence.mockRejectedValueOnce(new Error('NETWORK_UNCERTAIN'))
      const scope = p.nodes().find(el => el.tag === 'select' && el.children.some(child => child.props.value === '1-2'))!
      ;(scope.props['onUpdate:modelValue'] as (value: string) => void)('1-2')
      await vue.nextTick()
      const scan = p.nodes().find(el => el.tag === 'button' && String(el.props.onClick).includes('scanEvidence'))!
      action = (scan.props.onClick as () => unknown)()
      if (busy !== 'scanning') await action
    } else {
      p.repo.updateRequest.mockReturnValueOnce(submitResponse.promise)
      const checked = p.nodes().find(el => el.tag === 'input' && el.props.type === 'checkbox')!
      ;(checked.props['onUpdate:modelValue'] as (value: boolean) => void)(true)
      await vue.nextTick()
      expect(p.nodes().find(el => el.props.type === 'submit')!.props.disabled).toBe(false)
      action = (p.nodes().find(el => el.tag === 'form')!.props.onSubmit as (event: unknown) => unknown)({ preventDefault() {} })
      if (busy === 'submission retry') { submitResponse.reject(new Error('NETWORK_UNCERTAIN')); await action }
    }
    await vue.nextTick()
    expect(p.list().props.disabled).toBe(true)
    listResponse.resolve([quotation])
    await listing
    await p.click(oldChoice)
    await p.click(oldList)
    expect(p.repo.listRecoverableQuotations).toHaveBeenCalledTimes(2)
    expect(p.choice()).toBeUndefined()
    expect(p.evidence().some(el => p.text(el).includes(quotation.originalFilename))).toBe(false)
    if (busy === 'scanning') { extractionResponse.resolve(pending); await action }
    if (busy === 'submission') { submitResponse.reject(new Error('NETWORK_UNCERTAIN')); await action }
  })
})
