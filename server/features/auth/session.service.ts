import { z } from 'zod'
import { sessionResponseSchema } from '../../../shared/schemas/session'
import type { CompanyAccess } from '../../../shared/schemas/session'

export type SessionResponse = z.infer<typeof sessionResponseSchema>

export interface AppSessionCompanyReader {
  listCompanies(userId: string): Promise<CompanyAccess[]>
}

export function createAuthSessionService(reader: AppSessionCompanyReader) {
  return {
    async getSession(actor: { userId: string; email: string | null }): Promise<SessionResponse> {
      return sessionResponseSchema.parse({
        user: { id: actor.userId, email: actor.email },
        companies: await reader.listCompanies(actor.userId),
      })
    },
  }
}
