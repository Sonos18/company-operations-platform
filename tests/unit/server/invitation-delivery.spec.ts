import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverInvitation } from '../../../server/features/employees/invitation-delivery'
import { employeeInvitationResultSchema } from '../../../shared/schemas/employee-invitations'

const draft = {
  status: 'prepared' as const,
  recipient: 'pilot@example.test',
  subject: 'Lời mời tham gia Taskovia',
  body: 'Mở link: https://pilot.taskovia.test/auth/callback?token_hash=synthetic-token&type=invite',
}

describe('invitation delivery', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns the manual copy flow when no mailer is configured', async () => {
    await expect(deliverInvitation(draft, null)).resolves.toEqual({ ...draft, delivery: 'manual' })
  })

  it('sends the exact prepared email and withholds the body once accepted', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const result = await deliverInvitation(draft, { send })
    expect(send).toHaveBeenCalledWith({ to: draft.recipient, subject: draft.subject, text: draft.body })
    expect(result).toEqual({ status: 'sent', recipient: draft.recipient, subject: draft.subject })
    expect(result).not.toHaveProperty('body')
    expect(employeeInvitationResultSchema.parse(result)).toEqual(result)
  })

  it('falls back to manual copy when sending fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }))
    await expect(deliverInvitation(draft, { send })).resolves.toEqual({ ...draft, delivery: 'failed' })
  })

  it.each([
    [Object.assign(new Error('535 auth failed for app-password-value'), { code: 'EAUTH' }), 'EAUTH'],
    [Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), 'ETIMEDOUT'],
    [Object.assign(new Error('x'), { code: 'pilot@example.test synthetic-token' }), 'UNKNOWN'],
    [new Error('plain'), 'UNKNOWN'],
    ['string failure', 'UNKNOWN'],
  ])('logs only a safe error code %#', async (error, code) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await deliverInvitation(draft, { send: vi.fn().mockRejectedValue(error) })
    expect(log.mock.calls).toEqual([['INVITATION_EMAIL_SEND_FAILED', code]])
  })
})
