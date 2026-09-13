import { z } from 'zod'

const uuid = z.string().uuid()
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i)
const text = z.string().min(1)
export const decimalSourceAmountSchema = z.string().regex(/^-?\d{1,16}(?:\.\d{1,4})?$/)
export const importMappingStateSchema = z.enum(['confirmed', 'pending', 'reference_only', 'excluded'])
export const importLocatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cell_range'), sheetName: z.string().min(1), range: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('logical_section'), section: text }).strict(),
  z.object({ kind: z.literal('whole_file'), note: z.string().optional() }).strict(),
])
export const controlledImportManifestSchema = z.object({
  schemaVersion: z.literal('1.2'), workbookFamily: text, adapter: z.object({ id: text, version: text }).strict(), targetCompanyId: uuid,
  inputs: z.array(z.object({ fileIdentity: text, sha256, originalFilename: text, rawFileReference: z.string().optional() }).strict()).min(1),
  sections: z.array(z.object({ id: text, inputSha256: sha256, locator: importLocatorSchema, mappingState: importMappingStateSchema, observedLabels: z.array(z.string()), rawValues: z.array(z.string()), unresolvedIssues: z.array(z.string()) }).strict()).min(1),
  expected: z.object({ sources: z.number().int().nonnegative(), versions: z.number().int().nonnegative(), sections: z.number().int().nonnegative(), figures: z.number().int().nonnegative(), reviewIssues: z.number().int().nonnegative() }).strict(),
}).strict()
export const controlledImportRequestSchema = z.object({ runId: uuid, idempotencyKey: uuid, approvedManifestDigest: sha256, actualInputDigests: z.array(sha256).min(1), manifest: controlledImportManifestSchema }).strict()
export const controlledImportResultSchema = z.object({ runId: uuid, sourceIds: z.array(uuid), versionIds: z.array(uuid), sectionIds: z.array(uuid), figureIds: z.array(uuid), reviewIssueIds: z.array(uuid), replayed: z.boolean() }).strict()
export type ControlledImportManifest = z.infer<typeof controlledImportManifestSchema>
export type ControlledImportRequest = z.infer<typeof controlledImportRequestSchema>
export type ControlledImportResult = z.infer<typeof controlledImportResultSchema>
