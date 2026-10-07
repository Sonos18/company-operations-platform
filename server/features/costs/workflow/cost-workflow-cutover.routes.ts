import type { H3Event } from 'h3'
import { getHeader,getRouterParam,readBody } from 'h3'
import type { z } from 'zod'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { workflowCompanyConfigurationSchema,workflowCrewClassificationSchema,workflowCompanyActivationSchema } from '../../../../shared/schemas/costs/cost-workflow-cutover'
import { AppApiError } from '../../../utils/api-error'
import { c1RequestContext } from '../../c1-master-data/context'
import { CostWorkflowCutoverService } from './cost-workflow-cutover.service'
import { SupabaseWorkflowCutoverRepository } from './cost-workflow-cutover.repository'
interface Dependencies {resolveContext(event:H3Event,companyId:string):ReturnType<typeof c1RequestContext>;service?:CostWorkflowCutoverService}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new AppApiError(400,'INPUT_INVALID','Dữ liệu yêu cầu không hợp lệ.');return result.data}
export function createCostWorkflowCutoverRoutes(deps:Dependencies){
 async function resolve(event:H3Event){const companyId=parse(workflowUuidSchema,getRouterParam(event,'companyId')),context=await deps.resolveContext(event,companyId);if(context.companyId!==companyId)throw new AppApiError(403,'PERMISSION_DENIED','Phạm vi công ty không hợp lệ.');return {context,service:deps.service??new CostWorkflowCutoverService(new SupabaseWorkflowCutoverRepository(context.db))}}
 const key=(e:H3Event)=>parse(workflowUuidSchema,getHeader(e,'idempotency-key'))
 return {
  async configureCompany(e:H3Event){const v=await resolve(e);return v.service.configureCompany(v.context,parse(workflowCompanyConfigurationSchema,await readBody(e)),key(e))},
  async classifyCrew(e:H3Event){const v=await resolve(e);return v.service.classifyCrew(v.context,parse(workflowUuidSchema,getRouterParam(e,'partyId')),parse(workflowCrewClassificationSchema,await readBody(e)),key(e))},
  async activateCompany(e:H3Event){const v=await resolve(e);return v.service.activateCompany(v.context,parse(workflowCompanyActivationSchema,await readBody(e)),key(e))},
  async readSnapshot(e:H3Event){const v=await resolve(e);return v.service.readSnapshot(v.context)},
  async readCrews(e:H3Event){const v=await resolve(e);return v.service.readCrews(v.context)},
 }
}
export function createSupabaseCostWorkflowCutoverRoutes(){return createCostWorkflowCutoverRoutes({resolveContext:c1RequestContext})}
