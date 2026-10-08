import { z } from 'zod'
import {
  COST_EVIDENCE_MAX_BYTES,
  costEvidenceFinalizedSchema,
  costEvidenceReadUrlSchema,
  costEvidenceUploadIntentSchema,
} from '../../../../shared/schemas/costs/cost-evidence'
import {
  materialCommandResultSchema,
  materialOrderViewSchema,
  materialProjectOptionSchema,
  materialProposalViewSchema,
  materialSupplierNameViewSchema,
  materialViewSchema,
} from '../../../../shared/schemas/costs/material-procurement'
import { AppApiError } from '../../../utils/api-error'
import type { SupabaseMaterialEvidenceFinalizer, UserSupabaseClient } from '../../../utils/supabase-client'
import { verifyEvidenceBlob } from '../evidence/evidence-file-integrity'
import { workflowResponse } from '../workflow/cost-workflow.repository'
import type {
  MaterialProcurementContext,
  MaterialProcurementDataRepository,
} from './service'

type RpcName =
  | 'c1_material_list_projects'
  | 'c1_material_list_items'
  | 'c1_material_create_item'
  | 'c1_material_update_item'
  | 'c1_material_list_supplier_names'
  | 'c1_material_record_supplier_name'
  | 'c1_material_resolve_supplier'
  | 'c1_material_list_proposals'
  | 'c1_material_read_proposal'
  | 'c1_material_create_proposal'
  | 'c1_material_update_proposal'
  | 'c1_material_submit_proposal'
  | 'c1_material_decide_proposal'
  | 'c1_material_create_order'
  | 'c1_material_list_orders'
  | 'c1_material_read_order'
  | 'c1_material_cancel_order'
  | 'c1_material_create_evidence_intent'
  | 'c1_material_evidence_finalization_target'
  | 'c1_material_evidence_read_target'

interface RpcResult {
  data: unknown
  error: unknown
}

interface Bucket {
  download(path: string): Promise<RpcResult>
  createSignedUrl(path: string, expiresIn: number, options: { download: boolean }): Promise<RpcResult>
}

interface Client {
  rpc(name: RpcName, args: Record<string, unknown>): Promise<RpcResult>
  storage: { from(bucket: string): Bucket }
}

const finalizationTargetSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('finalized') }).strict(),
  z.object({
    status: z.literal('pending_upload'),
    bucketId: z.literal('c1-accounting-evidence'),
    objectPath: z.string().min(1),
    declaredMimeType: z.literal('application/pdf'),
    declaredSizeBytes: z.number().int().positive(),
    declaredSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict(),
])
const readTargetSchema = z.object({ bucketId: z.literal('c1-accounting-evidence'), objectPath: z.string().min(1) }).strict()

export class SupabaseMaterialProcurementRepository implements MaterialProcurementDataRepository {
  private readonly client: Client

  constructor(client: UserSupabaseClient, private readonly resolveFinalizer?: () => SupabaseMaterialEvidenceFinalizer) {
    this.client = client as unknown as Client
  }

  private async command(
    context: MaterialProcurementContext,
    name: RpcName,
    input: unknown,
    key: string,
    targets: Record<string, unknown> = {},
  ) {
    return workflowResponse(await this.client.rpc(name, {
      target_company_id: context.companyId,
      ...targets,
      target_input: input,
      target_idempotency_key: key,
      target_request_id: context.requestId,
    }), materialCommandResultSchema)
  }

  private async read<T>(
    context: MaterialProcurementContext,
    name: RpcName,
    schema: z.ZodType<T>,
    targets: Record<string, unknown> = {},
  ) {
    return workflowResponse(await this.client.rpc(name, {
      target_company_id: context.companyId,
      ...targets,
    }), schema)
  }

  listProjects(context: MaterialProcurementContext) {
    return this.read(context, 'c1_material_list_projects', z.array(materialProjectOptionSchema))
  }

  listMaterials(context: MaterialProcurementContext) {
    return this.read(context, 'c1_material_list_items', z.array(materialViewSchema))
  }

  createMaterial: MaterialProcurementDataRepository['createMaterial'] = (context, input, key) =>
    this.command(context, 'c1_material_create_item', input, key)

  updateMaterial: MaterialProcurementDataRepository['updateMaterial'] = (context, id, input, key) =>
    this.command(context, 'c1_material_update_item', input, key, { target_id: id })

  listSupplierNames(context: MaterialProcurementContext, id: string) {
    return this.read(context, 'c1_material_list_supplier_names', z.array(materialSupplierNameViewSchema), {
      target_id: id,
    })
  }

  recordSupplierName: MaterialProcurementDataRepository['recordSupplierName'] = (context, id, input, key) =>
    this.command(context, 'c1_material_record_supplier_name', input, key, { target_id: id })

  resolveSupplier: MaterialProcurementDataRepository['resolveSupplier'] = (context, input, key) =>
    this.command(context, 'c1_material_resolve_supplier', input, key)

  listProposals: MaterialProcurementDataRepository['listProposals'] = (context, projectId) =>
    this.read(context, 'c1_material_list_proposals', z.array(materialProposalViewSchema), { target_project_id: projectId })

