import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEvidenceExtractionSession } from '../../../app/utils/costs/cost-extraction-session'
import type { CostExtractionView, ExtractionResult } from '../../../shared/schemas/costs/cost-extraction'
import * as implementation from '../../../app/utils/costs/cost-extraction-polling'
import type { EvidenceExtractionPollingOptions, EvidenceExtractionPollingState } from '../../../app/utils/costs/cost-extraction-polling'

const id = 'c1f80000-0000-4000-8000-000000000001'
const input = { requestId: id, pdfPageScope: '1-2' as const, pdfDeclaredPageCount: 4 }
const pending: ExtractionResult = {
  status: 'unavailable', reviewRequired: true, fields: {}, warnings: ['OCR_PENDING'], sourceLocations: [], methodVersion: 'azure-f0-v1',
  azurePdfCoverage: { kind: 'azure-pdf-scope-v1', sourceSha256: 'a'.repeat(64), sourceByteLength: 100, requestedPages: [1, 2], returnedPages: [], requestedPagesMatched: false, sourcePageCount: { kind: 'user-declared', count: 4 }, wholeDocumentComplete: false, reviewRequired: true },
}
const ready: ExtractionResult = { ...pending, status: 'needs_review', warnings: ['TOTAL_REQUIRES_REVIEW'], fields: { amount: '10', currencyCode: 'VND' }, azurePdfCoverage: { ...pending.azurePdfCoverage!, returnedPages: [1, 2], requestedPagesMatched: true } }
const view = (result = pending): CostExtractionView => ({ extractionId: id, fileId: id, requestId: id, replayed: false, result })

function create(options: EvidenceExtractionPollingOptions) {
  expect(implementation.createEvidenceExtractionPolling, 'pending controller is implemented').toBeTypeOf('function')
  return implementation.createEvidenceExtractionPolling(options)
}
function fixture(scan: EvidenceExtractionPollingOptions['scan'] = async () => view()) {
  vi.useFakeTimers(); vi.setSystemTime(0)
  let scope = true
  const states: EvidenceExtractionPollingState[] = [], results: CostExtractionView[] = [], errors: unknown[] = []
  const controller = create({ scan, isScopeCurrent: () => scope, onStateChange: state => states.push(state), onResult: result => results.push(result), onError: error => errors.push(error) })
  return { controller, states, results, errors, revoke: () => { scope = false }, state: () => states.at(-1)! }
}
afterEach(() => vi.useRealTimers())

