import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken } from './run-supabase-dev.mjs'

const marker = '-- C1 MATERIAL PAYMENT CONCURRENCY FIXTURE'
const phases = new Set(['setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixtureNamespace = 'c1400000-0000-4000-8000-'
const fixtureUsers = new Set(['901', '902', '903', '904', '905', '906'].map(suffix => `${fixtureNamespace}000000000${suffix}`))
const readinessKey = 'c1_material_payment_actor_a_ready:c1400000-0000-4000-8000-000000000010:c1400000-0000-4000-8000-000000000020'
const loserCodes = ['INSTALLMENT_CAPACITY_EXCEEDED', 'AMENDMENT_BELOW_COMMITTED', 'VERSION_CONFLICT']
const loserCodePattern = new RegExp(`(?:^|[^A-Z0-9_])P0001:\\s*(${loserCodes.join('|')})(?:$|[^A-Z0-9_])`, 'u')

// Actor A always takes the contract row lock first (it signals readiness only after its
// command returned), so each scenario has exactly one deterministic winner and one loser code.
export const C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS = Object.freeze([
  Object.freeze({ name: 'create-create', actorA: 'c1_material_create_payment_request', actorB: 'c1_material_create_payment_request', loserCode: 'INSTALLMENT_CAPACITY_EXCEEDED' }),
  Object.freeze({ name: 'create-amend', actorA: 'c1_material_create_payment_request', actorB: 'c1_material_amend_contract', loserCode: 'AMENDMENT_BELOW_COMMITTED' }),
  Object.freeze({ name: 'amend-create', actorA: 'c1_material_amend_contract', actorB: 'c1_material_create_payment_request', loserCode: 'INSTALLMENT_CAPACITY_EXCEEDED' }),
  Object.freeze({ name: 'pay-pay', actorA: 'c1_material_record_payment', actorB: 'c1_material_record_payment', loserCode: 'VERSION_CONFLICT' }),
])

// Contract X (installment a01, 100) carries the create races; contract Y (installment a02, 60)
// carries one approved 60 request for the pay race and must stay untouched otherwise.
const untouchedContractX = Object.freeze({ xRequestCount: 0, xPendingAmountText: '0.0000', xAccountantARequestCount: 0, xContractVersionNo: 1, xVersionCount: 1, xInstallmentAmountText: '100.0000' })
const untouchedContractY = Object.freeze({ yPaymentCount: 0, yTreasurerAPaymentCount: 0, yRequestState: 'approved', yRequestVersion: 2 })
const cleanOutcome = Object.freeze({ actorBReceiptCount: 0, installmentInvariantHolds: true })
export const C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE = Object.freeze({
  'create-create': Object.freeze({ ...untouchedContractX, xRequestCount: 1, xPendingAmountText: '60.0000', xAccountantARequestCount: 1, ...untouchedContractY, ...cleanOutcome }),
  'create-amend': Object.freeze({ ...untouchedContractX, xRequestCount: 1, xPendingAmountText: '60.0000', xAccountantARequestCount: 1, ...untouchedContractY, ...cleanOutcome }),
  'amend-create': Object.freeze({ ...untouchedContractX, xContractVersionNo: 2, xVersionCount: 2, xInstallmentAmountText: '50.0000', ...untouchedContractY, ...cleanOutcome }),
  'pay-pay': Object.freeze({ ...untouchedContractX, yPaymentCount: 1, yTreasurerAPaymentCount: 1, yRequestState: 'paid', yRequestVersion: 3, ...cleanOutcome }),
})
const assertColumns = Object.freeze([
  ['x_request_count', 'xRequestCount'],
  ['x_pending_amount_text', 'xPendingAmountText'],
  ['x_accountant_a_request_count', 'xAccountantARequestCount'],
  ['x_contract_version_no', 'xContractVersionNo'],
  ['x_version_count', 'xVersionCount'],
  ['x_installment_amount_text', 'xInstallmentAmountText'],
  ['y_payment_count', 'yPaymentCount'],
  ['y_treasurer_a_payment_count', 'yTreasurerAPaymentCount'],
  ['y_request_state', 'yRequestState'],
  ['y_request_version', 'yRequestVersion'],
  ['actor_b_receipt_count', 'actorBReceiptCount'],
  ['installment_invariant_holds', 'installmentInvariantHolds'],
])
const scenariosByName = new Map(C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS.map(scenario => [scenario.name, scenario]))
const exactCleanupSql = `-- C1 MATERIAL PAYMENT CONCURRENCY FIXTURE
begin;
alter table public.roles disable trigger roles_audit_role_catalog_change;
alter table public.role_permissions disable trigger role_permissions_audit_role_catalog_change;
alter table public.company_role_assignments disable trigger company_role_assignments_audit_employee_rbac_change;
alter table public.company_role_assignments disable trigger company_role_assignments_prevent_last_admin_removal;
alter table public.audit_events disable trigger audit_events_prevent_mutation;
alter table public.cost_evidence_files disable trigger c1_cost_evidence_files_immutable;
alter table public.material_proposal_revisions disable trigger material_revision_history_immutable;
alter table public.material_proposal_revision_lines disable trigger material_revision_lines_history_immutable;
alter table public.material_order_contracts disable trigger material_order_contracts_history_immutable;
alter table public.material_evidence_scopes disable trigger material_evidence_scopes_history_immutable;
alter table public.material_contract_versions disable trigger material_contract_versions_history_immutable;
alter table public.material_contract_installments disable trigger material_contract_installments_history_immutable;
alter table public.material_payment_request_revisions disable trigger material_payment_request_revisions_history_immutable;
alter table public.material_payment_decisions disable trigger material_payment_decisions_history_immutable;
alter table public.material_payments disable trigger material_payments_history_immutable;
delete from public.app_notifications where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020';
delete from public.material_payments where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_payment_decisions where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_payment_request_revisions where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_payment_requests where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_evidence_scopes where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_order_contracts where order_id in ('c1400000-0000-4000-8000-000000000351','c1400000-0000-4000-8000-000000000352') and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_contract_installments where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_contract_versions where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_contracts where order_id in ('c1400000-0000-4000-8000-000000000351','c1400000-0000-4000-8000-000000000352') and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_order_allocations where id in ('c1400000-0000-4000-8000-000000000361','c1400000-0000-4000-8000-000000000362') and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_orders where id in ('c1400000-0000-4000-8000-000000000351','c1400000-0000-4000-8000-000000000352') and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.cost_evidence_files where id in ('c1400000-0000-4000-8000-000000000501','c1400000-0000-4000-8000-000000000502','c1400000-0000-4000-8000-000000000511','c1400000-0000-4000-8000-000000000512','c1400000-0000-4000-8000-000000000513','c1400000-0000-4000-8000-000000000514','c1400000-0000-4000-8000-000000000521','c1400000-0000-4000-8000-000000000531','c1400000-0000-4000-8000-000000000532') and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_proposal_revision_lines where revision_id = 'c1400000-0000-4000-8000-000000000401' and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_proposal_revisions where id = 'c1400000-0000-4000-8000-000000000401' and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_proposal_lines where id in ('c1400000-0000-4000-8000-000000000311','c1400000-0000-4000-8000-000000000312') and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_proposals where id = 'c1400000-0000-4000-8000-000000000301' and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and project_id = 'c1400000-0000-4000-8000-000000000101';
delete from public.material_items where id = 'c1400000-0000-4000-8000-000000000251' and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020';
delete from public.business_parties where id = 'c1400000-0000-4000-8000-000000000201' and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020';
delete from public.cost_command_receipts where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and actor_id in ('c1400000-0000-4000-8000-000000000901','c1400000-0000-4000-8000-000000000902','c1400000-0000-4000-8000-000000000903','c1400000-0000-4000-8000-000000000904','c1400000-0000-4000-8000-000000000905','c1400000-0000-4000-8000-000000000906') and command_name in ('material.record_contract','material.amend_contract','material.create_payment_request','material.decide_payment_request','material.record_payment');
delete from public.projects where id = 'c1400000-0000-4000-8000-000000000101' and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020';
delete from public.company_cost_settings where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020';
delete from public.company_role_assignments where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and user_id in ('c1400000-0000-4000-8000-000000000901','c1400000-0000-4000-8000-000000000902','c1400000-0000-4000-8000-000000000903','c1400000-0000-4000-8000-000000000904','c1400000-0000-4000-8000-000000000905','c1400000-0000-4000-8000-000000000906') and role_id in ('c1400000-0000-4000-8000-000000000911','c1400000-0000-4000-8000-000000000913','c1400000-0000-4000-8000-000000000914','c1400000-0000-4000-8000-000000000915','c1400000-0000-4000-8000-000000000916');
delete from public.role_permissions where role_id in ('c1400000-0000-4000-8000-000000000911','c1400000-0000-4000-8000-000000000913','c1400000-0000-4000-8000-000000000914','c1400000-0000-4000-8000-000000000915','c1400000-0000-4000-8000-000000000916');
delete from public.roles where id in ('c1400000-0000-4000-8000-000000000911','c1400000-0000-4000-8000-000000000913','c1400000-0000-4000-8000-000000000914','c1400000-0000-4000-8000-000000000915','c1400000-0000-4000-8000-000000000916') and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020';
delete from public.company_memberships where user_id in ('c1400000-0000-4000-8000-000000000901','c1400000-0000-4000-8000-000000000902','c1400000-0000-4000-8000-000000000903','c1400000-0000-4000-8000-000000000904','c1400000-0000-4000-8000-000000000905','c1400000-0000-4000-8000-000000000906') and tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020';
delete from public.tenant_memberships where user_id in ('c1400000-0000-4000-8000-000000000901','c1400000-0000-4000-8000-000000000902','c1400000-0000-4000-8000-000000000903','c1400000-0000-4000-8000-000000000904','c1400000-0000-4000-8000-000000000905','c1400000-0000-4000-8000-000000000906') and tenant_id = 'c1400000-0000-4000-8000-000000000010';
delete from public.audit_events where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020';
delete from public.companies where id = 'c1400000-0000-4000-8000-000000000020' and tenant_id = 'c1400000-0000-4000-8000-000000000010';
delete from public.tenants where id = 'c1400000-0000-4000-8000-000000000010';
delete from auth.users where id in ('c1400000-0000-4000-8000-000000000901','c1400000-0000-4000-8000-000000000902','c1400000-0000-4000-8000-000000000903','c1400000-0000-4000-8000-000000000904','c1400000-0000-4000-8000-000000000905','c1400000-0000-4000-8000-000000000906');
alter table public.material_payments enable trigger material_payments_history_immutable;
alter table public.material_payment_decisions enable trigger material_payment_decisions_history_immutable;
alter table public.material_payment_request_revisions enable trigger material_payment_request_revisions_history_immutable;
alter table public.material_contract_installments enable trigger material_contract_installments_history_immutable;
alter table public.material_contract_versions enable trigger material_contract_versions_history_immutable;
alter table public.material_evidence_scopes enable trigger material_evidence_scopes_history_immutable;
alter table public.material_order_contracts enable trigger material_order_contracts_history_immutable;
alter table public.material_proposal_revision_lines enable trigger material_revision_lines_history_immutable;
alter table public.material_proposal_revisions enable trigger material_revision_history_immutable;
alter table public.cost_evidence_files enable trigger c1_cost_evidence_files_immutable;
alter table public.audit_events enable trigger audit_events_prevent_mutation;
alter table public.company_role_assignments enable trigger company_role_assignments_prevent_last_admin_removal;
alter table public.company_role_assignments enable trigger company_role_assignments_audit_employee_rbac_change;
alter table public.role_permissions enable trigger role_permissions_audit_role_catalog_change;
alter table public.roles enable trigger roles_audit_role_catalog_change;
commit;`

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const readinessLock = fn => new RegExp(`pg_catalog\\.${fn}\\s*\\(\\s*pg_catalog\\.hashtextextended\\s*\\(\\s*'${escapeRegExp(readinessKey)}'\\s*,\\s*0\\s*\\)\\s*\\)`, 'u')

// Dollar-quoted DO bodies contain PL/pgSQL `end;`, which is not transaction control.
function hasSingleTransaction(sql) {
  const topLevelStatements = sql.replace(/\$\$[\s\S]*?\$\$/gu, '$$$$').replace(/--[^\n]*/gu, '').split(';').map(statement => statement.trim().toLowerCase())
  const transactionControl = topLevelStatements.filter(statement => /^(?:begin|commit|end|rollback|abort|savepoint|release|start|prepare)\b/u.test(statement))
  return transactionControl.join(' ') === 'begin commit'
}

function validateActorSql(phase, sql, scenario) {
  const command = phase === 'actor_a' ? scenario.actorA : scenario.actorB
  if (!hasSingleTransaction(sql)) throw new Error('C1 material payment concurrency actors require one transaction-held begin/commit block')
  const commandCalls = sql.match(/\bpublic\.c1_material_[a-z_]+\s*\(/gu) ?? []
  if (commandCalls.length !== 1 || !new RegExp(`\\bpublic\\.${command}\\s*\\(`, 'u').test(sql)) throw new Error(`C1 material payment concurrency ${scenario.name} ${phase} must call public.${command} exactly once`)
  if (!/^set local role authenticated;$/mu.test(sql)) throw new Error('C1 material payment concurrency actors must run their command as the authenticated role')
  const subjects = [...sql.matchAll(/set_config\('request\.jwt\.claims','\{"sub":"([0-9a-f-]{36})","role":"authenticated"\}',true\)/gu)].map(match => match[1])
  if (subjects.length !== 1) throw new Error('C1 material payment concurrency actors must set exactly one authenticated JWT subject')
  if (phase === 'actor_a') {
    const held = new RegExp(`\\bbegin\\s*;[\\s\\S]*\\bpublic\\.${command}\\s*\\([\\s\\S]*${readinessLock('pg_advisory_xact_lock').source}[\\s\\S]*pg_catalog\\.pg_sleep\\s*\\(\\s*3\\s*\\)[\\s\\S]*\\bcommit\\s*;`, 'u')
    if (!held.test(sql)) throw new Error('C1 material payment concurrency actor A requires a transaction-held contract lock behind the readiness signal')
  } else {
    const barrier = new RegExp(`\\bbegin\\s*;[\\s\\S]*${readinessLock('pg_try_advisory_lock').source}[\\s\\S]*actor A readiness barrier timed out[\\s\\S]*\\bpublic\\.${command}\\s*\\([\\s\\S]*\\bcommit\\s*;`, 'u')
    if (!barrier.test(sql)) throw new Error('C1 material payment concurrency actor B requires an actor A readiness barrier')
  }
}

export function validateC1MaterialPaymentConcurrencySql(phase, sql, scenarioName = 'create-create') {
  const scenario = scenariosByName.get(scenarioName)
  if (!scenario) throw new Error('Invalid C1 material payment concurrency scenario')
  if (!phases.has(phase) || typeof sql !== 'string' || !sql.startsWith(marker)) throw new Error('Invalid C1 material payment concurrency fixture')
  const ids = sql.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
  if (ids.some(id => !id.toLowerCase().startsWith(fixtureNamespace))) throw new Error('C1 material payment concurrency fixture must use reserved synthetic identifiers')
  const subjects = [...sql.matchAll(/"sub":"([0-9a-f-]{36})"/gu)].map(match => match[1])
  if (subjects.some(subject => !fixtureUsers.has(subject))) throw new Error('C1 material payment concurrency JWT subjects must be a fixture user')
  if (/\bupdate\s+(?:only\s+)?(?:[a-z_][\w]*\.)?[a-z_][\w]*/iu.test(sql)) throw new Error('C1 material payment concurrency fixture contains a broad update or forbidden operation')
  if (/\bdelete\b/iu.test(sql) && (phase !== 'cleanup' || sql !== exactCleanupSql)) throw new Error('C1 material payment concurrency fixture contains a broad delete or forbidden operation; only exact approved cleanup DELETE statements are allowed')
  if (phase === 'cleanup' && sql !== exactCleanupSql) throw new Error('C1 material payment concurrency cleanup must contain only exact approved DELETE statements')
  if (/\b(?:drop|truncate|reset|repair)\b/iu.test(sql)) throw new Error('C1 material payment concurrency fixture contains a forbidden operation')
  if (phase !== 'cleanup' && /\b(?:alter|create|grant|revoke|copy|vacuum)\b/iu.test(sql)) throw new Error('C1 material payment concurrency fixture contains a forbidden operation outside cleanup')
  if ((phase === 'assert' || phase.startsWith('actor_')) && /\binsert\s+into\b/iu.test(sql)) throw new Error('C1 material payment concurrency actors and assertions must not write rows directly')
  if (phase === 'setup' && (!sql.startsWith(`${marker}\nbegin;\n`) || !sql.endsWith('\ncommit;') || !hasSingleTransaction(sql))) throw new Error('C1 material payment concurrency setup must commit atomically')
  if (phase.startsWith('actor_')) validateActorSql(phase, sql, scenario)
}

function defaultReadPhase(phase, scenarioName) {
  const fixtureRoot = resolve(root, 'supabase/tests/database/c1_material_payment_concurrency')
  const fixturePath = phase.startsWith('actor_') ? resolve(fixtureRoot, scenarioName, `${phase}.sql`) : resolve(fixtureRoot, `${phase}.sql`)
  if (!existsSync(fixturePath)) throw new Error(`Missing C1 material payment concurrency fixture for ${scenarioName} ${phase}`)
  const sql = readFileSync(fixturePath, 'utf8').replace(/\r\n?/g, '\n').trim()
  validateC1MaterialPaymentConcurrencySql(phase, sql, scenarioName)
  return sql
}

function exactLoserCode(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.message !== 'string') return null
  return loserCodePattern.exec(value.message)?.[1] ?? null
}

function managementFailure(phase, status, body) {
  const diagnostic = typeof body?.message === 'string' ? /ERROR:\s*([0-9A-Z]{5}):\s*([^\r\n]{1,240})/u.exec(body.message) : null
  const contexts = typeof body?.message === 'string' ? body.message.match(/(?:PL\/pgSQL|SQL) function [^\r\n]{1,160}/gu)?.slice(0, 4) : null
  return new Error(`C1 material payment concurrency ${phase} failed with status ${status}${diagnostic ? ` (${diagnostic[1]}: ${diagnostic[2]})` : ''}${contexts?.length ? ` at ${contexts.join(' <- ')}` : ''}`)
}

function assertRow(row) {
  return Object.fromEntries(assertColumns.map(([column, key]) => [key, row?.[column]]))
}

/**
 * @param {string} phase
 * @param {string} sql
 * @param {{ cwd?: string, fetchImpl?: typeof globalThis.fetch, assertTarget?: () => void }} [options]
 */
export async function runC1MaterialPaymentManagementQuery(phase, sql, {
  cwd = process.cwd(),
  fetchImpl = globalThis.fetch,
  assertTarget = () => assertCloudDevTarget({ cwd }),
} = {}) {
  assertTarget()
  let response
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${CANONICAL_DEV_PROJECT_REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${readDedicatedSupabaseDevAccessToken(cwd)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: false }), signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new Error(`C1 material payment concurrency ${phase} transport failed`)
  }
  let body
  try {
    body = JSON.parse(await response.text())
  } catch {
    throw managementFailure(phase, response.status, body)
  }
  if (!response.ok) {
    const errorCode = phase.startsWith('actor_') ? exactLoserCode(body) : null
    if (errorCode) return { errorCode }
    throw managementFailure(phase, response.status, body)
  }
  const row = Array.isArray(body) ? body[0] : body
  return phase.startsWith('actor_') ? { resourceId: row?.resource_id } : phase === 'assert' ? assertRow(row) : {}
}

function checkActors(scenario, a, b) {
  if (typeof a?.resourceId !== 'string' || a.resourceId === '' || a.errorCode !== undefined) throw new Error(`C1 material payment concurrency ${scenario.name} actor A must commit its command`)
  if (b?.errorCode !== scenario.loserCode || b?.resourceId !== undefined) throw new Error(`C1 material payment concurrency ${scenario.name} actor B must fail with ${scenario.loserCode}`)
}

function checkFinalState(scenario, assertion) {
  const expected = C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE[scenario.name]
  const mismatches = Object.entries(expected).filter(([key, value]) => assertion?.[key] !== value).map(([key]) => key)
  if (mismatches.length) throw new Error(`C1 material payment concurrency ${scenario.name} final state mismatch: ${mismatches.join(', ')}`)
}

/**
 * @typedef {typeof C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS[number]} C1MaterialPaymentScenario
 * @typedef {'setup' | 'actor_a' | 'actor_b' | 'assert' | 'cleanup'} C1MaterialPaymentPhase
 * @param {{
 *   cwd?: string,
 *   assertTarget?: () => void,
 *   readPhase?: (phase: C1MaterialPaymentPhase, scenarioName: string) => string,
 *   runPhase?: (phase: C1MaterialPaymentPhase, sql: string, scenario: C1MaterialPaymentScenario) => Promise<unknown>,
 *   scenarios?: readonly C1MaterialPaymentScenario[],
 * }} [options]
 */
export async function runC1MaterialPaymentConcurrency({ cwd = process.cwd(), assertTarget = () => assertCloudDevTarget({ cwd }), readPhase = defaultReadPhase, runPhase, scenarios = C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS } = {}) {
  assertTarget()
  const run = runPhase ?? ((phase, sql) => runC1MaterialPaymentManagementQuery(phase, sql, { cwd, assertTarget: () => {} }))
  for (const scenario of scenarios) {
    if (scenariosByName.get(scenario.name) !== scenario) throw new Error('Invalid C1 material payment concurrency scenario')
    process.stdout.write(`C1 material payment concurrency: ${scenario.name}\n`)
    const execute = phase => run(phase, readPhase(phase, scenario.name), scenario)
    let failure
    try {
      await execute('cleanup'); await execute('setup')
      const actors = await Promise.allSettled([execute('actor_a'), execute('actor_b')])
      const actorFailures = actors.flatMap(actor => actor.status === 'rejected' ? [actor.reason] : [])
      if (actorFailures.length) throw new AggregateError(actorFailures, `C1 material payment concurrency ${scenario.name} actors ${actors.map(actor => actor.status).join('/')} failed: ${actorFailures.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`)
      const [a, b] = actors.map(actor => actor.value)
      checkActors(scenario, a, b)
      checkFinalState(scenario, await execute('assert'))
    } catch (error) { failure = error }
    await execute('cleanup')
    if (failure) throw failure
    process.stdout.write(`C1 material payment concurrency: ${scenario.name} passed\n`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runC1MaterialPaymentConcurrency()
