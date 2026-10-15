import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { z } from 'zod'
import { AppApiError } from '../../../utils/api-error'
import { resolveSupabaseMaterialReminderEmitter } from '../../../utils/supabase-client'
import { workflowResponse } from '../workflow/cost-workflow.repository'
import { vietnamToday } from '../../../../shared/utils/material-finance-summary'

export interface MaterialReminderInput {
  secret: string
  header: string | undefined
  emit(today: string): Promise<{ dueSoon: number, overdue: number }>
  now(): Date
}

function sameSecret(expected: string, header: string | undefined): boolean {
  if (!expected || !header?.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice('Bearer '.length))
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

export async function handleMaterialReminders(input: MaterialReminderInput) {
  if (!sameSecret(input.secret, input.header)) {
    throw new AppApiError(401, 'AUTH_INVALID', 'Yêu cầu không hợp lệ.')
  }
  return input.emit(vietnamToday(input.now()))
}

const reminderCountsSchema = z.object({
  dueSoon: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
}).strict()

/** Nuxt entry point: shared-secret check, then the service-role reminder RPC. */
export function runMaterialReminders(event: H3Event) {
  const runtime = useRuntimeConfig(event)
  return handleMaterialReminders({
    secret: String(runtime.materialReminderSecret ?? ''),
    header: getHeader(event, 'authorization'),
    now: () => new Date(),
    emit: async (today) => {
      return workflowResponse(await resolveSupabaseMaterialReminderEmitter(event).emit({ target_today: today }), reminderCountsSchema)
    },
  })
}
