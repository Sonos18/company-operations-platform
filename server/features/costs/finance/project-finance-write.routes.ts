import type { H3Event } from 'h3'
import { getHeader,getRouterParam,readBody } from 'h3'
import { z } from 'zod'
import { recordSubcontractPaymentInputSchema,voidSubcontractPaymentInputSchema } from '../../../../shared/schemas/costs/project-finance-writes'
import { AppApiError } from '../../../utils/api-error'
import { c1RequestContext } from '../../c1-master-data/context'
import { ProjectFinanceWriteRepository } from './project-finance-write.repository'
import { ProjectFinanceWriteService } from './project-finance-write.service'
const uuid=z.string().uuid();export interface ProjectFinanceWriteRouteDependencies{resolveContext(event:H3Event,companyId:string):ReturnType<typeof c1RequestContext>;service?:ProjectFinanceWriteService}
function invalid():never{throw new AppApiError(400,'INPUT_INVALID','Dữ liệu yêu cầu không hợp lệ.')}function param(event:H3Event,name:string){const value=uuid.safeParse(getRouterParam(event,name));return value.success?value.data:invalid()}function key(event:H3Event){const value=uuid.safeParse(getHeader(event,'idempotency-key'));return value.success?value.data:invalid()}async function body<T>(event:H3Event,schema:z.ZodType<T>){const value=schema.safeParse(await readBody(event));return value.success?value.data:invalid()}
export function createProjectFinanceWriteRoutes(dependencies:ProjectFinanceWriteRouteDependencies){async function resolved(event:H3Event){const context=await dependencies.resolveContext(event,param(event,'companyId'));return{context,service:dependencies.service??new ProjectFinanceWriteService(new ProjectFinanceWriteRepository(context.db))}}return{async recordPayment(event:H3Event){const value=await resolved(event);return value.service.recordPayment(value.context,param(event,'projectId'),param(event,'subcontractId'),await body(event,recordSubcontractPaymentInputSchema),key(event))},async voidPayment(event:H3Event){const value=await resolved(event);return value.service.voidPayment(value.context,param(event,'projectId'),param(event,'subcontractId'),param(event,'paymentId'),await body(event,voidSubcontractPaymentInputSchema),key(event))}}}
export function createSupabaseProjectFinanceWriteRoutes(_event:H3Event){return createProjectFinanceWriteRoutes({resolveContext:c1RequestContext})}
