import { Buffer } from 'node:buffer'

const endOfCentralDirectorySignature = 0x06054b50
const centralDirectorySignature = 0x02014b50

export type ZipArchiveMetadataErrorCode =
  | 'ZIP_ARCHIVE_INVALID'
  | 'ZIP_ARCHIVE_METADATA_UNSUPPORTED'
  | 'ZIP_ARCHIVE_ENTRY_LIMIT_EXCEEDED'
  | 'ZIP_ARCHIVE_ENTRY_SIZE_LIMIT_EXCEEDED'
  | 'ZIP_ARCHIVE_EXPANSION_LIMIT_EXCEEDED'

export class ZipArchiveMetadataError extends Error {
  constructor(readonly code: ZipArchiveMetadataErrorCode) {
    super(code)
  }
}

export interface ZipArchiveEntryMetadata {
  name: string
  compressedSize: number
  uncompressedSize: number
}

interface ZipArchiveLimits {
  maximumEntries: number
  maximumEntryBytes: number
  maximumExpansionBytes: number
  allowDataDescriptors?: boolean
}

function reject(code: ZipArchiveMetadataErrorCode): never {
  throw new ZipArchiveMetadataError(code)
}

export function inspectZipCentralDirectory(input: Uint8Array, limits: ZipArchiveLimits) {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  const start = Math.max(0, bytes.length - 65_557)
  let end = -1
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (bytes.readUInt32LE(offset) === endOfCentralDirectorySignature
      && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      end = offset
      break
    }
  }
  if (end < 0) reject('ZIP_ARCHIVE_INVALID')

  const disk = bytes.readUInt16LE(end + 4)
  const centralDisk = bytes.readUInt16LE(end + 6)
  const entriesOnDisk = bytes.readUInt16LE(end + 8)
  const entryCount = bytes.readUInt16LE(end + 10)
  const centralSize = bytes.readUInt32LE(end + 12)
  const centralOffset = bytes.readUInt32LE(end + 16)
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount
    || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    reject('ZIP_ARCHIVE_METADATA_UNSUPPORTED')
  }
  if (entryCount > limits.maximumEntries) reject('ZIP_ARCHIVE_ENTRY_LIMIT_EXCEEDED')

  const centralEnd = centralOffset + centralSize
  if (!Number.isSafeInteger(centralEnd) || centralOffset > end || centralEnd > end) {
    reject('ZIP_ARCHIVE_METADATA_UNSUPPORTED')
  }

  const entries: ZipArchiveEntryMetadata[] = []
  let cursor = centralOffset
  let declaredExpansion = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralEnd || bytes.readUInt32LE(cursor) !== centralDirectorySignature) {
      reject('ZIP_ARCHIVE_METADATA_UNSUPPORTED')
    }
    const flags = bytes.readUInt16LE(cursor + 8)
    const method = bytes.readUInt16LE(cursor + 10)
    const compressedSize = bytes.readUInt32LE(cursor + 20)
    const uncompressedSize = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const localOffset = bytes.readUInt32LE(cursor + 42)
    if ((flags & 0x01) !== 0 || (!limits.allowDataDescriptors && (flags & 0x08) !== 0)
      || (method !== 0 && method !== 8) || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff || localOffset === 0xffffffff || localOffset >= centralOffset) {
      reject('ZIP_ARCHIVE_METADATA_UNSUPPORTED')
    }
    const next = cursor + 46 + nameLength + extraLength + commentLength
    if (!Number.isSafeInteger(next) || next > centralEnd) reject('ZIP_ARCHIVE_METADATA_UNSUPPORTED')
    if (uncompressedSize > limits.maximumEntryBytes) reject('ZIP_ARCHIVE_ENTRY_SIZE_LIMIT_EXCEEDED')
    declaredExpansion += uncompressedSize
    if (!Number.isSafeInteger(declaredExpansion) || declaredExpansion > limits.maximumExpansionBytes) {
      reject('ZIP_ARCHIVE_EXPANSION_LIMIT_EXCEEDED')
    }
    entries.push({
      name: bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'),
      compressedSize,
      uncompressedSize,
    })
    cursor = next
  }
  if (cursor !== centralEnd) reject('ZIP_ARCHIVE_METADATA_UNSUPPORTED')
  return { entries, declaredExpansion }
}
