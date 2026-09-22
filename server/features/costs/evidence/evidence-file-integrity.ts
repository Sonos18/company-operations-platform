import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { AppApiError } from '../../../utils/api-error'

export async function hashEvidenceBlob(blob: Blob, maxBytes: number) {
  const hash = createHash('sha256')
  let sizeBytes = 0
  for await (const chunk of Readable.fromWeb(blob.stream() as never)) {
    const bytes = chunk as Uint8Array
    sizeBytes += bytes.byteLength
    if (sizeBytes > maxBytes) throw new AppApiError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn cho phép.')
    hash.update(bytes)
  }
  return { sizeBytes, sha256: hash.digest('hex') }
}
