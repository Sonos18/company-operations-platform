import { describe, expect, it } from 'vitest'
import { INVOICE_EVIDENCE_MAX_BYTES, isInvoiceEvidenceFile } from '../../../app/utils/materials/invoice-evidence-file'

describe('isInvoiceEvidenceFile', () => {
  it.each([
    ['hoa-don.pdf', ''],
    ['HOA-DON.XML', ''],
    ['scan.jpg', ''],
    ['scan.JPEG', ''],
    ['scan.png', ''],
    ['no-extension', 'application/pdf'],
    ['no-extension', 'text/xml'],
    ['no-extension', 'image/png'],
  ])('accepts %s (%s)', (name, type) => {
    expect(isInvoiceEvidenceFile({ name, type })).toBe(true)
  })

  it.each([
    ['notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['archive.zip', 'application/zip'],
    ['image.gif', 'image/gif'],
    ['no-extension', ''],
  ])('rejects %s (%s)', (name, type) => {
    expect(isInvoiceEvidenceFile({ name, type })).toBe(false)
  })

  it('limits files to 25 MiB', () => {
    expect(INVOICE_EVIDENCE_MAX_BYTES).toBe(25 * 1024 * 1024)
  })
})
