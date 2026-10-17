import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import { z } from 'zod'
import { notificationReadAllInputSchema } from '../../../../shared/schemas/costs/material-finance'
import { c1RequestContext } from '../../c1-master-data/context'
import { SupabaseMaterialFinanceReadRepository } from './finance-read-repository'
import { MaterialFinanceReadService } from './finance-read-service'
import { body, invalid, key, param } from './routes'

export interface MaterialFinanceReadRouteDependencies {
  resolveContext(event: H3Event, companyId: string): ReturnType<typeof c1RequestContext>
  service?: MaterialFinanceReadService
}

// Opaque keyset cursor produced by c1_list_app_notifications; the database validates its content.
const cursorSchema = z.string().min(1).max(200)
const optionalUuid = z.string().uuid()

function query(event: H3Event, name: string, schema: z.ZodType<string>): string | null {
  const raw = getQuery(event)[name]
  if (raw === undefined) return null
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : invalid()
}

export function createMaterialFinanceReadRoutes(dependencies: MaterialFinanceReadRouteDependencies) {
  async function resolved(event: H3Event) {
    const context = await dependencies.resolveContext(event, param(event, 'companyId'))
    return {
      context,
      service: dependencies.service ?? new MaterialFinanceReadService(new SupabaseMaterialFinanceReadRepository(context.db)),
    }
  }

  return {
    async projectSummary(event: H3Event) {
      const value = await resolved(event)
      return value.service.projectSummary(value.context, param(event, 'projectId'))
    },
    async inbox(event: H3Event) {
      const value = await resolved(event)
      return value.service.inbox(value.context, query(event, 'projectId', optionalUuid))
    },
    async suppliers(event: H3Event) {
      const value = await resolved(event)
      return value.service.suppliers(value.context)
    },
    async listNotifications(event: H3Event) {
      const value = await resolved(event)
      return value.service.listNotifications(value.context, query(event, 'cursor', cursorSchema))
    },
    async readNotification(event: H3Event) {
      const value = await resolved(event)
      return value.service.readNotification(value.context, param(event, 'notificationId'), key(event))
    },
    async readAllNotifications(event: H3Event) {
      const value = await resolved(event)
      return value.service.readAllNotifications(value.context, await body(event, notificationReadAllInputSchema))
    },
  }
}

export function createSupabaseMaterialFinanceReadRoutes() {
  return createMaterialFinanceReadRoutes({ resolveContext: c1RequestContext })
}
