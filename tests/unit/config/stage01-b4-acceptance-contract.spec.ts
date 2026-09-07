import { existsSync, readFileSync } from 'node:fs'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createGlobalSetup } from '../../acceptance/stage01-cloud-dev/global-setup'
import { createGlobalTeardown } from '../../acceptance/stage01-cloud-dev/global-teardown'
import { assertB4ActorBoundary, assertRetainedProfileShape, b4CompanyAdminPermissionBundle, deactivateProvenB4Actors, ensureB4EmployeeDirectoryRole, ensureProfile, reconcileB4CompanyAdminConfigPermissions, retainedProfileIdentity, selectFixedB4ActorCandidates, selectRetainedProfileAction } from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import * as fixture from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import { B4_RESULTS_DIRECTORY, B4_SECRET_STATE_PATH } from '../../acceptance/stage01-cloud-dev/acceptance-state'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const state = {
  runMarker: 'b4-stage01-run', tenantId: 'b4000000-0000-4000-8000-000000000010',
  companyId: 'b4000000-0000-4000-8000-000000000020', companyCode: 'VQH_STAGE01_ACCEPTANCE' as const,
  acceptanceSnapshotId: 'b4000000-0000-4000-8000-000000000050',
  actors: {
    reader: { userId: 'reader', employeeId: 'reader-employee', email: 'reader@taskovia.invalid', password: 'secret' },
    operator: { userId: 'operator', employeeId: 'operator-employee', email: 'operator@taskovia.invalid', password: 'secret' },
    decision: { userId: 'decision', employeeId: 'decision-employee', email: 'decision@taskovia.invalid', password: 'secret' },
  },
  profiles: { p1OpportunityId: 'p1', p2OpportunityId: 'p2', p3OpportunityId: 'p3' },
}

function completeP2Profile({ snapshotVersion, snapshotId = 'snapshot' }: { snapshotVersion?: number, snapshotId?: string } = {}) {
  const identity = retainedProfileIdentity('P2', snapshotVersion)
  return {
    opportunity: {
      id: 'p2-r2',
      primary_customer_name: identity.opportunityName,
      need_description: identity.opportunityDescription,
    },
    workflow: { subject_id: 'p2-r2', definition_snapshot_id: snapshotId },
    nodes: [{ id: 'intake', node_key: '01.1' }, { id: 'evaluation', node_key: '01.2' }],
    executions: [{ id: 'intake-execution', node_instance_id: 'intake' }, ...Array.from({ length: 5 }, (_, index) => ({ id: `evaluation-${index + 1}`, node_instance_id: 'evaluation' }))],
    cycles: Array.from({ length: 5 }, (_, index) => ({ id: `cycle-${index + 1}`, node_execution_id: `evaluation-${index + 1}` })),
    evaluations: Array.from({ length: 5 }, (_, cycle) => Array.from({ length: 6 }, (_, index) => ({ decision_cycle_id: `cycle-${cycle + 1}`, revision: index === 5 ? 2 : 1 }))).flat(),
    recommendations: Array.from({ length: 5 }, (_, index) => ({ decision_cycle_id: `cycle-${index + 1}`, version: 1 })),
    clarifications: [],
    contacts: Array.from({ length: 10 }, (_, index) => ({ contact_id: `contact-${index + 1}` })),
  }
}

function b4Row<T extends Record<string, unknown>>(row: T): T & { tenant_id: string, company_id: string } {
  return {
    ...row,
    tenant_id: 'b4000000-0000-4000-8000-000000000010',
    company_id: 'b4000000-0000-4000-8000-000000000020',
  }
}

function completeP2ProfileRows(options: { snapshotVersion?: number, snapshotId?: string } = {}) {
  const profile = completeP2Profile(options)
  return {
    opportunities: [b4Row(profile.opportunity)],
    workflow_instances: [b4Row({ id: 'workflow-p2', ...profile.workflow, subject_type: 'opportunity' })],
    workflow_node_instances: profile.nodes.map(node => b4Row({ ...node, workflow_instance_id: 'workflow-p2' })),
    workflow_node_executions: profile.executions.map(b4Row),
    stage01_decision_cycles: profile.cycles.map(cycle => b4Row({ ...cycle, opportunity_id: 'p2-r2' })),
    stage01_criterion_evaluations: profile.evaluations.map(b4Row),
    stage01_recommendations: profile.recommendations.map(b4Row),
    stage01_clarification_returns: [],
    opportunity_contacts: profile.contacts.map(contact => b4Row({ ...contact, opportunity_id: 'p2-r2', ended_at: null })),
  }
}

