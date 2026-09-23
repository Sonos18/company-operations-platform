import { describe, expect, it, vi } from 'vitest'
import { createHttpCostEvidenceRepository } from '../../../app/repositories/http/http-cost-evidence-repository'
import { createHttpProjectCostRepository } from '../../../app/repositories/http/http-project-cost-repository'
import { createHttpProjectFinanceRepository } from '../../../app/repositories/http/http-project-finance-repository'

const ids = {
  tenant: 'c1010000-0000-4000-8000-000000000010',
  company: 'c1010000-0000-4000-8000-000000000020',
  project: 'c1010000-0000-4000-8000-000000000101',
  cost: 'c1010000-0000-4000-8000-000000000201',
  category: 'c1010000-0000-4000-8000-000000000301',
  evidence: 'c1010000-0000-4000-8000-000000000701',
  link: 'c1010000-0000-4000-8000-000000000801',
  subcontract: 'c1010000-0000-4000-8000-000000000901',
  payment: 'c1010000-0000-4000-8000-000000000902',
  callerKey: 'c1010000-0000-4000-8000-000000000991',
  generatedKey: 'c1010000-0000-4000-8000-000000000992',
}

function responseFor(url: string) {
  if (url.endsWith('/evidence/upload-intents')) return { evidenceFileId: ids.evidence, version: 0, bucketId: 'c1-accounting-evidence', objectPath: `${ids.tenant}/${ids.company}/${ids.project}/${ids.evidence}`, expiresAt: '2026-09-23T12:00:00.000Z', replayed: false }
  if (url.endsWith('/finalize')) return { id: ids.evidence, status: 'finalized', originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 3, sha256: '0'.repeat(64), version: 1, finalizedAt: '2026-09-23T12:00:00.000Z', replayed: false }
  if (url.endsWith('/evidence')) return { linkId: ids.link, costId: ids.cost, evidenceFileId: ids.evidence, evidenceKind: 'invoice', replayed: false }
  if (url.endsWith('/payments')) return { paymentId: ids.payment, version: 0, status: 'recorded', replayed: false }
  if (url.endsWith('/void')) return { paymentId: ids.payment, version: 1, status: 'voided', replayed: false }
  return { id: ids.cost, version: 1, publicationState: url.endsWith('/publish') || url.endsWith('/corrections') ? 'published' : 'draft', replayed: false }
}

describe('C1 receipt-backed HTTP command identity', () => {
  it('forwards the caller-owned key unchanged for the complete command family', async () => {
    const client = {
      request: vi.fn(async input => input.schema.parse(responseFor(input.url))),
    }
    const projectCosts = createHttpProjectCostRepository({ companyId: ids.company, client: client as never })
    const evidence = createHttpCostEvidenceRepository({ companyId: ids.company, client: client as never })
    const finance = createHttpProjectFinanceRepository({ companyId: ids.company, client: client as never })
    const command = { idempotencyKey: ids.callerKey }

    const commands = [
      () => projectCosts.create(ids.project, { description: 'Draft', costCategoryId: ids.category, workStatus: 'unknown' }, command),
      () => projectCosts.publish(ids.cost, { expectedVersion: 0 }, command),
      () => projectCosts.correct(ids.cost, { expectedVersion: 0, reason: 'Correct description', operationalChanges: { description: 'Corrected' } }, command),
      () => evidence.createUploadIntent(ids.project, { originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 3, sha256: '0'.repeat(64) }, command),
      () => evidence.finalize(ids.evidence, { expectedVersion: 0 }, command),
      () => evidence.link(ids.cost, { evidenceFileId: ids.evidence, evidenceKind: 'invoice' }, command),
      () => finance.recordSubcontractPayment(ids.project, ids.subcontract, { expectedSubcontractVersion: 0, description: 'Payment', paidAmount: '1.0000', currencyCode: 'VND' }, command),
      () => finance.voidSubcontractPayment(ids.project, ids.subcontract, ids.payment, { expectedVersion: 0, reason: 'Wrong payment' }, command),
    ]

    for (const invoke of commands) {
      await invoke()
      expect(client.request).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey: ids.callerKey }))
    }
  })
})
