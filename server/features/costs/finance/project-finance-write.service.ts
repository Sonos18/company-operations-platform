import type { PermissionCode } from '../../../../shared/constants/permissions'
import { recordSubcontractPaymentInputSchema,voidSubcontractPaymentInputSchema } from '../../../../shared/schemas/costs/project-finance-writes'
import { AppApiError } from '../../../utils/api-error'
import type { ProjectFinanceWriteRepository } from './project-finance-write.repository'
export interface ProjectFinanceWriteServiceContext{actorId:string;tenantId:string;companyId:string;permissions:readonly PermissionCode[];requestId:string}
function requirePermission(context:ProjectFinanceWriteServiceContext){if(!context.permissions.includes('cost.record_cash'))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền thực hiện thao tác này.')}
function parse<T>(schema:{parse(value:unknown):T},value:unknown):T{try{return schema.parse(value)}catch{throw new AppApiError(400,'INPUT_INVALID','Dữ liệu không hợp lệ.')}}
export class ProjectFinanceWriteService{constructor(private readonly repository:ProjectFinanceWriteRepository){}async recordPayment(context:ProjectFinanceWriteServiceContext,projectId:string,subcontractId:string,value:unknown,key:string){requirePermission(context);return this.repository.recordPayment(context,projectId,subcontractId,parse(recordSubcontractPaymentInputSchema,value),key)}async voidPayment(context:ProjectFinanceWriteServiceContext,projectId:string,subcontractId:string,paymentId:string,value:unknown,key:string){requirePermission(context);return this.repository.voidPayment(context,projectId,subcontractId,paymentId,parse(voidSubcontractPaymentInputSchema,value),key)}}
