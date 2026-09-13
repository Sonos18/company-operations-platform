import { describe, expect, it, vi } from 'vitest'
import { createSourceReviewService } from '../../../server/features/costs/source-review.service'
const context = { actorId: 'c1000000-0000-4000-8000-000000000901', tenantId: 'c1000000-0000-4000-8000-000000000010', companyId: 'c1000000-0000-4000-8000-000000000020', permissions: ['cost.source.read', 'cost.prepare'] as const, requestId: 'c1000000-0000-4000-8000-000000000099' }
describe('C1 source review', () => {
  it('keeps an issue scoped to its selection and never activates finance', async () => { const createIssue = vi.fn(async value => value); const service = createSourceReviewService({ createIssue, getIssue: vi.fn(), resolveIssue: vi.fn() }); await expect(service.create(context, 'c1000000-0000-4000-8000-000000000052', { issueKind: 'formula_error', description: 'Cached value is missing', impact: 'blocks_normalization' })).resolves.toMatchObject({ financialActivation: false }); expect(createIssue).toHaveBeenCalledWith(expect.objectContaining({ selectionId: 'c1000000-0000-4000-8000-000000000052' })) })
})
