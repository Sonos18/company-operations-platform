import { z } from 'zod'
import { controlledImportManifestSchema, controlledImportResultSchema } from '../../../../shared/schemas/costs/imports'

const digest = z.string().regex(/^[a-f0-9]{64}$/u)
export const controlledImportExecutionPacketSchema = z.object({
  environment: z.literal('cloud-dev'), authorizationReference: z.string().min(1), companyId: z.string().uuid(), workbookFamily: z.string().min(1), adapter: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(), manifestDigest: digest, inputDigests: z.array(digest).min(1), runId: z.string().uuid(), idempotencyKey: z.string().uuid(),
}).strict()
export const controlledImportPreparationSchema = z.object({
  companyId: z.string().uuid(), workbookFamily: z.string(), adapter: z.object({ id: z.string(), version: z.string() }), manifestDigest: digest, inputDigests: z.array(digest), manifest: controlledImportManifestSchema,
}).passthrough()
export type ControlledImportExecutionPacket = z.infer<typeof controlledImportExecutionPacketSchema>

interface Transport {
  persist(companyId: string, request: unknown): Promise<unknown>
  get(companyId: string, runId: string): Promise<unknown>
}
function same(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right) }

export function createControlledImportCommand(transport: Transport) {
  return {
    async execute(input: { execute: boolean; packet: unknown; preparation: unknown }) {
      if (!input.execute) throw new Error('EXECUTION_INTENT_REQUIRED')
      const packet = controlledImportExecutionPacketSchema.parse(input.packet)
      const preparation = controlledImportPreparationSchema.parse(input.preparation)
      if (packet.companyId !== preparation.companyId || packet.workbookFamily !== preparation.workbookFamily || !same(packet.adapter, preparation.adapter) || packet.manifestDigest !== preparation.manifestDigest || !same(packet.inputDigests, preparation.inputDigests)) throw new Error('EXECUTION_PACKET_MISMATCH')
      try {
        const value = await transport.persist(packet.companyId, { runId: packet.runId, idempotencyKey: packet.idempotencyKey, approvedManifestDigest: packet.manifestDigest, actualInputDigests: packet.inputDigests, manifest: preparation.manifest })
        return controlledImportResultSchema.parse(value)
      } catch (error) {
        if (error instanceof Error && error.message.includes('IDEMPOTENCY_CONFLICT')) throw error
        throw new Error('WRITE_OUTCOME_UNKNOWN', { cause: error })
      }
    },
    async getResult(input: unknown) {
      const packet = controlledImportExecutionPacketSchema.parse(input)
      return controlledImportResultSchema.parse(await transport.get(packet.companyId, packet.runId))
    },
  }
}
