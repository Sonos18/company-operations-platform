/**
 * Storage Content-Type for evidence objects.
 *
 * XML invoices are never stored with an XML type: a browser can execute XML as XHTML or SVG when
 * the object is opened inline. They are stored as application/octet-stream, which every browser
 * downloads, so even a signed URL created without `download` cannot render them. The declared
 * MIME type (application/xml or text/xml) stays on the evidence row; only the stored object type
 * differs. The bucket accepts octet-stream and no XML type (20261015090500).
 */
export const XML_EVIDENCE_MIME_TYPES: readonly string[] = ['application/xml', 'text/xml']
export const XML_EVIDENCE_STORAGE_CONTENT_TYPE = 'application/octet-stream'

export function isXmlEvidenceMimeType(mimeType: string): boolean {
  return XML_EVIDENCE_MIME_TYPES.includes(mimeType.trim().toLowerCase())
}

/** The Content-Type an evidence object with this declared MIME type is uploaded and stored with. */
export function evidenceStorageContentType(declaredMimeType: string): string {
  return isXmlEvidenceMimeType(declaredMimeType) ? XML_EVIDENCE_STORAGE_CONTENT_TYPE : declaredMimeType
}
