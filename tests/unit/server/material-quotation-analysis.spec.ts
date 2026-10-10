import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { buildMaterialQuotationResult, createMaterialQuotationAnalysisRoute, requireQuotationScope } from '../../../server/features/costs/material-procurement/quotation-analysis'
import { extractMaterialQuotation } from '../../../server/features/costs/material-procurement/quotation-provider'
import { materialProposalViewSchema } from '../../../shared/schemas/costs/material-procurement'
import { ids, purchasingRoleScope } from '../material-procurement/fixtures'

vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(),
  getRouterParam: (event: H3Event, name: string) => event.context.params?.[name],
  readBody: async (event: H3Event) => event.context.analysisInput,
}))

const actorId = ids.user
const companyId = '10000000-0000-4000-8000-000000000002'
const context = { actorId, companyId, tenantId: '10000000-0000-4000-8000-000000000001', requestId: 'test', permissions: purchasingRoleScope }
const input = { evidenceFileId: ids.unsignedQuotation, approvedRevisionId: ids.proposalRevision, expectedProposalVersion: 1 }
const proposal = materialProposalViewSchema.parse({
  id: ids.proposal, projectId: ids.project, createdBy: ids.user, version: 1,
  reviewState: 'approved', returnReason: null, approvedRevisionId: ids.proposalRevision,
  currentRevisionId: ids.proposalRevision, neededOn: '2026-10-30', deliveryAddress: 'Site', notes: null,
  lines: [{ lineId: ids.proposalLine, materialId: ids.material, materialName: 'Steel', specification: 'D10',
    unit: 'kg', quantity: '20.0000', notes: null, engineerProposedInvoiceName: null, buyerProposedInvoiceName: null,
    effectiveInvoiceDisplayName: 'Steel', invoiceDisplayNameSource: 'canonical', buyerOverrideVersion: 0,
    buyerInvoiceNameEditable: true, allocatedQuantity: '8', signedQuantity: '0', remainingQuantity: '12' }],
  orderProgress: { orderCount: 1, signedOrderCount: 0 },
})
const source = {
  evidenceFileId: ids.unsignedQuotation, sha256: 'a'.repeat(64), actorId, companyId, projectId: ids.project,
  proposalId: ids.proposal, approvedRevisionId: ids.proposalRevision, proposalVersion: 1,
}
const row = {
  proposalLineId: ids.proposalLine, sourceRowKey: '1:1', sourcePage: 1, quotationMaterialName: 'Steel D10',
  quotationUnit: 'kg', rawQuantity: '20', quotationQuantity: '20', rawUnitPrice: '12.5', unitPrice: '12.5',
  taxBasis: 'exclusive' as const, nameMatches: true, specificationMatches: true, unitMatches: true, warnings: [],
}
const extraction = { supplier: { name: 'Supplier A', taxCode: null, contactName: null, phone: null }, currencyCode: 'VND', warnings: [], lines: [row] }

describe('quotation analysis guarded suggestions (source only; not run during alpha)', () => {
  it('compares exact Decimal quantity and caps suggestions at canonical remaining quantity', () => {
    const exact = buildMaterialQuotationResult(extraction, proposal, 'VND', source)
    expect(exact.matched).toBe(true)
    expect(exact.lines[0]).toMatchObject({ quantityMatchesProposal: true, suggestedAllocationQuantity: '12', unitPrice: '12.5' })
    const partial = buildMaterialQuotationResult({ ...extraction, lines: [{ ...row, rawQuantity: '10', quotationQuantity: '10' }] }, proposal, 'VND', source)
    expect(partial.matched).toBe(false)
    expect(partial.lines[0]).toMatchObject({ quotationQuantity: '10', quantityMatchesProposal: false, suggestedAllocationQuantity: '10' })
  })

  it('rejects unknown/missing/duplicate proposal identities and reused physical PDF rows', () => {
    for (const lines of [[], [row, row], [{ ...row, proposalLineId: ids.material }]]) {
      expect(() => buildMaterialQuotationResult({ ...extraction, lines }, proposal, 'VND', source)).toThrow()
    }
    const twoLines = { ...proposal, lines: [...proposal.lines, { ...proposal.lines[0]!, lineId: ids.material }] }
    expect(() => buildMaterialQuotationResult({ ...extraction, lines: [row, { ...row, proposalLineId: ids.material }] }, twoLines, 'VND', source)).toThrow()
  })

  it('keeps raw ambiguous values and prevents VAT/currency/semantic guesses from autofilling price or allocation', () => {
    const ambiguous = buildMaterialQuotationResult({ ...extraction, lines: [{ ...row, rawQuantity: '1.000', quotationQuantity: '1000', rawUnitPrice: '1.00,0', unitPrice: '1000' }] }, proposal, 'VND', source)
    expect(ambiguous.lines[0]).toMatchObject({ rawQuantity: '1.000', rawUnitPrice: '1.00,0', quotationQuantity: null, unitPrice: null, suggestedAllocationQuantity: null, matched: false })
    for (const changed of [{ ...extraction, currencyCode: 'USD' }, { ...extraction, lines: [{ ...row, taxBasis: 'unknown' }] }]) {
      expect(buildMaterialQuotationResult(changed, proposal, 'VND', source).lines[0]).toMatchObject({ extractedUnitPrice: '12.5', unitPrice: null })
    }
    expect(buildMaterialQuotationResult({ ...extraction, lines: [{ ...row, unitMatches: false }] }, proposal, 'VND', source).lines[0]).toMatchObject({ matched: false, suggestedAllocationQuantity: null })
  })

  it('accepts exact grouped integer VND money while keeping quantity separators ambiguous', () => {
    for (const rawUnitPrice of ['18.500', '18,500', '18.500 đ', '18.500 VND']) {
      const result = buildMaterialQuotationResult({ ...extraction, lines: [{ ...row, rawUnitPrice, unitPrice: '18500' }] }, proposal, 'VND', source)
      expect(result.lines[0]).toMatchObject({ rawUnitPrice, extractedUnitPrice: '18500', unitPrice: '18500' })
    }
    const mismatched = buildMaterialQuotationResult({ ...extraction, lines: [{ ...row, rawUnitPrice: '18.500', unitPrice: '18.5' }] }, proposal, 'VND', source)
    expect(mismatched.lines[0]?.unitPrice).toBeNull()
    const foreign = buildMaterialQuotationResult({ ...extraction, currencyCode: 'USD', lines: [{ ...row, rawUnitPrice: '18,500', unitPrice: '18500' }] }, proposal, 'VND', source)
    expect(foreign.lines[0]?.unitPrice).toBeNull()
  })

  it('denies unapproved/version/revision/project and role scopes', () => {
    requireQuotationScope(context, ids.project, ids.proposal, input, proposal)
    for (const changed of [{ ...proposal, version: 2 }, { ...proposal, currentRevisionId: ids.material }, { ...proposal, reviewState: 'submitted' as const }, { ...proposal, projectId: ids.material }]) {
      expect(() => requireQuotationScope(context, ids.project, ids.proposal, input, changed)).toThrow()
    }
    expect(() => requireQuotationScope({ ...context, permissions: ['material.read'] }, ids.project, ids.proposal, input, proposal)).toThrow()
  })

  it('makes one fixed direct Responses request with PDF and rejects refusal/incomplete output without retry', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(extraction) }] }],
    })))
    await expect(extractMaterialQuotation('test-key', Buffer.from('%PDF-1.7'), proposal, fetcher as typeof fetch)).resolves.toEqual(extraction)
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, request] = fetcher.mock.calls[0]! as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(request.redirect).toBe('error')
    const payload = JSON.parse(String(request.body))
    expect(payload).toMatchObject({ model: 'gpt-5.4-mini', store: false, max_output_tokens: 12000, text: { format: { strict: true } } })
    expect(payload.input[0].content[0].file_data).toContain('data:application/pdf;base64,')
    for (const envelope of [
      { status: 'incomplete', output: [] },
      { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] },
    ]) {
      const denied = vi.fn(async () => new Response(JSON.stringify(envelope)))
      await expect(extractMaterialQuotation('test-key', Buffer.from('%PDF'), proposal, denied as typeof fetch)).rejects.toMatchObject({ code: 'QUOTATION_ANALYSIS_FAILED' })
      expect(denied).toHaveBeenCalledOnce()
    }
    await expect(extractMaterialQuotation('', Buffer.from('%PDF'), proposal, fetcher as typeof fetch)).rejects.toMatchObject({ code: 'QUOTATION_ANALYSIS_NOT_CONFIGURED' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
})

