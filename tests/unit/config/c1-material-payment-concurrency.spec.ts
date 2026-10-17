import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CANONICAL_DEV_PROJECT_REF } from '../../../scripts/assert-cloud-dev-target.mjs'
import {
  C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE,
  C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS,
  runC1MaterialPaymentConcurrency,
  runC1MaterialPaymentManagementQuery,
  validateC1MaterialPaymentConcurrencySql,
} from '../../../scripts/run-c1-material-payment-concurrency.mjs'

const marker = '-- C1 MATERIAL PAYMENT CONCURRENCY FIXTURE'
const fixtureRoot = resolve(process.cwd(), 'supabase/tests/database/c1_material_payment_concurrency')
const readFixture = (path: string) => readFileSync(resolve(fixtureRoot, path), 'utf8').replace(/\r\n?/g, '\n').trim()
const phaseSql = (phase: string) => `${marker}\n-- ${phase}\nselect 'c1400000-0000-4000-8000-000000000010'::uuid;`
const exactCleanupSql = readFixture('cleanup.sql')
const runnerSource = readFileSync(resolve(process.cwd(), 'scripts/run-c1-material-payment-concurrency.mjs'), 'utf8')
const runnerCleanupSql = runnerSource.match(/const exactCleanupSql = `([\s\S]*?)`/u)?.[1].replace(/\r\n?/g, '\n').trim()
const readinessKey = 'c1_material_payment_actor_a_ready:c1400000-0000-4000-8000-000000000010:c1400000-0000-4000-8000-000000000020'
const managementRoots: string[] = []

const scenarioByName = (name: string) => {
  const scenario = C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS.find(entry => entry.name === name)
  if (!scenario) throw new Error(`missing scenario ${name}`)
  return scenario
}
const createCreate = scenarioByName('create-create')
const winningActors = (phase: string, scenarioName = 'create-create') => {
  if (phase === 'actor_a') return { resourceId: 'c1400000-0000-4000-8000-0000000000aa' }
  if (phase === 'actor_b') return { errorCode: scenarioByName(scenarioName).loserCode }
  if (phase === 'assert') return { ...C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE[scenarioName as keyof typeof C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE] }
  return {}
}

function listFixtureFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? listFixtureFiles(path) : [path]
  })
}

function makeManagementRoot() {
  const root = mkdtempSync(join(tmpdir(), 'taskovia-c1-material-payment-concurrency-'))
  managementRoots.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })
  writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
  writeFileSync(join(root, '.env.local'), `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co\nNUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key\n`)
  writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=dedicated-dev-pat\n')
  return root
}

