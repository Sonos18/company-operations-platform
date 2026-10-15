import type { UserSupabaseClient } from '../../../utils/supabase-client'
import type {
  AmendMaterialContractInput,
  RecordMaterialContractInput,
} from '../../../../shared/schemas/costs/material-finance'
import { financeCommand, financeRead, rpcClient, type MaterialFinanceRpcClient } from './repository'
import { materialContractFactsSchema, type MaterialContractDataRepository } from './contract-service'
import type { MaterialFinanceContext } from './service'

export class SupabaseMaterialContractRepository implements MaterialContractDataRepository {
  private readonly client: MaterialFinanceRpcClient

  constructor(client: UserSupabaseClient) {
    this.client = rpcClient(client)
  }

  readContractFacts(context: MaterialFinanceContext, projectId: string, orderId: string) {
    return financeRead(this.client, context, 'c1_material_read_contract', materialContractFactsSchema.nullable(), {
      target_project_id: projectId,
      target_id: orderId,
    })
  }

  recordContract(context: MaterialFinanceContext, projectId: string, orderId: string, input: RecordMaterialContractInput, key: string) {
    return financeCommand(this.client, context, 'c1_material_record_contract', input, key, {
      target_project_id: projectId,
      target_id: orderId,
    })
  }

  amendContract(context: MaterialFinanceContext, projectId: string, contractId: string, input: AmendMaterialContractInput, key: string) {
    return financeCommand(this.client, context, 'c1_material_amend_contract', input, key, {
      target_project_id: projectId,
      target_id: contractId,
    })
  }
}
