import { createHash } from 'node:crypto'
import { z } from 'zod'
import { controlledImportManifestSchema, controlledImportResultSchema } from '../../../../shared/schemas/costs/imports'

const digest = z.string().regex(/^[a-f0-9]{64}$/u)
const destinationSchema = z.object({ applicationOrigin: z.string().min(1), supabaseProjectRef: z.string().min(1), associationReference: z.string().min(1) }).strict()
export const controlledImportExecutionPacketSchema = z.object({
  environment: z.literal('cloud-dev'), authorizationReference: z.string().min(1), destination: destinationSchema, companyId: z.string().uuid(), workbookFamily: z.string().min(1), adapter: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(), manifestDigest: digest, inputDigests: z.array(digest).min(1), runId: z.string().uuid(), idempotencyKey: z.string().uuid(),
}).strict()
export const controlledImportPreparationSchema = z.object({
  companyId: z.string().uuid(), workbookFamily: z.string(), adapter: z.object({ id: z.string(), version: z.string() }), manifestDigest: digest, inputDigests: z.array(digest), manifest: controlledImportManifestSchema,
}).passthrough()
export type ControlledImportExecutionPacket = z.infer<typeof controlledImportExecutionPacketSchema>
export type ControlledImportCommandErrorPhase = 'pre_dispatch' | 'server_rejection' | 'post_dispatch_unknown'
export class ControlledImportCommandError extends Error {
  readonly phase: ControlledImportCommandErrorPhase
  readonly code: string
  readonly statusCode?: number
  readonly requestId?: string
  readonly apiCode?: string
  constructor(options: { phase: ControlledImportCommandErrorPhase; code: string; statusCode?: number; requestId?: string; apiCode?: string; cause?: unknown }) {
    super(options.code, { cause: options.cause })
    this.name = 'ControlledImportCommandError'; this.phase = options.phase; this.code = options.code; this.statusCode = options.statusCode; this.requestId = options.requestId; this.apiCode = options.apiCode
  }
}

interface Transport {
  persist(companyId: string, request: unknown): Promise<unknown>
  get(companyId: string, runId: string): Promise<unknown>
}
function same(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right) }
function refusal(code: string, cause?: unknown): never { throw new ControlledImportCommandError({ phase: 'pre_dispatch', code, cause }) }
function packet(input: unknown) { const parsed = controlledImportExecutionPacketSchema.safeParse(input); return parsed.success ? parsed.data : refusal('EXECUTION_PACKET_INVALID', parsed.error) }
function preparation(input: unknown) { const parsed = controlledImportPreparationSchema.safeParse(input); return parsed.success ? parsed.data : refusal('PREPARATION_INVALID', parsed.error) }
function strictOrigin(value: string) {
  let parsed: URL
  try { parsed = new URL(value) } catch (error) { return refusal('DESTINATION_INVALID', error) }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash || value !== parsed.origin) return refusal('DESTINATION_INVALID')
  return parsed.origin
}
export function validateControlledImportDestination(endpoint: string, destination: ControlledImportExecutionPacket['destination'], trustedProjectRef: string) {
  const actualOrigin = strictOrigin(endpoint); const approvedOrigin = strictOrigin(destination.applicationOrigin)
  if (actualOrigin !== approvedOrigin || destination.supabaseProjectRef !== trustedProjectRef) return refusal('DESTINATION_MISMATCH')
  return actualOrigin
}
function requestDigest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

export function createControlledImportCommand(transport: Transport) {
  return {
    async execute(input: { execute: boolean; packet: unknown; preparation: unknown; beforeDispatch?: (value: { packet: ControlledImportExecutionPacket; request: unknown; requestDigest: string }) => void | Promise<void> }) {
      if (!input.execute) return refusal('EXECUTION_INTENT_REQUIRED')
      const parsedPacket = packet(input.packet)
      const parsedPreparation = preparation(input.preparation)
      if (parsedPacket.companyId !== parsedPreparation.companyId || parsedPacket.workbookFamily !== parsedPreparation.workbookFamily || !same(parsedPacket.adapter, parsedPreparation.adapter) || parsedPacket.manifestDigest !== parsedPreparation.manifestDigest || !same(parsedPacket.inputDigests, parsedPreparation.inputDigests)) return refusal('EXECUTION_PACKET_MISMATCH')
      const request = { runId: parsedPacket.runId, idempotencyKey: parsedPacket.idempotencyKey, approvedManifestDigest: parsedPacket.manifestDigest, actualInputDigests: parsedPacket.inputDigests, manifest: parsedPreparation.manifest }
      try { await input.beforeDispatch?.({ packet: parsedPacket, request, requestDigest: requestDigest(request) }) } catch (error) { return refusal('EVIDENCE_WRITE_FAILED', error) }
      try {
        const value = controlledImportResultSchema.parse(await transport.persist(parsedPacket.companyId, request))
        if (value.runId !== parsedPacket.runId) throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'RESULT_IDENTITY_MISMATCH' })
        return value
      } catch (error) {
        if (error instanceof ControlledImportCommandError) throw error
        throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'WRITE_OUTCOME_UNKNOWN', cause: error })
      }
    },
    async getResult(input: unknown) {
      const parsedPacket = packet(input)
      try {
        const value = controlledImportResultSchema.parse(await transport.get(parsedPacket.companyId, parsedPacket.runId))
        if (value.runId !== parsedPacket.runId) throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'RESULT_IDENTITY_MISMATCH' })
        return value
      } catch (error) {
        if (error instanceof ControlledImportCommandError) throw error
        throw new ControlledImportCommandError({ phase: 'post_dispatch_unknown', code: 'MALFORMED_RESPONSE', cause: error })
      }
    },
  }
}