  readProposal: MaterialProcurementDataRepository['readProposal'] = (context, projectId, id) =>
    this.read(context, 'c1_material_read_proposal', materialProposalViewSchema, { target_project_id: projectId, target_id: id })

  createProposal: MaterialProcurementDataRepository['createProposal'] = (context, projectId, input, key) =>
    this.command(context, 'c1_material_create_proposal', input, key, { target_project_id: projectId })

  updateProposal: MaterialProcurementDataRepository['updateProposal'] = (context, projectId, id, input, key) =>
    this.command(context, 'c1_material_update_proposal', input, key, { target_project_id: projectId, target_id: id })

  submitProposal: MaterialProcurementDataRepository['submitProposal'] = (context, projectId, id, input, key) =>
    this.command(context, 'c1_material_submit_proposal', input, key, { target_project_id: projectId, target_id: id })

  decideProposal: MaterialProcurementDataRepository['decideProposal'] = (context, projectId, id, input, key) =>
    this.command(context, 'c1_material_decide_proposal', input, key, { target_project_id: projectId, target_id: id })

  createOrder: MaterialProcurementDataRepository['createOrder'] = (context, projectId, proposalId, input, key) =>
    this.command(context, 'c1_material_create_order', input, key, { target_project_id: projectId, target_id: proposalId })

  listOrders: MaterialProcurementDataRepository['listOrders'] = (context, projectId) =>
    this.read(context, 'c1_material_list_orders', z.array(materialOrderViewSchema), { target_project_id: projectId })

  readOrder: MaterialProcurementDataRepository['readOrder'] = (context, projectId, orderId) =>
    this.read(context, 'c1_material_read_order', materialOrderViewSchema, { target_project_id: projectId, target_id: orderId })

  cancelOrder: MaterialProcurementDataRepository['cancelOrder'] = (context, projectId, orderId, input, key) =>
    this.command(context, 'c1_material_cancel_order', input, key, { target_project_id: projectId, target_id: orderId })

  async createEvidenceIntent(
    context: MaterialProcurementContext,
    projectId: string,
    input: Parameters<MaterialProcurementDataRepository['createEvidenceIntent']>[2],
    key: string,
  ) {
    return workflowResponse(await this.client.rpc('c1_material_create_evidence_intent', {
      target_company_id: context.companyId,
      target_project_id: projectId,
      target_input: input,
      target_idempotency_key: key,
      target_request_id: context.requestId,
    }), costEvidenceUploadIntentSchema)
  }

  async finalizeEvidence(
    context: MaterialProcurementContext,
    projectId: string,
    fileId: string,
    input: Parameters<MaterialProcurementDataRepository['finalizeEvidence']>[3],
    key: string,
  ) {
    const target = workflowResponse(await this.client.rpc('c1_material_evidence_finalization_target', {
      target_company_id: context.companyId,
      target_project_id: projectId,
      target_id: fileId,
    }), finalizationTargetSchema)
    let finalInput: Record<string, unknown> = input
    if (target.status === 'pending_upload') {
      const downloaded = await this.client.storage.from(target.bucketId).download(target.objectPath)
      if (downloaded.error || !(downloaded.data instanceof Blob)) {
        throw new AppApiError(409, 'EVIDENCE_UPLOAD_MISMATCH', 'Không thể xác minh tệp tải lên.')
      }
      const identity = await verifyEvidenceBlob(downloaded.data, COST_EVIDENCE_MAX_BYTES, target.declaredMimeType)
      if (downloaded.data.type !== target.declaredMimeType
        || identity.sizeBytes !== target.declaredSizeBytes
        || identity.sha256 !== target.declaredSha256) {
        throw new AppApiError(409, 'EVIDENCE_UPLOAD_MISMATCH', 'Tệp tải lên không khớp với khai báo.')
      }
      finalInput = { ...input, ...identity }
    }
    const finalizer = this.resolveFinalizer?.()
    if (!finalizer) throw new AppApiError(500, 'INTERNAL_ERROR', 'Dịch vụ hoàn tất chứng từ chưa được cấu hình.')
    return workflowResponse(await finalizer.finalize({
      target_actor_id: context.actorId,
      target_company_id: context.companyId,
      target_project_id: projectId,
      target_id: fileId,
      target_input: finalInput,
      target_idempotency_key: key,
      target_request_id: context.requestId,
    }), costEvidenceFinalizedSchema)
  }

  async readEvidenceUrl(context: MaterialProcurementContext, projectId: string, fileId: string, input: Parameters<MaterialProcurementDataRepository['readEvidenceUrl']>[3]) {
    const target = workflowResponse(await this.client.rpc('c1_material_evidence_read_target', {
      target_company_id: context.companyId,
      target_project_id: projectId,
      target_id: fileId,
    }), readTargetSchema)
    const signed = workflowResponse(
      await this.client.storage.from(target.bucketId).createSignedUrl(target.objectPath, 60, { download: input.disposition === 'attachment' }),
      z.object({ signedUrl: z.string().url() }).passthrough(),
    )
    return costEvidenceReadUrlSchema.parse({ url: signed.signedUrl, expiresAt: new Date(Date.now() + 60_000).toISOString() })
  }
}
