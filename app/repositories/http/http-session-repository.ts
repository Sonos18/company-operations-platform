import type { z } from 'zod'
import type { AuthenticatedHttpClient } from './authenticated-http-client'
import { sessionResponseSchema } from '../../../shared/schemas/session'

export type SessionResponse = z.infer<typeof sessionResponseSchema>

export interface SessionRepository {
  get(): Promise<SessionResponse>
}

export function createHttpSessionRepository(client: AuthenticatedHttpClient): SessionRepository {
  return {
    get: () => client.request({
      url: '/api/auth/session',
      method: 'GET',
      schema: sessionResponseSchema,
    }),
  }
}
