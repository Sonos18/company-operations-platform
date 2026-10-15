import type {
  EmployeeInvitationResult,
  PreparedEmployeeInvitation,
} from '../../../shared/schemas/employee-invitations'

export interface InvitationEmail {
  to: string
  subject: string
  text: string
}

export interface InvitationMailer {
  send(message: InvitationEmail): Promise<void>
}

const safeErrorCode = /^[A-Z][A-Z0-9_]{1,31}$/

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    if (typeof code === 'string' && safeErrorCode.test(code)) return code
  }
  return 'UNKNOWN'
}

/** Sends a prepared invitation; on any failure HR keeps the manual copy flow. */
export async function deliverInvitation(
  draft: PreparedEmployeeInvitation,
  mailer: InvitationMailer | null,
): Promise<EmployeeInvitationResult> {
  if (!mailer) return { ...draft, delivery: 'manual' }
  try {
    await mailer.send({ to: draft.recipient, subject: draft.subject, text: draft.body })
  } catch (error) {
    // Provider messages may echo credentials or addresses; log the code only.
    console.error('INVITATION_EMAIL_SEND_FAILED', errorCode(error))
    return { ...draft, delivery: 'failed' }
  }
  return { status: 'sent', recipient: draft.recipient, subject: draft.subject }
}