function createProfileClient(initialRows: Record<string, Array<Record<string, unknown>>>) {
  const rows = Object.fromEntries(Object.entries(initialRows).map(([table, tableRows]) => [table, tableRows.map(row => ({ ...row }))])) as Record<string, Array<Record<string, unknown>>>
  const inserts: Array<{ table: string, value: Record<string, unknown> }> = []
  let nextId = 1

  return {
    rows,
    inserts,
    client: {
      from(table: string) {
        const predicates: Array<(row: Record<string, unknown>) => boolean> = []
        let action: 'select' | 'insert' = 'select'
        let values: Array<Record<string, unknown>> = []
        let single = false
        let applied = false
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            predicates.push(row => row[column] === value)
            return query
          },
          in: (column: string, values: unknown[]) => {
            predicates.push(row => values.includes(row[column]))
            return query
          },
          is: (column: string, value: unknown) => {
            predicates.push(row => row[column] === value)
            return query
          },
          order: () => query,
          limit: () => query,
          maybeSingle: () => {
            single = true
            return query
          },
          single: () => {
            single = true
            return query
          },
          insert: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
            action = 'insert'
            values = Array.isArray(input) ? input : [input]
            return query
          },
          then: (resolve: (value: { data: unknown, error: null }) => void) => {
            if (action === 'insert' && !applied) {
              const tableRows = rows[table] ?? (rows[table] = [])
              values = values.map(value => ({
                id: value.id ?? `${table}-${nextId++}`,
                ...(table === 'opportunity_contacts' && value.ended_at === undefined ? { ended_at: null } : {}),
                ...value,
              }))
              tableRows.push(...values)
              inserts.push(...values.map(value => ({ table, value })))
              applied = true
            }
            const result = action === 'insert'
              ? values
              : (rows[table] ?? []).filter(row => predicates.every(predicate => predicate(row)))
            resolve({ data: single ? (result[0] ?? null) : result, error: null })
          },
        }
        return query
      },
    },
  }
}

function createB4EmployeeRoleClient() {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    roles: [b4Row({
      id: 'b4000000-0000-4000-8000-000000000304', code: 'employee', name: 'Wrong', description: 'Wrong',
      is_privileged: true, is_system: false, is_active: false,
    })],
    role_permissions: [{ role_id: 'b4000000-0000-4000-8000-000000000304', permission_code: 'employee.read_all' }],
    company_role_assignments: [b4Row({
      id: 'reader-base', user_id: 'reader', role_id: 'b4000000-0000-4000-8000-000000000304', revoked_at: null,
    })],
  }
  let nextId = 1

  return {
    rows,
    client: {
      from(table: string) {
        const predicates: Array<(row: Record<string, unknown>) => boolean> = []
        let action: 'select' | 'upsert' | 'delete' | 'insert' = 'select'
        let values: Array<Record<string, unknown>> = []
        let single = false
        let applied = false
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            predicates.push(row => row[column] === value)
            return query
          },
          is: (column: string, value: unknown) => {
            predicates.push(row => row[column] === value)
            return query
          },
          maybeSingle: () => {
            single = true
            return query
          },
          upsert: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
            action = 'upsert'
            values = Array.isArray(input) ? input : [input]
            return query
          },
          delete: () => {
            action = 'delete'
            return query
          },
          insert: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
            action = 'insert'
            values = Array.isArray(input) ? input : [input]
            return query
          },
          then: (resolve: (value: { data: unknown, error: null }) => void) => {
            const tableRows = rows[table] ?? (rows[table] = [])
            if (!applied && action === 'delete') {
              rows[table] = tableRows.filter(row => !predicates.every(predicate => predicate(row)))
              applied = true
            }
            if (!applied && action === 'upsert') {
              for (const value of values) {
                const existing = table === 'role_permissions'
                  ? tableRows.find(row => row.role_id === value.role_id && row.permission_code === value.permission_code)
                  : value.id === undefined ? undefined : tableRows.find(row => row.id === value.id)
                if (existing) Object.assign(existing, value)
                else tableRows.push({ ...value })
              }
              applied = true
            }
            if (!applied && action === 'insert') {
              for (const value of values) tableRows.push({
                id: value.id ?? `${table}-${nextId++}`,
                ...(table === 'company_role_assignments' && value.revoked_at === undefined ? { revoked_at: null } : {}),
                ...value,
              })
              applied = true
            }
            const result = action === 'select'
              ? tableRows.filter(row => predicates.every(predicate => predicate(row)))
              : values
            resolve({ data: single ? (result[0] ?? null) : result, error: null })
          },
        }
        return query
      },
    },
  }
}

const requiredTaxonomyKeys = [
  'customer_type', 'contact_relationship', 'scope', 'lead_source', 'referrer_type', 'engagement_status',
  'invalid_reason', 'budget_status', 'timeline_status', 'priority', 'intake_channel', 'blocker_category',
]

function canonicalStage01Definition() {
  return {
    taxonomies: {
      customer_type: [{ code: 'business', label: 'Business' }],
      contact_relationship: [{ code: 'decision_maker', label: 'Decision maker' }],
      scope: [{ code: 'implementation', label: 'Implementation' }],
      lead_source: [{ code: 'referral', label: 'Referral', behavior: { requiresReferrer: true } }],
      referrer_type: [{ code: 'partner', label: 'Partner' }],
      engagement_status: [{ code: 'active', label: 'Active' }],
      invalid_reason: [{ code: 'duplicate', label: 'Duplicate' }],
      budget_status: [{ code: 'approved', label: 'Approved' }],
      timeline_status: [{ code: 'planned', label: 'Planned' }],
      priority: [{ code: 'high', label: 'High' }],
      intake_channel: [{ code: 'email', label: 'Email' }],
      blocker_category: [{ code: 'legal', label: 'Legal approval' }, { code: 'resource', label: 'Resource availability' }],
    },
  }
}

