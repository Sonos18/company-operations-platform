import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvidenceUploadSlot } from '../../../app/utils/materials/evidence-upload-slot'

const uploadMock = vi.hoisted(() => vi.fn())
vi.mock('../../../app/utils/costs/material-evidence-uploader', () => ({ uploadMaterialEvidence: uploadMock }))

const target = { kind: 'material_order' as const, orderId: '80000000-0000-4000-8000-000000000001' }
const context = {
  companyId: 'company',
  projectId: 'project',
  repository: {} as never,
  supabaseClient: {} as never,
  isScopeCurrent: () => true,
}
const pdf = (name: string, content = 'x') => new File([content], name, { type: 'application/pdf', lastModified: 1 })

function createSlot() {
  return createEvidenceUploadSlot({ evidenceRole: 'signed_contract', target: () => target, context: () => context })
}

describe('createEvidenceUploadSlot', () => {
  beforeEach(() => uploadMock.mockReset())

  it('uploads once with the configured role and target, then reuses the finalized id', async () => {
    uploadMock.mockResolvedValue({ evidenceFileId: 'file-1' })
    const slot = createSlot()
    slot.selectFile(pdf('a.pdf'))
    expect(await slot.ensureUploaded()).toBe('file-1')
    expect(await slot.ensureUploaded()).toBe('file-1')
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock.mock.calls[0]?.[0]).toMatchObject({ evidenceRole: 'signed_contract', target, companyId: 'company', projectId: 'project' })
  })

  it('keeps the upload session between attempts of the same file', async () => {
    uploadMock.mockImplementationOnce(async (options: { onSessionChange: (value: unknown) => void }) => {
      options.onSessionChange({ targetIdentity: 't', session: { id: 's' } })
      throw new Error('network')
    })
    uploadMock.mockResolvedValueOnce({ evidenceFileId: 'file-2' })
    const slot = createSlot()
    slot.selectFile(pdf('a.pdf'))
    await expect(slot.ensureUploaded()).rejects.toThrow('network')
    await slot.ensureUploaded()
    expect(uploadMock.mock.calls[1]?.[0].session).toEqual({ targetIdentity: 't', session: { id: 's' } })
  })

  it('selecting the same file again keeps the result; a different file resets it', async () => {
    uploadMock.mockResolvedValueOnce({ evidenceFileId: 'file-1' }).mockResolvedValueOnce({ evidenceFileId: 'file-2' })
    const slot = createSlot()
    slot.selectFile(pdf('a.pdf'))
    await slot.ensureUploaded()
    slot.selectFile(pdf('a.pdf'))
    expect(slot.state.fileId).toBe('file-1')
    slot.selectFile(pdf('b.pdf', 'other'))
    expect(slot.state.fileId).toBeNull()
    expect(await slot.ensureUploaded()).toBe('file-2')
  })

  it('refuses to upload without a file', async () => {
    const slot = createSlot()
    await expect(slot.ensureUploaded()).rejects.toThrow('Chưa chọn tệp')
    expect(uploadMock).not.toHaveBeenCalled()
  })
})
