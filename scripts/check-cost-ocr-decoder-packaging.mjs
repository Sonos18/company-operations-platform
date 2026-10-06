import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, realpathSync, lstatSync } from 'node:fs'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

/** Run against a detached generated Nitro server, never against source node_modules. */
export async function checkCostOcrDecoderPackaging(serverDirectory) {
  const root = realpathSync(resolve(serverDirectory))
  const require = createRequire(pathToFileURL(join(root, 'index.mjs')))
  const checks = []
  const modules = new Map()
  const inside = (path, boundary = root) => {
    const rel = relative(boundary, realpathSync(path))
    return rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel)
  }
  const check = (name, action) => {
    try { checks.push({ name, passed: true, ...action() }) }
    catch (error) { checks.push({ name, passed: false, code: error.code ?? 'PACKAGING_CHECK_FAILED', reason: error.message }) }
  }
  check('generated server entry', () => {
    if (!existsSync(join(root, 'index.mjs'))) throw new Error('Missing generated server entry')
    return {}
  })
  check('runtime dependency declarations', () => {
    const dependencies = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies
    if (dependencies?.pngjs !== '7.0.0' || dependencies?.['jpeg-js'] !== '0.4.4') throw new Error('Missing or incorrect decoder dependency declarations')
    return { versions: { pngjs: dependencies.pngjs, 'jpeg-js': dependencies['jpeg-js'] } }
  })
  for (const name of ['pngjs/package.json', 'pngjs', 'jpeg-js/package.json', 'jpeg-js']) {
    check(name, () => {
      const path = require.resolve(name)
      if (!inside(path, join(root, 'node_modules'))) throw new Error('Decoder resolves outside generated server node_modules')
      const value = require(name)
      if (name.endsWith('/package.json')) {
        const expected = name.startsWith('pngjs/') ? '7.0.0' : '0.4.4'
        if (value.version !== expected) throw new Error('Incorrect decoder version')
      }
      modules.set(name, value)
      return { artifactPath: relative(root, realpathSync(path)) }
    })
  }
  check('original decoder license notices', () => {
    const notices = [
      ['pngjs', 'be75ef59c5cf59715588a17a82dff7dd3e83c4dba3c458676bb9311e05fbedc5'],
      ['jpeg-js', 'c0a8512eabe960492fefd4f287523eb3b5ca1518ca37ef0ec83344cd7f089cb8'],
    ]
    for (const [name, sha256] of notices) {
      const path = join(root, 'node_modules', name, 'LICENSE')
      if (!inside(path, join(root, 'node_modules')) || createHash('sha256').update(readFileSync(path)).digest('hex') !== sha256) throw new Error('Missing or changed original decoder license notice')
    }
    const decoder = join(root, 'node_modules', 'jpeg-js', 'lib', 'decoder.js')
    if (createHash('sha256').update(readFileSync(decoder)).digest('hex') !== 'a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f') throw new Error('Changed JPEG decoder source notice')
    return { noticeFiles: 2, jpegDecoderSourceNoticePreserved: true }
  })
  check('artifact closure and absolute runtime references', () => {
    let files = 0
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (!inside(path)) throw new Error('Generated artifact contains an external symlink')
        if (entry.isSymbolicLink()) {
          if (lstatSync(path).isSymbolicLink()) continue
        } else if (entry.isDirectory()) walk(path)
        else {
          files++
          if (/\.(?:mjs|cjs|js)$/.test(entry.name)) {
            const text = readFileSync(path, 'utf8')
            if (/['"\x60](?:file:\/\/)?\/(?:tmp|data)\//.test(text)) throw new Error('Generated runtime contains an absolute temporary/data dependency path')
          }
        }
      }
    }
    walk(root)
    return { files }
  })
  check('image subprocess runtime files', () => {
    for (const name of ['azure-f0-image-worker.mjs', 'azure-f0-image-decoder.mjs', 'azure-f0-image-execution.mjs']) {
      const path = join(root, 'cost-ocr', name)
      if (!existsSync(path) || !inside(path)) throw new Error('Missing or external image subprocess runtime file')
    }
    return { runtimeFiles: 3 }
  })
  const checkAsync = async (name, action) => {
    try { checks.push({ name, passed: true, ...await action() }) }
    catch (error) { checks.push({ name, passed: false, code: error.code ?? 'PACKAGING_CHECK_FAILED', reason: error.message }) }
  }
  if (['pngjs/package.json', 'pngjs', 'jpeg-js/package.json', 'jpeg-js'].every((name) => modules.has(name))) {
    const width = 64, height = 64
    const data = Buffer.alloc(width * height * 4)
    for (let i = 0; i < data.length; i += 4) { data[i] = 17; data[i + 1] = 34; data[i + 2] = 51; data[i + 3] = 255 }
    check('synthetic PNG encode/decode', () => {
      const { PNG } = modules.get('pngjs')
      const decoded = PNG.sync.read(PNG.sync.write({ width, height, data }), { checkCRC: true })
      if (decoded.width !== width || decoded.height !== height || !Buffer.from(decoded.data).equals(data)) throw new Error('PNG synthetic round-trip mismatch')
      return { width, height, decodedBytes: decoded.data.length }
    })
    check('synthetic JPEG encode/decode', () => {
      const jpeg = modules.get('jpeg-js')
      const decoded = jpeg.decode(jpeg.encode({ width, height, data }, 80).data, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false, maxResolutionInMP: 4, maxMemoryUsageInMB: 64 })
      if (decoded.width !== width || decoded.height !== height || decoded.data.length !== data.length) throw new Error('JPEG synthetic dimensions mismatch')
      for (let i = 0; i < data.length; i += 4) {
        if ([0, 1, 2].some((channel) => Math.abs(decoded.data[i + channel] - data[i + channel]) > 8) || decoded.data[i + 3] !== 255) throw new Error('JPEG synthetic pixel mismatch')
      }
      return { width, height, decodedBytes: decoded.data.length }
    })
  }
  if (modules.has('pngjs') && modules.has('jpeg-js')) {
    await checkAsync('detached PNG and JPEG subprocess decode', async () => {
      const execution = await import(pathToFileURL(join(root, 'cost-ocr', 'azure-f0-image-execution.mjs')).href)
      const width = 64, height = 64, data = Buffer.alloc(width * height * 4, 128)
      const png = modules.get('pngjs').PNG.sync.write({ width, height, data })
      const jpeg = modules.get('jpeg-js').encode({ width, height, data }, 80).data
      if (!await execution.decodeAzureF0Image(png, 'image/png') ||
          !await execution.decodeAzureF0Image(jpeg, 'image/jpeg')) throw new Error('Detached subprocess did not attest the supported synthetic images')
      if (await execution.decodeAzureF0Image(Buffer.from('malformed synthetic image'), 'image/png')) throw new Error('Detached subprocess accepted malformed image')
      return { supportedImages: 2, malformedRejected: true, NODE_PATH: process.env.NODE_PATH ?? null }
    })
  }
  return { passed: checks.every((entry) => entry.passed), checks, passedChecks: checks.filter((entry) => entry.passed).length, failedChecks: checks.filter((entry) => !entry.passed).length, NODE_PATH: process.env.NODE_PATH ?? null }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.env.NODE_PATH) throw new Error('Usage: NODE_PATH unset node scripts/check-cost-ocr-decoder-packaging.mjs DETACHED_SERVER_DIRECTORY')
  const result = await checkCostOcrDecoderPackaging(process.argv[2])
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  process.exitCode = result.passed ? 0 : 2
}