describe('confirmed pending Azure PDF continuation', () => {
  it('admits only an Azure pending result whose PDF evidence matches the frozen request', () => {
    expect(implementation.isPendingAzurePdfExtraction).toBeTypeOf('function')
    const confirmed = implementation.isPendingAzurePdfExtraction
    expect(confirmed(pending, input)).toBe(true)
    expect(confirmed({ ...pending, methodVersion: 'offline-unavailable-v1', azurePdfCoverage: undefined }, input)).toBe(false)
    expect(confirmed({ ...pending, azurePdfCoverage: undefined }, input)).toBe(false)
    expect(confirmed(pending, { ...input, pdfPageScope: '1' })).toBe(false)
    expect(confirmed(pending, { ...input, pdfDeclaredPageCount: 5 })).toBe(false)
    for (const warning of ['OCR_RESPONSE_UNCERTAIN', 'OCR_PROVIDER_NOT_CONFIGURED', 'OCR_FREE_QUOTA_EXHAUSTED', 'EXTRACTION_RESULT_INVALID'] as const) {
      expect(confirmed({ ...pending, warnings: ['OCR_PENDING', warning] }, input)).toBe(false)
    }
  })

  it('waits five seconds and uses a new persistence key for each acknowledged pending response', async () => {
    const commands: unknown[][] = []
    const repository = { extractEvidence: async (...args: unknown[]) => { commands.push(args); return view() } }
    let keys = 0
    const session = createEvidenceExtractionSession({ projectId: id, repository: repository as never, isScopeCurrent: () => true, key: () => `persistence-${++keys}` })
    const initial = await session.scan(id, input)
    const f = fixture((fileId, command) => session.scan(fileId, command))
    const mutable = { ...input }
    expect(f.controller.start(id, mutable, initial)).toBe(true)
    mutable.pdfDeclaredPageCount = 8
    await vi.advanceTimersByTimeAsync(4999)
    expect(commands).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(commands).toHaveLength(2)
    expect(commands[1]!.slice(0, 3)).toEqual(commands[0]!.slice(0, 3))
    expect(commands[1]![3]).toEqual({ idempotencyKey: 'persistence-2' })
    f.controller.cancel()
  })

  it('makes at most six automatic continuations and leaves same-job manual retrieval available', async () => {
    let calls = 0
    const f = fixture(async () => { calls++; return view() })
    f.controller.start(id, input, view())
    await vi.advanceTimersByTimeAsync(100_000)
    expect(calls).toBe(6)
    expect(f.state()).toMatchObject({ phase: 'limited', fileId: id, automaticRequests: 6, manualReady: true })
    expect(await f.controller.continue()).toBe(true)
    expect(calls).toBe(7)
    expect(await f.controller.continue()).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.state().manualReady).toBe(true)
    expect(calls).toBe(7)
    f.controller.cancel()
  })

  it('never overlaps a slow continuation with an automatic or manual request', async () => {
    let finish!: (result: CostExtractionView) => void
    let calls = 0
    const f = fixture(() => { calls++; return new Promise(resolve => { finish = resolve }) })
    f.controller.start(id, input, view())
    await vi.advanceTimersByTimeAsync(20_000)
    expect(calls).toBe(1)
    expect(await f.controller.continue()).toBe(false)
    finish(view()); await Promise.resolve(); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(4999)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toBe(2)
    f.controller.cancel(); finish(view())
  })

  it('stops scheduling after ninety seconds even when the last request resolves later', async () => {
    let finish!: (result: CostExtractionView) => void
    let calls = 0
    const f = fixture(() => { calls++; return new Promise(resolve => { finish = resolve }) })
    f.controller.start(id, input, view())
    await vi.advanceTimersByTimeAsync(91_000)
    finish(view()); await Promise.resolve(); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(100_000)
    expect(calls).toBe(1)
    expect(f.state()).toMatchObject({ phase: 'limited', manualReady: true })
    f.controller.cancel()
  })

  it('stops on completion and exposes only the result from the captured scope', async () => {
    const f = fixture(async () => view(ready))
    f.controller.start(id, input, view())
    await vi.advanceTimersByTimeAsync(100_000)
    expect(f.results).toEqual([view(ready)])
    expect(f.state()).toMatchObject({ phase: 'idle', fileId: null })
  })

  it('cancels scheduled work when the company, project or permission scope is revoked', async () => {
    let calls = 0
    const f = fixture(async () => { calls++; return view() })
    f.controller.start(id, input, view()); f.revoke()
    await vi.advanceTimersByTimeAsync(100_000)
    expect(calls).toBe(0)
    expect(f.results).toEqual([])
  })

  it('ignores an in-flight completion after cancellation or unmount', async () => {
    let finish!: (result: CostExtractionView) => void
    const f = fixture(() => new Promise(resolve => { finish = resolve }))
    f.controller.start(id, input, view())
    await vi.advanceTimersByTimeAsync(5000)
    f.controller.cancel(); finish(view(ready))
    await vi.advanceTimersByTimeAsync(100_000)
    expect(f.results).toEqual([])
    expect(f.errors).toEqual([])
    expect(f.state()).toMatchObject({ phase: 'idle', fileId: null })
  })

  it('stops after a lost response and retains the existing identical-key explicit retry', async () => {
    const commands: unknown[][] = []
    let keys = 0
    const repository = { extractEvidence: async (...args: unknown[]) => { commands.push(args); if (commands.length === 2) throw new Error('response lost'); return view() } }
    const session = createEvidenceExtractionSession({ projectId: id, repository: repository as never, isScopeCurrent: () => true, key: () => `persistence-${++keys}` })
    const initial = await session.scan(id, input)
    const f = fixture((fileId, command) => session.scan(fileId, command))
    f.controller.start(id, input, initial)
    await vi.advanceTimersByTimeAsync(100_000)
    expect(commands).toHaveLength(2)
    expect(f.state()).toMatchObject({ phase: 'uncertain', fileId: id, manualReady: true })
    expect(session.pendingFileId).toBe(id)
    expect(f.errors).toHaveLength(1)
    await f.controller.continue()
    expect(commands[2]).toEqual(commands[1])
    await vi.advanceTimersByTimeAsync(100_000)
    expect(commands).toHaveLength(3)
    f.controller.cancel()
  })

  it('stops on a confirmed uncertain or permanent unavailable provider result', async () => {
    for (const warning of ['OCR_RESPONSE_UNCERTAIN', 'OCR_PROVIDER_NOT_CONFIGURED', 'EXTRACTION_RESULT_INVALID'] as const) {
      let calls = 0
      const terminal = { ...pending, warnings: [warning] }
      const f = fixture(async () => { calls++; return view(terminal) })
      f.controller.start(id, input, view())
      await vi.advanceTimersByTimeAsync(100_000)
      expect(calls).toBe(1)
      expect(f.results).toEqual([view(terminal)])
      expect(f.state()).toMatchObject({ phase: 'idle', fileId: null })
    }
  })

  it('rejects a response whose immutable source or request identity changes', async () => {
    const changed = { ...pending, azurePdfCoverage: { ...pending.azurePdfCoverage!, sourceSha256: 'b'.repeat(64) } }
    const f = fixture(async () => view(changed))
    f.controller.start(id, input, view())
    await vi.advanceTimersByTimeAsync(100_000)
    expect(f.results).toEqual([])
    expect(f.errors).toHaveLength(1)
    expect(f.state().phase).toBe('uncertain')
    f.controller.cancel()
  })

  it('rejects a reviewable continuation that loses the admitted PDF coverage', async () => {
    const f = fixture(async () => view({ ...ready, azurePdfCoverage: undefined }))
    f.controller.start(id, input, view())
    await vi.advanceTimersByTimeAsync(100_000)
    expect(f.results).toEqual([])
    expect(f.errors).toHaveLength(1)
    expect(f.state().phase).toBe('uncertain')
    f.controller.cancel()
  })
  it('never starts polling for a nonpending or mismatched initial response', async () => {
    let calls = 0
    const f = fixture(async () => { calls++; return view() })
    expect(f.controller.start(id, input, view(ready))).toBe(false)
    expect(f.controller.start(id, { ...input, pdfPageScope: '1' }, view())).toBe(false)
    await vi.advanceTimersByTimeAsync(100_000)
    expect(calls).toBe(0)
  })
})

describe('meaningful extraction Apply fields', () => {
  it('excludes empty fields, failed or unavailable results, party-only hints and empty basis containers', () => {
    expect(implementation.hasApplicableExtractionFields).toBeTypeOf('function')
    const applicable = implementation.hasApplicableExtractionFields
    expect(applicable({ ...ready, fields: {} }, 'materials')).toBe(false)
    expect(applicable(pending, 'materials')).toBe(false)
    expect(applicable({ ...ready, status: 'failed' }, 'materials')).toBe(false)
    expect(applicable({ ...ready, fields: { partyHint: 'Unit fixture' } }, 'materials')).toBe(false)
    expect(applicable({ ...ready, fields: { basis: { kind: 'materials', lines: [] } } }, 'materials')).toBe(false)
    expect(applicable(ready, 'materials')).toBe(true)
    expect(applicable({ ...ready, fields: { basis: { kind: 'materials', lines: [{ description: 'Unit fixture', quantity: '1', unit: 'unit', unitPrice: '10' }] } } }, 'other')).toBe(false)
  })
})
