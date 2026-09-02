import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'

export const B4_ACCEPTANCE_TENANT_CODE = 'taskovia-b4-acceptance'
export const B4_ACCEPTANCE_TENANT_ID = 'b4000000-0000-4000-8000-000000000010'
export const B4_ACCEPTANCE_COMPANY_CODE = 'VQH_STAGE01_ACCEPTANCE'
export const B4_ACCEPTANCE_COMPANY_ID = 'b4000000-0000-4000-8000-000000000020'

const CANONICAL_VQH_TENANT_ID = '10000000-0000-4000-8000-000000000010'
const CANONICAL_VQH_COMPANY_ID = '10000000-0000-4000-8000-000000000020'
const SOURCE_ANCHOR = '8e1abc74'
const B4_ACTOR_EMAILS = {
  reader: 'b4-stage01-reader@taskovia.invalid',
  operator: 'b4-stage01-operator@taskovia.invalid',
  decision: 'b4-stage01-decision@taskovia.invalid',
}
const B4_EMPLOYEE_IDS = {
  reader: 'b4000000-0000-4000-8000-000000000201',
  operator: 'b4000000-0000-4000-8000-000000000202',
  decision: 'b4000000-0000-4000-8000-000000000203',
}
const B4_ROLE_IDS = {
  reader: 'b4000000-0000-4000-8000-000000000301',
  operator: 'b4000000-0000-4000-8000-000000000302',
  companyAdmin: 'b4000000-0000-4000-8000-000000000303',
}
const B4_DEPARTMENT_ID = 'b4000000-0000-4000-8000-000000000401'
const profileName = name => `B4 ${name} performance profile [${SOURCE_ANCHOR}]`

function requiredEnv(env, name) {
  const matches = env.split(/\r?\n/).filter(line => line.startsWith(`${name}=`))
  if (matches.length !== 1) throw new Error(`${name} must be assigned exactly once for B4 acceptance`)
  const value = matches[0].slice(name.length + 1).trim()
  if (!value) throw new Error(`${name} is missing for B4 acceptance`)
  return value
}