function createSnapshotClient(initialSnapshots: Array<Record<string, unknown>>) {
  const snapshots = initialSnapshots.map(snapshot => structuredClone(snapshot))
  const inserts: Array<Record<string, unknown>> = []
  let nextId = 1

  return {
    snapshots,
    inserts,
    client: {
      from(table: string) {
        if (table !== 'workflow_definition_snapshots') throw new Error(`Unexpected snapshot table ${table}`)
        const predicates: Array<(row: Record<string, unknown>) => boolean> = []
        let action: 'select' | 'insert' = 'select'
        let values: Array<Record<string, unknown>> = []
        let descending = false
        let resultLimit: number | undefined
        let single = false
        let applied = false
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            predicates.push(row => row[column] === value)
            return query
          },
          order: (column: string, options: { ascending: boolean }) => {
            if (column !== 'template_version') throw new Error(`Unexpected snapshot order ${column}`)
            descending = options.ascending === false
            return query
          },
          limit: (value: number) => {
            resultLimit = value
            return query
          },
          maybeSingle: () => {
            single = true
            return query
          },
          single: () => {
            single = true
            return query
          },
          insert: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
            action = 'insert'
            values = (Array.isArray(input) ? input : [input]).map(value => structuredClone(value))
            return query
          },
          then: (resolve: (value: { data: unknown, error: null }) => void) => {
            if (action === 'insert' && !applied) {
              values = values.map(value => ({ id: `snapshot-${nextId++}`, ...value }))
              snapshots.push(...values)
              inserts.push(...values.map(value => structuredClone(value)))
              applied = true
            }
            let result = action === 'insert'
              ? values
              : snapshots.filter(row => predicates.every(predicate => predicate(row)))
            if (descending) result = [...result].sort((left, right) => Number(right.template_version) - Number(left.template_version))
            if (resultLimit !== undefined) result = result.slice(0, resultLimit)
            resolve({ data: single ? (result[0] ?? null) : result, error: null })
          },
        }
        return query
      },
    },
  }
}

