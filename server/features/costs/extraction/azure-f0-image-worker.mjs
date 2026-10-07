import { createHash } from 'node:crypto'
import { hasCompleteAzureF0Image } from './azure-f0-image-decoder.mjs'

const maximumBytes = 4_000_000
const mimeType = process.argv[2]
let sizeBytes = 0
const chunks = []
if (!['image/png', 'image/jpeg'].includes(mimeType)) process.exit(2)
process.stdin.on('error', () => process.exit(2))
process.stdin.on('data', chunk => {
  sizeBytes += chunk.length
  if (sizeBytes > maximumBytes) process.exit(2)
  chunks.push(chunk)
})
process.stdin.on('end', () => {
  if (sizeBytes === 0) process.exit(2)
  const bytes = Buffer.concat(chunks, sizeBytes)
  const complete = hasCompleteAzureF0Image(bytes, mimeType)
  process.stdout.write(JSON.stringify({
    complete, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes, mimeType,
  }) + '\n')
})
