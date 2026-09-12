import type { H3Event } from 'h3'
import { getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { filePreviewQuerySchema } from '../../../shared/schemas/files'
import { AppApiError } from '../../utils/api-error'
import { c1RequestContext } from '../c1-master-data/context'
import { createFilePreviewService } from './file-preview.service'
import { createSupabaseFileRepository, createSupabaseFileStorage } from './file.repository'
import { createFileService } from './file.service'

const uuid = z.string().uuid()
function param(event: H3Event, name: string) { const value = uuid.safeParse(getRouterParam(event, name)); if (!value.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Định danh không hợp lệ.'); return value.data }
export function createSupabaseFileRoutes(event: H3Event) {
  async function service() { const companyId = param(event, 'companyId'); const context = await c1RequestContext(event, companyId); return { context, service: createFileService({ repository: createSupabaseFileRepository(context.db), storage: createSupabaseFileStorage(context.db), preview: createFilePreviewService() }) } }
  return {
    async finalize() { const value = await service(); return value.service.finalize(value.context, param(event, 'fileId')) },
    async preview() { const value = await service(); return value.service.preview(value.context, param(event, 'fileId'), filePreviewQuerySchema.parse(getQuery(event))) },
    async readUrl() { const value = await service(); return value.service.createReadUrl(value.context, param(event, 'fileId')) },
  }
}
