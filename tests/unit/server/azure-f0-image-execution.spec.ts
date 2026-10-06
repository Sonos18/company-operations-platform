import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as image from '../../../server/features/costs/extraction/azure-f0-image-inspection'
import { createAzureF0ImageDocumentInspector } from '../../../server/features/costs/extraction/azure-f0-document-inspection'

const require = createRequire(import.meta.url)
const directories: string[] = []
type Decode = (bytes: Uint8Array, mimeType: string) => Promise<boolean>
function decoder(worker?: string): Decode {
  const create = (image as unknown as { createAzureF0ImageDecoder?: (worker?: string) => Decode }).createAzureF0ImageDecoder
  expect(create, 'subprocess execution factory is required').toBeTypeOf('function')
  return create!(worker)
}
function worker(body: string) {
  const directory = mkdtempSync(join(tmpdir(), 'taskovia-image-execution-test-'))
  directories.push(directory)
  const path = join(directory, 'worker.mjs'), pid = join(directory, 'pid'), env = join(directory, 'env.json')
  writeFileSync(path, [
    "import {writeFileSync} from 'node:fs';",
    "import {createHash} from 'node:crypto';",
    'writeFileSync(' + JSON.stringify(pid) + ',String(process.pid));',
    'writeFileSync(' + JSON.stringify(env) + ',JSON.stringify(process.env));',
    "const chunks=[];process.stdin.on('data',chunk=>chunks.push(chunk));process.stdin.on('end',()=>{",
    "const bytes=Buffer.concat(chunks);const mimeType=process.argv[2];",
    "const reply=()=>process.stdout.write(JSON.stringify({complete:true,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,mimeType})+'\\n');",
    body,
    '});',
  ].join('\n'))
  return { path, pid, env }
}
async function started(path: string) {
  const end = Date.now() + 2000
  while (!existsSync(path) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10))
  expect(existsSync(path)).toBe(true)
}
function exited(path: string) {
  const pid = Number(readFileSync(path, 'utf8'))
  expect(() => process.kill(pid, 0)).toThrow()
}
afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
it('decodes supported image bytes in the default child process', async () => {
  const { PNG } = require('pngjs')
  const bytes = PNG.sync.write({ width: 64, height: 64, data: Buffer.alloc(64 * 64 * 4, 128) })
  expect(await decoder()(bytes, 'image/png')).toBe(true)
})
it('copies caller bytes before child execution', async () => {
  const f = worker('setTimeout(reply,100);'), bytes = Buffer.from('immutable synthetic bytes')
  const pending = decoder(f.path)(bytes, 'image/png')
  bytes.fill(0)
  expect(await pending).toBe(true)
  exited(f.pid)
})
it('does not inherit credentials, NODE_OPTIONS or NODE_PATH', async () => {
  vi.stubEnv('TASKOVIA_COST_OCR_AZURE_API_KEY', 'synthetic-only')
  vi.stubEnv('NODE_OPTIONS', '--require=/synthetic-must-not-load')
  vi.stubEnv('NODE_PATH', '/synthetic-must-not-resolve')
  const f = worker('reply();')
  expect(await decoder(f.path)(Buffer.from('safe'), 'image/png')).toBe(true)
  const environment = JSON.parse(readFileSync(f.env, 'utf8'))
  expect(environment).toEqual({ LANG: 'C', TZ: 'UTC' })
  exited(f.pid)
})
it.each([
  ['empty', Buffer.alloc(0), 'image/png'],
  ['oversized', Buffer.alloc(4_000_001), 'image/png'],
  ['unsupported MIME', Buffer.from('safe'), 'application/pdf'],
] as const)('rejects %s without spawning a child', async (_name, bytes, mime) => {
  const f = worker('reply();')
  expect(await decoder(f.path)(bytes, mime)).toBe(false)
  expect(existsSync(f.pid)).toBe(false)
})
it.each([
  ['crash', 'process.exit(7);'],
  ['malformed JSON', "process.stdout.write('not-json');"],
  ['oversized stdout', "process.stdout.write('x'.repeat(2048));"],
  ['stderr', "process.stderr.write('synthetic failure');reply();"],
  ['wrong source hash', "process.stdout.write(JSON.stringify({complete:true,sha256:'0'.repeat(64),sizeBytes:bytes.length,mimeType})+'\\n');"],
  ['duplicate field', "process.stdout.write('{\"complete\":false,\"complete\":true,\"sha256\":\"'+createHash('sha256').update(bytes).digest('hex')+'\",\"sizeBytes\":'+bytes.length+',\"mimeType\":\"'+mimeType+'\"}\\n');"],
] as const)('rejects %s and reaps the owned child', async (_name, body) => {
  const f = worker(body)
  expect(await decoder(f.path)(Buffer.from('safe'), 'image/png')).toBe(false)
  exited(f.pid)
})
it('kills a synchronous stalled child after five seconds and frees its single permit only after exit', async () => {
  const f = worker('while(true){}'), successful = worker('reply();')
  const start = performance.now(), pending = decoder(f.path)(Buffer.from('safe'), 'image/png')
  await started(f.pid)
  expect(await decoder(successful.path)(Buffer.from('safe'), 'image/png')).toBe(false)
  expect(existsSync(successful.pid)).toBe(false)
  expect(await pending).toBe(false)
  expect(performance.now() - start).toBeGreaterThanOrEqual(4800)
  expect(performance.now() - start).toBeLessThan(7500)
  exited(f.pid)
  expect(await decoder(successful.path)(Buffer.from('safe'), 'image/png')).toBe(true)
  exited(successful.pid)
}, 10000)
it('returns incomplete if fresh original access changes while decoding', async () => {
  const { PNG } = require('pngjs'), bytes = PNG.sync.write({ width: 64, height: 64, data: Buffer.alloc(64 * 64 * 4, 128) })
  const id = '11111111-1111-4111-8111-111111111111'
  const metadata = { tenantId: id, companyId: id, projectId: id, fileId: id, fileVersion: 1, sha256: createHash('sha256').update(bytes).digest('hex'), mimeType: 'image/png', sizeBytes: bytes.length }
  let reads = 0
  const inspect = createAzureF0ImageDocumentInspector(metadata, async () => ++reads === 1 ? metadata : null)
  expect((await inspect({ fileId: id, bytes, mimeType: 'image/png', scope: { companyId: id, projectId: id } })).complete).toBe(false)
  expect(reads).toBe(2)
})

it('kills native synchronous work at the deadline and waits for its process to exit', async () => {
  const f = worker("requireNative();"), path = f.path
  writeFileSync(path, readFileSync(path, 'utf8').replace("import {createHash}", "import {pbkdf2Sync} from 'node:crypto';\nimport {createHash}").replace('requireNative();', "pbkdf2Sync('synthetic','synthetic',2147483647,32,'sha256');reply();"))
  const start = performance.now(), pending = decoder(path)(Buffer.from('safe'), 'image/png')
  await started(f.pid)
  expect(await pending).toBe(false)
  expect(performance.now() - start).toBeGreaterThanOrEqual(4800)
  expect(performance.now() - start).toBeLessThan(7500)
  exited(f.pid)
}, 10000)
it('fails closed when the child entry is missing', async () => {
  expect(await decoder(join(tmpdir(), 'taskovia-nonexistent-worker.mjs'))(Buffer.from('safe'), 'image/png')).toBe(false)
})
