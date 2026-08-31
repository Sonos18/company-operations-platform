import { z } from 'zod'
import {
  createStage01ConfigDraftInputSchema,
  discardStage01ConfigDraftInputSchema,
  publishStage01ConfigDraftInputSchema,
  publishStage01ConfigResultSchema,
  stage01BusinessConfigSystemSchema,
  stage01BusinessConfigViewSchema,
  stage01BusinessTaxonomiesSchema,
  stage01ConfigDraftSchema,
  stage01CriteriaSchema,
  updateStage01ConfigDraftInputSchema,
} from '../../../shared/schemas/stage01-config'
import type {
  CreateStage01ConfigDraftInput,
  DiscardStage01ConfigDraftInput,
  PublishStage01ConfigDraftInput,
  PublishStage01ConfigResult,
  Stage01BusinessConfigView,
  Stage01ConfigDraft,
  UpdateStage01ConfigDraftInput,
} from '../../../shared/schemas/stage01-config'
import type { UserSupabaseClient } from '../../utils/supabase-client'
import { AppApiError } from '../../utils/api-error'
import { failStage01Database, mapStage01RpcError } from '../stage01/stage01-errors'

export interface Stage01ConfigDataRepository {
  get(companyId: string): Promise<Stage01BusinessConfigView>
  createDraft(companyId: string, input: CreateStage01ConfigDraftInput, requestId: string): Promise<Stage01ConfigDraft>
  updateDraft(companyId: string, input: UpdateStage01ConfigDraftInput, requestId: string): Promise<Stage01ConfigDraft>
  discardDraft(companyId: string, input: DiscardStage01ConfigDraftInput, requestId: string): Promise<null>
  publishDraft(companyId: string, input: PublishStage01ConfigDraftInput, requestId: string): Promise<PublishStage01ConfigResult>
}

interface QueryResult { data: unknown, error: unknown }
interface Query extends PromiseLike<QueryResult> {
  select(columns: string): Query
  eq(column: string, value: string): Query
  order(column: string, options?: { ascending?: boolean }): Query
  limit(count: number): Query
  maybeSingle(): Promise<QueryResult>
}
interface Stage01ConfigDataClient {
  from(table: string): Query
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>
}

const uuidSchema = z.string().uuid()
const versionSchema = z.number().int().nonnegative()
const positiveVersionSchema = z.number().int().positive()
const meaningfulTextSchema = z.string().trim().min(1)
const timestampSchema = z.string().datetime({ offset: true })
const rawTaxonomyEntrySchema = z.object({
  code: meaningfulTextSchema,
  label: meaningfulTextSchema,
  semanticKey: meaningfulTextSchema.optional(),
  behavior: z.object({ requiresReferrer: z.boolean() }).strict().optional(),
}).strict()
const rawTaxonomyEntriesSchema = z.array(rawTaxonomyEntrySchema).min(1)
const rawTaxonomiesSchema = z.object({
  customer_type: rawTaxonomyEntriesSchema,
  contact_relationship: rawTaxonomyEntriesSchema,
  scope: rawTaxonomyEntriesSchema,
  lead_source: rawTaxonomyEntriesSchema,
  referrer_type: rawTaxonomyEntriesSchema,
  engagement_status: rawTaxonomyEntriesSchema,
  invalid_reason: rawTaxonomyEntriesSchema,
  budget_status: rawTaxonomyEntriesSchema,
  timeline_status: rawTaxonomyEntriesSchema,
  priority: rawTaxonomyEntriesSchema,
  intake_channel: rawTaxonomyEntriesSchema,
  blocker_category: rawTaxonomyEntriesSchema,
}).strict()
const definitionSchema = z.object({
  taxonomies: rawTaxonomiesSchema,
  criteria: stage01CriteriaSchema,
  nodes: z.array(z.unknown()),
  dependencies: z.array(z.unknown()),
  dimensions: z.array(z.unknown()),
  capabilities: z.record(z.string(), z.string()),
  gates: z.unknown(),
}).passthrough()
const snapshotRowSchema = z.object({
  id: uuidSchema,
  template_version: positiveVersionSchema,
  schema_version: positiveVersionSchema,
  definition_hash: meaningfulTextSchema,
  created_at: timestampSchema,
  definition: definitionSchema,
}).strict()
const draftRowSchema = z.object({
  id: uuidSchema,
  base_snapshot_id: uuidSchema,
  version: versionSchema,
  created_by: uuidSchema,
  created_at: timestampSchema,
  updated_by: uuidSchema,
  updated_at: timestampSchema,
  definition: definitionSchema,
}).strict()
const emptyCommandResultSchema = z.object({}).strict()

const snapshotColumns = 'id, template_version, schema_version, definition_hash, created_at, definition'
const draftColumns = 'id, base_snapshot_id, version, created_by, created_at, updated_by, updated_at, definition'

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) return failStage01Database(message)
  return result.data
}

