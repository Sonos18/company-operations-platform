import { describe, expect, it } from 'vitest'
import { costRequestInputSchema, cashAdjustmentInputSchema, contractBasisInputSchema } from '../../../shared/schemas/costs/cost-workflow'

const id = 'c1f50000-0000-4000-8000-000000000001'
const request = () => ({ partyId: id, partyKind: 'organization', categoryId: id, amount: '30.0000', currencyCode: 'VND', basis: { kind: 'materials', lines: [{ description: 'Pipe', quantity: '2', unit: 'piece', unitPrice: '15' }], deliverySite: 'Synthetic site' }, evidenceFileIds: [id] })
describe('document-backed request input', () => {
  it('accepts reviewed material basis and finalized-file references', () => { expect(costRequestInputSchema.parse(request()).amount).toBe('30.0000') })
  it('requires an identified party', () => { const { partyId: _missing, ...value } = request(); expect(costRequestInputSchema.safeParse(value).success).toBe(false) })
  it('requires at least one original document', () => { expect(costRequestInputSchema.safeParse({ ...request(), evidenceFileIds: [] }).success).toBe(false) })
  it.each(['-1','1.00001','1e2','NaN',' 1','+1'])('rejects invalid exact money %s', amount => { expect(costRequestInputSchema.safeParse({ ...request(), amount }).success).toBe(false) })
  it.each(['actorId','tenantId','permissions','approvedBy','status'])('rejects client authority field %s', key => { expect(costRequestInputSchema.safeParse({ ...request(), [key]: id }).success).toBe(false) })
  it('requires explicit ownership of a crew', () => { const value = { ...request(), partyKind: 'crew', basis: { kind: 'direct_labor', weekStart: '2026-10-05', workers: [{ workerReference: 'Synthetic worker', days: '5', dailyRate: '2', allowance: '0' }] } }; expect(costRequestInputSchema.safeParse(value).success).toBe(false); expect(costRequestInputSchema.safeParse({ ...value, crewOwnership: 'vqh_internal' }).success).toBe(true) })
  it('does not accept internal ownership for an organization', () => { expect(costRequestInputSchema.safeParse({ ...request(), crewOwnership: 'vqh_internal' }).success).toBe(false) })
  it('rejects invalid calendar dates rather than normalizing them', () => { const value = { ...request(), partyKind: 'crew', crewOwnership: 'vqh_internal', basis: { kind: 'direct_labor', weekStart: '2026-02-30', workers: [{ workerReference: 'Synthetic', days: '1', dailyRate: '2', allowance: '0' }] } }; expect(costRequestInputSchema.safeParse(value).success).toBe(false) })
  it('rejects a supplier selected for a direct VQH crew payment', () => { expect(costRequestInputSchema.safeParse({ ...request(), basis: { kind: 'direct_labor', weekStart: '2026-10-05', workers: [{ workerReference: 'Synthetic', days: '1', dailyRate: '2', allowance: '0' }] } }).success).toBe(false) })
  it('requires supporting evidence for the initial contract reference', () => { expect(contractBasisInputSchema.safeParse({partyId:id, reference:'Synthetic quotation', referenceAmount:'100', currencyCode:'VND', evidenceFileIds:[]}).success).toBe(false) })
  it('separates refund receipts from correction of outgoing cash', () => { expect(cashAdjustmentInputSchema.safeParse({kind:'refund',requestedAmount:'2',reason:'Synthetic return',evidenceFileIds:[id],expectedVersion:1}).success).toBe(true); expect(cashAdjustmentInputSchema.safeParse({kind:'correction',correctedOutgoing:'0',reason:'Duplicate record',evidenceFileIds:[id],expectedVersion:1}).success).toBe(true); expect(cashAdjustmentInputSchema.safeParse({kind:'correction',requestedAmount:'2',reason:'Wrong event',evidenceFileIds:[id],expectedVersion:1}).success).toBe(false) })
})
