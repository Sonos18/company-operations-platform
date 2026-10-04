import { expect, it } from 'vitest'
import { costWorkflowConcurrencyPreflight } from '../../../scripts/run-c1-cost-workflow-concurrency.mjs'
const input = {projectRef:'gtgljlnhwvhqdnwrfdfj',authorization:'approved-synthetic-fixtures',namespace:'c1f5',retainAuditHistory:true}
it('requires the canonical Cloud DEV target',()=>{expect(()=>costWorkflowConcurrencyPreflight({...input,projectRef:'other'})).toThrow('WORKFLOW_CONCURRENCY_WRONG_TARGET')})
it('requires explicit persistent-fixture authority',()=>{expect(()=>costWorkflowConcurrencyPreflight({...input,authorization:''})).toThrow('WORKFLOW_CONCURRENCY_AUTHORIZATION_REQUIRED')})
it('requires reserved fixture identity and honest history retention',()=>{expect(()=>costWorkflowConcurrencyPreflight({...input,retainAuditHistory:false})).toThrow('WORKFLOW_CONCURRENCY_RETENTION_REQUIRED');expect(()=>costWorkflowConcurrencyPreflight({...input,namespace:'VQH'})).toThrow('WORKFLOW_CONCURRENCY_RETENTION_REQUIRED')})
it('reports the required races without contacting any database',()=>{const result=costWorkflowConcurrencyPreflight(input);expect(result.scenarios).toContain('approval-cap');expect(result.scenarios).toContain('refund-correction');expect(result.cleanup).toContain('retained')})
