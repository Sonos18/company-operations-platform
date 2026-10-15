import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { AppApiError } from '../../../utils/api-error'

const uuid = z.string().uuid()

export function invalid(): never {
  throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
}
export function param(event: H3Event, name: string) {
  const parsed = uuid.safeParse(getRouterParam(event, name))
  return parsed.success ? parsed.data : invalid()
}
export function key(event: H3Event) {
  const parsed = uuid.safeParse(getHeader(event, 'idempotency-key'))
  return parsed.success ? parsed.data : invalid()
}
export async function body<T>(event: H3Event, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await readBody(event))
  return parsed.success ? parsed.data : invalid()
}