async function loadB4Environment(cwd) {
  const env = await readFile(resolve(cwd, '.env.local'), 'utf8')
  return {
    url: requiredEnv(env, 'NUXT_PUBLIC_SUPABASE_URL'),
    anonKey: requiredEnv(env, 'NUXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: requiredEnv(env, 'NUXT_SUPABASE_SERVICE_ROLE_KEY'),
  }
}

function adminClient(environment) {
  return createClient(environment.url, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function must(result, operation) {
  if (result.error) throw new Error(`B4 acceptance ${operation} failed`)
  return result.data
}

function perRunPassword() {
  return `B4-${randomBytes(32).toString('base64url')}!a1`
}

export function assertB4ActorBoundary({ tenantMemberships = [], memberships = [], assignments = [] }) {
  const belongsToB4Tenant = membership => membership.tenant_id === B4_ACCEPTANCE_TENANT_ID
  const belongsToB4Company = membership => (
    membership.tenant_id === B4_ACCEPTANCE_TENANT_ID
    && membership.company_id === B4_ACCEPTANCE_COMPANY_ID
  )
  if (!tenantMemberships.every(belongsToB4Tenant) || !memberships.every(belongsToB4Company) || !assignments.every(belongsToB4Company)) {
    throw new Error('B4 acceptance actor identity is already scoped outside B4')
  }
}

async function assertExistingActorBoundary(client, userId) {
  const [tenantMemberships, memberships, assignments] = await Promise.all([
    must(client.from('tenant_memberships').select('tenant_id').eq('user_id', userId), 'actor tenant boundary read'),
    must(client.from('company_memberships').select('tenant_id, company_id').eq('user_id', userId), 'actor company boundary read'),
    must(client.from('company_role_assignments').select('tenant_id, company_id').eq('user_id', userId).is('revoked_at', null), 'actor role boundary read'),
  ])
  assertB4ActorBoundary({ tenantMemberships, memberships, assignments })
}

async function ensureExactTenantAndCompany(client) {
  const tenantById = await must(client.from('tenants').select('id, code').eq('id', B4_ACCEPTANCE_TENANT_ID).maybeSingle(), 'tenant read')
  const tenantByCode = await must(client.from('tenants').select('id, code').eq('code', B4_ACCEPTANCE_TENANT_CODE).maybeSingle(), 'tenant code read')
  if ((tenantById && tenantById.code !== B4_ACCEPTANCE_TENANT_CODE) || (tenantByCode && tenantByCode.id !== B4_ACCEPTANCE_TENANT_ID)) {
    throw new Error('B4 acceptance tenant identity conflicts with an existing tenant')
  }
  if (!tenantById) {
    await must(client.from('tenants').insert({ id: B4_ACCEPTANCE_TENANT_ID, code: B4_ACCEPTANCE_TENANT_CODE, name: 'Taskovia B4 Acceptance', deployment_mode: 'shared' }), 'tenant bootstrap')
  }

  const companyById = await must(client.from('companies').select('id, tenant_id, code').eq('id', B4_ACCEPTANCE_COMPANY_ID).maybeSingle(), 'company read')
  const companyByCode = await must(client.from('companies').select('id, tenant_id, code').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID).eq('code', B4_ACCEPTANCE_COMPANY_CODE).maybeSingle(), 'company code read')
  if (
    (companyById && (companyById.tenant_id !== B4_ACCEPTANCE_TENANT_ID || companyById.code !== B4_ACCEPTANCE_COMPANY_CODE))
    || (companyByCode && companyByCode.id !== B4_ACCEPTANCE_COMPANY_ID)
  ) throw new Error('B4 acceptance company identity conflicts with an existing company')
  if (!companyById) {
    await must(client.from('companies').insert({ id: B4_ACCEPTANCE_COMPANY_ID, tenant_id: B4_ACCEPTANCE_TENANT_ID, code: B4_ACCEPTANCE_COMPANY_CODE, name: 'VQH Stage 01 Acceptance' }), 'company bootstrap')
  }
}

async function findOrCreateActor(client, kind) {
  const email = B4_ACTOR_EMAILS[kind]
  const password = perRunPassword()
  let page = 1
  let actor
  do {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (result.error) throw new Error('B4 acceptance actor lookup failed')
    actor = result.data.users.find(user => user.email?.toLowerCase() === email)
    if (actor || result.data.users.length < 1000) break
    page += 1
  } while (!actor)

  if (actor) {
    await assertExistingActorBoundary(client, actor.id)
    const updated = await client.auth.admin.updateUserById(actor.id, { password, ban_duration: 'none', email_confirm: true })
    if (updated.error) throw new Error('B4 acceptance actor rotation failed')
    actor = updated.data.user
  } else {
    const created = await client.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error || !created.data.user) throw new Error('B4 acceptance actor bootstrap failed')
    actor = created.data.user
  }
  return { userId: actor.id, employeeId: B4_EMPLOYEE_IDS[kind], email, password }
}

async function ensureActorAccess(client, actors) {
  await must(client.from('departments').upsert({ id: B4_DEPARTMENT_ID, tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, code: 'B4', name: 'B4 Acceptance' }, { onConflict: 'id' }), 'acceptance department')
  for (const [kind, actor] of Object.entries(actors)) {
    await must(client.from('tenant_memberships').upsert({ user_id: actor.userId, tenant_id: B4_ACCEPTANCE_TENANT_ID, roles: ['b4_acceptance'] }, { onConflict: 'user_id,tenant_id' }), 'tenant membership')
    await must(client.from('company_memberships').upsert({ user_id: actor.userId, tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, roles: ['employee'], is_active: true }, { onConflict: 'tenant_id,company_id,user_id' }), 'company membership')
    await must(client.from('employees').upsert({
      id: actor.employeeId, tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID,
      user_id: actor.userId, employee_code: `B4-${kind.toUpperCase()}`, full_name: `B4 ${kind}`,
      work_email: actor.email, department_id: B4_DEPARTMENT_ID, employment_status: 'active', created_by: actor.userId,
    }, { onConflict: 'id' }), 'acceptance employee')
  }
}

const READER_PERMISSIONS = ['project.read', 'opportunity.read', 'journey.read']
const OPERATOR_PERMISSIONS = [
  'project.read', 'employee.read_directory', 'opportunity.read', 'opportunity.create', 'opportunity.update',
  'opportunity.contact.manage', 'opportunity.scope.manage', 'opportunity.referrer.manage', 'opportunity.intake_record.create',
  'opportunity.duplicate.raise', 'opportunity.duplicate.resolve', 'journey.read', 'journey.assignment.manage',
  'journey.node.start', 'journey.node.complete', 'journey.node.revalidate', 'journey.blocker.raise', 'journey.blocker.resolve',
  'stage01.evaluation.update', 'stage01.recommendation.submit', 'stage01.clarification.return',
]

async function ensureRole(client, role, permissions) {
  await must(client.from('roles').upsert({
    id: role.id, tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, code: role.code,
    name: role.name, description: role.description, is_privileged: role.isPrivileged, is_system: true, is_active: true,
  }, { onConflict: 'id' }), `role ${role.code}`)
  await must(client.from('role_permissions').delete().eq('role_id', role.id), `role permissions ${role.code}`)
  if (permissions.length) await must(client.from('role_permissions').upsert(permissions.map(permission_code => ({ role_id: role.id, permission_code })), { onConflict: 'role_id,permission_code' }), `role permission bootstrap ${role.code}`)
}

async function ensureRoles(client) {
  await ensureRole(client, { id: B4_ROLE_IDS.reader, code: 'b4_stage01_reader', name: 'B4 Stage 01 Reader', description: 'Read-only B4 acceptance actor', isPrivileged: false }, READER_PERMISSIONS)
  await ensureRole(client, { id: B4_ROLE_IDS.operator, code: 'b4_stage01_operator', name: 'B4 Stage 01 Operator', description: 'Operational B4 acceptance actor without decision authority', isPrivileged: false }, OPERATOR_PERMISSIONS)
  const canonicalRole = await must(client.from('roles').select('id').eq('tenant_id', CANONICAL_VQH_TENANT_ID).eq('company_id', CANONICAL_VQH_COMPANY_ID).eq('code', 'company_admin').maybeSingle(), 'canonical company admin read')
  if (!canonicalRole) throw new Error('B4 acceptance canonical company_admin role is missing')
  const permissions = await must(client.from('role_permissions').select('permission_code').eq('role_id', canonicalRole.id), 'canonical company admin permissions')
  if (permissions.length === 0) throw new Error('B4 acceptance canonical company_admin permissions are missing')
  await ensureRole(client, { id: B4_ROLE_IDS.companyAdmin, code: 'company_admin', name: 'B4 Company Administrator', description: 'Mirrors canonical company_admin permissions for acceptance decision authority', isPrivileged: true }, permissions.map(permission => permission.permission_code))
}

async function ensureAssignments(client, actors) {
  const assignments = [
    [actors.reader, B4_ROLE_IDS.reader], [actors.operator, B4_ROLE_IDS.operator], [actors.decision, B4_ROLE_IDS.companyAdmin],
  ]
  for (const [actor, roleId] of assignments) {
    const existing = await must(client.from('company_role_assignments').select('id').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
      .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('user_id', actor.userId).eq('role_id', roleId).is('revoked_at', null).maybeSingle(), 'role assignment read')
    if (!existing) {
      await must(client.from('company_role_assignments').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, user_id: actor.userId, role_id: roleId, granted_by: actor.userId, grant_reason: 'B4 acceptance bootstrap' }), 'role assignment')
    }
  }
}

