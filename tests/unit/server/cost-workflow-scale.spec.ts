import { expect, it } from 'vitest'
import { summarizeWorkflowCash, evaluateInstallmentCapacity } from '../../../server/features/costs/workflow/cost-workflow-money'
const facts = {currencyCode:'VND',moneyScale:0,outgoing:[{id:'p',validAmount:'10.0000'}],refunds:[],installments:[{id:'i',authorized:'30',consumed:'10'}],unreconciledCount:0,coverage:'complete' as const}
it('honors configured zero-decimal currency without rejecting canonical zero suffixes', () => { expect(summarizeWorkflowCash(facts).grossPaid).toBe('10.0000') })
it('rejects a fractional fact beyond the project scale', () => { expect(()=>summarizeWorkflowCash({...facts,outgoing:[{id:'p',validAmount:'10.1000'}]})).toThrow('INVALID_WORKFLOW_MONEY') })
it('checks installment amounts against configured project scale', () => { expect(()=>evaluateInstallmentCapacity('100',['30'],'0.1',0)).toThrow('INVALID_WORKFLOW_MONEY') })
