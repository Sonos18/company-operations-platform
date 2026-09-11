import { z } from 'zod'
import { ClientError } from '../../errors/client-error'

export const contactMethodTypeSchema = z.enum(['phone', 'email', 'other'])
export type ContactRecoveryMethodType = z.infer<typeof contactMethodTypeSchema>

export const contactRecoveryDraftSchema = z.object({
  displayName: z.string(),
  relationshipCode: z.string(),
  methodType: contactMethodTypeSchema,
  methodValue: z.string(),
  isPrimary: z.boolean(),
}).strict()
export type ContactRecoveryDraft = z.infer<typeof contactRecoveryDraftSchema>

export const contactRecoveryEntrySchema = z.object({
  phase: z.enum(['method_pending', 'link_pending', 'link_complete_pending_reload', 'blocked_unknown']),
  contactId: z.string().uuid().nullable(),
  contactVersion: z.number().int().nonnegative().nullable(),
  methodCompleted: z.boolean(),
  draft: contactRecoveryDraftSchema,
  reason: z.string(),
}).strict()
export type ContactRecoveryEntry = z.infer<typeof contactRecoveryEntrySchema>

export function contactWriteOutcomeIsUnknown(error: unknown): boolean {
  if (!(error instanceof ClientError)) return true
  return error.kind === 'network'
    || error.code === 'NETWORK_ERROR'
    || error.code === 'MALFORMED_RESPONSE'
    || error.code === 'INTERNAL_ERROR'
}

export function blockedContactRecovery(
  draft: ContactRecoveryDraft,
  reason: string,
  contactId: string | null = null,
  contactVersion: number | null = null,
): ContactRecoveryEntry {
  return {
    phase: 'blocked_unknown',
    contactId,
    contactVersion,
    methodCompleted: false,
    draft,
    reason,
  }
}