function businessTaxonomies(value: z.infer<typeof rawTaxonomiesSchema>) {
  const stripped = Object.fromEntries(Object.entries(value).map(([key, entries]) => [
    key,
    entries.map(({ semanticKey: _semanticKey, ...entry }) => entry),
  ]))
  return parse(stage01BusinessTaxonomiesSchema, stripped, 'Cấu hình taxonomy Stage 01 không hợp lệ.')
}

function mapDefinition(value: z.infer<typeof definitionSchema>) {
  const system = parse(stage01BusinessConfigSystemSchema, {
    nodes: value.nodes,
    dependencies: value.dependencies,
    dimensions: value.dimensions,
    capabilities: value.capabilities,
    gates: value.gates,
  }, 'Cấu hình hệ thống Stage 01 không hợp lệ.')
  return {
    taxonomies: businessTaxonomies(value.taxonomies),
    criteria: value.criteria,
    system,
  }
}

function mapDraft(row: z.infer<typeof draftRowSchema>): Stage01ConfigDraft {
  const definition = mapDefinition(row.definition)
  return parse(stage01ConfigDraftSchema, {
    id: row.id,
    baseSnapshotId: row.base_snapshot_id,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    taxonomies: definition.taxonomies,
    criteria: definition.criteria,
  }, 'Không thể đọc configuration draft.')
}

function malformedInput(): never {
  throw new AppApiError(500, 'INTERNAL_ERROR', 'Dữ liệu configuration không hợp lệ.')
}

export function createSupabaseStage01ConfigRepository(db: UserSupabaseClient): Stage01ConfigDataRepository {
  const client = db as unknown as Stage01ConfigDataClient

  async function rpc<T>(name: string, input: unknown, inputSchema: z.ZodType<unknown>, companyId: string, requestId: string, resultSchema: z.ZodType<T>, message: string): Promise<T> {
    const validatedInput = inputSchema.safeParse(input)
    if (!validatedInput.success) return malformedInput()
    const { data, error } = await client.rpc(name, {
      target_company_id: companyId,
      target_input: validatedInput.data,
      target_request_id: requestId,
    })
    if (error) return mapStage01RpcError(error, message)
    return parse(resultSchema, data, message)
  }

  return {
    async get(companyId) {
      const snapshotResult = await client.from('workflow_definition_snapshots').select(snapshotColumns)
        .eq('company_id', companyId).eq('workflow_key', 'vqh.stage01')
        .order('template_version', { ascending: false }).limit(1).maybeSingle()
      if (snapshotResult.error) return failStage01Database('Không thể đọc published configuration Stage 01.')
      if (snapshotResult.data === null) {
        throw new AppApiError(409, 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE', 'Cấu hình Stage 01 chưa sẵn sàng.')
      }
      const snapshot = parse(snapshotRowSchema, snapshotResult.data, 'Cấu hình published Stage 01 không hợp lệ.')
      const draftResult = await client.from('workflow_definition_drafts').select(draftColumns)
        .eq('company_id', companyId).eq('workflow_key', 'vqh.stage01').maybeSingle()
      if (draftResult.error) return failStage01Database('Không thể đọc configuration draft.')
      const definition = mapDefinition(snapshot.definition)
      const draft = draftResult.data === null ? null : mapDraft(parse(draftRowSchema, draftResult.data, 'Configuration draft không hợp lệ.'))
      return parse(stage01BusinessConfigViewSchema, {
        workflowKey: 'vqh.stage01',
        published: {
          snapshotId: snapshot.id,
          templateVersion: snapshot.template_version,
          schemaVersion: snapshot.schema_version,
          definitionHash: snapshot.definition_hash,
          publishedAt: snapshot.created_at,
          taxonomies: definition.taxonomies,
          criteria: definition.criteria,
          system: definition.system,
        },
        draft,
      }, 'Không thể đọc Stage 01 configuration.')
    },
    createDraft(companyId, input, requestId) {
      return rpc('create_stage01_config_draft', input, createStage01ConfigDraftInputSchema, companyId, requestId,
        stage01ConfigDraftSchema, 'Không thể tạo configuration draft.')
    },
    updateDraft(companyId, input, requestId) {
      return rpc('update_stage01_config_draft', input, updateStage01ConfigDraftInputSchema, companyId, requestId,
        stage01ConfigDraftSchema, 'Không thể cập nhật configuration draft.')
    },
    async discardDraft(companyId, input, requestId) {
      await rpc('discard_stage01_config_draft', input, discardStage01ConfigDraftInputSchema, companyId, requestId,
        emptyCommandResultSchema, 'Không thể discard configuration draft.')
      return null
    },
    publishDraft(companyId, input, requestId) {
      return rpc('publish_stage01_config_draft', input, publishStage01ConfigDraftInputSchema, companyId, requestId,
        publishStage01ConfigResultSchema, 'Không thể publish configuration draft.')
    },
  }
}
