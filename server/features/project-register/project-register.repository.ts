import { z } from 'zod'
import {
  projectRegisterSchema, type CreateProjectRegisterInput, type ProjectRegister, type UpdateProjectRegisterInput,
} from '../../../shared/schemas/costs/master-data'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

const rowSchema = z.object({
  id: z.string().uuid(), tenant_id: z.string().uuid(), company_id: z.string().uuid(), code: z.string(), name: z.string(), origin: z.enum(['legacy_import', 'manual', 'opportunity_conversion']), operational_state: z.enum(['active', 'completed', 'paused', 'unknown']),
  client_display_name: z.string().nullable(), location_text: z.string().nullable(), version: z.number().int().nonnegative(), created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict()
interface Query { select(columns: string): Query; eq(column: string, value: string): Query; order(column: string): PromiseLike<{ data: unknown; error: unknown }>; maybeSingle(): Promise<{ data: unknown; error: unknown }> }
interface Client { from(table: 'projects'): Query; rpc(name: 'c1_create_project' | 'c1_update_project', args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }

function fail(message: string): never { throw new AppApiError(500, 'INTERNAL_ERROR', message) }
function mapRow(row: unknown): ProjectRegister {
  const parsed = rowSchema.safeParse(row)
  if (!parsed.success) return fail('Không thể đọc Project Register.')
  return projectRegisterSchema.parse({ id: parsed.data.id, code: parsed.data.code, name: parsed.data.name, origin: parsed.data.origin, operationalState: parsed.data.operational_state, clientDisplayName: parsed.data.client_display_name, locationText: parsed.data.location_text, version: parsed.data.version, createdAt: parsed.data.created_at, updatedAt: parsed.data.updated_at })
}
function rpcError(error: unknown): never {
  const known = z.object({ code: z.string().optional(), message: z.string().optional() }).safeParse(error)
  if (known.success && known.data.code === 'P0001' && known.data.message === 'MODULE_DISABLED') throw new AppApiError(403, 'PERMISSION_DENIED', 'C1 chưa được bật cho công ty này.')
  if (known.success && known.data.code === 'P0001' && known.data.message === 'RESOURCE_NOT_FOUND') throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', 'Không tìm thấy Project Register.')
  if (known.success && known.data.code === 'P0001' && known.data.message === 'VERSION_CONFLICT') throw new AppApiError(409, 'VERSION_CONFLICT', 'Dữ liệu đã thay đổi.')
  return fail('Không thể cập nhật Project Register.')
}

export interface ProjectRegisterDataRepository { list(companyId: string, tenantId: string): Promise<ProjectRegister[]>; get(companyId: string, tenantId: string, id: string): Promise<ProjectRegister | null>; create(companyId: string, tenantId: string, input: CreateProjectRegisterInput, requestId: string): Promise<ProjectRegister>; update(companyId: string, tenantId: string, id: string, input: UpdateProjectRegisterInput, requestId: string): Promise<ProjectRegister> }
export function createSupabaseProjectRegisterRepository(db: UserSupabaseClient): ProjectRegisterDataRepository {
  const client = db as unknown as Client
  async function get(companyId: string, tenantId: string, id: string) {
    const { data, error } = await client.from('projects').select('id, tenant_id, company_id, code, name, origin, operational_state, client_display_name, location_text, version, created_at, updated_at').eq('tenant_id', tenantId).eq('company_id', companyId).eq('id', id).maybeSingle()
    if (error) return fail('Không thể đọc Project Register.')
    return data === null ? null : mapRow(data)
  }
  return {
    async list(companyId, tenantId) {
      const { data, error } = await client.from('projects').select('id, tenant_id, company_id, code, name, origin, operational_state, client_display_name, location_text, version, created_at, updated_at').eq('tenant_id', tenantId).eq('company_id', companyId).order('created_at')
      const parsed = z.array(rowSchema).safeParse(data)
      if (error || !parsed.success) return fail('Không thể đọc Project Register.')
      return parsed.data.map(mapRow)
    },
    get,
    async create(companyId, tenantId, input, requestId) {
      const { data, error } = await client.rpc('c1_create_project', { target_company_id: companyId, target_input: input, target_request_id: requestId })
      if (error) return rpcError(error)
      const id = z.object({ id: z.string().uuid() }).safeParse(data)
      if (!id.success) return fail('Không thể tạo Project Register.')
      return (await get(companyId, tenantId, id.data.id)) ?? fail('Không thể đọc Project Register.')
    },
    async update(companyId, tenantId, id, input, requestId) {
      const { error } = await client.rpc('c1_update_project', { target_company_id: companyId, target_id: id, target_input: input, target_request_id: requestId })
      if (error) return rpcError(error)
      return (await get(companyId, tenantId, id)) ?? fail('Không thể đọc Project Register.')
    },
  }
}
