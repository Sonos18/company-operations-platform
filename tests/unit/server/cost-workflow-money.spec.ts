import { describe, expect, it } from 'vitest'
import { evaluateInstallmentCapacity, summarizeWorkflowCash } from '../../../server/features/costs/workflow/cost-workflow-money'
const facts = () => ({ currencyCode:'VND', moneyScale:4, outgoing:[{id:'payment-1',validAmount:'10'}], refunds:[{id:'refund-1',paymentId:'payment-1',confirmedAmount:'2'}], installments:[{id:'installment-1',authorized:'30',consumed:'10'}], unreconciledCount:0, coverage:'complete' as const })
describe('installment authorization and actual cash are distinct', () => {
 it('counts paid plus remaining against the contract ceiling', () => { expect(evaluateInstallmentCapacity('100',['30'],'70')).toEqual({allowed:true,available:'70.0000'}); expect(evaluateInstallmentCapacity('100',['30'],'71').allowed).toBe(false) })
 it('keeps exact high precision rather than JS number arithmetic', () => { expect(evaluateInstallmentCapacity('9007199254740993.0001',['9007199254740993'],'0.0001')).toEqual({allowed:true,available:'0.0001'}) })
 it('reports 10 paid, 2 received refund, 8 net and 20 authority remaining', () => { expect(summarizeWorkflowCash(facts())).toEqual({grossPaid:'10.0000',confirmedRefunds:'2.0000',netCash:'8.0000',approvedUnspent:'20.0000',unreconciledCount:0,coverage:'complete'}) })
 it('does not restore consumption after correction of the outgoing fact', () => { const value=facts(); value.outgoing[0]!.validAmount='8'; value.refunds=[]; expect(summarizeWorkflowCash(value)).toMatchObject({grossPaid:'8.0000',confirmedRefunds:'0.0000',approvedUnspent:'20.0000'}) })
 it('counts a repeated identical event only once', () => { const value=facts(); value.outgoing.push({...value.outgoing[0]!}); expect(summarizeWorkflowCash(value).grossPaid).toBe('10.0000') })
 it('rejects conflicting amounts for the same event identity', () => { const value=facts(); value.outgoing.push({id:'payment-1',validAmount:'11'}); expect(()=>summarizeWorkflowCash(value)).toThrow('CONFLICTING_CASH_FACT') })
 it('rejects a refund not linked to actual outgoing', () => { const value=facts(); value.refunds[0]!.paymentId='unknown'; expect(()=>summarizeWorkflowCash(value)).toThrow('REFUND_EXCEEDS_OUTGOING') })
 it('rejects correction reducing valid outgoing below already received refunds', () => { const value=facts(); value.outgoing[0]!.validAmount='1'; expect(()=>summarizeWorkflowCash(value)).toThrow('REFUND_EXCEEDS_OUTGOING') })
 it('rejects consumed authority beyond an approved installment', () => { const value=facts(); value.installments[0]!.consumed='31'; expect(()=>summarizeWorkflowCash(value)).toThrow('AUTHORIZATION_EXCEEDED') })
 it('rejects negative or over-scale money instead of rounding it', () => { expect(()=>evaluateInstallmentCapacity('100',['-1'],'2')).toThrow('INVALID_WORKFLOW_MONEY'); expect(()=>evaluateInstallmentCapacity('100',['1.00001'],'2')).toThrow('INVALID_WORKFLOW_MONEY') })
 it('preserves incomplete historic coverage instead of pretending it is complete', () => { expect(summarizeWorkflowCash({...facts(),coverage:'partial',unreconciledCount:2})).toMatchObject({coverage:'partial',unreconciledCount:2}) })
})
