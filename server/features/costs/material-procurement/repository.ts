import { z } from 'zod'
import {
  materialCommandResultSchema,
  materialProjectOptionSchema,
  materialProposalViewSchema,
  materialSupplierNameViewSchema,
  materialViewSchema,
} from '../../../../shared/schemas/costs/material-procurement'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
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

interface RpcResult {
  data: unknown
  error: unknown
}

interface Client {
  rpc(name: RpcName, args: Record<string, unknown>): Promise<RpcResult>
}

export class SupabaseMaterialProcurementRepository implements MaterialProcurementDataRepository {
  private readonly client: Client

  constructor(client: UserSupabaseClient) {
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
}
