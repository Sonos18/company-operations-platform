import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_DEV_PROJECT_REF } from './assert-cloud-dev-target.mjs'
import { apiErrorBodySchema, type ApiErrorCode } from '../shared/schemas/api-error'
import { ControlledImportCommandError, controlledImportExecutionPacketSchema, createControlledImportCommand, validateControlledImportDestination } from '../server/features/costs/imports/controlled-import.command'
import { prepareVqhWorkbookImport } from '../server/features/costs/imports/vqh-workbook-family-adapter'

const help = `Taskovia C1 controlled import\n\nprepare --manifest <json> --digest <sha256> --company <uuid> --bind <fileIdentity=path>... --output <dir>\nexecute --packet <json> --preparation <json> --bind <fileIdentity=path>... --endpoint <https-url> --access-token-env <name> --execute --output <dir>\nget-result --packet <json> --endpoint <https-url> --access-token-env <name> --output <dir>`
function option(args: string[], name: string) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
function required(args: string[], name: string) { const value = option(args, name); if (!value) throw new Error(`MISSING_OPTION:${name}`); return value }
function bindings(args: string[]) { return args.flatMap((value, index) => value === '--bind' && args[index + 1]?.includes('=') ? [{ fileIdentity: args[index + 1]!.slice(0, args[index + 1]!.indexOf('=')), path: args[index + 1]!.slice(args[index + 1]!.indexOf('=') + 1) }] : []) }
function json(path: string) { return JSON.parse(readFileSync(resolve(path), 'utf8')) }
function exclusiveJson(path: string, value: unknown) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }) }
const fileEvidence = { open: (path: string, value: unknown) => exclusiveJson(resolve(path, 'attempt.json'), value), finish: (path: string, value: unknown) => exclusiveJson(resolve(path, 'outcome.json'), value) }
const definiteRejections = new Map<ApiErrorCode, number>([['AUTH_REQUIRED', 401], ['AUTH_INVALID', 401], ['INPUT_INVALID', 400], ['COMPANY_FORBIDDEN', 403], ['PERMISSION_DENIED', 403], ['IDEMPOTENCY_CONFLICT', 409], ['RESOURCE_NOT_FOUND', 404]])
const strictApiErrorBodySchema = apiErrorBodySchema.extend({ error: apiErrorBodySchema.shape.error.strict() }).strict()
function safeRequestId(value: string) { return /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : undefined }
function commandError(error: unknown) {
  if (error instanceof ControlledImportCommandError) return error
  return new ControlledImportCommandError({ phase: 'pre_dispatch', code: 'LOCAL_REFUSAL', cause: error })
}
function errorEvidence(error: ControlledImportCommandError) {
  const cause = error.cause
  return { code: error.code, phase: error.phase, ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }), ...(error.requestId ? { requestId: error.requestId } : {}), ...(cause instanceof Error ? { causeName: cause.name, ...('code' in cause && typeof cause.code === 'string' && /^[A-Z0-9_]{1,64}$/u.test(cause.code) ? { causeCode: cause.code } : {}) } : {}) }
}
function reserveAttempt(path: string) {
  try { mkdirSync(path) } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') throw new ControlledImportCommandError({ phase: 'pre_dispatch', code: 'ATTEMPT_DIRECTORY_EXISTS', cause: error })
    throw new ControlledImportCommandError({ phase: 'pre_dispatch', code: 'EVIDENCE_WRITE_FAILED', cause: error })
  }
}
function httpTransport(endpoint: string, token: string, fetcher: typeof fetch) {
  async function request(path: string, init?: RequestInit) {
    let response: Response
    try { response = await fetcher(`${endpoint}${path}`, { ...init, redirect: 'error', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init?.headers } }) } catch (error) { throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'WRITE_OUTCOME_UNKNOWN', cause: error }) }
    if (response.status >= 300 && response.status < 400) throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'UNEXPECTED_REDIRECT', statusCode: response.status })
    let value: unknown
    try { value = JSON.parse(await response.text()) } catch (error) { throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'MALFORMED_RESPONSE', statusCode: response.status, cause: error }) }
    if (!response.ok) {
      const parsed = strictApiErrorBodySchema.safeParse(value)
      if (parsed.success && definiteRejections.get(parsed.data.error.code) === response.status) throw new ControlledImportCommandError({ phase: 'server_rejection', code: parsed.data.error.code, statusCode: response.status, requestId: safeRequestId(parsed.data.error.requestId) })
      throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'UNUSABLE_ERROR_RESPONSE', statusCode: response.status })
    }
    return value
  }
  return { persist: (companyId: string, requestBody: unknown) => request(`/api/companies/${companyId}/controlled-imports`, { method: 'POST', body: JSON.stringify(requestBody) }), get: (companyId: string, runId: string) => request(`/api/companies/${companyId}/controlled-imports/${runId}`) }
}