async function ensureAcceptanceSnapshot(client) {
  const canonical = await must(client.from('workflow_definition_snapshots').select('definition_hash, definition, schema_version')
    .eq('tenant_id', CANONICAL_VQH_TENANT_ID).eq('company_id', CANONICAL_VQH_COMPANY_ID).eq('workflow_key', 'vqh.stage01')
    .order('template_version', { ascending: false }).limit(1).maybeSingle(), 'canonical Stage 01 snapshot read')
  if (!canonical) throw new Error('B4 acceptance canonical Stage 01 snapshot is missing')
  const existing = await must(client.from('workflow_definition_snapshots').select('id').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
    .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('workflow_key', 'vqh.stage01').eq('definition_hash', canonical.definition_hash).maybeSingle(), 'acceptance snapshot read')
  if (existing) return existing.id
  const latest = await must(client.from('workflow_definition_snapshots').select('template_version').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
    .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('workflow_key', 'vqh.stage01').order('template_version', { ascending: false }).limit(1).maybeSingle(), 'acceptance snapshot version read')
  const snapshot = await must(client.from('workflow_definition_snapshots').insert({
    tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, workflow_key: 'vqh.stage01',
    template_version: (latest?.template_version ?? 0) + 1, schema_version: canonical.schema_version,
    definition: canonical.definition, definition_hash: canonical.definition_hash,
  }).select('id').single(), 'acceptance snapshot append')
  return snapshot.id
}

