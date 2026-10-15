import type { z } from 'zod'
import { materialFinanceCommandResultSchema } from '../../../../shared/schemas/costs/material-finance'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { workflowResponse } from '../workflow/cost-workflow.repository'
import type { MaterialFinanceContext } from './service'

interface RpcResult { data: unknown, error: unknown }
export interface MaterialFinanceRpcClient { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> }

export function rpcClient(client: UserSupabaseClient): MaterialFinanceRpcClient {
  return client as unknown as MaterialFinanceRpcClient
}

export async function financeCommand(
  client: MaterialFinanceRpcClient,
  context: MaterialFinanceContext,
  name: string,
  input: unknown,
  key: string,
  targets: Record<string, unknown>,
) {
  return workflowResponse(await client.rpc(name, {
    target_company_id: context.companyId,
    ...targets,
    target_input: input,
    target_idempotency_key: key,
    target_request_id: context.requestId,
  }), materialFinanceCommandResultSchema)
}

export async function financeRead<T>(
  client: MaterialFinanceRpcClient,
  context: MaterialFinanceContext,
  name: string,
  schema: z.ZodType<T>,
  targets: Record<string, unknown> = {},
) {
  return workflowResponse(await client.rpc(name, { target_company_id: context.companyId, ...targets }), schema)
}
