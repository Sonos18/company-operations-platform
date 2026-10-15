import { describe, expect, it, vi } from 'vitest'
import { uploadMaterialEvidence } from '../../../app/utils/costs/material-evidence-uploader'
import { ids } from '../material-procurement/fixtures'

const companyId = '10000000-0000-4000-8000-000000000001'
const file = new File(['%PDF-1.7 synthetic'], 'quotation.pdf', { type: 'application/pdf' })
const intent = {
  evidenceFileId: ids.unsignedQuotation,
  version: 0,
  bucketId: 'c1-accounting-evidence',
  objectPath: companyId + '/' + companyId + '/' + ids.project + '/' + ids.unsignedQuotation,
  expiresAt: '2099-10-08T00:00:00.000Z',
  replayed: false,
}
const finalized = {
  id: ids.unsignedQuotation,
  status: 'finalized',
  originalFilename: file.name,
  mimeType: 'application/pdf',
  sizeBytes: file.size,
  sha256: 'a'.repeat(64),
  version: 1,
  finalizedAt: '2026-10-08T00:00:00.000Z',
  replayed: false,
}

function fixture() {
  const createEvidenceIntent = vi.fn(async () => intent)
  const finalizeEvidence = vi.fn(async () => finalized)
  const upload = vi.fn(async () => ({ error: null }))
  return {
    createEvidenceIntent,
    finalizeEvidence,
    upload,
    repository: { createEvidenceIntent, finalizeEvidence } as never,
    supabaseClient: { storage: { from: vi.fn(() => ({ upload })) } } as never,
  }
}

describe('material evidence uploader', () => {
  it('preserves the immutable material role and target through the shared uploader', async () => {
    const value = fixture()
    await uploadMaterialEvidence({
      ...value,
      companyId,
      projectId: ids.project,
      file,
      evidenceRole: 'unsigned_quotation',
      target: { kind: 'material_proposal', proposalId: ids.proposal, revisionId: ids.proposalRevision },
      isScopeCurrent: () => true,
    })

    expect(value.createEvidenceIntent).toHaveBeenCalledWith(
      ids.project,
      expect.objectContaining({
        mimeType: 'application/pdf',
        evidenceRole: 'unsigned_quotation',
        target: { kind: 'material_proposal', proposalId: ids.proposal, revisionId: ids.proposalRevision },
      }),
      expect.anything(),
    )
    expect(value.upload).toHaveBeenCalledOnce()
  })

  it('rejects canonical image evidence for the material-only boundary before Storage upload', async () => {
    const value = fixture()
    await expect(uploadMaterialEvidence({
      ...value,
      companyId,
      projectId: ids.project,
      file: new File(['image'], 'proof.png', { type: 'image/png' }),
      evidenceRole: 'unsigned_quotation',
      target: { kind: 'material_proposal', proposalId: ids.proposal, revisionId: ids.proposalRevision },
      isScopeCurrent: () => true,
    })).rejects.toThrow()
    expect(value.upload).not.toHaveBeenCalled()
  })

  const contractTarget = { kind: 'material_contract' as const, contractId: '10000000-0000-4000-8000-0000000000c1' }

  it('uploads an XML invoice with an application/xml or text/xml MIME type', async () => {
    const value = fixture()
    await uploadMaterialEvidence({
      ...value,
      companyId,
      projectId: ids.project,
      file: new File(['<HDon/>'], 'hoa-don.xml', { type: 'text/xml' }),
      evidenceRole: 'invoice',
      target: contractTarget,
      isScopeCurrent: () => true,
    })
    expect(value.createEvidenceIntent).toHaveBeenCalledWith(
      ids.project,
      expect.objectContaining({ mimeType: 'text/xml', evidenceRole: 'invoice', target: contractTarget }),
      expect.anything(),
    )
    expect(value.upload).toHaveBeenCalledOnce()
  })

  it('derives the XML MIME type from the extension when the browser leaves the type empty', async () => {
    const value = fixture()
    await uploadMaterialEvidence({
      ...value,
      companyId,
      projectId: ids.project,
      file: new File(['<HDon/>'], 'hoa-don.XML', { type: '' }),
      evidenceRole: 'invoice',
      target: contractTarget,
      isScopeCurrent: () => true,
    })
    expect(value.createEvidenceIntent).toHaveBeenCalledWith(
      ids.project,
      expect.objectContaining({ mimeType: 'application/xml' }),
      expect.anything(),
    )
  })

  it('uploads a PNG payment proof', async () => {
    const value = fixture()
    await uploadMaterialEvidence({
      ...value,
      companyId,
      projectId: ids.project,
      file: new File(['png'], 'unc.png', { type: 'image/png' }),
      evidenceRole: 'payment_proof',
      target: contractTarget,
      isScopeCurrent: () => true,
    })
    expect(value.createEvidenceIntent).toHaveBeenCalledWith(
      ids.project,
      expect.objectContaining({ mimeType: 'image/png', evidenceRole: 'payment_proof' }),
      expect.anything(),
    )
  })

  it('rejects a MIME type the evidence role does not allow before any intent or upload', async () => {
    for (const [role, name, type] of [
      ['invoice', 'hoa-don.png', 'image/png'],
      ['payment_proof', 'unc.xml', 'application/xml'],
      ['contract_amendment', 'phu-luc.xml', 'text/xml'],
    ] as const) {
      const value = fixture()
      await expect(uploadMaterialEvidence({
        ...value,
        companyId,
        projectId: ids.project,
        file: new File(['x'], name, { type }),
        evidenceRole: role,
        target: contractTarget,
        isScopeCurrent: () => true,
      })).rejects.toThrow('Định dạng tệp không được hỗ trợ cho loại chứng từ này.')
      expect(value.createEvidenceIntent).not.toHaveBeenCalled()
      expect(value.upload).not.toHaveBeenCalled()
    }
  })
})