describe('B4 Cloud DEV acceptance boundary', () => {
  it('keeps S09 role inserts collision-free alongside the bootstrapped B4 employee baseline', async () => {
    const roleClient = createB4EmployeeRoleClient()
    await ensureB4EmployeeDirectoryRole(roleClient.client, state.actors)
    const baseline = structuredClone(roleClient.rows.roles)
    const sql = read('supabase/tests/database/stage01_b4_acceptance.test.sql')
    const s09 = sql.slice(sql.indexOf('-- B4-S09 Amendment 1'), sql.indexOf('-- B4-S09: reader denials'))
    const roleInsert = s09.match(/insert into public\.roles\b[^;]+;/)?.[0]
    expect(roleInsert).toBeDefined()
    const insertedCodes = [...roleInsert!.matchAll(/\(\w+, tenant_id, company_id, '([^']+)'/g)].map(match => match[1])
    const combinedCodes = [...baseline.map(role => role.code), ...insertedCodes]

    expect(combinedCodes.filter(code => code === 'employee')).toHaveLength(1)
    expect(new Set(combinedCodes).size).toBe(combinedCodes.length)
    expect(insertedCodes).toEqual(['b4_s09_read_all'])
    expect(roleInsert).not.toMatch(/on conflict/i)
    expect(s09).not.toMatch(/(?:update|delete from) public\.(?:roles|role_permissions)\b/i)
  })

  it('reuses the active company employee role only for the S09 directory target and keeps read-all permissions isolated', () => {
    const sql = read('supabase/tests/database/stage01_b4_acceptance.test.sql')
    const s09 = sql.slice(sql.indexOf('-- B4-S09 Amendment 1'), sql.indexOf('-- B4-S09: reader denials'))
    expect(s09).toMatch(/select baseline\.id into strict base_role_id\s+from public\.roles as baseline/)
    expect(s09).toContain("baseline.tenant_id = 'b4000000-0000-4000-8000-000000000010'::uuid")
    expect(s09).toContain("baseline.company_id = 'b4000000-0000-4000-8000-000000000020'::uuid")
    expect(s09).toContain("baseline.code = 'employee'")
    expect(s09).toContain('and baseline.is_active;')
    expect(s09).not.toContain('b4000000-0000-4000-8000-00000000090b')
    expect(s09.match(/insert into public\.role_permissions\b[^;]+;/g)).toEqual([
      "insert into public.role_permissions (role_id, permission_code) values (role_id, 'employee.read_all');",
    ])
    expect(s09).toContain("(tenant_id, company_id, actor_id, role_id, actor_id, 'Transactional B4 S09 employee.read_all fixture')")
    expect(s09).toContain("(tenant_id, company_id, private_user_id, base_role_id, actor_id, 'Transactional B4 S09 active directory target')")
    expect(sql).toContain("then raise exception 'B4-S09 employee.read_all actor could not read directory'")
    expect(sql).toContain("then raise exception 'B4-S09 employee.read_all exposed private employee data'")
  })

  it('keeps B4 capability UPSERT conflict columns distinct from bootstrap PL/pgSQL variables', () => {
    const sql = read('supabase/tests/database/stage01_b4_acceptance.test.sql')
    const bootstrap = sql.slice(0, sql.indexOf('-- A complete synthetic definition'))

    expect(bootstrap).toContain("v_tenant_id constant uuid := 'b4000000-0000-4000-8000-000000000010'")
    expect(bootstrap).toContain("v_company_id constant uuid := 'b4000000-0000-4000-8000-000000000020'")
    expect(bootstrap).not.toMatch(/^\s+tenant_id constant uuid :=/m)
    expect(bootstrap).not.toMatch(/^\s+company_id constant uuid :=/m)
    expect(bootstrap).toContain("values (\n    v_tenant_id, v_company_id, 'opportunity.decision_authority', true, operator_id\n  ) on conflict (tenant_id, company_id, capability_key)")
    expect(bootstrap).toContain("select v_tenant_id,\n    v_company_id,\n    canonical.policy_key")
    expect(bootstrap).toContain('on conflict (tenant_id, company_id, policy_key, policy_version) do nothing')
  })

  it('keeps the Stage B database operator distinct from the browser operator in either bootstrap order', () => {
    const databaseFixture = read('supabase/tests/database/stage01_b4_acceptance.test.sql')
    const databaseBootstrap = databaseFixture.slice(0, databaseFixture.indexOf('-- A complete synthetic definition'))
    const browserFixture = read('scripts/stage01-b4-acceptance-fixture.mjs')

    expect(databaseBootstrap).toContain("operator_id constant uuid := 'b4000000-0000-4000-8000-000000000901'")
    expect(databaseBootstrap).toContain("operator_employee_id constant uuid := 'b4000000-0000-4000-8000-000000000906'")
    expect(databaseBootstrap).toContain("operator_employee_id, v_tenant_id, v_company_id, operator_id, 'B4-DB-OPERATOR'")
    expect(databaseBootstrap).toContain("on conflict (id) do nothing;")
    expect(browserFixture).toContain("operator: 'b4000000-0000-4000-8000-000000000202'")
    expect(browserFixture).toContain('employee_code: `B4-${kind.toUpperCase()}`')
    expect(browserFixture).toContain("{ onConflict: 'id' }")
  })

  it('seeds the B4 S02 completed Intake with the required started and completed timestamp pairs', () => {
    const sql = read('supabase/tests/database/stage01_b4_acceptance.test.sql')
    const scenario = sql.slice(sql.indexOf("do $$\ndeclare context jsonb"), sql.indexOf("-- A B4-only S09"))

    expect(scenario).toContain('intake_fixture_at constant timestamptz := clock_timestamp();')
    expect(scenario).toContain('node_instance_id, execution_no, phase, started_by, started_at, completed_by, completed_at)')
    expect(scenario).toContain("1, 'completed', 'b4000000-0000-4000-8000-000000000901', intake_fixture_at - interval '1 minute', 'b4000000-0000-4000-8000-000000000901', intake_fixture_at")
    expect(scenario).not.toContain('phase, completed_by, completed_at)')
  })

  it('removes only Stage 01 configuration administration from the cloned B4 company_admin bundle', async () => {
    expect(b4CompanyAdminPermissionBundle([
      'opportunity.read', 'opportunity.decision.record', 'opportunity.decision_authority.assign',
      'stage01.config.read', 'stage01.config.update', 'stage01.config.publish',
    ])).toEqual([
      'opportunity.decision.record', 'opportunity.decision_authority.assign', 'opportunity.read',
    ])

    const roleClient = createB4EmployeeRoleClient()
    roleClient.rows.role_permissions = [
      { role_id: 'b4000000-0000-4000-8000-000000000303', permission_code: 'opportunity.decision.record' },
      { role_id: 'b4000000-0000-4000-8000-000000000303', permission_code: 'stage01.config.read' },
      { role_id: 'b4000000-0000-4000-8000-000000000303', permission_code: 'stage01.config.update' },
      { role_id: 'b4000000-0000-4000-8000-000000000303', permission_code: 'stage01.config.publish' },
    ]

    await reconcileB4CompanyAdminConfigPermissions(roleClient.client)

    expect(roleClient.rows.role_permissions).toEqual([
      { role_id: 'b4000000-0000-4000-8000-000000000303', permission_code: 'opportunity.decision.record' },
    ])
  })

  it('keeps the B4 acceptance journey on operational Stage 01 APIs rather than configuration administration APIs', () => {
    const fullStack = read('tests/acceptance/stage01-cloud-dev/stage01-fullstack.spec.ts')
    const operationalService = read('server/features/stage01/stage01.service.ts')
    const getOperation = operationalService.slice(
      operationalService.indexOf('async get(context'),
      operationalService.indexOf('async evaluateCriterion'),
    )

    expect(fullStack).not.toContain('/stage-01/config')
    expect(fullStack).not.toContain('stage01.config.')
    expect(getOperation).toContain("requirePermission(context, 'opportunity.read')")
    expect(getOperation).toContain("requirePermission(context, 'journey.read')")
  })

  it('appends one exact canonical snapshot for an outdated acceptance snapshot and reuses it idempotently', async () => {
    const canonicalDefinition = canonicalStage01Definition()
    const canonicalSnapshot = {
      id: 'canonical-snapshot', tenant_id: '10000000-0000-4000-8000-000000000010', company_id: '10000000-0000-4000-8000-000000000020',
      workflow_key: 'vqh.stage01', template_version: 7, schema_version: 2, definition_hash: 'canonical-definition-hash', definition: canonicalDefinition,
    }
    const outdatedAcceptanceSnapshot = {
      id: 'acceptance-old', tenant_id: 'b4000000-0000-4000-8000-000000000010', company_id: 'b4000000-0000-4000-8000-000000000020',
      workflow_key: 'vqh.stage01', template_version: 3, schema_version: 2, definition_hash: 'outdated-definition-hash',
      definition: { ...canonicalStage01Definition(), taxonomies: { ...canonicalStage01Definition().taxonomies, blocker_category: [] } },
    }
    const snapshots = createSnapshotClient([canonicalSnapshot, outdatedAcceptanceSnapshot])
    const snapshotFixture = fixture as typeof fixture & {
      ensureAcceptanceSnapshot?: (client: typeof snapshots.client) => Promise<{ id: string, version: number }>
    }
    const canonicalBefore = structuredClone(canonicalSnapshot)

    const correctedSnapshotId = await Promise.resolve().then(() => snapshotFixture.ensureAcceptanceSnapshot!(snapshots.client))

    expect(correctedSnapshotId).toEqual({ id: 'snapshot-1', version: 4 })
    expect(snapshots.inserts).toHaveLength(1)
    expect(snapshots.inserts[0]).toMatchObject({
      tenant_id: 'b4000000-0000-4000-8000-000000000010', company_id: 'b4000000-0000-4000-8000-000000000020',
      workflow_key: 'vqh.stage01', template_version: 4, schema_version: 2, definition_hash: 'canonical-definition-hash',
    })
    const correctedDefinition = snapshots.inserts[0]?.definition as { taxonomies: Record<string, Array<{ code: string, label: string, behavior?: unknown }>> }
    expect(correctedDefinition.taxonomies.blocker_category)
      .toEqual([{ code: 'legal', label: 'Legal approval' }, { code: 'resource', label: 'Resource availability' }])
    const correctedTaxonomies = correctedDefinition.taxonomies
    for (const key of requiredTaxonomyKeys) {
      expect(correctedTaxonomies[key]).toEqual(expect.arrayContaining([expect.objectContaining({ code: expect.any(String), label: expect.any(String) })]))
    }
    expect(correctedTaxonomies.lead_source).toEqual([{ code: 'referral', label: 'Referral', behavior: { requiresReferrer: true } }])
    expect(snapshots.snapshots.find(snapshot => snapshot.id === 'acceptance-old')).toEqual(outdatedAcceptanceSnapshot)
    expect(canonicalSnapshot).toEqual(canonicalBefore)

    await expect(snapshotFixture.ensureAcceptanceSnapshot!(snapshots.client)).resolves.toEqual({ id: 'snapshot-1', version: 4 })
    expect(snapshots.inserts).toHaveLength(1)
  })

  it('reconciles exactly the B4 base employee role and one active assignment per real B4 actor', async () => {
    const roleClient = createB4EmployeeRoleClient()
    const actors = {
      reader: { userId: 'reader' },
      operator: { userId: 'operator' },
      decision: { userId: 'decision' },
    }

    await ensureB4EmployeeDirectoryRole(roleClient.client, actors)
    const employeeRole = roleClient.rows.roles.find(role => role.code === 'employee')
    expect(employeeRole).toMatchObject(b4Row({
      id: 'b4000000-0000-4000-8000-000000000304', code: 'employee', name: 'Nhân viên',
      description: 'Company directory and assigned-work access', is_privileged: false, is_system: true, is_active: true,
    }))
    expect(roleClient.rows.role_permissions
      .filter(permission => permission.role_id === employeeRole?.id)
      .map(permission => permission.permission_code).sort()).toEqual([
      'employee.read_directory', 'employee.read_self_private', 'project.read', 'task.read_assigned', 'task.update_assigned',
    ])
    const activeAssignments = roleClient.rows.company_role_assignments.filter(assignment => (
      assignment.role_id === employeeRole?.id && assignment.revoked_at === null
    ))
    expect(activeAssignments.map(assignment => assignment.user_id).sort()).toEqual(['decision', 'operator', 'reader'])
    expect(activeAssignments.filter(assignment => assignment.user_id === 'foreign')).toHaveLength(0)

    await ensureB4EmployeeDirectoryRole(roleClient.client, actors)
    expect(roleClient.rows.company_role_assignments.filter(assignment => (
      assignment.role_id === employeeRole?.id && assignment.revoked_at === null
    ))).toHaveLength(3)
  })

  it('keeps its fixed isolated identity, secret-state boundary, and real-browser contract', () => {
    const fixture = read('scripts/stage01-b4-acceptance-fixture.mjs')
    const state = read('tests/acceptance/stage01-cloud-dev/acceptance-state.ts')
    const setup = read('tests/acceptance/stage01-cloud-dev/global-setup.ts')
    const teardown = read('tests/acceptance/stage01-cloud-dev/global-teardown.ts')
    const config = read('playwright.b4.config.ts')
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

    expect(fixture).toContain("'taskovia-b4-acceptance'")
    expect(fixture).toContain("'VQH_STAGE01_ACCEPTANCE'")
    expect(fixture).toContain("'b4000000-0000-4000-8000-000000000010'")
    expect(fixture).toContain("'b4000000-0000-4000-8000-000000000020'")
    expect(fixture).toContain('assertCloudDevTarget({ cwd })')
    expect(fixture).toContain('randomBytes')
    expect(state).toContain('acceptance-state.json')
    expect(state).toContain('acceptance-evidence.json')
    expect(setup).toContain('0o600')
    expect(teardown).toContain('dependencies.finalize')
    expect(config).toContain('4327')
    expect(config).toContain("testDir: './tests/acceptance/stage01-cloud-dev'")
    expect(config).toContain('timeout: 120_000')
    expect(config).toContain('pnpm dev --host 127.0.0.1 --port 4327')
    expect(packageJson.scripts['test:b4:cloud-dev']).toBe('playwright test --config=playwright.b4.config.ts')
  })

  it('forbids business-route replacement in full-stack acceptance specs', () => {
    const fullStackSpecs = [
      'tests/acceptance/stage01-cloud-dev/stage01-fullstack.spec.ts',
      'tests/acceptance/stage01-cloud-dev/stage01-performance.spec.ts',
    ].filter(path => existsSync(resolve(root, path)))

    for (const path of fullStackSpecs) {
      const source = read(path)
      expect(source).not.toContain('page.route(')
      expect(source).not.toContain('context.route(')
      expect(source).not.toContain('route.fulfill(')
    }
  })

  it('awaits a B4 query-builder response before returning its data', async () => {
    let awaited = false
    const queryBuilder = {
      then(resolve: (value: { data: { id: string }, error: null }) => void) {
        awaited = true
        resolve({ data: { id: 'canonical-role' }, error: null })
      },
    }
    const fixtureWithMust = fixture as typeof fixture & {
      must: (result: typeof queryBuilder, operation: string) => Promise<{ id: string }>
    }

    await expect(fixtureWithMust.must(queryBuilder, 'canonical role read')).resolves.toEqual({ id: 'canonical-role' })
    expect(awaited).toBe(true)
  })

  it('orders historical B4 evaluation executions after their explicit creation timestamps', () => {
    const fixtureWithExecutionPayload = fixture as typeof fixture & {
      buildB4EvaluationExecution: (input: { cycleNo: number, cycles: number, nodeInstanceId: string, actorId: string }) => {
        created_at: string
        superseded_at: string | null
      }
    }
    for (const cycles of [5, 20]) {
      const executions = Array.from({ length: cycles }, (_, index) => fixtureWithExecutionPayload.buildB4EvaluationExecution({
        cycleNo: index + 1, cycles, nodeInstanceId: 'evaluation-node', actorId: 'b4-operator',
      }))

      for (const execution of executions.slice(0, -1)) {
        expect(execution.superseded_at).not.toBeNull()
        expect(Date.parse(execution.superseded_at!)).toBeGreaterThanOrEqual(Date.parse(execution.created_at))
      }
      expect(executions.at(-1)?.superseded_at).toBeNull()
      expect(Date.parse(executions[0]!.superseded_at!)).toBeLessThan(Date.parse(executions[1]!.created_at))
    }
  })

  it('finalizes credentials before deleting secret state when canonical cleanliness fails', async () => {
    const calls: string[] = []
    const canonicalFailure = new Error('canonical marker')
    const teardown = createGlobalTeardown({
      cwd: () => root,
      readAuthoritativeMetadata: async () => ({ runMarker: 'b4-stage01-0f822dd1-8896-44cc-8e8f-a59cebe87df7' }),
      assertCanonical: async () => { calls.push('canonical'); throw canonicalFailure },
      finalizeFixedActors: async () => { calls.push('finalize') },
      removeSecretState: async () => { calls.push('remove') },
    })

    await expect(teardown()).rejects.toBe(canonicalFailure)
    expect(calls).toEqual(['canonical', 'finalize', 'remove'])
  })

  it('recovers fixed B4 credentials and removes unreadable secret state without reading it', async () => {
    const calls: string[] = []
    const teardown = createGlobalTeardown({
      cwd: () => root,
      readAuthoritativeMetadata: async () => { calls.push('metadata'); return { runMarker: 'b4-stage01-0f822dd1-8896-44cc-8e8f-a59cebe87df7' } },
      assertCanonical: async ({ runMarker }) => { calls.push(`canonical:${runMarker}`) },
      finalizeFixedActors: async () => { calls.push('recover-fixed-identities') },
      removeSecretState: async () => { calls.push('remove') },
    })

    await teardown()
    expect(calls).toEqual(['metadata', 'canonical:b4-stage01-0f822dd1-8896-44cc-8e8f-a59cebe87df7', 'recover-fixed-identities', 'remove'])
  })

  it('uses only the authoritative server marker when parseable local artifacts are tampered', async () => {
    const calls: string[] = []
    const tamperedState = {
      ...state,
      runMarker: 'b4-stage01-tampered',
      actors: { ...state.actors, reader: { ...state.actors.reader, userId: 'arbitrary-auth-user' } },
    }
    const cwd = await mkdtemp(resolve(tmpdir(), 'taskovia-b4-teardown-'))
    try {
      await mkdir(resolve(cwd, B4_RESULTS_DIRECTORY), { recursive: true })
      await writeFile(resolve(cwd, B4_SECRET_STATE_PATH), JSON.stringify(tamperedState), 'utf8')
      await writeFile(resolve(cwd, B4_RESULTS_DIRECTORY, 'acceptance-evidence.json'), JSON.stringify({
        runMarker: 'b4-stage01-tampered-evidence', tenantId: 'not-b4', companyId: 'not-b4',
      }), 'utf8')
      const teardown = createGlobalTeardown({
        cwd: () => cwd,
        readAuthoritativeMetadata: async () => { calls.push('metadata'); return { runMarker: 'b4-stage01-server-authoritative' } },
        assertCanonical: async ({ runMarker }) => { calls.push(`canonical:${runMarker}`) },
        finalizeFixedActors: async () => { calls.push('finalize-fixed-identities') },
      })

      await teardown()
      expect(calls).toEqual(['metadata', 'canonical:b4-stage01-server-authoritative', 'finalize-fixed-identities'])
      expect(existsSync(resolve(cwd, B4_SECRET_STATE_PATH))).toBe(false)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('continues credential deactivation for safe fixed actors when one identity fails B4-only proof', async () => {
    const finalized: string[] = []
    const actors = selectFixedB4ActorCandidates([
      { id: 'safe-reader', email: 'b4-stage01-reader@taskovia.invalid' },
      { id: 'unsafe-operator', email: 'b4-stage01-operator@taskovia.invalid' },
      { id: 'safe-decision', email: 'b4-stage01-decision@taskovia.invalid' },
    ])
    await expect(deactivateProvenB4Actors({
      actors,
      proveB4Only: async actor => {
        if (actor.kind === 'operator') throw new Error('operator has non-B4 membership')
      },
      deactivate: async actor => { finalized.push(`${actor.kind}:${actor.userId}`) },
    })).rejects.toThrow('B4 acceptance recovery failed')
    expect(finalized).toEqual(['reader:safe-reader', 'decision:safe-decision'])
  })

  it('finalizes and removes partial secret state when setup persistence fails', async () => {
    const calls: string[] = []
    const writeFailure = new Error('secret state write failed')
    const setup = createGlobalSetup({
      cwd: () => root,
      bootstrap: async () => state,
      makeResultsDirectory: async () => { calls.push('mkdir') },
      writeSecretState: async () => { calls.push('write-secret'); throw writeFailure },
      chmodSecretState: async () => { calls.push('chmod') },
      writeEvidence: async () => { calls.push('write-evidence') },
      finalize: async () => { calls.push('finalize') },
      removeSecretState: async () => { calls.push('remove') },
    })

    await expect(setup()).rejects.toBe(writeFailure)
    expect(calls).toEqual(['mkdir', 'write-secret', 'finalize', 'remove'])
  })

  it('removes a written secret-state file with the default setup cleanup dependency', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'taskovia-b4-setup-'))
    const statePath = resolve(cwd, B4_SECRET_STATE_PATH)
    const chmodFailure = new Error('chmod failed')
    try {
      const setup = createGlobalSetup({
        cwd: () => cwd,
        bootstrap: async () => state,
        makeResultsDirectory: async directory => { await mkdir(resolve(directory, B4_RESULTS_DIRECTORY), { recursive: true }) },
        writeSecretState: async () => { await writeFile(statePath, 'secret-state', 'utf8') },
        chmodSecretState: async () => { throw chmodFailure },
        writeEvidence: async () => { throw new Error('evidence must not be written') },
        finalize: async () => {},
      })

      await expect(setup()).rejects.toBe(chmodFailure)
      await expect(access(statePath)).rejects.toThrow()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('rejects a reused actor with a canonical membership before credential rotation', () => {
    expect(() => assertB4ActorBoundary({
      memberships: [{ tenant_id: '10000000-0000-4000-8000-000000000010', company_id: '10000000-0000-4000-8000-000000000020' }],
      assignments: [],
    })).toThrow('B4 acceptance actor identity is already scoped outside B4')
  })

  it('reuses only a profile with its required source marker and P3 graph cardinalities', () => {
    const profile = {
      opportunity: { id: 'p3', primary_customer_name: 'B4 P3 performance profile [8e1abc74]', need_description: 'Retained B4 P3 profile anchored to 8e1abc74' },
      workflow: { subject_id: 'p3', definition_snapshot_id: 'snapshot' },
      nodes: [{ id: 'intake', node_key: '01.1' }, { id: 'evaluation', node_key: '01.2' }],
      executions: [{ id: 'intake-execution', node_instance_id: 'intake' }, ...Array.from({ length: 20 }, (_, index) => ({ id: `evaluation-${index + 1}`, node_instance_id: 'evaluation' }))],
      cycles: Array.from({ length: 20 }, (_, index) => ({ id: `cycle-${index + 1}`, node_execution_id: `evaluation-${index + 1}` })),
      evaluations: Array.from({ length: 20 }, (_, cycle) => Array.from({ length: 6 }, (_, index) => ({ decision_cycle_id: `cycle-${cycle + 1}`, revision: index === 5 ? 2 : 1 }))).flat(),
      recommendations: Array.from({ length: 20 }, (_, cycle) => [{ decision_cycle_id: `cycle-${cycle + 1}`, version: 1 }, { decision_cycle_id: `cycle-${cycle + 1}`, version: 2 }]).flat(),
      clarifications: Array.from({ length: 20 }, (_, index) => ({ decision_cycle_id: `cycle-${index + 1}` })),
      contacts: Array.from({ length: 20 }, (_, index) => ({ contact_id: `contact-${index + 1}` })),
    }

    expect(assertRetainedProfileShape({ key: 'P3', snapshotId: 'snapshot', profile })).toBe('p3')
    expect(assertRetainedProfileShape({
      key: 'P3', snapshotId: 'snapshot', profile: {
        ...profile,
        opportunity: { ...profile.opportunity, need_description: 'Retained B4 P3 profile anchored to 8e1abc74; earlier accepted fixture metadata' },
      },
    })).toBe('p3')
    expect(() => assertRetainedProfileShape({ key: 'P3', snapshotId: 'snapshot', profile: { ...profile, contacts: profile.contacts.slice(0, 19) } })).toThrow('B4 acceptance P3 retained profile is invalid')
  })

  it('selects only the fixed P2 revision 2 identity and preserves the P1/P3 locators', () => {
    expect(retainedProfileIdentity('P1')).toEqual({
      opportunityName: 'B4 P1 performance profile [8e1abc74]',
      opportunityDescription: 'Retained B4 P1 profile anchored to 8e1abc74',
    })
    expect(retainedProfileIdentity('P2')).toEqual({
      opportunityName: 'B4 P2 performance profile [8e1abc74] [fixture-r2]',
      opportunityDescription: 'Retained B4 P2 profile anchored to 8e1abc74; fixture revision 2; legacy locator B4 P2 performance profile [8e1abc74]; chronology recovery',
    })
    expect(retainedProfileIdentity('P3')).toEqual({
      opportunityName: 'B4 P3 performance profile [8e1abc74]',
      opportunityDescription: 'Retained B4 P3 profile anchored to 8e1abc74',
    })
  })

  it('uses a snapshot-versioned replacement profile without rebinding a retained profile', () => {
    expect(retainedProfileIdentity('P1', 17)).toEqual({
      opportunityName: 'B4 P1 performance profile [8e1abc74] [snapshot-v17]',
      opportunityDescription: 'Replacement B4 P1 profile anchored to 8e1abc74; acceptance snapshot version 17',
    })
    expect(selectRetainedProfileAction({
      key: 'P1',
      snapshotVersion: 17,
      existing: { id: 'retained-p1', primary_customer_name: 'B4 P1 performance profile [8e1abc74]' },
    })).toEqual({
      kind: 'create',
      identity: retainedProfileIdentity('P1', 17),
    })
  })

  it('creates only P2-r2 when the legacy P2 is not the selected locator', () => {
    expect(selectRetainedProfileAction({ key: 'P2', existing: null })).toEqual({
      kind: 'create',
      identity: {
        opportunityName: 'B4 P2 performance profile [8e1abc74] [fixture-r2]',
        opportunityDescription: 'Retained B4 P2 profile anchored to 8e1abc74; fixture revision 2; legacy locator B4 P2 performance profile [8e1abc74]; chronology recovery',
      },
    })

    expect(() => selectRetainedProfileAction({
      key: 'P2',
      existing: { id: 'legacy-p2', primary_customer_name: 'B4 P2 performance profile [8e1abc74]' },
    })).toThrow('B4 acceptance P2 retained profile selector conflict')
  })

  it('reuses a complete P2-r2 and rejects an invalid P2-r2 without creating a later revision', () => {
    const profile = completeP2Profile()

    expect(assertRetainedProfileShape({ key: 'P2', snapshotId: 'snapshot', profile })).toBe('p2-r2')
    expect(selectRetainedProfileAction({ key: 'P2', existing: profile.opportunity })).toEqual({
      kind: 'reuse',
      identity: {
        opportunityName: 'B4 P2 performance profile [8e1abc74] [fixture-r2]',
        opportunityDescription: 'Retained B4 P2 profile anchored to 8e1abc74; fixture revision 2; legacy locator B4 P2 performance profile [8e1abc74]; chronology recovery',
      },
      opportunity: profile.opportunity,
    })
    expect(() => assertRetainedProfileShape({
      key: 'P2',
      snapshotId: 'snapshot',
      profile: { ...profile, contacts: profile.contacts.slice(0, 9) },
    })).toThrow('B4 acceptance P2 retained profile is invalid')
  })

  it('creates P2-r2 through the fixture path without mutating a partial legacy P2', async () => {
    const legacy = b4Row({
      id: 'legacy-p2',
      primary_customer_name: 'B4 P2 performance profile [8e1abc74]',
      need_description: 'Retained B4 P2 profile anchored to 8e1abc74',
    })
    const profileClient = createProfileClient({ opportunities: [legacy] })

    const opportunityId = await ensureProfile(profileClient.client, {
      key: 'P2', cycles: 5, contacts: 10, snapshotId: 'snapshot', actorId: 'operator',
    })

    const created = profileClient.rows.opportunities.find(opportunity => opportunity.primary_customer_name === 'B4 P2 performance profile [8e1abc74] [fixture-r2]')
    expect(opportunityId).toBe(created?.id)
    expect(profileClient.rows.opportunities.find(opportunity => opportunity.id === 'legacy-p2')).toEqual(legacy)
    expect(profileClient.inserts.filter(insert => insert.table === 'opportunities').map(insert => insert.value.primary_customer_name)).toEqual([
      'B4 P2 performance profile [8e1abc74] [fixture-r2]',
    ])
    expect(profileClient.rows.opportunities.some(opportunity => String(opportunity.primary_customer_name).includes('fixture-r3'))).toBe(false)
  })

  it('reuses a complete P2-r2 without profile inserts and fails closed for an invalid P2-r2', async () => {
    const validClient = createProfileClient(completeP2ProfileRows())
    await expect(ensureProfile(validClient.client, {
      key: 'P2', cycles: 5, contacts: 10, snapshotId: 'snapshot', actorId: 'operator',
    })).resolves.toBe('p2-r2')
    expect(validClient.inserts).toEqual([])

    const invalidClient = createProfileClient({ opportunities: [b4Row({
      id: 'p2-r2',
      primary_customer_name: 'B4 P2 performance profile [8e1abc74] [fixture-r2]',
      need_description: 'Retained B4 P2 profile anchored to 8e1abc74; fixture revision 2; legacy locator B4 P2 performance profile [8e1abc74]; chronology recovery',
    })] })
    await expect(ensureProfile(invalidClient.client, {
      key: 'P2', cycles: 5, contacts: 10, snapshotId: 'snapshot', actorId: 'operator',
    })).rejects.toThrow('B4 acceptance P2 retained profile is invalid')
    expect(invalidClient.inserts).toEqual([])
  })

  it('passes the snapshot version through the complete retained-profile lookup path', async () => {
    const snapshotVersion = 17
    const snapshotId = 'snapshot-v17'
    const versionedClient = createProfileClient(completeP2ProfileRows({ snapshotVersion, snapshotId }))

    await expect(ensureProfile(versionedClient.client, {
      key: 'P2', cycles: 5, contacts: 10, snapshotId, snapshotVersion, actorId: 'operator',
    })).resolves.toBe('p2-r2')
    expect(versionedClient.inserts).toEqual([])
  })
})
