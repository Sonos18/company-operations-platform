import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { PermissionCode } from '../../../../shared/constants/permissions'
import { controlledImportRequestSchema, type ControlledImportRequest } from '../../../../shared/schemas/costs/imports'
import { AppApiError } from '../../../utils/api-error'
import type { ControlledImportDataRepository } from './controlled-import.repository'
import { validateReviewedImport } from './import-manifest'

export interface ControlledImportServiceContext { actorId: string; tenantId: string; companyId: string; permissions: readonly PermissionCode[]; requestId: string }
function requireCapabilities(context: ControlledImportServiceContext) {
  if (!context.permissions.includes('cost.source.read') || !context.permissions.includes('cost.prepare')) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền nhập nguồn C1.')
}
function invalid(error: unknown): never {
  if (error instanceof Error && error.message === 'COMPANY_FORBIDDEN') throw new AppApiError(403, 'COMPANY_FORBIDDEN', 'Manifest không thuộc công ty đang thao tác.')
  throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu import đã review không hợp lệ.')
}
function payloadDigest(request: ControlledImportRequest, manifestDigest: string) {
  return createHash('sha256').update(`${request.runId}|${request.approvedManifestDigest}|${request.actualInputDigests.join(',')}|${manifestDigest}`).digest('hex')
}

export function createControlledImportService(repository: ControlledImportDataRepository, permittedAdapter: { id: string; version: string }) {
  return {
    async persist(context: ControlledImportServiceContext, input: unknown) {
      requireCapabilities(context)
      try {
        const request = controlledImportRequestSchema.parse(input)
        const reviewed = validateReviewedImport({ manifest: request.manifest, approvedManifestDigest: request.approvedManifestDigest, actualInputDigests: request.actualInputDigests, trustedCompanyId: context.companyId, permittedAdapter })
        const normalizedRequest = { ...request, manifest: reviewed.manifest }
        return repository.persist(context.companyId, normalizedRequest, payloadDigest(normalizedRequest, reviewed.digest), context.requestId)
      } catch (error) {
        if (error instanceof AppApiError) throw error
        return invalid(error)
      }
    },
    async get(context: ControlledImportServiceContext, inputRunId: string) {
      requireCapabilities(context)
      const parsed = z.string().uuid().safeParse(inputRunId)
      if (!parsed.success) return invalid(parsed.error)
      return repository.get(context.companyId, parsed.data)
    },
  }
}