export async function run(argv = process.argv.slice(2), dependencies: { env: Record<string, string | undefined>; fetch: typeof fetch; prepare: typeof prepareVqhWorkbookImport; evidence?: typeof fileEvidence } = { env: process.env, fetch: globalThis.fetch, prepare: prepareVqhWorkbookImport }) {
  if (argv.length === 0 || argv.includes('--help')) { console.log(help); return }
  const mode = argv[0]
  if (mode === 'prepare') {
    const result = await prepareVqhWorkbookImport({ manifest: json(required(argv, '--manifest')), approvedManifestDigest: required(argv, '--digest'), targetCompanyId: required(argv, '--company'), bindings: bindings(argv), outputDirectory: resolve(required(argv, '--output')) })
    console.log(JSON.stringify({ manifestDigest: result.manifestDigest, counts: result.counts, unresolved: result.unresolved, provenance: result.provenance }))
    return
  }
  if (mode === 'execute' || mode === 'get-result') {
    const packet = controlledImportExecutionPacketSchema.parse(json(required(argv, '--packet')))
    const endpoint = required(argv, '--endpoint')
    validateControlledImportDestination(endpoint, packet.destination, CANONICAL_DEV_PROJECT_REF)
    const tokenName = required(argv, '--access-token-env')
    const token = dependencies.env[tokenName]
    if (!token) throw new Error('ACCESS_TOKEN_MISSING')
    const outputDirectory = required(argv, '--output')
    reserveAttempt(outputDirectory)
    const attemptId = randomUUID()
    const evidence = dependencies.evidence ?? fileEvidence
    const command = createControlledImportCommand(httpTransport(endpoint, token, dependencies.fetch))
    let result
    try {
      if (mode === 'execute') {
        const saved = json(required(argv, '--preparation'))
        const fresh = await dependencies.prepare({ manifest: saved.manifest, approvedManifestDigest: packet.manifestDigest, targetCompanyId: packet.companyId, bindings: bindings(argv), outputDirectory: resolve(outputDirectory, 'pre-dispatch') })
        result = await command.execute({ execute: argv.includes('--execute'), packet, preparation: fresh, beforeDispatch: ({ requestDigest }) => evidence.open(outputDirectory, { schemaVersion: 1, attemptId, status: 'LAUNCH_INTENDED', serverExecutionProven: false, operation: { runId: packet.runId, idempotencyKey: packet.idempotencyKey, authorizationReference: packet.authorizationReference, manifestDigest: packet.manifestDigest, inputDigests: packet.inputDigests, requestDigest }, destination: packet.destination }) })
      } else {
        evidence.open(outputDirectory, { schemaVersion: 1, attemptId, status: 'RECONCILIATION_INTENDED', serverExecutionProven: false, operation: { runId: packet.runId, idempotencyKey: packet.idempotencyKey }, destination: packet.destination })
        result = await command.getResult(packet)
      }
    } catch (error) {
      const failure = commandError(error)
      try { evidence.finish(outputDirectory, { schemaVersion: 1, attemptId, status: failure.phase === 'server_rejection' ? 'REJECTED' : failure.phase === 'post_dispatch_unknown' ? 'UNKNOWN' : 'REFUSED', runId: packet.runId, idempotencyKey: packet.idempotencyKey, error: errorEvidence(failure) }) } catch (writeError) {
        if (failure.phase === 'post_dispatch_unknown' || failure.phase === 'server_rejection') throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'EVIDENCE_WRITE_FAILED_AFTER_DISPATCH', cause: { operationError: failure, writeError } })
      }
      throw failure
    }
    try { evidence.finish(outputDirectory, { schemaVersion: 1, attemptId, status: 'SUCCEEDED', runId: packet.runId, idempotencyKey: packet.idempotencyKey, result }) } catch (error) { throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'EVIDENCE_WRITE_FAILED_AFTER_DISPATCH', cause: error }) }
    console.log(JSON.stringify(result))
    return result
  }
  throw new Error(`UNKNOWN_COMMAND:${mode}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