afterEach(() => {
  for (const root of managementRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('C1 material payment concurrency runner', () => {
  it('covers create/create, both create/amend orders and pay/pay with one specific loser code each', () => {
    expect(C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS).toEqual([
      { name: 'create-create', actorA: 'c1_material_create_payment_request', actorB: 'c1_material_create_payment_request', loserCode: 'INSTALLMENT_CAPACITY_EXCEEDED' },
      { name: 'create-amend', actorA: 'c1_material_create_payment_request', actorB: 'c1_material_amend_contract', loserCode: 'AMENDMENT_BELOW_COMMITTED' },
      { name: 'amend-create', actorA: 'c1_material_amend_contract', actorB: 'c1_material_create_payment_request', loserCode: 'INSTALLMENT_CAPACITY_EXCEEDED' },
      { name: 'pay-pay', actorA: 'c1_material_record_payment', actorB: 'c1_material_record_payment', loserCode: 'VERSION_CONFLICT' },
    ])
    expect(Object.keys(C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE)).toEqual(C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS.map(scenario => scenario.name))
  })

  it('expects the paid plus pending invariant and no loser receipt in every final state', () => {
    for (const expected of Object.values(C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE)) {
      expect(expected.installmentInvariantHolds).toBe(true)
      expect(expected.actorBReceiptCount).toBe(0)
    }
    expect(C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE['create-create']).toMatchObject({ xRequestCount: 1, xPendingAmountText: '60.0000', xAccountantARequestCount: 1, xInstallmentAmountText: '100.0000' })
    expect(C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE['create-amend']).toMatchObject({ xRequestCount: 1, xPendingAmountText: '60.0000', xContractVersionNo: 1, xVersionCount: 1, xInstallmentAmountText: '100.0000' })
    expect(C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE['amend-create']).toMatchObject({ xRequestCount: 0, xPendingAmountText: '0.0000', xContractVersionNo: 2, xVersionCount: 2, xInstallmentAmountText: '50.0000' })
    expect(C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE['pay-pay']).toMatchObject({ yPaymentCount: 1, yTreasurerAPaymentCount: 1, yRequestState: 'paid', yRequestVersion: 3 })
  })

  it('posts to the canonical DEV project with the dedicated PAT and normalizes only exact loser codes', async () => {
    const cwd = makeManagementRoot()
    const requests: Array<{ url: string, authorization: string | null, body: unknown }> = []
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), authorization: new Headers(init?.headers).get('Authorization'), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ message: 'Failed to run sql query: ERROR: P0001: INSTALLMENT_CAPACITY_EXCEEDED' }), { status: 400 })
    }
    await expect(runC1MaterialPaymentManagementQuery('actor_b', phaseSql('actor_b'), { cwd, fetchImpl })).resolves.toEqual({ errorCode: 'INSTALLMENT_CAPACITY_EXCEEDED' })
    expect(requests).toEqual([{ url: `https://api.supabase.com/v1/projects/${CANONICAL_DEV_PROJECT_REF}/database/query`, authorization: 'Bearer dedicated-dev-pat', body: { query: phaseSql('actor_b'), read_only: false } }])

    for (const code of ['AMENDMENT_BELOW_COMMITTED', 'VERSION_CONFLICT']) {
      await expect(runC1MaterialPaymentManagementQuery('actor_a', phaseSql('actor_a'), {
        cwd,
        fetchImpl: async () => new Response(JSON.stringify({ message: `Failed to run sql query: ERROR: P0001: ${code}` }), { status: 400 }),
      })).resolves.toEqual({ errorCode: code })
    }
    for (const body of [
      { message: 'Failed to run sql query: ERROR: INSTALLMENT_CAPACITY_EXCEEDED' },
      { message: 'Failed to run sql query: ERROR: XP0001: VERSION_CONFLICT' },
      { message: 'Failed to run sql query: ERROR: P0001: VERSION_CONFLICT_EXTRA' },
      { message: 'Failed to run sql query: ERROR: P0001: PROOF_ALREADY_USED', hint: 'VERSION_CONFLICT' },
      { message: 'Failed to run sql query: ERROR: P0001: C1 material payment actor A readiness barrier timed out' },
    ]) {
      await expect(runC1MaterialPaymentManagementQuery('actor_b', phaseSql('actor_b'), {
        cwd,
        fetchImpl: async () => new Response(JSON.stringify(body), { status: 400 }),
      })).rejects.toThrow('C1 material payment concurrency actor_b failed')
    }
    await expect(runC1MaterialPaymentManagementQuery('setup', phaseSql('setup'), {
      cwd,
      fetchImpl: async () => new Response(JSON.stringify({ message: 'Failed to run sql query: ERROR: P0001: VERSION_CONFLICT' }), { status: 400 }),
    })).rejects.toThrow('C1 material payment concurrency setup failed with status 400 (P0001: VERSION_CONFLICT)')
    await expect(runC1MaterialPaymentManagementQuery('actor_a', phaseSql('actor_a'), {
      cwd,
      fetchImpl: async () => new Response('malformed management response', { status: 400 }),
    })).rejects.toThrow('C1 material payment concurrency actor_a failed')
  })

  it('maps actor and assert rows from the management API', async () => {
    const cwd = makeManagementRoot()
    await expect(runC1MaterialPaymentManagementQuery('actor_a', phaseSql('actor_a'), {
      cwd,
      fetchImpl: async () => new Response(JSON.stringify([{ resource_id: 'c1400000-0000-4000-8000-0000000000aa' }]), { status: 201 }),
    })).resolves.toEqual({ resourceId: 'c1400000-0000-4000-8000-0000000000aa' })
    await expect(runC1MaterialPaymentManagementQuery('assert', phaseSql('assert'), {
      cwd,
      fetchImpl: async () => new Response(JSON.stringify([{
        x_request_count: 1, x_pending_amount_text: '60.0000', x_accountant_a_request_count: 1, x_contract_version_no: 1, x_version_count: 1,
        x_installment_amount_text: '100.0000', y_payment_count: 0, y_treasurer_a_payment_count: 0, y_request_state: 'approved', y_request_version: 2,
        actor_b_receipt_count: 0, installment_invariant_holds: true,
      }]), { status: 201 }),
    })).resolves.toEqual(C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE['create-create'])
  })

  it('rejects non-synthetic or unsafe fixture SQL', () => {
    const scenario = 'create-create'
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', 'select 1;', scenario)).toThrow('Invalid C1 material payment concurrency fixture')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', phaseSql('actor_a'), 'unknown')).toThrow('Invalid C1 material payment concurrency scenario')
    expect(() => validateC1MaterialPaymentConcurrencySql('assert', `${marker}\nselect '10000000-0000-4000-8000-000000000010'::uuid;`, scenario)).toThrow('reserved synthetic')
    expect(() => validateC1MaterialPaymentConcurrencySql('assert', `${marker}\nselect 'c1410000-0000-4000-8000-000000000010'::uuid;`, scenario)).toThrow('reserved synthetic')
    expect(() => validateC1MaterialPaymentConcurrencySql('cleanup', `${marker}\ndelete from public.material_payments;`, scenario)).toThrow('broad delete')
    expect(() => validateC1MaterialPaymentConcurrencySql('setup', `${marker}\ndelete from public.material_payments where tenant_id = 'c1400000-0000-4000-8000-000000000010';`, scenario)).toThrow('broad delete')
    expect(() => validateC1MaterialPaymentConcurrencySql('assert', `${marker}\nupdate public.material_payment_requests set amount = 1 where tenant_id = 'c1400000-0000-4000-8000-000000000010';`, scenario)).toThrow('broad update')
    expect(() => validateC1MaterialPaymentConcurrencySql('assert', `${marker}\ntruncate public.material_payments;`, scenario)).toThrow('forbidden operation')
    expect(() => validateC1MaterialPaymentConcurrencySql('assert', `${marker}\ndrop table public.material_payments;`, scenario)).toThrow('forbidden operation')
    expect(() => validateC1MaterialPaymentConcurrencySql('assert', `${marker}\nalter table public.material_payments disable trigger material_payments_history_immutable;`, scenario)).toThrow('forbidden operation')
    expect(() => validateC1MaterialPaymentConcurrencySql('assert', `${marker}\ninsert into public.material_payments select * from public.material_payments where tenant_id = 'c1400000-0000-4000-8000-000000000010';`, scenario)).toThrow('must not write')
    expect(() => validateC1MaterialPaymentConcurrencySql('cleanup', `${exactCleanupSql}\ndelete from public.tenants where true;`, scenario)).toThrow('only exact approved cleanup DELETE')
    expect(() => validateC1MaterialPaymentConcurrencySql('cleanup', exactCleanupSql.replace("delete from auth.users where id in (", "delete from auth.users where id not in ("), scenario)).toThrow('only exact approved cleanup DELETE')
    expect(() => validateC1MaterialPaymentConcurrencySql('cleanup', `${marker}\nselect 1;`, scenario)).toThrow('exact approved')
    expect(() => validateC1MaterialPaymentConcurrencySql('cleanup', exactCleanupSql, scenario)).not.toThrow()
  })

  it('requires actor A to hold the contract lock in a transaction behind the readiness barrier', () => {
    const actorA = readFixture('create-create/actor_a.sql')
    const actorB = readFixture('create-create/actor_b.sql')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA, 'create-create')).not.toThrow()
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_b', actorB, 'create-create')).not.toThrow()
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA.replace('select pg_catalog.pg_sleep(3);\n', ''), 'create-create')).toThrow('transaction-held')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA.replace('begin;\n', ''), 'create-create')).toThrow('transaction-held')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA.replace(readinessKey, 'other_ready_key'), 'create-create')).toThrow('transaction-held')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA.replace('set local role none;\n', 'set local role none;\ncommit;\nbegin;\n'), 'create-create')).toThrow('transaction-held')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA.replace('set local role none;\n', 'set local role none; end;\n'), 'create-create')).toThrow('transaction-held')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_b', actorB.replace('commit;\n', 'rollback;\n'), 'create-create')).toThrow('transaction-held')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_b', actorB.replace(/pg_try_advisory_lock/gu, 'pg_advisory_lock'), 'create-create')).toThrow('readiness barrier')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA.replace('set local role authenticated;\n', ''), 'create-create')).toThrow('authenticated')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA.replace('c1_material_create_payment_request', 'c1_material_record_payment'), 'create-create')).toThrow('must call public.c1_material_create_payment_request')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA.replace('"sub":"c1400000-0000-4000-8000-000000000901"', '"sub":"c1400000-0000-4000-8000-000000000999"'), 'create-create')).toThrow('fixture user')
    expect(() => validateC1MaterialPaymentConcurrencySql('actor_a', actorA, 'pay-pay')).toThrow('must call public.c1_material_record_payment')
  })

  it('keeps every fixture file inside the reserved c140 namespace and free of forbidden words', () => {
    const files = listFixtureFiles(fixtureRoot)
    expect(files.map(file => file.slice(fixtureRoot.length + 1).replace(/\\/gu, '/')).sort()).toEqual([
      'amend-create/actor_a.sql', 'amend-create/actor_b.sql', 'assert.sql', 'cleanup.sql',
      'create-amend/actor_a.sql', 'create-amend/actor_b.sql', 'create-create/actor_a.sql', 'create-create/actor_b.sql',
      'pay-pay/actor_a.sql', 'pay-pay/actor_b.sql', 'setup.sql',
    ])
    for (const file of files) {
      const sql = readFileSync(file, 'utf8')
      expect(sql.startsWith(marker)).toBe(true)
      const ids = sql.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) expect(id.toLowerCase().startsWith('c1400000-0000-4000-8000-')).toBe(true)
      expect(sql).not.toMatch(/\b(?:drop|truncate|reset|repair)\b/iu)
    }
  })

  it('uses distinct users per actor and the loser idempotency keys counted by the assert', () => {
    const assertSql = readFixture('assert.sql')
    const subject = (sql: string) => /"sub":"(c1400000-0000-4000-8000-[0-9a-f]{12})"/u.exec(sql)?.[1]
    const idempotencyKey = (sql: string) => /receipt\.idempotency_key='(c1400000-0000-4000-8000-[0-9a-f]{12})'/u.exec(sql)?.[1]
    for (const scenario of C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS) {
      const actorA = readFixture(`${scenario.name}/actor_a.sql`)
      const actorB = readFixture(`${scenario.name}/actor_b.sql`)
      expect(subject(actorA)).toBeDefined()
      expect(subject(actorB)).toBeDefined()
      expect(subject(actorA)).not.toBe(subject(actorB))
      expect(idempotencyKey(actorA)).not.toBe(idempotencyKey(actorB))
      expect(assertSql).toContain(`'${idempotencyKey(actorB)}'`)
      expect(assertSql).not.toContain(`'${idempotencyKey(actorA)}'`)
      expect(actorA).toContain(`public.${scenario.actorA}(`)
      expect(actorB).toContain(`public.${scenario.actorB}(`)
    }
    const payA = readFixture('pay-pay/actor_a.sql')
    const payB = readFixture('pay-pay/actor_b.sql')
    expect(payA).toContain('"proofFileId":"c1400000-0000-4000-8000-000000000531"')
    expect(payB).toContain('"proofFileId":"c1400000-0000-4000-8000-000000000532"')
  })

  it('creates the contracts through the real record RPC under the recorder claims', () => {
    const setup = readFixture('setup.sql')
    expect(() => validateC1MaterialPaymentConcurrencySql('setup', setup, 'create-create')).not.toThrow()
    expect(() => validateC1MaterialPaymentConcurrencySql('setup', setup.replace('set local role none;\n', 'set local role none;\ncommit;\nbegin;\n'), 'create-create')).toThrow('commit atomically')
    expect(() => validateC1MaterialPaymentConcurrencySql('setup', setup.replace(/\ncommit;$/u, ''), 'create-create')).toThrow('commit atomically')
    expect(setup.match(/public\.c1_material_record_contract\(/gu)).toHaveLength(2)
    expect(setup).toMatch(/"sub":"c1400000-0000-4000-8000-000000000903"[\s\S]*public\.c1_material_record_contract\(/u)
    expect(setup).toContain("'taskovia.c1_material_evidence.intent'")
    expect(setup).not.toMatch(/\binsert\s+into\s+public\.material_contract/iu)
    for (const permission of ['material.read', 'material.payment.request', 'material.contract.record', 'material.payment.approve', 'material.payment.execute', 'material.order.manage']) {
      expect(setup).toContain(`'${permission}'`)
    }
  })

  it('uses the exact cleanup to cover every populated synthetic fixture table and restores every trigger', () => {
    expect(runnerCleanupSql).toBe(exactCleanupSql)
    for (const table of [
      'public.app_notifications', 'public.material_payments', 'public.material_payment_decisions', 'public.material_payment_request_revisions',
      'public.material_payment_requests', 'public.material_evidence_scopes', 'public.material_order_contracts', 'public.material_contract_installments',
      'public.material_contract_versions', 'public.material_contracts', 'public.material_order_allocations', 'public.material_orders',
      'public.cost_evidence_files', 'public.material_proposal_revision_lines', 'public.material_proposal_revisions', 'public.material_proposal_lines',
      'public.material_proposals', 'public.material_items', 'public.business_parties', 'public.cost_command_receipts', 'public.projects',
      'public.company_cost_settings', 'public.company_role_assignments', 'public.role_permissions', 'public.roles', 'public.company_memberships',
      'public.tenant_memberships', 'public.audit_events', 'public.companies', 'public.tenants', 'auth.users',
    ]) expect(exactCleanupSql).toContain(`delete from ${table} `)

    const deleteLines = exactCleanupSql.split('\n').filter(line => line.startsWith('delete from '))
    for (const line of deleteLines) expect(line).toMatch(/ where [\s\S]*'c1400000-0000-4000-8000-[0-9a-f]{12}'/u)
    const receiptCleanup = "delete from public.cost_command_receipts where tenant_id = 'c1400000-0000-4000-8000-000000000010' and company_id = 'c1400000-0000-4000-8000-000000000020' and actor_id in ('c1400000-0000-4000-8000-000000000901','c1400000-0000-4000-8000-000000000902','c1400000-0000-4000-8000-000000000903','c1400000-0000-4000-8000-000000000904','c1400000-0000-4000-8000-000000000905','c1400000-0000-4000-8000-000000000906') and command_name in ('material.record_contract','material.amend_contract','material.create_payment_request','material.decide_payment_request','material.record_payment');"
    expect(deleteLines.filter(line => line.includes('cost_command_receipts'))).toEqual([receiptCleanup])

    const disabled = exactCleanupSql.split('\n').filter(line => / disable trigger /u.test(line)).map(line => line.replace(' disable trigger ', ' trigger '))
    const enabled = exactCleanupSql.split('\n').filter(line => / enable trigger /u.test(line)).map(line => line.replace(' enable trigger ', ' trigger '))
    expect(disabled.length).toBeGreaterThan(0)
    expect(enabled).toEqual([...disabled].reverse())
    expect(exactCleanupSql.startsWith(`${marker}\nbegin;\n`)).toBe(true)
    expect(exactCleanupSql.endsWith('\ncommit;')).toBe(true)

    const order = (fragment: string) => {
      const index = exactCleanupSql.indexOf(fragment)
      expect(index).toBeGreaterThan(-1)
      return index
    }
    expect(order('delete from public.material_payments ')).toBeLessThan(order('delete from public.material_payment_requests '))
    expect(order('delete from public.material_payment_requests ')).toBeLessThan(order('delete from public.material_contracts '))
    expect(order('delete from public.material_evidence_scopes ')).toBeLessThan(order('delete from public.material_contracts '))
    expect(order('delete from public.material_order_contracts ')).toBeLessThan(order('delete from public.material_order_allocations '))
    expect(order('delete from public.material_contracts ')).toBeLessThan(order('delete from public.material_orders '))
    expect(order('delete from public.material_orders ')).toBeLessThan(order('delete from public.cost_evidence_files '))
    expect(order('delete from public.app_notifications ')).toBeLessThan(order('delete from public.projects '))
    expect(order('delete from public.cost_command_receipts ')).toBeLessThan(order('delete from auth.users '))
    expect(order('delete from public.audit_events ')).toBeLessThan(order('delete from public.companies '))
  })

  it('guards the target, launches exactly two sessions, asserts the final state, and always performs exact cleanup', async () => {
    const assertTarget = vi.fn()
    const calls: string[] = []
    const run = vi.fn(async (phase: string) => {
      calls.push(phase)
      return winningActors(phase)
    })

    await runC1MaterialPaymentConcurrency({ scenarios: [createCreate], assertTarget, readPhase: phaseSql, runPhase: run })

    expect(assertTarget).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['cleanup', 'setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
    expect(run).toHaveBeenCalledTimes(6)
  })

  it.each(['setup', 'actor_a', 'actor_b', 'assert'])('cleans up after a %s failure', async (failedPhase) => {
    const calls: string[] = []
    await expect(runC1MaterialPaymentConcurrency({
      scenarios: [createCreate], assertTarget: vi.fn(), readPhase: phaseSql,
      runPhase: async (phase) => {
        calls.push(phase)
        if (phase === failedPhase) throw new Error(`${phase} failed`)
        return winningActors(phase)
      },
    })).rejects.toThrow(`${failedPhase} failed`)
    expect(calls.at(-1)).toBe('cleanup')
  })

  it.each([
    ['actor A lost', { errorCode: 'INSTALLMENT_CAPACITY_EXCEEDED' }, { errorCode: 'INSTALLMENT_CAPACITY_EXCEEDED' }, 'actor A must commit'],
    ['both committed', { resourceId: 'c1400000-0000-4000-8000-0000000000aa' }, { resourceId: 'c1400000-0000-4000-8000-0000000000bb' }, 'actor B must fail with INSTALLMENT_CAPACITY_EXCEEDED'],
    ['wrong loser code', { resourceId: 'c1400000-0000-4000-8000-0000000000aa' }, { errorCode: 'VERSION_CONFLICT' }, 'actor B must fail with INSTALLMENT_CAPACITY_EXCEEDED'],
  ])('fails closed when %s while still cleaning up', async (_label, actorA, actorB, message) => {
    const calls: string[] = []
    await expect(runC1MaterialPaymentConcurrency({
      scenarios: [createCreate], assertTarget: vi.fn(), readPhase: phaseSql,
      runPhase: async (phase) => {
        calls.push(phase)
        if (phase === 'actor_a') return actorA
        if (phase === 'actor_b') return actorB
        return winningActors(phase)
      },
    })).rejects.toThrow(message)
    expect(calls).not.toContain('assert')
    expect(calls.at(-1)).toBe('cleanup')
  })

  it('fails closed on any final-state mismatch while still cleaning up', async () => {
    const calls: string[] = []
    await expect(runC1MaterialPaymentConcurrency({
      scenarios: [createCreate], assertTarget: vi.fn(), readPhase: phaseSql,
      runPhase: async (phase) => {
        calls.push(phase)
        if (phase === 'assert') return { ...C1_MATERIAL_PAYMENT_CONCURRENCY_EXPECTED_STATE['create-create'], xPendingAmountText: '120.0000', installmentInvariantHolds: false }
        return winningActors(phase)
      },
    })).rejects.toThrow('final state mismatch: xPendingAmountText, installmentInvariantHolds')
    expect(calls.at(-1)).toBe('cleanup')
  })

  it('loads and checks every approved real fixture scenario', async () => {
    const calls: string[] = []
    const sqlByPhase = new Map<string, string>()
    await runC1MaterialPaymentConcurrency({
      assertTarget: vi.fn(),
      runPhase: async (phase, sql, scenario) => {
        calls.push(`${scenario.name}:${phase}`)
        sqlByPhase.set(`${scenario.name}:${phase}`, sql)
        return winningActors(phase, scenario.name)
      },
    })
    expect(calls).toHaveLength(C1_MATERIAL_PAYMENT_CONCURRENCY_SCENARIOS.length * 6)
    expect(sqlByPhase.get('create-create:cleanup')).toBe(exactCleanupSql)
    expect(sqlByPhase.get('pay-pay:actor_b')).toContain('public.c1_material_record_payment(')
    expect(sqlByPhase.get('amend-create:actor_a')).toContain('public.c1_material_amend_contract(')
  })

  it('waits for both rejected actors before cleanup and retains both failures', async () => {
    let actorASettled = false
    let actorBSettled = false
    let cleanupAfterActors = false
    let cleanupCalls = 0
    let rejectActorA!: (reason: Error) => void
    let rejectActorB!: (reason: Error) => void
    let startActorA!: () => void
    let startActorB!: () => void
    const actorAStarted = new Promise<void>((resolveStart) => { startActorA = resolveStart })
    const actorBStarted = new Promise<void>((resolveStart) => { startActorB = resolveStart })
    const actorAFailure = new Error('actor A failed')
    const actorBFailure = new Error('actor B failed')

    const execution = runC1MaterialPaymentConcurrency({
      scenarios: [createCreate], assertTarget: vi.fn(), readPhase: phaseSql,
      runPhase: (phase) => {
        if (phase === 'cleanup') {
          cleanupCalls += 1
          if (cleanupCalls === 2) cleanupAfterActors = actorASettled && actorBSettled
          return Promise.resolve({})
        }
        if (phase === 'actor_a') return new Promise((_resolve, reject) => {
          startActorA()
          rejectActorA = (reason) => { actorASettled = true; reject(reason) }
        })
        if (phase === 'actor_b') return new Promise((_resolve, reject) => {
          startActorB()
          rejectActorB = (reason) => { actorBSettled = true; reject(reason) }
        })
        return Promise.resolve({})
      },
    })

    await Promise.all([actorAStarted, actorBStarted])
    rejectActorA(actorAFailure)
    await Promise.resolve()
    expect(cleanupCalls).toBe(1)

    rejectActorB(actorBFailure)
    const failure = await execution.catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([actorAFailure, actorBFailure])
    expect(cleanupAfterActors).toBe(true)
  })
})
