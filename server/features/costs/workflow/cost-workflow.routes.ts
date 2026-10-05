import type { H3Event } from 'h3'
import { getHeader,getQuery,getRouterParam,readBody } from 'h3'
import { z } from 'zod'
import { contractAdjustmentInputSchema,contractBasisInputSchema,costRequestInputSchema,workflowCommandVersionSchema,workflowDecisionInputSchema,workflowManagerAssignmentSchema,workflowUpdateRequestInputSchema,workflowPaymentInputSchema,cashAdjustmentInputSchema,workflowRefundConfirmationSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { workflowEvidenceIntentSchema,workflowEvidenceLinkSchema } from '../../../../shared/schemas/costs/cost-workflow-evidence'
import { costEvidenceFinalizeInputSchema,costEvidenceReadUrlInputSchema } from '../../../../shared/schemas/costs/cost-evidence'
import { AppApiError } from '../../../utils/api-error'
import type { SupabaseEvidenceFinalizer } from '../../../utils/supabase-client'
import { resolveCostEvidenceFinalizer } from '../evidence/cost-evidence.routes'
import { c1RequestContext } from '../../c1-master-data/context'
import {costExtractionCommandSchema} from '../../../../shared/schemas/costs/cost-extraction'
import {CostExtractionService} from '../extraction/cost-extraction.service'
import {SupabaseCostExtractionRepository} from '../extraction/cost-extraction.repository'
import {createCostExtractionAdapter} from '../extraction/cost-extraction-config'
import {CostWorkflowReportingService} from '../finance/cost-workflow-reporting.service'
import {SupabaseWorkflowReportingRepository} from '../finance/cost-workflow-reporting.repository'
import { CostWorkflowCashService } from './cost-workflow-cash.service'
import { SupabaseWorkflowCashRepository } from './cost-workflow-cash.repository'
import { CostWorkflowService } from './cost-workflow.service'
import { SupabaseWorkflowRepository } from './cost-workflow.repository'
import { CostWorkflowEvidenceService } from './cost-workflow-evidence.service'
import { SupabaseWorkflowEvidenceRepository } from './cost-workflow-evidence.repository'
export interface CostWorkflowRouteDependencies {resolveContext(event:H3Event,companyId:string):ReturnType<typeof c1RequestContext>;service?:CostWorkflowService;extractionService?:CostExtractionService;reportingService?:CostWorkflowReportingService;cashService?:CostWorkflowCashService;evidenceService?:CostWorkflowEvidenceService;finalizer?:SupabaseEvidenceFinalizer;finalizerFactory?:()=>SupabaseEvidenceFinalizer}
const uuid=z.string().uuid()
function invalid():never{throw new AppApiError(400,'INPUT_INVALID','Dữ liệu yêu cầu không hợp lệ.')}
function param(event:H3Event,name:string){const parsed=uuid.safeParse(getRouterParam(event,name));return parsed.success?parsed.data:invalid()}
function key(event:H3Event){const parsed=uuid.safeParse(getHeader(event,'idempotency-key'));return parsed.success?parsed.data:invalid()}
async function body<T>(event:H3Event,schema:z.ZodType<T>){const parsed=schema.safeParse(await readBody(event));return parsed.success?parsed.data:invalid()}
export function createCostWorkflowRoutes(deps:CostWorkflowRouteDependencies){
 async function resolved(event:H3Event,needsFinalizer=false){const context=await deps.resolveContext(event,param(event,'companyId'));return {context,extraction:deps.extractionService??new CostExtractionService(new SupabaseCostExtractionRepository(context.db),createCostExtractionAdapter()),reporting:deps.reportingService??new CostWorkflowReportingService(new SupabaseWorkflowReportingRepository(context.db)),cash:deps.cashService??new CostWorkflowCashService(new SupabaseWorkflowCashRepository(context.db)),service:deps.service??new CostWorkflowService(new SupabaseWorkflowRepository(context.db)),evidence:deps.evidenceService??new CostWorkflowEvidenceService(new SupabaseWorkflowEvidenceRepository(context.db,deps.finalizer??(needsFinalizer?deps.finalizerFactory?.():undefined)))}}
 return {
 async readDirectory(event:H3Event){const v=await resolved(event);return v.service.readDirectory(v.context,getQuery(event))},
 async readRequestHistory(event:H3Event){const v=await resolved(event);return v.service.readRequestHistory(v.context,param(event,'projectId'),param(event,'requestId'))},
 async extractEvidence(event:H3Event){const v=await resolved(event),input=await body(event,costExtractionCommandSchema);return v.extraction.extract(v.context,param(event,'projectId'),input.requestId,param(event,'evidenceFileId'),key(event))},
 async readWorkflowCash(event:H3Event){const v=await resolved(event);return v.reporting.readWorkflowCash(v.context,param(event,'projectId'))},
 async readInventory(event:H3Event){const v=await resolved(event);return v.reporting.readInventory(v.context,param(event,'projectId'))},
 async confirmPayment(event:H3Event){const v=await resolved(event);return v.cash.confirmPayment(v.context,param(event,'projectId'),param(event,'installmentId'),await body(event,workflowPaymentInputSchema),key(event))},
 async createCashAdjustment(event:H3Event){const v=await resolved(event);return v.cash.createCashAdjustment(v.context,param(event,'projectId'),param(event,'paymentId'),await body(event,cashAdjustmentInputSchema),key(event))},
 async decideCashAdjustment(event:H3Event){const v=await resolved(event);return v.cash.decideCashAdjustment(v.context,param(event,'projectId'),param(event,'adjustmentId'),await body(event,workflowDecisionInputSchema),key(event))},
 async confirmRefund(event:H3Event){const v=await resolved(event);return v.cash.confirmRefund(v.context,param(event,'projectId'),param(event,'adjustmentId'),await body(event,workflowRefundConfirmationSchema),key(event))},
 async applyCashCorrection(event:H3Event){const v=await resolved(event);return v.cash.applyCashCorrection(v.context,param(event,'projectId'),param(event,'adjustmentId'),await body(event,workflowCommandVersionSchema),key(event))},
  async assignManager(event:H3Event){const value=await resolved(event);return value.service.assignManager(value.context,param(event,'projectId'),await body(event,workflowManagerAssignmentSchema),key(event))},
  async createRequest(event:H3Event){const value=await resolved(event);return value.service.createRequest(value.context,param(event,'projectId'),await body(event,costRequestInputSchema),key(event))},
  async updateRequest(event:H3Event){const value=await resolved(event);return value.service.updateRequest(value.context,param(event,'projectId'),param(event,'requestId'),await body(event,workflowUpdateRequestInputSchema),key(event))},
  async submitRequest(event:H3Event){const value=await resolved(event);return value.service.submitRequest(value.context,param(event,'projectId'),param(event,'requestId'),await body(event,workflowCommandVersionSchema),key(event))},
  async decideRequest(event:H3Event){const value=await resolved(event);return value.service.decideRequest(value.context,param(event,'projectId'),param(event,'requestId'),await body(event,workflowDecisionInputSchema),key(event))},
  async createContractBasis(event:H3Event){const value=await resolved(event);return value.service.createContractBasis(value.context,param(event,'projectId'),await body(event,contractBasisInputSchema),key(event))},
  async submitContractAdjustment(event:H3Event){const value=await resolved(event);return value.service.submitContractAdjustment(value.context,param(event,'projectId'),param(event,'contractId'),await body(event,contractAdjustmentInputSchema),key(event))},
  async decideContractAdjustment(event:H3Event){const value=await resolved(event);return value.service.decideContractAdjustment(value.context,param(event,'projectId'),param(event,'contractId'),param(event,'adjustmentId'),await body(event,workflowDecisionInputSchema),key(event))},
  async listRequests(event:H3Event){const value=await resolved(event);return value.service.listRequests(value.context,param(event,'projectId'))},
  async readRequest(event:H3Event){const value=await resolved(event);return value.service.readRequest(value.context,param(event,'projectId'),param(event,'requestId'))},
  async listContracts(event:H3Event){const value=await resolved(event);return value.service.listContracts(value.context,param(event,'projectId'))},
  async readContract(event:H3Event){const value=await resolved(event);return value.service.readContract(value.context,param(event,'projectId'),param(event,'contractId'))},
  async listAdjustments(event:H3Event){const value=await resolved(event);return value.service.listAdjustments(value.context,param(event,'projectId'))},
  async readAdjustment(event:H3Event){const value=await resolved(event);return value.service.readAdjustment(value.context,param(event,'projectId'),param(event,'adjustmentId'))},
  async readProjectContext(event:H3Event){const value=await resolved(event);return value.service.readProjectContext(value.context,param(event,'projectId'))},
  async listNotifications(event:H3Event){const value=await resolved(event);return value.service.listNotifications(value.context)},
  async markNotificationRead(event:H3Event){const value=await resolved(event);return value.service.markNotificationRead(value.context,param(event,'notificationId'),key(event))},
  async listParties(event:H3Event){const value=await resolved(event);return value.evidence.listWorkflowParties(value.context,param(event,'projectId'))},
 async createEvidenceIntent(event:H3Event){const value=await resolved(event);return value.evidence.createIntent(value.context,param(event,'projectId'),await body(event,workflowEvidenceIntentSchema),key(event))},
 async finalizeEvidence(event:H3Event){const value=await resolved(event,true);return value.evidence.finalize(value.context,param(event,'projectId'),param(event,'evidenceFileId'),await body(event,costEvidenceFinalizeInputSchema),key(event))},
 async linkEvidence(event:H3Event){const value=await resolved(event);return value.evidence.linkRequestEvidence(value.context,param(event,'projectId'),param(event,'requestId'),await body(event,workflowEvidenceLinkSchema),key(event))},
 async readEvidenceUrl(event:H3Event){const value=await resolved(event);return value.evidence.createReadUrl(value.context,param(event,'projectId'),param(event,'evidenceFileId'),await body(event,costEvidenceReadUrlInputSchema))},
 }
}
export function createSupabaseCostWorkflowRoutes(event:H3Event){
 return createCostWorkflowRoutes({resolveContext:c1RequestContext,finalizerFactory:()=>resolveCostEvidenceFinalizer(event)})
}
