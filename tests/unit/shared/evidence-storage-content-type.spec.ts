import { describe, expect, it } from 'vitest'
import { evidenceStorageContentType, isXmlEvidenceMimeType } from '../../../shared/utils/evidence-storage-content-type'

describe('evidence storage content type', () => {
  it.each(['application/xml', 'text/xml', 'APPLICATION/XML'])('stores %s evidence as an opaque download', (mimeType) => {
    expect(isXmlEvidenceMimeType(mimeType)).toBe(true)
    expect(evidenceStorageContentType(mimeType)).toBe('application/octet-stream')
  })

  it.each(['application/pdf', 'image/png', 'image/jpeg'])('stores %s evidence with its own type', (mimeType) => {
    expect(isXmlEvidenceMimeType(mimeType)).toBe(false)
    expect(evidenceStorageContentType(mimeType)).toBe(mimeType)
  })
})
