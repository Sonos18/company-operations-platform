import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export const costWorkflowRaceScenarios = ['approval-reassignment','approval-completion','approval-cap','payment-remainder','refund-correction','settlement-completion','receipt-replay','offboarding-replay']
export function costWorkflowConcurrencyPreflight({projectRef,authorization,namespace,retainAuditHistory}) {
 if (projectRef !== 'gtgljlnhwvhqdnwrfdfj') throw new Error('WORKFLOW_CONCURRENCY_WRONG_TARGET')
 if (authorization !== 'approved-synthetic-fixtures') throw new Error('WORKFLOW_CONCURRENCY_AUTHORIZATION_REQUIRED')
 if (namespace !== 'c1f5' || retainAuditHistory !== true) throw new Error('WORKFLOW_CONCURRENCY_RETENTION_REQUIRED')
 return {scenarios:[...costWorkflowRaceScenarios],namespace,cleanup:'supported deactivation/revocation; immutable audit and role history retained'}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) throw new Error('WORKFLOW_CONCURRENCY_NOT_READY: reviewed fixture manifest and commands required; no database contacted')
