import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import JSZip from 'jszip'
import { AppApiError } from '../../../utils/api-error'

const signatures: Record<string, readonly number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'application/vnd.ms-excel': [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
}

function mismatch(): never { throw new AppApiError(409, 'EVIDENCE_UPLOAD_MISMATCH', 'Định dạng tệp không khớp với khai báo.') }
function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) { return prefix.every((value, index) => bytes[index] === value) }

async function verifyXlsx(bytes: Uint8Array) {
  if (!hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) mismatch()
  try {
    const archive = await JSZip.loadAsync(bytes)
    const contentTypes = archive.file('[Content_Types].xml')
    if (!contentTypes || !archive.file('xl/workbook.xml')) mismatch()
    const xml = await contentTypes.async('string')
    if (!xml.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')) mismatch()
  } catch (error) {
    if (error instanceof AppApiError) throw error
    mismatch()
  }
}

export async function verifyEvidenceBlob(blob: Blob, maxBytes: number, mimeType: string) {
  const hash = createHash('sha256')
  let sizeBytes = 0
  const chunks: Uint8Array[] = []
  for await (const chunk of Readable.fromWeb(blob.stream() as never)) {
    const bytes = chunk as Uint8Array
    sizeBytes += bytes.byteLength
    if (sizeBytes > maxBytes) throw new AppApiError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn cho phép.')
    hash.update(bytes)
    chunks.push(bytes)
  }
  const bytes = new Uint8Array(Buffer.concat(chunks))
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') await verifyXlsx(bytes)
  else if (!signatures[mimeType] || !hasPrefix(bytes, signatures[mimeType])) mismatch()
  return { sizeBytes, sha256: hash.digest('hex'), mimeType }
}
