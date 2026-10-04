import { describe, expect, it, vi } from 'vitest'
import { createManualEmployeeInvitationService } from '../../../server/features/employees/manual-invitation.service'
import { createSupabaseManualInvitationAuth } from '../../../server/features/employees/manual-invitation-auth'
const actorId = '10000000-0000-4000-8000-000000000001'
const userId = '10000000-0000-4000-8000-000000000002'
const companyId = '10000000-0000-4000-8000-000000000020'
const tenantId = '10000000-0000-4000-8000-000000000010'
const departmentId = '10000000-0000-4000-8000-000000000201'
const context = { actorId, companyId, tenantId, permissions: ['account.invite', 'employee.create'] as never }
const input = { employeeCode: 'PILOT-1', fullName: 'Pilot user', workEmail: 'pilot@example.test', departmentId }
const employee = { id: '10000000-0000-4000-8000-000000000101', employeeCode: input.employeeCode, fullName: input.fullName, workEmail: input.workEmail, department: { id: departmentId, code: 'HR', name: 'HR' }, position: null, hireDate: null, probationEndDate: null, employmentStatus: 'active', profileComplete: false, account: { userId, email: input.workEmail }, roles: [{ id: '10000000-0000-4000-8000-000000000301', code: 'employee', name: 'Employee', description: 'Employee', isPrivileged: false, isSystem: true }] }
function setup(state = 'new') {
 const complete = vi.fn().mockResolvedValue(employee)
 const findInvitationEmployee = vi.fn().mockResolvedValue(invitationProfile)
 const auth = { assertPending: vi.fn().mockResolvedValue(undefined), inspect: vi.fn().mockResolvedValue(state === 'new' ? { kind: 'new' } : { kind: state }), generate: vi.fn().mockResolvedValue({ userId, tokenHash: 'synthetic-invite-token' }) }
 return { complete, findInvitationEmployee, auth, service: createManualEmployeeInvitationService({ completeEmployeeOnboarding: complete, findInvitationEmployee } as never, auth as never, 'https://pilot.taskovia.test') }
}
describe('manual employee invitation', () => {
 it('requires both HR permissions before Auth inspection', async () => {
  const { service, auth, complete } = setup()
  for (const permissions of [[], ['employee.create'], ['account.invite']]) await expect(service.prepare({ ...context, permissions: permissions as never }, input)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  expect(auth.inspect).not.toHaveBeenCalled(); expect(auth.generate).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled()
 })
 it('releases a prepared invite email only after onboarding', async () => {
  const { service, complete } = setup()
  const result = await service.prepare(context, input)
  expect(complete).toHaveBeenCalledWith(companyId, userId, input)
  expect(result).toMatchObject({ status: 'prepared', recipient: input.workEmail, subject: expect.any(String), body: expect.stringContaining('https://pilot.taskovia.test/auth/callback?token_hash=synthetic-invite-token&type=invite') })
  expect(JSON.stringify(result)).not.toContain('type=recovery')
 })
 it.each(['active', 'foreign', 'failed'])('denies ineligible existing identities: %s', async state => {
  const { service, auth, complete } = setup(state)
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: state === 'failed' ? 'ACCOUNT_INVITE_FAILED' : 'EMPLOYEE_EMAIL_CONFLICT' })
  expect(auth.generate).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled()
 })
 it('does not reactivate terminated staff or rotate links for mismatched codes or emails', async () => {
  for (const record of [{ ...invitationProfile, employmentStatus: 'terminated' }, { ...invitationProfile, employeeCode: 'OTHER' }, { ...invitationProfile, workEmail: 'other@example.test' }]) {
   const { service, findInvitationEmployee, auth, complete } = setup()
   auth.inspect.mockResolvedValue({ kind: 'pending', userId } as never)
   findInvitationEmployee.mockResolvedValue(record as never)
   await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'EMPLOYEE_EMAIL_CONFLICT' })
   expect(auth.generate).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled()
  }
 })
 it('returns no link if target activates while onboarding is running', async () => {
  const { service, auth } = setup()
  auth.assertPending.mockRejectedValue(new Error('activated'))
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'ACCOUNT_INVITE_FAILED' })
 })
 it('returns no credential when onboarding fails', async () => {
  const { service, complete } = setup()
  complete.mockRejectedValue(new Error('private database error'))
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' })
 })
 it('rejects mismatched onboarding identity', async () => {
  const { service, complete } = setup()
  complete.mockResolvedValue({ ...employee, account: { userId: actorId, email: input.workEmail } })
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' })
 })
})
const pending = { id: userId, email: input.workEmail, email_confirmed_at: null, confirmed_at: null, last_sign_in_at: null, invited_at: '2026-10-03T00:00:00Z', app_metadata: { taskovia_manual_invitation: { tenantId, companyId } } }
function admin(users: unknown[] = []) {
 return { auth: { admin: { createUser: vi.fn().mockResolvedValue({ data: { user: { ...pending, invited_at: null } }, error: null }), listUsers: vi.fn().mockResolvedValue({ data: { users }, error: null }), getUserById: vi.fn().mockResolvedValue({ data: { user: pending }, error: null }), generateLink: vi.fn().mockResolvedValue({ data: { user: pending, properties: { hashed_token: 'synthetic-invite-token', verification_type: 'invite' } }, error: null }), updateUserById: vi.fn().mockResolvedValue({ data: { user: pending }, error: null }), inviteUserByEmail: vi.fn() } } }
}
describe('manual invite Auth adapter', () => {
 it('blocks confirmed and foreign pending accounts', async () => {
  for(const user of [{ ...pending, email_confirmed_at: '2026-10-03T00:00:00Z' }, { ...pending, app_metadata: {} }]) {
   const client = admin([user]); const auth = createSupabaseManualInvitationAuth(client as never)
   expect((await auth.inspect(input.workEmail, context)).kind).toBe(user.email_confirmed_at ? 'active' : 'foreign')
   expect(client.auth.admin.generateLink).not.toHaveBeenCalled()
  }
 })
 it('accepts pending ownership only from matching server metadata', async () => {
  const auth = createSupabaseManualInvitationAuth(admin([pending]) as never)
  expect(await auth.inspect(input.workEmail, context)).toEqual({ kind: 'pending', userId })
  expect((await auth.inspect(input.workEmail, { ...context, companyId: actorId })).kind).toBe('foreign')
  expect((await auth.inspect(input.workEmail, { ...context, tenantId: actorId })).kind).toBe('foreign')
 })
 it('generates invite without sending email and marks server-only ownership for partial retries', async () => {
  const client = admin(); const auth = createSupabaseManualInvitationAuth(client as never)
  expect(await auth.generate(input.workEmail, context, { kind: 'new' })).toEqual({ userId, tokenHash: 'synthetic-invite-token' })
  expect(client.auth.admin.createUser).toHaveBeenCalledWith({ email: input.workEmail, email_confirm: false, app_metadata: { taskovia_manual_invitation: { tenantId, companyId } } })
  expect(client.auth.admin.generateLink).toHaveBeenCalledWith({ type: 'invite', email: input.workEmail })
  expect(client.auth.admin.updateUserById).not.toHaveBeenCalled()
  expect(client.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
 })
 it('rejects recovery links and activation changes before reissue', async () => {
  const client = admin(); const auth = createSupabaseManualInvitationAuth(client as never)
  client.auth.admin.generateLink.mockResolvedValueOnce({ data: { user: pending, properties: { hashed_token: 'synthetic-invite-token', verification_type: 'recovery' } }, error: null } as never)
  await expect(auth.generate(input.workEmail, context, { kind: 'new' })).rejects.toThrow()
  client.auth.admin.getUserById.mockResolvedValueOnce({ data: { user: { ...pending, email_confirmed_at: '2026-10-03T00:00:00Z' } }, error: null } as never)
  await expect(auth.generate(input.workEmail, context, { kind: 'pending', userId })).rejects.toThrow()
 })
})

describe('atomic manual invitation ownership', () => {
 it('does not claim an existing identity if another Auth creator wins the email race', async () => {
  const client = admin()
  client.auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } } as never)
  await expect(createSupabaseManualInvitationAuth(client as never).generate(input.workEmail, context, { kind: 'new' })).rejects.toThrow()
  expect(client.auth.admin.generateLink).not.toHaveBeenCalled()
  expect(client.auth.admin.updateUserById).not.toHaveBeenCalled()
 })
 it('retries owned unconfirmed drafts after link generation failed', async () => {
  const draft = { ...pending, invited_at: null }
  const client = admin([draft])
  client.auth.admin.getUserById.mockResolvedValueOnce({ data: { user: draft }, error: null })
  const auth = createSupabaseManualInvitationAuth(client as never)
  expect(await auth.inspect(input.workEmail, context)).toEqual({ kind: 'pending', userId })
  expect(await auth.generate(input.workEmail, context, { kind: 'pending', userId })).toEqual({ userId, tokenHash: 'synthetic-invite-token' })
  expect(client.auth.admin.createUser).not.toHaveBeenCalled()
 })
})

