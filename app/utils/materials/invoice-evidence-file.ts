/** File types accepted as invoice evidence: PDF, XML, JPG and PNG, up to 25 MiB. */
export const INVOICE_EVIDENCE_ACCEPT = '.pdf,.xml,.jpg,.jpeg,.png,application/pdf,application/xml,text/xml,image/jpeg,image/png'

export const INVOICE_EVIDENCE_MAX_BYTES = 25 * 1024 * 1024

/** True when the file name or the browser-reported MIME type is one of the accepted invoice file types. */
export function isInvoiceEvidenceFile(file: { name: string, type: string }): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.pdf') || file.type === 'application/pdf'
    || name.endsWith('.xml') || file.type === 'application/xml' || file.type === 'text/xml'
    || name.endsWith('.jpg') || name.endsWith('.jpeg') || file.type === 'image/jpeg'
    || name.endsWith('.png') || file.type === 'image/png'
}