const PROFILE_REQUIREMENTS = {
  P1: { cycles: 1, contacts: 2, revisions: false, repeatedRecommendations: false },
  P2: { cycles: 5, contacts: 10, revisions: true, repeatedRecommendations: false },
  P3: { cycles: 20, contacts: 20, revisions: true, repeatedRecommendations: true },
}

export function assertRetainedProfileShape({ key, snapshotId, profile }) {
  const requirement = PROFILE_REQUIREMENTS[key]
  const invalid = () => { throw new Error(`B4 acceptance ${key} retained profile is invalid`) }
  if (!requirement || !profile?.opportunity || !profile.workflow) invalid()
  if (
    profile.opportunity.primary_customer_name !== profileName(key)
    || !profile.opportunity.need_description?.includes(SOURCE_ANCHOR)
    || profile.workflow.subject_id !== profile.opportunity.id
    || profile.workflow.definition_snapshot_id !== snapshotId
  ) invalid()
  const intake = profile.nodes.filter(node => node.node_key === '01.1')
  const evaluation = profile.nodes.filter(node => node.node_key === '01.2')
  if (profile.nodes.length !== 2 || intake.length !== 1 || evaluation.length !== 1) invalid()
  const executionIds = new Set(profile.executions.map(execution => execution.id))
  const evaluationExecutionIds = new Set(profile.executions.filter(execution => execution.node_instance_id === evaluation[0].id).map(execution => execution.id))
  if (profile.cycles.length !== requirement.cycles || profile.cycles.some(cycle => !executionIds.has(cycle.node_execution_id) || !evaluationExecutionIds.has(cycle.node_execution_id))) invalid()
  const cycleIds = new Set(profile.cycles.map(cycle => cycle.id))
  if (cycleIds.size !== requirement.cycles || new Set(profile.contacts.map(contact => contact.contact_id)).size !== requirement.contacts) invalid()
  for (const cycleId of cycleIds) {
    const evaluations = profile.evaluations.filter(evaluation => evaluation.decision_cycle_id === cycleId)
    const recommendations = profile.recommendations.filter(recommendation => recommendation.decision_cycle_id === cycleId)
    const clarifications = profile.clarifications.filter(clarification => clarification.decision_cycle_id === cycleId)
    if (evaluations.length < 5 || recommendations.length < 1) invalid()
    if (requirement.revisions && !evaluations.some(evaluation => evaluation.revision >= 2)) invalid()
    if (requirement.repeatedRecommendations && (recommendations.length < 2 || clarifications.length < 1)) invalid()
  }
  return profile.opportunity.id
}

async function readRetainedProfile(client, { key, snapshotId, opportunity }) {
  const workflow = await must(client.from('workflow_instances').select('id, subject_id, definition_snapshot_id').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
    .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('subject_type', 'opportunity').eq('subject_id', opportunity.id).maybeSingle(), `${key} profile workflow read`)
  if (!workflow) return assertRetainedProfileShape({ key, snapshotId, profile: {} })
  const nodes = await must(client.from('workflow_node_instances').select('id, node_key').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
    .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('workflow_instance_id', workflow.id), `${key} profile node read`)
  const nodeIds = nodes.map(node => node.id)
  const executions = nodeIds.length === 0 ? [] : await must(client.from('workflow_node_executions').select('id, node_instance_id').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
    .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).in('node_instance_id', nodeIds), `${key} profile execution read`)
  const cycles = await must(client.from('stage01_decision_cycles').select('id, node_execution_id').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
    .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('opportunity_id', opportunity.id), `${key} profile cycle read`)
  const cycleIds = cycles.map(cycle => cycle.id)
  const profileRows = async (table, columns, operation) => cycleIds.length === 0 ? [] : must(client.from(table).select(columns)
    .eq('tenant_id', B4_ACCEPTANCE_TENANT_ID).eq('company_id', B4_ACCEPTANCE_COMPANY_ID).in('decision_cycle_id', cycleIds), operation)
  const [evaluations, recommendations, clarifications, contacts] = await Promise.all([
    profileRows('stage01_criterion_evaluations', 'decision_cycle_id, revision', `${key} profile evaluation read`),
    profileRows('stage01_recommendations', 'decision_cycle_id, version', `${key} profile recommendation read`),
    profileRows('stage01_clarification_returns', 'decision_cycle_id', `${key} profile clarification read`),
    must(client.from('opportunity_contacts').select('contact_id').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID).eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('opportunity_id', opportunity.id).is('ended_at', null), `${key} profile contact read`),
  ])
  return assertRetainedProfileShape({ key, snapshotId, profile: { opportunity, workflow, nodes, executions, cycles, evaluations, recommendations, clarifications, contacts } })
}

