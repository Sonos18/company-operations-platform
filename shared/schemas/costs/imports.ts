import { z } from 'zod'
import { sourceFigureBalanceKindSchema, sourceFigureBasisSchema, sourceFigureConfirmationSchema, sourceFigureMetricSchema, sourceFigurePeriodBasisSchema, sourceFigureRoundingBasisSchema, sourceFigureScopeKindSchema, sourceFigureValueStateSchema, sourceReviewImpactSchema, sourceReviewIssueKindSchema } from './sources'

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
const mappingSchema = z.object({ state: importMappingStateSchema, projectId: uuid.optional(), partyId: uuid.optional(), engagementId: uuid.optional(), componentId: uuid.optional(), note: z.string().optional() }).strict()
const sourceDescriptorSchema = z.object({ id: text, code: text, title: text, sourceSystem: text, suggestedProjectId: uuid.optional() }).strict()
const sourceVersionDescriptorSchema = z.object({ id: text, sourceId: text, inputFileIdentity: text, inputFileSha256: sha256, originalFilename: text, rawFileReference: z.string().nullable(), sourceVersionLabel: z.string().nullable(), sourcePeriodText: z.string().nullable(), sourceAsOfText: z.string().nullable() }).strict()
const manifestFigureSchema = z.object({ id: text, sectionId: text, label: text, rawValueText: z.string(), valueState: sourceFigureValueStateSchema, amount: decimalSourceAmountSchema.nullable(), currencyCode: z.string().length(3).nullable(), metricKind: sourceFigureMetricSchema, basis: sourceFigureBasisSchema, balanceKind: sourceFigureBalanceKindSchema.nullable(), roundingBasis: sourceFigureRoundingBasisSchema, roundingNote: z.string().nullable(), periodBasis: sourceFigurePeriodBasisSchema, periodFrom: z.string().date().nullable(), periodTo: z.string().date().nullable(), asOfDate: z.string().date().nullable(), mapping: mappingSchema, scopeKind: sourceFigureScopeKindSchema, scopeDescription: text, confirmation: sourceFigureConfirmationSchema, confirmationReference: z.string().nullable() }).strict().superRefine((value, ctx) => { if (value.valueState === 'known' && value.amount === null) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'known requires amount' }); if (value.valueState !== 'known' && value.amount !== null) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'non-known forbids amount' }) })
const manifestIssueSchema = z.object({ id: text, sectionId: text, kind: sourceReviewIssueKindSchema, impact: sourceReviewImpactSchema, description: text, reference: z.string().nullable(), affectedMapping: mappingSchema.optional() }).strict()
const duplicateCandidateSchema = z.object({ id: text, sectionId: text, candidateSectionId: text, reason: text }).strict()
export const controlledImportManifestSchema = z.object({
  schemaVersion: z.literal('1.2'), workbookFamily: text, adapter: z.object({ id: text, version: text }).strict(), targetCompanyId: uuid,
  inputs: z.array(z.object({ fileIdentity: text, sha256, originalFilename: text, rawFileReference: z.string().optional() }).strict()).min(1),
  sources: z.array(sourceDescriptorSchema).min(1), sourceVersions: z.array(sourceVersionDescriptorSchema).min(1),
  sections: z.array(z.object({ id: text, sourceVersionId: text, inputSha256: sha256, locator: importLocatorSchema, mapping: mappingSchema, observedLabels: z.array(z.string()), rawValues: z.array(z.string()), unresolvedIssues: z.array(z.string()) }).strict()).min(1),
  figures: z.array(manifestFigureSchema), reviewIssues: z.array(manifestIssueSchema), duplicateCandidates: z.array(duplicateCandidateSchema),
  expected: z.object({ sources: z.number().int().nonnegative(), versions: z.number().int().nonnegative(), sections: z.number().int().nonnegative(), figures: z.number().int().nonnegative(), reviewIssues: z.number().int().nonnegative() }).strict(),
}).strict().superRefine((value, ctx) => {
  const unique = (items: { id: string }[], label: string) => { const ids = new Set<string>(); for (const item of items) { if (ids.has(item.id)) ctx.addIssue({ code: 'custom', message: `duplicate ${label} id` }); ids.add(item.id) } }
  unique(value.sources, 'source'); unique(value.sourceVersions, 'source version'); unique(value.sections, 'section'); unique(value.figures, 'figure'); unique(value.reviewIssues, 'review issue'); unique(value.duplicateCandidates, 'duplicate candidate')
  const inputs = new Map<string, (typeof value.inputs)[number]>(); for (const input of value.inputs) { if (inputs.has(input.fileIdentity)) ctx.addIssue({ code: 'custom', message: 'duplicate input identity' }); inputs.set(input.fileIdentity, input) }; const sources = new Set(value.sources.map(source => source.id)); const versions = new Map(value.sourceVersions.map(version => [version.id, version])); const sections = new Set(value.sections.map(section => section.id))
  for (const sourceVersion of value.sourceVersions) { const input = inputs.get(sourceVersion.inputFileIdentity); if (!sources.has(sourceVersion.sourceId) || !input || input.sha256 !== sourceVersion.inputFileSha256 || input.originalFilename !== sourceVersion.originalFilename) ctx.addIssue({ code: 'custom', message: 'invalid source version reference' }) }
  for (const section of value.sections) { const sourceVersion = versions.get(section.sourceVersionId); if (!sourceVersion || sourceVersion.inputFileSha256 !== section.inputSha256) ctx.addIssue({ code: 'custom', message: 'invalid section reference' }) }
  for (const figure of value.figures) if (!sections.has(figure.sectionId)) ctx.addIssue({ code: 'custom', message: 'invalid figure section' })
  for (const issue of value.reviewIssues) if (!sections.has(issue.sectionId)) ctx.addIssue({ code: 'custom', message: 'invalid issue section' })
  for (const candidate of value.duplicateCandidates) if (!sections.has(candidate.sectionId) || !sections.has(candidate.candidateSectionId)) ctx.addIssue({ code: 'custom', message: 'invalid duplicate section' })
  if (value.expected.sources !== value.sources.length || value.expected.versions !== value.sourceVersions.length || value.expected.sections !== value.sections.length || value.expected.figures !== value.figures.length || value.expected.reviewIssues !== value.reviewIssues.length) ctx.addIssue({ code: 'custom', message: 'expected counts do not match records' })
})
export const controlledImportRequestSchema = z.object({ runId: uuid, idempotencyKey: uuid, approvedManifestDigest: sha256, actualInputDigests: z.array(sha256).min(1), manifest: controlledImportManifestSchema }).strict()
export const controlledImportResultSchema = z.object({ runId: uuid, sourceIds: z.array(uuid), versionIds: z.array(uuid), sectionIds: z.array(uuid), figureIds: z.array(uuid), reviewIssueIds: z.array(uuid), replayed: z.boolean() }).strict()
export type ControlledImportManifest = z.infer<typeof controlledImportManifestSchema>
export type ControlledImportRequest = z.infer<typeof controlledImportRequestSchema>
export type ControlledImportResult = z.infer<typeof controlledImportResultSchema>