const invitationProfile = { employeeCode: input.employeeCode, fullName: input.fullName, workEmail: input.workEmail, departmentId, positionId: null, hireDate: null, employmentStatus: 'active' }
const profileChanges = [
 ['name', { fullName: 'Changed name' }],
 ['department', { departmentId: actorId }],
 ['position', { positionId: actorId }],
 ['hire date', { hireDate: '2026-10-04' }],
] as const
describe('pending invitation profile consistency', () => {
 it.each(profileChanges)('rejects edited %s before rotating an existing link', async (_field, change) => {
  const { service, auth, complete, findInvitationEmployee } = setup()
  auth.inspect.mockResolvedValue({ kind: 'pending', userId } as never)
  findInvitationEmployee.mockResolvedValue(invitationProfile as never)
  await expect(service.prepare(context, { ...input, ...change })).rejects.toMatchObject({ code: 'EMPLOYEE_EMAIL_CONFLICT' })
  expect(auth.generate).not.toHaveBeenCalled()
  expect(complete).not.toHaveBeenCalled()
 })
 it('reissues unchanged data and greets the persisted employee', async () => {
  const { service, auth, findInvitationEmployee } = setup()
  auth.inspect.mockResolvedValue({ kind: 'pending', userId } as never)
  findInvitationEmployee.mockResolvedValue(invitationProfile as never)
  const result = await service.prepare(context, input)
  expect(result.status).toBe('prepared')
  expect(result.body.split('\n')[0]).toBe('Chào ' + invitationProfile.fullName + ',')
 })
 it('reissues unchanged populated optional fields', async () => {
  const { service, auth, complete, findInvitationEmployee } = setup()
  const populated = { ...input, positionId: actorId, hireDate: '2026-10-04' }
  auth.inspect.mockResolvedValue({ kind: 'pending', userId } as never)
  findInvitationEmployee.mockResolvedValue({ ...invitationProfile, positionId: actorId, hireDate: populated.hireDate } as never)
  complete.mockResolvedValue({ ...employee, position: { id: actorId, code: 'HR', name: 'HR', level: null }, hireDate: populated.hireDate } as never)
  expect((await service.prepare(context, populated)).status).toBe('prepared')
 })
 it.each([
  ['position', { positionId: actorId }],
  ['hire date', { hireDate: '2026-10-04' }],
 ] as const)('rejects omitted %s when persisted data is populated', async (_field, change) => {
  const { service, auth, findInvitationEmployee } = setup()
  auth.inspect.mockResolvedValue({ kind: 'pending', userId } as never)
  findInvitationEmployee.mockResolvedValue({ ...invitationProfile, ...change } as never)
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'EMPLOYEE_EMAIL_CONFLICT' })
  expect(auth.generate).not.toHaveBeenCalled()
 })
 it.each([
  ['name', { fullName: 'Concurrent edit' }],
  ['department', { department: { id: actorId, code: 'OPS', name: 'Operations' } }],
  ['position', { position: { id: actorId, code: 'HR', name: 'HR', level: null } }],
  ['hire date', { hireDate: '2026-10-04' }],
 ] as const)('releases no invitation when RPC result has changed %s', async (_field, change) => {
  const { service, complete } = setup()
  complete.mockResolvedValue({ ...employee, ...change } as never)
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'EMPLOYEE_EMAIL_CONFLICT' })
 })
 it.each([...profileChanges, ['termination', { employmentStatus: 'terminated' }]] as const)('rechecks persisted %s after Auth pending validation', async (_field, change) => {
  const { service, auth, findInvitationEmployee } = setup()
  auth.inspect.mockResolvedValue({ kind: 'pending', userId } as never)
  findInvitationEmployee.mockResolvedValueOnce(invitationProfile as never).mockResolvedValue({ ...invitationProfile, ...change } as never)
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'EMPLOYEE_EMAIL_CONFLICT' })
 })
 it('releases no credential if employee disappears during final validation', async () => {
  const { service, auth, findInvitationEmployee } = setup()
  auth.inspect.mockResolvedValue({ kind: 'pending', userId } as never)
  findInvitationEmployee.mockResolvedValueOnce(invitationProfile as never).mockResolvedValue(null)
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' })
 })
})

describe('final invitation profile read failure', () => {
 it('returns a safe incomplete error without releasing a credential', async () => {
  const { service, auth, findInvitationEmployee } = setup()
  auth.inspect.mockResolvedValue({ kind: 'pending', userId } as never)
  findInvitationEmployee.mockResolvedValueOnce(invitationProfile).mockRejectedValue(new Error('private database details'))
  await expect(service.prepare(context, input)).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' })
 })
})
