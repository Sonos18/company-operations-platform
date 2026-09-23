import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import JSZip, { type JSZipObject } from 'jszip'
import { AppApiError } from '../../../utils/api-error'
import { inspectZipCentralDirectory } from '../../../utils/zip-archive-metadata'

const signatures: Record<string, readonly number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'application/vnd.ms-excel': [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
}

function mismatch(): never { throw new AppApiError(409, 'EVIDENCE_UPLOAD_MISMATCH', 'Định dạng tệp không khớp với khai báo.') }
function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) { return prefix.every((value, index) => bytes[index] === value) }

const maximumXlsxEntries = 1024
const maximumXlsxEntryBytes = 25 * 1024 * 1024
const maximumXlsxExpansionBytes = 256 * 1024 * 1024
const maximumXlsxMetadataBytes = 256 * 1024
const maximumXlsxMetadataExpansionBytes = 512 * 1024
const maximumXlsxMetadataCompressionRatio = 100

function xlsxMetadata(bytes: Uint8Array) {
  const archive = inspectZipCentralDirectory(bytes, {
    maximumEntries: maximumXlsxEntries,
    maximumEntryBytes: maximumXlsxEntryBytes,
    maximumExpansionBytes: maximumXlsxExpansionBytes,
    allowDataDescriptors: true,
  })
  const relevant = archive.entries.filter(entry => entry.name === '[Content_Types].xml' || entry.name === 'xl/workbook.xml')
  if (relevant.length !== 2 || new Set(relevant.map(entry => entry.name)).size !== 2) mismatch()
  let expansion = 0
  for (const entry of relevant) {
    expansion += entry.uncompressedSize
    const ratio = entry.compressedSize === 0
      ? (entry.uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY)
      : entry.uncompressedSize / entry.compressedSize
    if (entry.uncompressedSize > maximumXlsxMetadataBytes
      || expansion > maximumXlsxMetadataExpansionBytes
      || ratio > maximumXlsxMetadataCompressionRatio) mismatch()
  }
  return relevant.find(entry => entry.name === '[Content_Types].xml')!
}

async function boundedText(entry: JSZipObject, expectedBytes: number) {
  return await new Promise<string>((resolve, reject) => {
    const stream = entry.nodeStream() as unknown as { on(event: string, listener: (...args: unknown[]) => void): unknown; destroy(): void }
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const stop = () => {
      if (settled) return
      settled = true
      stream.destroy()
      reject(new Error('XLSX_METADATA_EXPANSION_MISMATCH'))
    }
    stream.on('data', chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk) : Buffer.from(String(chunk))
      if (size + bytes.length > expectedBytes || size + bytes.length > maximumXlsxMetadataBytes) return stop()
      size += bytes.length
      chunks.push(bytes)
    })
    stream.on('error', stop)
    stream.on('end', () => {
      if (settled) return
      settled = true
      if (size !== expectedBytes) return reject(new Error('XLSX_METADATA_EXPANSION_MISMATCH'))
      resolve(Buffer.concat(chunks, size).toString('utf8'))
    })
  })
}

async function verifyXlsx(bytes: Uint8Array) {
  if (!hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) mismatch()
  try {
    const contentTypesMetadata = xlsxMetadata(bytes)
    const archive = await JSZip.loadAsync(bytes)
    const contentTypes = archive.file('[Content_Types].xml')
    if (!contentTypes || !archive.file('xl/workbook.xml')) mismatch()
    const xml = await boundedText(contentTypes, contentTypesMetadata.uncompressedSize)
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
