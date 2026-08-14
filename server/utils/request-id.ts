import { z } from 'zod'

const uuidSchema = z.string().uuid()

export function ensureRequestId(
  candidate: string | undefined,
  createId: () => string = crypto.randomUUID,
): string {
  return candidate && uuidSchema.safeParse(candidate).success ? candidate : createId()
}
