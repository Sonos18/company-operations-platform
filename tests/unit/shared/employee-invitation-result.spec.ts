import { describe, expect, it } from 'vitest'
import { employeeInvitationResultSchema } from '../../../shared/schemas/employee-invitations'

const base = { recipient: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia' }

describe('employee invitation result schema', () => {
  it('accepts a sent result without a body', () => {
    expect(employeeInvitationResultSchema.parse({ status: 'sent', ...base })).toEqual({ status: 'sent', ...base })
  })
  it('rejects a sent result that carries the invitation body', () => {
    expect(employeeInvitationResultSchema.safeParse({ status: 'sent', ...base, body: 'token' }).success).toBe(false)
  })
  it.each(['manual', 'failed'] as const)('accepts a prepared result with delivery %s', delivery => {
    expect(employeeInvitationResultSchema.parse({ status: 'prepared', ...base, body: 'link', delivery }).status).toBe('prepared')
  })
  it('rejects a prepared result without a delivery reason', () => {
    expect(employeeInvitationResultSchema.safeParse({ status: 'prepared', ...base, body: 'link' }).success).toBe(false)
  })
})
