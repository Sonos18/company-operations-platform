import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualInvitationRoutes } from '../../../server/features/employees/manual-invitation.routes'
const { readBody, getRouterParam, setResponseHeader } = vi.hoisted(() => ({ readBody: vi.fn(), getRouterParam: vi.fn(), setResponseHeader: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), readBody, getRouterParam, setResponseHeader }))
const companyId = '10000000-0000-4000-8000-000000000020'
const context = { actorId: '10000000-0000-4000-8000-000000000001', tenantId: '10000000-0000-4000-8000-000000000010', companyId, permissions: ['account.invite', 'employee.create'] as never }
describe('manual invitation routes', () => {
 beforeEach(() => { vi.clearAllMocks(); getRouterParam.mockReturnValue(companyId) })
 it('denies access before reading employee input or constructing privileged Auth operations', async () => {
  const prepare = vi.fn()
  const routes = createManualInvitationRoutes({ resolveContext: vi.fn().mockResolvedValue({ ...context, permissions: [] }), prepare, options: vi.fn(), takeSlot: vi.fn() })
  await expect(routes.prepare({} as never)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  expect(readBody).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled()
  expect(setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'no-store')
 })
 it.each(['companyId', 'tenantId', 'roles', 'roleId'])('rejects client-supplied scope or role: %s', async field => {
  readBody.mockResolvedValue({ employeeCode: 'P1', fullName: 'Pilot', workEmail: 'pilot@example.test', departmentId: context.actorId, [field]: field === 'roles' ? ['hr_manager'] : companyId })
  const prepare = vi.fn()
  const routes = createManualInvitationRoutes({ resolveContext: vi.fn().mockResolvedValue(context), prepare, options: vi.fn(), takeSlot: vi.fn() })
  await expect(routes.prepare({} as never)).rejects.toMatchObject({ code: 'INPUT_INVALID' })
  expect(prepare).not.toHaveBeenCalled()
 })
 it('passes server-owned context and normalized input with no caching', async () => {
  readBody.mockResolvedValue({ employeeCode: 'P1', fullName: 'Pilot', workEmail: ' PILOT@example.test ', departmentId: context.actorId })
  const prepare = vi.fn().mockResolvedValue({ status: 'prepared' })
  const routes = createManualInvitationRoutes({ resolveContext: vi.fn().mockResolvedValue(context), prepare, options: vi.fn(), takeSlot: vi.fn() })
  await routes.prepare({} as never)
  expect(prepare).toHaveBeenCalledWith(context, expect.objectContaining({ workEmail: 'pilot@example.test' }))
  expect(setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Referrer-Policy', 'no-referrer')
 })
})