describe('quotation route scope and in-flight canonical changes', () => {
  function harness() {
    const pdf = new Blob(['%PDF-1.7 quotation'], { type: 'application/pdf' })
    const hash = createHash('sha256').update('%PDF-1.7 quotation').digest('hex')
    let currentProposal = proposal
    let sourceVisible = true
    let calls = 0
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'c1_material_read_proposal' ? currentProposal : { currencyCode: 'VND' }, error: null,
    }))
    const from = vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query), eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          error: null,
          data: table === 'material_evidence_scopes' ? (sourceVisible ? { evidence_file_id: input.evidenceFileId } : null)
            : { id: input.evidenceFileId, tenant_id: context.tenantId, company_id: companyId, project_id: ids.project,
              status: 'finalized', bucket_id: 'c1-accounting-evidence',
              object_path: [context.tenantId, companyId, ids.project, input.evidenceFileId].join('/'),
              verified_mime_type: 'application/pdf', verified_size_bytes: pdf.size, verified_sha256: hash, version: 1 },
        })),
      }
      return query
    })
    const db = { rpc, from, storage: { from: vi.fn(() => ({ download: vi.fn(async () => ({ data: pdf, error: null })) })) } }
    const resolveContext = vi.fn(async () => { calls++; return { ...context, roles: [], permissions: [...context.permissions], db: db as never } })
    const extract = vi.fn(async () => extraction)
    const event = { context: { params: { companyId, projectId: ids.project, proposalId: ids.proposal }, analysisInput: input } } as unknown as H3Event
    const route = createMaterialQuotationAnalysisRoute({ resolveContext, apiKey: () => 'test-key', extract })
    return { route, event, extract, from, resolveContext, calls: () => calls,
      changeProposal: () => { currentProposal = { ...proposal, lines: [{ ...proposal.lines[0]!, buyerOverrideVersion: 1, effectiveInvoiceDisplayName: 'New buyer name' }] } },
      hideSource: () => { sourceVisible = false },
    }
  }

  it('uses fresh authenticated canonical reads and denies overlay changes without a header version change', async () => {
    const ok = harness()
    await expect(ok.route(ok.event)).resolves.toMatchObject({ matched: true, source: { sha256: expect.any(String) } })
    expect(ok.calls()).toBe(2)
    expect(ok.extract).toHaveBeenCalledOnce()
    const changed = harness()
    changed.extract.mockImplementation(async () => { changed.changeProposal(); return extraction })
    await expect(changed.route(changed.event)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(changed.calls()).toBe(2)
  })

  it('denies invisible or wrong proposal evidence scope before provider access', async () => {
    const denied = harness()
    denied.hideSource()
    await expect(denied.route(denied.event)).rejects.toMatchObject({ code: 'SOURCE_SELECTION_SCOPE_MISMATCH', details: { stage: 'scope_metadata' } })
    expect(denied.extract).not.toHaveBeenCalled()
  })
})
