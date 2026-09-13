import { describe, expect, it, vi } from 'vitest'
import { AppApiError } from '../../../server/utils/api-error'
import { createFileService } from '../../../server/features/files/file.service'

const companyId = 'c1000000-0000-4000-8000-000000000020'
const tenantId = 'c1000000-0000-4000-8000-000000000010'
const actorId = 'c1000000-0000-4000-8000-000000000901'
const fileId = 'c1000000-0000-4000-8000-000000000040'

const context = (permissions = ['cost.source.read', 'cost.prepare', 'cost.file.read'] as const) => ({ actorId, tenantId, companyId, permissions, requestId: 'c1000000-0000-4000-8000-000000000099' })
const pending = { id: fileId, bucket: 'taskovia-c1-financial', objectKey: `c1-acceptance/run/${fileId}`, originalName: 'source.xlsx', state: 'pending' as const, previewState: 'available' as const, version: 0 }

describe('private C1 file lifecycle', () => {
  it('creates a non-upsert upload intent and finalizes only server-observed metadata', async () => {
    const repository = { createPending: vi.fn(async () => pending), getById: vi.fn(async () => pending), finalize: vi.fn(async () => ({ ...pending, state: 'ready' as const, byteSize: 4, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sha256: 'a'.repeat(64), version: 1 })) }
    const storage = { createUploadUrl: vi.fn(async () => 'https://upload.invalid'), getMetadata: vi.fn(async () => ({ byteSize: 4, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sha256: 'a'.repeat(64) })), createReadUrl: vi.fn() }
    const service = createFileService({ repository, storage, preview: { preview: vi.fn() } })

    await expect(service.createUploadIntent(context(), { originalName: 'source.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).resolves.toMatchObject({ file: pending, uploadUrl: 'https://upload.invalid' })
    await expect(service.finalize(context(), fileId)).resolves.toMatchObject({ state: 'ready', byteSize: 4 })
    expect(storage.createUploadUrl).toHaveBeenCalledWith('taskovia-c1-financial', pending.objectKey, { upsert: false })
    expect(repository.finalize).toHaveBeenCalledWith(expect.objectContaining({ sha256: 'a'.repeat(64), byteSize: 4 }))
    expect(repository.createPending).toHaveBeenCalledWith(expect.objectContaining({ requestId: context().requestId }))
    expect(repository.finalize).toHaveBeenCalledWith(expect.objectContaining({ requestId: context().requestId }))
  })

  it('rejects fake client metadata, oversized files, and raw access without both source and file permissions', async () => {
    const repository = { getById: vi.fn(async () => pending), createPending: vi.fn(), finalize: vi.fn() }
    const storage = { createUploadUrl: vi.fn(), getMetadata: vi.fn(async () => ({ byteSize: 20 * 1024 * 1024 + 1, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sha256: 'a'.repeat(64) })), createReadUrl: vi.fn() }
    const service = createFileService({ repository, storage, preview: { preview: vi.fn() } })

    await expect(service.finalize(context(), fileId)).rejects.toMatchObject({ statusCode: 413, code: 'FILE_TOO_LARGE' })
    await expect(service.createReadUrl(context(['cost.source.read']), fileId)).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    await expect(service.preview(context(['cost.read'] as never), fileId, {})).rejects.toBeInstanceOf(AppApiError)
  })

  it('returns a 60-second no-store read URL only for a ready visible source file', async () => {
    const repository = { getById: vi.fn(async () => ({ ...pending, state: 'ready' as const })), createPending: vi.fn(), finalize: vi.fn() }
    const storage = { createUploadUrl: vi.fn(), getMetadata: vi.fn(), createReadUrl: vi.fn(async () => ({ url: 'https://signed.invalid', expiresAt: '2026-09-12T00:01:00.000Z' })) }
    const service = createFileService({ repository, storage, preview: { preview: vi.fn() } })

    await expect(service.createReadUrl(context(), fileId)).resolves.toEqual({ url: 'https://signed.invalid', expiresAt: '2026-09-12T00:01:00.000Z', cacheControl: 'private, no-store' })
    expect(storage.createReadUrl).toHaveBeenCalledWith('taskovia-c1-financial', pending.objectKey, 60)
  })
})
