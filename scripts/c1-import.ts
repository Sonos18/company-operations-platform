import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createControlledImportCommand } from '../server/features/costs/imports/controlled-import.command'
import { prepareVqhWorkbookImport } from '../server/features/costs/imports/vqh-workbook-family-adapter'

const help = `Taskovia C1 controlled import\n\nprepare --manifest <json> --digest <sha256> --company <uuid> --bind <fileIdentity=path>... --output <dir>\nexecute --packet <json> --preparation <json> --bind <fileIdentity=path>... --endpoint <https-url> --access-token-env <name> --execute --output <dir>\nget-result --packet <json> --endpoint <https-url> --access-token-env <name> --output <dir>`
function option(args: string[], name: string) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
function required(args: string[], name: string) { const value = option(args, name); if (!value) throw new Error(`MISSING_OPTION:${name}`); return value }
function bindings(args: string[]) { return args.flatMap((value, index) => value === '--bind' && args[index + 1]?.includes('=') ? [{ fileIdentity: args[index + 1]!.slice(0, args[index + 1]!.indexOf('=')), path: args[index + 1]!.slice(args[index + 1]!.indexOf('=') + 1) }] : []) }
function json(path: string) { return JSON.parse(readFileSync(resolve(path), 'utf8')) }
function output(path: string, value: unknown) { mkdirSync(resolve(path), { recursive: true }); writeFileSync(resolve(path, 'outcome.json'), `${JSON.stringify(value, null, 2)}\n`) }
function httpTransport(endpoint: string, token: string, fetcher: typeof fetch) {
  if (!endpoint.startsWith('https://')) throw new Error('HTTPS_ENDPOINT_REQUIRED')
  async function request(path: string, init?: RequestInit) { const response = await fetcher(`${endpoint.replace(/\/$/u, '')}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init?.headers } }); const value = await response.json(); if (!response.ok) throw new Error(value?.error?.code ?? `HTTP_${response.status}`); return value }
  return { persist: (companyId: string, requestBody: unknown) => request(`/api/companies/${companyId}/controlled-imports`, { method: 'POST', body: JSON.stringify(requestBody) }), get: (companyId: string, runId: string) => request(`/api/companies/${companyId}/controlled-imports/${runId}`) }
}

export async function run(argv = process.argv.slice(2), dependencies: { env: Record<string, string | undefined>; fetch: typeof fetch; prepare: typeof prepareVqhWorkbookImport } = { env: process.env, fetch: globalThis.fetch, prepare: prepareVqhWorkbookImport }) {
  if (argv.length === 0 || argv.includes('--help')) { console.log(help); return }
  const mode = argv[0]
  if (mode === 'prepare') {
    const result = await prepareVqhWorkbookImport({ manifest: json(required(argv, '--manifest')), approvedManifestDigest: required(argv, '--digest'), targetCompanyId: required(argv, '--company'), bindings: bindings(argv), outputDirectory: resolve(required(argv, '--output')) })
    console.log(JSON.stringify({ manifestDigest: result.manifestDigest, counts: result.counts, unresolved: result.unresolved, provenance: result.provenance }))
    return
  }
  if (mode === 'execute' || mode === 'get-result') {
    const packet = json(required(argv, '--packet'))
    const tokenName = required(argv, '--access-token-env')
    const token = dependencies.env[tokenName]
    if (!token) throw new Error('ACCESS_TOKEN_MISSING')
    const outputDirectory = required(argv, '--output')
    const command = createControlledImportCommand(httpTransport(required(argv, '--endpoint'), token, dependencies.fetch))
    let result
    try {
      if (mode === 'execute') {
        const saved = json(required(argv, '--preparation'))
        const fresh = await dependencies.prepare({ manifest: saved.manifest, approvedManifestDigest: packet.manifestDigest, targetCompanyId: packet.companyId, bindings: bindings(argv), outputDirectory: resolve(outputDirectory, 'pre-dispatch') })
        result = await command.execute({ execute: argv.includes('--execute'), packet, preparation: fresh })
      } else result = await command.getResult(packet)
    } catch (error) {
      if (mode === 'execute' && error instanceof Error && error.message === 'WRITE_OUTCOME_UNKNOWN') output(outputDirectory, { status: 'UNKNOWN', runId: packet.runId, idempotencyKey: packet.idempotencyKey, error: error.message })
      throw error
    }
    output(outputDirectory, result)
    console.log(JSON.stringify(result))
    return
  }
  throw new Error(`UNKNOWN_COMMAND:${mode}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