async function ensureProfile(client, { key, cycles, contacts, snapshotId, actorId }) {
  const existing = await must(client.from('opportunities').select('id, primary_customer_name, need_description').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
    .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('primary_customer_name', profileName(key)).maybeSingle(), `${key} profile read`)
  if (existing) return readRetainedProfile(client, { key, snapshotId, opportunity: existing })
  const opportunity = await must(client.from('opportunities').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, primary_customer_name: profileName(key), need_description: `Retained B4 ${key} profile anchored to ${SOURCE_ANCHOR}`, created_by: actorId }).select('id').single(), `${key} profile bootstrap`)
  const workflow = await must(client.from('workflow_instances').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, subject_type: 'opportunity', subject_id: opportunity.id, definition_snapshot_id: snapshotId, created_by: actorId }).select('id').single(), `${key} workflow bootstrap`)
  const intake = await must(client.from('workflow_node_instances').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, workflow_instance_id: workflow.id, node_key: '01.1', node_type: 'stage' }).select('id').single(), `${key} intake node bootstrap`)
  await must(client.from('workflow_node_executions').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, node_instance_id: intake.id, execution_no: 1, phase: 'completed', started_by: actorId, started_at: new Date().toISOString(), completed_by: actorId, completed_at: new Date().toISOString() }), `${key} intake execution bootstrap`)
  const evaluation = await must(client.from('workflow_node_instances').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, workflow_instance_id: workflow.id, node_key: '01.2', node_type: 'stage' }).select('id').single(), `${key} evaluation node bootstrap`)
  for (let cycleNo = 1; cycleNo <= cycles; cycleNo += 1) {
    const execution = await must(client.from('workflow_node_executions').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, node_instance_id: evaluation.id, execution_no: cycleNo, phase: 'active', started_by: actorId, started_at: new Date().toISOString(), superseded_at: cycleNo === cycles ? null : new Date().toISOString() }).select('id').single(), `${key} evaluation execution bootstrap`)
    const cycle = await must(client.from('stage01_decision_cycles').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, opportunity_id: opportunity.id, node_execution_id: execution.id, cycle_no: cycleNo, created_by: actorId }).select('id').single(), `${key} decision cycle bootstrap`)
    const evaluations = Array.from({ length: 5 }, (_, index) => ({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, decision_cycle_id: cycle.id, criterion_key: `b4_${key.toLowerCase()}_criterion_${index + 1}`, revision: 1, applicability: 'applicable', result: 'fit', rationale: 'B4 retained performance profile', evidence: [], evaluated_by: actorId }))
    await must(client.from('stage01_criterion_evaluations').insert(evaluations), `${key} criterion profile bootstrap`)
    if (key !== 'P1') {
      await must(client.from('stage01_criterion_evaluations').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, decision_cycle_id: cycle.id, criterion_key: `b4_${key.toLowerCase()}_criterion_1`, revision: 2, applicability: 'applicable', result: 'fit', rationale: 'B4 retained evaluation revision', evidence: [], evaluated_by: actorId }), `${key} criterion revision bootstrap`)
    }
    const recommendation = await must(client.from('stage01_recommendations').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, decision_cycle_id: cycle.id, version: 1, recommendation: 'recommend_proceed', rationale: 'B4 retained performance recommendation', evidence: [], submitted_by: actorId }).select('id').single(), `${key} recommendation bootstrap`)
    if (key === 'P3') {
      await must(client.from('stage01_clarification_returns').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, decision_cycle_id: cycle.id, recommendation_id: recommendation.id, reason: 'B4 retained repeated clarification profile', returned_by: actorId }), `${key} clarification bootstrap`)
      await must(client.from('stage01_recommendations').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, decision_cycle_id: cycle.id, version: 2, recommendation: 'recommend_proceed', rationale: 'B4 retained recommendation revision', evidence: [], submitted_by: actorId }), `${key} recommendation revision bootstrap`)
    }
  }
  for (let index = 1; index <= contacts; index += 1) {
    const contact = await must(client.from('contacts').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, display_name: `B4 ${key} Contact ${index}`, created_by: actorId }).select('id').single(), `${key} contact bootstrap`)
    await must(client.from('contact_methods').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, contact_id: contact.id, method_type: 'email', value: `b4-${key.toLowerCase()}-${index}@taskovia.invalid`, is_usable: true }), `${key} contact method bootstrap`)
    await must(client.from('opportunity_contacts').insert({ tenant_id: B4_ACCEPTANCE_TENANT_ID, company_id: B4_ACCEPTANCE_COMPANY_ID, opportunity_id: opportunity.id, contact_id: contact.id, relationship_code: 'decision_maker', is_primary: index === 1, created_by: actorId }), `${key} opportunity contact bootstrap`)
  }
  return opportunity.id
}

