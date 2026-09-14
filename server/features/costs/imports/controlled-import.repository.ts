import { z } from 'zod'
import { controlledImportResultSchema, type ControlledImportRequest, type ControlledImportResult } from '../../../../shared/schemas/costs/imports'
import { AppApiError } from '../../../utils/api-error'
import type { UserSupabaseClient } from '../../../utils/supabase-client'

const resultRowSchema = z.object({
  run_id: z.string().uuid(), source_ids: z.array(z.string().uuid()), version_ids: z.array(z.string().uuid()),
  section_ids: z.array(z.string().uuid()), figure_ids: z.array(z.string().uuid()), review_issue_ids: z.array(z.string().uuid()), replayed: z.boolean(),
}).strict()
interface Client {
  rpc(name: 'c1_persist_controlled_import' | 'c1_get_controlled_import_result', args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

type DiagnosticCategory = 'database_timeout' | 'database_lock' | 'database_data' | 'database_constraint' | 'unrecognized_business_contract' | 'database_error'

function diagnostic(error: unknown): { postgresCode?: string; diagnosticCategory: DiagnosticCategory } {
  const parsed = z.object({ code: z.string().optional() }).passthrough().safeParse(error)
  const postgresCode = parsed.success && parsed.data.code ? parsed.data.code : undefined
  if (postgresCode === '57014') return { postgresCode, diagnosticCategory: 'database_timeout' }
  if (postgresCode === '55P03') return { postgresCode, diagnosticCategory: 'database_lock' }
  if (postgresCode?.startsWith('22')) return { postgresCode, diagnosticCategory: 'database_data' }
  if (postgresCode?.startsWith('23')) return { postgresCode, diagnosticCategory: 'database_constraint' }
  if (postgresCode === 'P0001') return { postgresCode, diagnosticCategory: 'unrecognized_business_contract' }
  return { ...(postgresCode ? { postgresCode } : {}), diagnosticCategory: 'database_error' }
}

function fail(error: unknown, context?: { companyId: string; requestId: string }): never {
  const parsed = z.object({ code: z.string().optional(), message: z.string().optional() }).passthrough().safeParse(error)
  const message = parsed.success && parsed.data.code === 'P0001' ? parsed.data.message : undefined
  if (message === 'AUTH_REQUIRED') throw new AppApiError(401, 'AUTH_REQUIRED', 'Bạn cần đăng nhập để tiếp tục.')
  if (message === 'COMPANY_FORBIDDEN') throw new AppApiError(403, 'COMPANY_FORBIDDEN', 'Bạn không có quyền truy cập công ty này.')
  if (message === 'PERMISSION_DENIED' || message === 'MODULE_DISABLED') throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền nhập nguồn C1.')
  if (message === 'IDEMPOTENCY_CONFLICT') throw new AppApiError(409, 'IDEMPOTENCY_CONFLICT', 'Khóa idempotency đã được dùng với dữ liệu khác.')
  if (message === 'RESOURCE_NOT_FOUND') throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy kết quả import.')
  if (message && ['INPUT_INVALID', 'MANIFEST_DIGEST_MISMATCH', 'INPUT_DIGEST_MISMATCH', 'ADAPTER_NOT_PERMITTED'].includes(message)) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu import không hợp lệ.')
  if (context) console.error(JSON.stringify({ requestId: context.requestId, companyId: context.companyId, operation: 'c1_persist_controlled_import', ...diagnostic(error), httpStatus: 500 }))
  throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể lưu nguồn import.')
}
function mapResult(value: unknown): ControlledImportResult {
  const parsed = resultRowSchema.safeParse(value)
  if (!parsed.success) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc kết quả import.')
  return controlledImportResultSchema.parse({ runId: parsed.data.run_id, sourceIds: parsed.data.source_ids, versionIds: parsed.data.version_ids, sectionIds: parsed.data.section_ids, figureIds: parsed.data.figure_ids, reviewIssueIds: parsed.data.review_issue_ids, replayed: parsed.data.replayed })
}

export interface ControlledImportDataRepository {
  persist(companyId: string, request: ControlledImportRequest, payloadDigest: string, requestId: string): Promise<ControlledImportResult>
  get(companyId: string, runId: string): Promise<ControlledImportResult>
}
export function createSupabaseControlledImportRepository(db: UserSupabaseClient): ControlledImportDataRepository {
  const client = db as unknown as Client
  return {
    async persist(companyId, request, payloadDigest, requestId) {
      const { data, error } = await client.rpc('c1_persist_controlled_import', { target_company_id: companyId, target_request: request, target_payload_digest: payloadDigest, target_request_id: requestId })
      if (error) return fail(error, { companyId, requestId })
      return mapResult(data)
    },
    async get(companyId, runId) {
      const { data, error } = await client.rpc('c1_get_controlled_import_result', { target_company_id: companyId, target_run_id: runId })
      if (error) return fail(error)
      return mapResult(data)
    },
  }
}
