import {
  costExtractionCommandSchema,
  costExtractionResultSchema,
  type AzureF0PdfCoverage,
  type CostExtractionView,
  type ExtractionResult,
} from '../../../shared/schemas/costs/cost-extraction'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'

type Command = Parameters<CostWorkflowRepository['extractEvidence']>[2]
type BasisKind = NonNullable<ExtractionResult['fields']['basis']>['kind']
const delayMs = 5000
const automaticLimit = 6
const automaticWindowMs = 90_000

export interface EvidenceExtractionPollingState {
  readonly phase: 'idle' | 'waiting' | 'requesting' | 'limited' | 'uncertain'
  readonly fileId: string | null
  readonly automaticRequests: number
  readonly manualReady: boolean
}
export interface EvidenceExtractionPollingOptions {
  scan(fileId: string, input: Command): Promise<CostExtractionView>
  isScopeCurrent(): boolean
  onStateChange(state: EvidenceExtractionPollingState): void
  onResult(result: CostExtractionView): void
  onError(error: unknown): void
  now?: () => number
}

/** A pending PDF has admitted requested pages, but no returned page coverage yet. */
export function isPendingAzurePdfExtraction(result: ExtractionResult, input: Command): boolean {
  const parsed = costExtractionResultSchema.safeParse(result)
  if (!parsed.success || !input.pdfPageScope || result.methodVersion !== 'azure-f0-v1' || result.status !== 'unavailable'
    || !result.warnings.includes('OCR_PENDING') || result.warnings.some(warning => warning !== 'OCR_PENDING' && warning !== 'OCR_PDF_PARTIAL_DOCUMENT')) return false
  const coverage = parsed.data.azurePdfCoverage
  if (!coverage) return false
  const pages = input.pdfPageScope === '1' ? [1] : [1, 2]
  return JSON.stringify(coverage.requestedPages) === JSON.stringify(pages)
    && (input.pdfDeclaredPageCount === undefined || (coverage.sourcePageCount.kind !== 'unknown' && coverage.sourcePageCount.count === input.pdfDeclaredPageCount))
}

/** Party selection is always manual; an empty or incompatible basis cannot be applied. */
export function hasApplicableExtractionFields(result: ExtractionResult, basisKind: BasisKind): boolean {
  if (!['ready', 'needs_review'].includes(result.status) || result.warnings.includes('OCR_PENDING') || result.warnings.includes('OCR_RESPONSE_UNCERTAIN')
    || (result.azurePdfCoverage && !result.azurePdfCoverage.requestedPagesMatched)) return false
  const fields = result.fields
  if (fields.amount || fields.currencyCode || Object.values(fields.accountingBasis ?? {}).some(Boolean)) return true
  const basis = fields.basis
  if (!basis || basis.kind !== basisKind) return false
  if (basis.kind === 'materials') return !!basis.deliverySite || basis.lines.length > 0
  if (basis.kind === 'direct_labor') return !!basis.weekStart || basis.workers.length > 0
  if (basis.kind === 'subcontract') return !!basis.acceptanceReference || !!basis.retentionAmount
  return basis.lines.length > 0
}

function coverageIdentity(coverage: AzureF0PdfCoverage): string {
  return JSON.stringify([coverage.sourceSha256, coverage.sourceByteLength, coverage.requestedPages, coverage.sourcePageCount])
}

/** Continue only an acknowledged pending job. The scan session owns persistence keys:
 * confirmed replies clear its key; a lost reply keeps the exact command/key for an explicit retry.
 */
export function createEvidenceExtractionPolling(options: EvidenceExtractionPollingOptions) {
  const now = options.now ?? Date.now
  let timer: ReturnType<typeof setTimeout> | null = null
  let active: {
    fileId: string
    input: Readonly<Command>
    coverage: string
    startedAt: number
    settledAt: number
    automaticRequests: number
    requesting: boolean
  } | null = null

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  function publish(phase: EvidenceExtractionPollingState['phase'], manualReady = false) {
    options.onStateChange(Object.freeze({ phase, fileId: active?.fileId ?? null, automaticRequests: active?.automaticRequests ?? 0, manualReady }))
  }
  function cancel() {
    clearTimer(); active = null; publish('idle')
  }
  function current(captured: NonNullable<typeof active>) {
    return active === captured && options.isScopeCurrent()
  }
  function manualWait(captured: NonNullable<typeof active>, phase: 'limited' | 'uncertain') {
    if (!current(captured)) { if (active === captured) cancel(); return }
    const remaining = Math.max(0, captured.settledAt + delayMs - now())
    publish(phase, remaining === 0)
    if (remaining > 0) timer = setTimeout(() => {
      timer = null
      if (current(captured)) publish(phase, true)
      else if (active === captured) cancel()
    }, remaining)
  }
  function schedule(captured: NonNullable<typeof active>) {
    if (!current(captured)) { if (active === captured) cancel(); return }
    if (captured.automaticRequests >= automaticLimit || now() + delayMs > captured.startedAt + automaticWindowMs) {
      manualWait(captured, 'limited'); return
    }
    publish('waiting')
    timer = setTimeout(() => {
      timer = null
      if (!current(captured)) { if (active === captured) cancel(); return }
      if (now() > captured.startedAt + automaticWindowMs) { manualWait(captured, 'limited'); return }
      void request(captured, true)
    }, delayMs)
  }
  async function request(captured: NonNullable<typeof active>, automatic: boolean): Promise<boolean> {
    if (!current(captured) || captured.requesting || now() - captured.settledAt < delayMs) return false
    clearTimer(); captured.requesting = true
    if (automatic) captured.automaticRequests++
    publish('requesting')
    try {
      const response = await options.scan(captured.fileId, captured.input)
      if (!current(captured)) { if (active === captured) cancel(); return true }
      captured.settledAt = now(); captured.requesting = false
      if (response.fileId !== captured.fileId || response.requestId !== captured.input.requestId
        || (!response.result.azurePdfCoverage && ['ready', 'needs_review'].includes(response.result.status))
        || (response.result.azurePdfCoverage && coverageIdentity(response.result.azurePdfCoverage) !== captured.coverage)) throw new Error('EXTRACTION_SCOPE_CHANGED')
      const pending = isPendingAzurePdfExtraction(response.result, captured.input)
      if (!pending) cancel()
      options.onResult(response)
      if (pending) {
        if (automatic) schedule(captured)
        else manualWait(captured, 'limited')
      }
    } catch (error) {
      if (!current(captured)) { if (active === captured) cancel(); return true }
      captured.settledAt = now(); captured.requesting = false
      manualWait(captured, 'uncertain')
      options.onError(error)
    }
    return true
  }
  return {
    start(fileId: string, input: Command, response: CostExtractionView): boolean {
      if (active || !options.isScopeCurrent()) return false
      const parsed = costExtractionCommandSchema.safeParse(input)
      if (!parsed.success || response.fileId !== fileId || response.requestId !== parsed.data.requestId || !isPendingAzurePdfExtraction(response.result, parsed.data)) return false
      active = { fileId, input: Object.freeze(parsed.data), coverage: coverageIdentity(response.result.azurePdfCoverage!), startedAt: now(), settledAt: now(), automaticRequests: 0, requesting: false }
      schedule(active)
      return true
    },
    async continue(): Promise<boolean> {
      return active ? request(active, false) : false
    },
    cancel,
  }
}