async function ensureRetainedProfiles(client, snapshotId, actorId) {
  return {
    p1OpportunityId: await ensureProfile(client, { key: 'P1', cycles: 1, contacts: 2, snapshotId, actorId }),
    p2OpportunityId: await ensureProfile(client, { key: 'P2', cycles: 5, contacts: 10, snapshotId, actorId }),
    p3OpportunityId: await ensureProfile(client, { key: 'P3', cycles: 20, contacts: 20, snapshotId, actorId }),
  }
}

async function deactivateActorCredentials(client, actors) {
  await Promise.all(Object.values(actors).map(async actor => {
    const result = await client.auth.admin.updateUserById(actor.userId, { password: perRunPassword(), ban_duration: '876000h' })
    if (result.error) throw new Error('B4 acceptance credential deactivation failed')
  }))
}

export async function deactivateProvenB4Actors({ actors, proveB4Only, deactivate }) {
  const failures = []
  for (const actor of actors) {
    try {
      await proveB4Only(actor)
    } catch (error) {
      failures.push(error)
      continue
    }
    try { await deactivate(actor) } catch (error) { failures.push(error) }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'B4 acceptance recovery failed')
}

export function selectFixedB4ActorCandidates(users) {
  return Object.entries(B4_ACTOR_EMAILS).map(([kind, email]) => {
    const matches = users.filter(user => user.email?.toLowerCase() === email)
    if (matches.length !== 1 || typeof matches[0].id !== 'string') {
      return { kind, email, userId: undefined, invalid: `B4 acceptance ${kind} fixed actor lookup is ambiguous or missing` }
    }
    return { kind, email, userId: matches[0].id }
  })
}

async function deactivateFixedB4Actors(client) {
  const emails = new Set(Object.values(B4_ACTOR_EMAILS))
  const fixedEmailUsers = []
  let page = 1
  while (true) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (result.error) throw new Error('B4 acceptance recovery actor lookup failed')
    for (const user of result.data.users) {
      if (user.email && emails.has(user.email.toLowerCase())) {
        fixedEmailUsers.push(user)
      }
    }
    if (result.data.users.length < 1000) break
    page += 1
  }
  const actors = selectFixedB4ActorCandidates(fixedEmailUsers)
  await deactivateProvenB4Actors({
    actors,
    proveB4Only: async actor => {
      if (!actor.userId) throw new Error(actor.invalid)
      await assertExistingActorBoundary(client, actor.userId)
    },
    deactivate: async actor => {
      if (!actor.userId) throw new Error(`B4 acceptance ${actor.kind} fixed actor is missing`)
      const result = await client.auth.admin.updateUserById(actor.userId, { password: perRunPassword(), ban_duration: '876000h' })
      if (result.error) throw new Error(`B4 acceptance ${actor.kind} credential deactivation failed`)
    },
  })
}

