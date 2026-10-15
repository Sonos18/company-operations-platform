import type { H3Event } from 'h3'
import { amendMaterialContractInputSchema, recordMaterialContractInputSchema } from '../../../../shared/schemas/costs/material-finance'
import { c1RequestContext } from '../../c1-master-data/context'
import { SupabaseMaterialContractRepository } from './contract-repository'
import { MaterialContractService } from './contract-service'
import { body, key, param } from './routes'

export interface MaterialContractRouteDependencies {
  resolveContext(event: H3Event, companyId: string): ReturnType<typeof c1RequestContext>
  service?: MaterialContractService
}

export function createMaterialContractRoutes(dependencies: MaterialContractRouteDependencies) {
  async function resolved(event: H3Event) {
    const context = await dependencies.resolveContext(event, param(event, 'companyId'))
    return {
      context,
      service: dependencies.service ?? new MaterialContractService(new SupabaseMaterialContractRepository(context.db)),
    }
  }

  return {
    async readContract(event: H3Event) {
      const value = await resolved(event)
      return value.service.readContract(value.context, param(event, 'projectId'), param(event, 'orderId'))
    },
    async recordContract(event: H3Event) {
      const value = await resolved(event)
      return value.service.recordContract(value.context, param(event, 'projectId'), param(event, 'orderId'), await body(event, recordMaterialContractInputSchema), key(event))
    },
    async amendContract(event: H3Event) {
      const value = await resolved(event)
      return value.service.amendContract(value.context, param(event, 'projectId'), param(event, 'contractId'), await body(event, amendMaterialContractInputSchema), key(event))
    },
  }
}

export function createSupabaseMaterialContractRoutes(_event: H3Event) {
  return createMaterialContractRoutes({ resolveContext: c1RequestContext })
}
