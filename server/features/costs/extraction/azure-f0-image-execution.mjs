import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const maximumBytes = 4_000_000
const maximumOutputBytes = 1024
const deadlineMs = 5000
let occupied = false

function defaultWorker() {
  const directory = dirname(fileURLToPath(import.meta.url))
  const adjacent = join(directory, 'azure-f0-image-worker.mjs')
  if (existsSync(adjacent)) return adjacent
  // Nitro may bundle this parent module into a server chunk. Only search fixed
  // artifact-relative locations; neither request fields nor environment choose it.
  let parent = directory
  for (let depth = 0; depth < 5; depth++) {
    const candidate = join(parent, 'cost-ocr', 'azure-f0-image-worker.mjs')
    if (existsSync(candidate)) return candidate
    const next = dirname(parent)
    if (next === parent) break
    parent = next
  }
  return adjacent // Missing deployment closure fails closed at spawn.
}

/** One child per server process, no queue. Heap flags are not a total RSS cap. */
export function createAzureF0ImageDecoder(workerFile) {
  return async (bytes, mimeType) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 ||
        bytes.byteLength > maximumBytes || !['image/png', 'image/jpeg'].includes(mimeType) ||
        occupied) return false
    occupied = true
    let snapshot, sha256
    try {
      snapshot = Buffer.from(bytes)
      sha256 = createHash('sha256').update(snapshot).digest('hex')
    } catch {
      occupied = false
      return false
    }
    return new Promise(resolve => {
      const started = performance.now()
      let child, timer, failed = false, outputBytes = 0, output = ''
      const fail = () => {
        failed = true
        if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }
      try {
        child = spawn(process.execPath, [
          '--max-old-space-size=64', '--max-semi-space-size=8',
          workerFile ?? defaultWorker(), mimeType,
        ], {
          shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
          env: { LANG: 'C', TZ: 'UTC' },
        })
      } catch {
        occupied = false
        resolve(false)
        return
      }
      timer = setTimeout(fail, Math.max(0, deadlineMs - (performance.now() - started)))
      child.on('error', fail)
      child.stdin.on('error', fail)
      child.stdout.on('error', fail)
      child.stderr.on('error', fail)
      child.stdout.on('data', chunk => {
        outputBytes += chunk.length
        if (failed || outputBytes > maximumOutputBytes || performance.now() - started >= deadlineMs) {
          fail()
          return
        }
        output += chunk.toString('utf8')
      })
      child.stderr.on('data', () => fail())
      // Wait for close, not just exit: release the permit only after the process
      // and its pipes have closed. A timed-out process can never attest completion.
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        child.stdin.destroy()
        child.stdout.destroy()
        child.stderr.destroy()
        let verified = false
        if (!failed && code === 0 && signal === null && performance.now() - started < deadlineMs) {
          try {
            const value = JSON.parse(output)
            const expected = { complete: value.complete, sha256, sizeBytes: snapshot.length, mimeType }
            verified = typeof value.complete === 'boolean' && value.complete &&
              output === JSON.stringify(expected) + '\n'
          } catch { /* Malformed, extra or duplicate fields fail closed. */ }
        }
        occupied = false
        resolve(verified)
      })
      try { child.stdin.end(snapshot) } catch { fail() }
    })
  }
}

export const decodeAzureF0Image = createAzureF0ImageDecoder()