function assertAuthoritativeRunMarker(runMarker) {
  if (typeof runMarker !== 'string' || !/^b4-stage01-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runMarker)) {
    throw new Error('B4 acceptance authoritative run marker is invalid')
  }
}

async function recordB4RunMarker(client, { runMarker, actorId }) {
  assertAuthoritativeRunMarker(runMarker)
  await must(client.from('audit_events').insert({
    tenant_id: B4_ACCEPTANCE_TENANT_ID,
    company_id: B4_ACCEPTANCE_COMPANY_ID,
    actor_id: actorId,
    action: 'b4.acceptance.run_bootstrapped',
    resource_type: 'b4_acceptance_run',
    resource_id: runMarker,
    request_id: randomUUID(),
    after_summary: { sourceAnchor: SOURCE_ANCHOR },
  }), 'authoritative B4 run marker append')
}

async function readAuthoritativeB4RunMarker(client) {
  const row = await must(client.from('audit_events').select('resource_id').eq('tenant_id', B4_ACCEPTANCE_TENANT_ID)
    .eq('company_id', B4_ACCEPTANCE_COMPANY_ID).eq('action', 'b4.acceptance.run_bootstrapped')
    .eq('resource_type', 'b4_acceptance_run').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(), 'authoritative B4 run marker read')
  if (!row) throw new Error('B4 acceptance authoritative run marker is missing')
  assertAuthoritativeRunMarker(row.resource_id)
  return { runMarker: row.resource_id }
}

export async function finalizeB4Acceptance({ cwd = process.cwd(), state }) {
  assertCloudDevTarget({ cwd })
  const client = adminClient(await loadB4Environment(cwd))
  await deactivateActorCredentials(client, state.actors)
}

export async function finalizeB4AcceptanceRecovery({ cwd = process.cwd() } = {}) {
  assertCloudDevTarget({ cwd })
  const client = adminClient(await loadB4Environment(cwd))
  await deactivateFixedB4Actors(client)
}

export async function readB4AuthoritativeCleanupMetadata({ cwd = process.cwd() } = {}) {
  assertCloudDevTarget({ cwd })
  const client = adminClient(await loadB4Environment(cwd))
  return readAuthoritativeB4RunMarker(client)
}

export async function assertCanonicalVqhHasNoRunMarker({ cwd = process.cwd(), runMarker }) {
  assertCloudDevTarget({ cwd })
  const client = adminClient(await loadB4Environment(cwd))
  const rows = await must(client.from('opportunities').select('id').eq('tenant_id', CANONICAL_VQH_TENANT_ID).eq('company_id', CANONICAL_VQH_COMPANY_ID).ilike('need_description', `%${runMarker}%`).limit(1), 'canonical VQH marker check')
  if (rows.length > 0) throw new Error('B4 acceptance run marker exists in canonical VQH business data')
}

export async function bootstrapB4Acceptance({ cwd = process.cwd() } = {}) {
  assertCloudDevTarget({ cwd })
  const environment = await loadB4Environment(cwd)
  const client = adminClient(environment)
  const runMarker = `b4-stage01-${randomUUID()}`
  const actors = {}
  try {
    await ensureExactTenantAndCompany(client)
    actors.reader = await findOrCreateActor(client, 'reader')
    actors.operator = await findOrCreateActor(client, 'operator')
    actors.decision = await findOrCreateActor(client, 'decision')
    await ensureActorAccess(client, actors)
    await ensureRoles(client)
    await ensureAssignments(client, actors)
    const acceptanceSnapshotId = await ensureAcceptanceSnapshot(client)
    const profiles = await ensureRetainedProfiles(client, acceptanceSnapshotId, actors.operator.userId)
    await recordB4RunMarker(client, { runMarker, actorId: actors.decision.userId })
    return { runMarker, tenantId: B4_ACCEPTANCE_TENANT_ID, companyId: B4_ACCEPTANCE_COMPANY_ID, companyCode: B4_ACCEPTANCE_COMPANY_CODE, acceptanceSnapshotId, actors, profiles }
  } catch (error) {
    if (Object.keys(actors).length > 0) await deactivateActorCredentials(client, actors)
    throw error
  } finally {
    environment.serviceRoleKey = undefined
  }
}
