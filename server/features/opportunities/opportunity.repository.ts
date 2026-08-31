import { z } from 'zod'
import {
  contactMethodSchema,
  contactSchema,
  createStage01OpportunityResultSchema,
  duplicateConcernSchema,
  intakeRecordSchema,
  opportunityContactSchema,
  opportunityDetailSchema,
  opportunityReferrerSchema,
  opportunityScopeSchema,
  opportunitySummarySchema,
} from '../../../shared/schemas/opportunities'
import { opportunityCreateOptionsSchema, type OpportunityCreateOptions } from '../../../shared/schemas/opportunity-create-options'
import type {
  AddContactMethodInput,
  AddOpportunityReferrerInput,
  AddOpportunityScopeInput,
  AppendIntakeRecordInput,
  Contact,
  ContactMethod,
  CorrectIntakeRecordInput,
  CreateContactInput,
  CreateOpportunityInput,
  CreateStage01OpportunityResult,
  DuplicateConcern,
  EndOpportunityContactInput,
  EndOpportunityReferrerInput,
  InvalidateOpportunityInput,
  IntakeRecord,
  LinkOpportunityContactInput,
  OpportunityContact,
  OpportunityDetail,
  OpportunityReferrer,
  OpportunityScope,
  OpportunitySummary,
  RaiseDuplicateConcernInput,
  ResolveDuplicateConcernInput,
  RestoreOpportunityInput,
  RetireOpportunityScopeInput,
  SetPrimaryContactInput,
  SetPrimaryReferrerInput,
  UpdateContactInput,
  UpdateContactMethodInput,
  UpdateOpportunityInput,
} from '../../../shared/schemas/opportunities'
import type { UserSupabaseClient } from '../../utils/supabase-client'
import { failStage01Database, mapStage01RpcError } from '../stage01/stage01-errors'

export interface OpportunityDataRepository {
  list(companyId: string): Promise<OpportunitySummary[]>
  getCreateOptions(companyId: string): Promise<OpportunityCreateOptions>
  getById(companyId: string, opportunityId: string): Promise<OpportunityDetail | null>
  create(companyId: string, input: CreateOpportunityInput, requestId: string): Promise<CreateStage01OpportunityResult>
  update(companyId: string, opportunityId: string, input: UpdateOpportunityInput, requestId: string): Promise<OpportunityDetail>
  createContact(companyId: string, input: CreateContactInput, requestId: string): Promise<Contact>
  updateContact(companyId: string, contactId: string, input: UpdateContactInput, requestId: string): Promise<Contact>
  addContactMethod(companyId: string, contactId: string, input: AddContactMethodInput, requestId: string): Promise<ContactMethod>
  updateContactMethod(companyId: string, contactId: string, methodId: string, input: UpdateContactMethodInput, requestId: string): Promise<ContactMethod>
  linkContact(companyId: string, opportunityId: string, input: LinkOpportunityContactInput, requestId: string): Promise<OpportunityContact>
  setPrimaryContact(companyId: string, opportunityId: string, input: SetPrimaryContactInput, requestId: string): Promise<OpportunityContact>
  endContact(companyId: string, opportunityId: string, relationshipId: string, input: EndOpportunityContactInput, requestId: string): Promise<void>
  addScope(companyId: string, opportunityId: string, input: AddOpportunityScopeInput, requestId: string): Promise<OpportunityScope>
  retireScope(companyId: string, opportunityId: string, scopeId: string, input: RetireOpportunityScopeInput, requestId: string): Promise<void>
  addReferrer(companyId: string, opportunityId: string, input: AddOpportunityReferrerInput, requestId: string): Promise<OpportunityReferrer>
  setPrimaryReferrer(companyId: string, opportunityId: string, input: SetPrimaryReferrerInput, requestId: string): Promise<OpportunityReferrer>
  endReferrer(companyId: string, opportunityId: string, referrerId: string, input: EndOpportunityReferrerInput, requestId: string): Promise<void>
  addIntakeRecord(companyId: string, opportunityId: string, input: AppendIntakeRecordInput, requestId: string): Promise<IntakeRecord>
  correctIntakeRecord(companyId: string, opportunityId: string, recordId: string, input: CorrectIntakeRecordInput, requestId: string): Promise<IntakeRecord>
  raiseDuplicateConcern(companyId: string, opportunityId: string, input: RaiseDuplicateConcernInput, requestId: string): Promise<DuplicateConcern>
  resolveDuplicateConcern(companyId: string, opportunityId: string, concernId: string, input: ResolveDuplicateConcernInput, requestId: string): Promise<void>
  invalidate(companyId: string, opportunityId: string, input: InvalidateOpportunityInput, requestId: string): Promise<void>
  restore(companyId: string, opportunityId: string, input: RestoreOpportunityInput, requestId: string): Promise<void>
}

interface QueryResult { data: unknown, error: unknown }
interface Query extends PromiseLike<QueryResult> {
  select(columns: string): Query
  eq(column: string, value: string): Query
  order(column: string, options?: { ascending?: boolean }): Query
  maybeSingle(): Promise<QueryResult>
}
interface OpportunityDataClient {
  from(table: string): Query
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>
}

const uuid = z.string().uuid()
const version = z.number().int().nonnegative()
const opportunityCommandResultSchema = z.object({ opportunityId: uuid, opportunityVersion: version }).strict()
const contactCommandResultSchema = z.object({ contactId: uuid, contactVersion: version }).strict()
const contactMethodCommandResultSchema = z.object({ contactMethodId: uuid, contactId: uuid, contactVersion: version }).strict()
const relationshipCommandResultSchema = z.object({ relationshipId: uuid, opportunityId: uuid, opportunityVersion: version }).strict()
const scopeCommandResultSchema = z.object({ scopeId: uuid, opportunityVersion: version }).strict()
const referrerCommandResultSchema = z.object({ referrerId: uuid, opportunityVersion: version }).strict()
const intakeCommandResultSchema = z.object({ intakeRecordId: uuid, opportunityVersion: version }).strict()
const duplicateCommandResultSchema = z.object({ duplicateConcernId: uuid, opportunityVersion: version }).strict()
const validityCommandResultSchema = z.object({
  opportunityId: uuid,
  validityState: z.enum(['valid', 'invalid']),
  opportunityVersion: version,
}).strict()

const opportunityRowSchema = z.object({
  id: uuid,
  validity_state: z.enum(['valid', 'invalid']),
  canonical_opportunity_id: uuid.nullable(),
  primary_customer_name: z.string().trim().min(1).nullable(),
  customer_type_code: z.string().trim().min(1).nullable(),
  need_description: z.string().trim().min(1).nullable(),
  location_status: z.enum(['unknown', 'area_known', 'relative', 'exact']),
  location_text: z.string().trim().min(1).nullable(),
  primary_lead_source_code: z.string().trim().min(1).nullable(),
  engagement_status_code: z.string().trim().min(1).nullable(),
  budget_status_code: z.string().trim().min(1).nullable(),
  budget_min: z.coerce.number().nonnegative().nullable(),
  budget_max: z.coerce.number().nonnegative().nullable(),
  currency_code: z.string().trim().length(3).nullable(),
  budget_note: z.string().trim().min(1).nullable(),
  timeline_status_code: z.string().trim().min(1).nullable(),
  timeline_start_date: z.string().date().nullable(),
  timeline_end_date: z.string().date().nullable(),
  timeline_note: z.string().trim().min(1).nullable(),
  priority_code: z.string().trim().min(1).nullable(),
  version,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
}).strict()

const contactRowSchema = z.object({
  id: uuid, display_name: z.string().trim().min(1), notes: z.string().trim().min(1).nullable(),
  version, created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
}).strict()
const contactMethodRowSchema = z.object({
  id: uuid, contact_id: uuid, method_type: z.enum(['phone', 'email', 'other']), value: z.string().trim().min(1),
  is_usable: z.boolean(), reliability_state: z.enum(['unverified', 'confirmed', 'disputed']).nullable(),
  created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
}).strict()
const relationshipRowSchema = z.object({
  id: uuid, opportunity_id: uuid, contact_id: uuid, relationship_code: z.string().trim().min(1),
  is_primary: z.boolean(), reliability_state: z.enum(['unverified', 'confirmed', 'disputed']).nullable(),
  created_at: z.string().datetime({ offset: true }), ended_at: z.string().datetime({ offset: true }).nullable(),
  end_reason: z.string().trim().min(1).nullable(),
}).strict()
const scopeRowSchema = z.object({
  id: uuid, opportunity_id: uuid, scope_code: z.string().trim().min(1), note: z.string().trim().min(1).nullable(),
  reliability_state: z.enum(['unverified', 'confirmed', 'disputed']).nullable(),
  created_at: z.string().datetime({ offset: true }), retired_at: z.string().datetime({ offset: true }).nullable(),
  retire_reason: z.string().trim().min(1).nullable(),
}).strict()
const referrerRowSchema = z.object({
  id: uuid, opportunity_id: uuid, referrer_type_code: z.string().trim().min(1), display_name: z.string().trim().min(1),
  contact_id: uuid.nullable(), note: z.string().trim().min(1).nullable(),
  reliability_state: z.enum(['unverified', 'confirmed', 'disputed']).nullable(), is_primary: z.boolean(),
  created_at: z.string().datetime({ offset: true }), ended_at: z.string().datetime({ offset: true }).nullable(),
  end_reason: z.string().trim().min(1).nullable(),
}).strict()
const intakeRowSchema = z.object({
  id: uuid, opportunity_id: uuid, channel_code: z.string().trim().min(1), summary: z.string().trim().min(1),
  correction_of_record_id: uuid.nullable(), correction_reason: z.string().trim().min(1).nullable(),
  created_at: z.string().datetime({ offset: true }),
}).strict()
const duplicateRowSchema = z.object({
  id: uuid, opportunity_id: uuid, suspected_duplicate_opportunity_id: uuid.nullable(), description: z.string().trim().min(1),
  resolution: z.enum(['same_need', 'different_need']).nullable(), canonical_opportunity_id: uuid.nullable(),
  resolution_note: z.string().trim().min(1).nullable(), raised_at: z.string().datetime({ offset: true }),
  resolved_at: z.string().datetime({ offset: true }).nullable(),
}).strict()

const opportunityColumns = 'id, validity_state, canonical_opportunity_id, primary_customer_name, customer_type_code, need_description, location_status, location_text, primary_lead_source_code, engagement_status_code, budget_status_code, budget_min, budget_max, currency_code, budget_note, timeline_status_code, timeline_start_date, timeline_end_date, timeline_note, priority_code, version, created_at, updated_at'
const contactColumns = 'id, display_name, notes, version, created_at, updated_at'
const contactMethodColumns = 'id, contact_id, method_type, value, is_usable, reliability_state, created_at, updated_at'
const relationshipColumns = 'id, opportunity_id, contact_id, relationship_code, is_primary, reliability_state, created_at, ended_at, end_reason'
const scopeColumns = 'id, opportunity_id, scope_code, note, reliability_state, created_at, retired_at, retire_reason'
const referrerColumns = 'id, opportunity_id, referrer_type_code, display_name, contact_id, note, reliability_state, is_primary, created_at, ended_at, end_reason'
const intakeColumns = 'id, opportunity_id, channel_code, summary, correction_of_record_id, correction_reason, created_at'
const duplicateColumns = 'id, opportunity_id, suspected_duplicate_opportunity_id, description, resolution, canonical_opportunity_id, resolution_note, raised_at, resolved_at'

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) return failStage01Database(message)
  return result.data
}

function mapOpportunity(row: z.infer<typeof opportunityRowSchema>, related?: {
  contacts: OpportunityContact[], scopes: OpportunityScope[], referrers: OpportunityReferrer[],
  intakeRecords: IntakeRecord[], duplicateConcerns: DuplicateConcern[],
}): OpportunityDetail | OpportunitySummary {
  const common = {
    id: row.id, validityState: row.validity_state, canonicalOpportunityId: row.canonical_opportunity_id,
    primaryCustomerName: row.primary_customer_name, needDescription: row.need_description,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  }
  if (!related) return opportunitySummarySchema.parse(common)
  return opportunityDetailSchema.parse({
    ...common,
    customerTypeCode: row.customer_type_code, locationStatus: row.location_status, locationText: row.location_text,
    primaryLeadSourceCode: row.primary_lead_source_code, engagementStatusCode: row.engagement_status_code,
    budgetStatusCode: row.budget_status_code, budgetMin: row.budget_min, budgetMax: row.budget_max,
    currencyCode: row.currency_code, budgetNote: row.budget_note, timelineStatusCode: row.timeline_status_code,
    timelineStartDate: row.timeline_start_date, timelineEndDate: row.timeline_end_date,
    timelineNote: row.timeline_note, priorityCode: row.priority_code, ...related,
  })
}

function mapContactMethod(row: z.infer<typeof contactMethodRowSchema>): ContactMethod {
  return contactMethodSchema.parse({ id: row.id, contactId: row.contact_id, methodType: row.method_type, value: row.value,
    isUsable: row.is_usable, reliabilityState: row.reliability_state, createdAt: row.created_at, updatedAt: row.updated_at })
}
function mapRelationship(row: z.infer<typeof relationshipRowSchema>): OpportunityContact {
  return opportunityContactSchema.parse({ id: row.id, opportunityId: row.opportunity_id, contactId: row.contact_id,
    relationshipCode: row.relationship_code, isPrimary: row.is_primary, reliabilityState: row.reliability_state,
    createdAt: row.created_at, endedAt: row.ended_at, endReason: row.end_reason })
}
function mapScope(row: z.infer<typeof scopeRowSchema>): OpportunityScope {
  return opportunityScopeSchema.parse({ id: row.id, opportunityId: row.opportunity_id, scopeCode: row.scope_code,
    note: row.note, reliabilityState: row.reliability_state, createdAt: row.created_at,
    retiredAt: row.retired_at, retireReason: row.retire_reason })
}
function mapReferrer(row: z.infer<typeof referrerRowSchema>): OpportunityReferrer {
  return opportunityReferrerSchema.parse({ id: row.id, opportunityId: row.opportunity_id, referrerTypeCode: row.referrer_type_code,
    displayName: row.display_name, contactId: row.contact_id, note: row.note, reliabilityState: row.reliability_state,
    isPrimary: row.is_primary, createdAt: row.created_at, endedAt: row.ended_at, endReason: row.end_reason })
}
function mapIntake(row: z.infer<typeof intakeRowSchema>): IntakeRecord {
  return intakeRecordSchema.parse({ id: row.id, opportunityId: row.opportunity_id, channelCode: row.channel_code,
    summary: row.summary, correctionOfRecordId: row.correction_of_record_id,
    correctionReason: row.correction_reason, createdAt: row.created_at })
}
function mapDuplicate(row: z.infer<typeof duplicateRowSchema>): DuplicateConcern {
  return duplicateConcernSchema.parse({ id: row.id, opportunityId: row.opportunity_id,
    suspectedDuplicateOpportunityId: row.suspected_duplicate_opportunity_id, description: row.description,
    resolution: row.resolution, canonicalOpportunityId: row.canonical_opportunity_id,
    resolutionNote: row.resolution_note, raisedAt: row.raised_at, resolvedAt: row.resolved_at })
}

export function createSupabaseOpportunityRepository(db: UserSupabaseClient): OpportunityDataRepository {
  const client = db as unknown as OpportunityDataClient

  async function rpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, message: string): Promise<T> {
    const { data, error } = await client.rpc(name, args)
    if (error) return mapStage01RpcError(error, message)
    return parse(schema, data, message)
  }
  async function rows<T>(table: string, columns: string, companyId: string, opportunityId: string, schema: z.ZodType<T>, message: string): Promise<T[]> {
    const { data, error } = await client.from(table).select(columns).eq('company_id', companyId).eq('opportunity_id', opportunityId)
    if (error) return failStage01Database(message)
    return parse(z.array(schema), data, message)
  }
  async function getContact(companyId: string, contactId: string): Promise<Contact> {
    const contactResult = await client.from('contacts').select(contactColumns).eq('company_id', companyId).eq('id', contactId).maybeSingle()
    if (contactResult.error || contactResult.data === null) return failStage01Database('Không thể đọc Contact.')
    const methodResult = await client.from('contact_methods').select(contactMethodColumns).eq('company_id', companyId).eq('contact_id', contactId).order('created_at')
    if (methodResult.error) return failStage01Database('Không thể đọc Contact Method.')
    const row = parse(contactRowSchema, contactResult.data, 'Không thể đọc Contact.')
    const methods = parse(z.array(contactMethodRowSchema), methodResult.data, 'Không thể đọc Contact Method.').map(mapContactMethod)
    return contactSchema.parse({ id: row.id, displayName: row.display_name, notes: row.notes, version: row.version,
      methods, createdAt: row.created_at, updatedAt: row.updated_at })
  }
  async function getOne<T>(table: string, columns: string, companyId: string, id: string, schema: z.ZodType<T>, message: string): Promise<T> {
    const { data, error } = await client.from(table).select(columns).eq('company_id', companyId).eq('id', id).maybeSingle()
    if (error || data === null) return failStage01Database(message)
    return parse(schema, data, message)
  }

  const repository: OpportunityDataRepository = {
    async list(companyId) {
      const { data, error } = await client.from('opportunities').select(opportunityColumns).eq('company_id', companyId).order('created_at', { ascending: false })
      if (error) return failStage01Database('Không thể đọc danh sách Opportunity.')
      return parse(z.array(opportunityRowSchema), data, 'Không thể đọc danh sách Opportunity.').map(row => mapOpportunity(row) as OpportunitySummary)
    },
    async getCreateOptions(companyId) {
      return rpc('get_stage01_opportunity_create_options', { target_company_id: companyId }, opportunityCreateOptionsSchema, 'Không thể đọc tùy chọn tạo Opportunity.')
    },
    async getById(companyId, opportunityId) {
      const result = await client.from('opportunities').select(opportunityColumns).eq('company_id', companyId).eq('id', opportunityId).maybeSingle()
      if (result.error) return failStage01Database('Không thể đọc Opportunity.')
      if (result.data === null) return null
      const [contacts, scopes, referrers, intakeRecords, duplicateConcerns] = await Promise.all([
        rows('opportunity_contacts', relationshipColumns, companyId, opportunityId, relationshipRowSchema, 'Không thể đọc Opportunity Contact.').then(values => values.map(mapRelationship)),
        rows('opportunity_scopes', scopeColumns, companyId, opportunityId, scopeRowSchema, 'Không thể đọc Opportunity Scope.').then(values => values.map(mapScope)),
        rows('opportunity_referrers', referrerColumns, companyId, opportunityId, referrerRowSchema, 'Không thể đọc Opportunity Referrer.').then(values => values.map(mapReferrer)),
        rows('opportunity_intake_records', intakeColumns, companyId, opportunityId, intakeRowSchema, 'Không thể đọc Intake Record.').then(values => values.map(mapIntake)),
        rows('opportunity_duplicate_concerns', duplicateColumns, companyId, opportunityId, duplicateRowSchema, 'Không thể đọc duplicate concern.').then(values => values.map(mapDuplicate)),
      ])
      return mapOpportunity(parse(opportunityRowSchema, result.data, 'Không thể đọc Opportunity.'), {
        contacts, scopes, referrers, intakeRecords, duplicateConcerns,
      }) as OpportunityDetail
    },
    async create(companyId, input, requestId) {
      return rpc('create_stage01_opportunity', { target_company_id: companyId, target_input: input, target_request_id: requestId }, createStage01OpportunityResultSchema, 'Không thể tạo Opportunity.')
    },
    async update(companyId, opportunityId, input, requestId) {
      await rpc('update_opportunity_current_data', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, opportunityCommandResultSchema, 'Không thể cập nhật Opportunity.')
      return await repository.getById(companyId, opportunityId) ?? failStage01Database('Không thể đọc Opportunity sau khi cập nhật.')
    },
    async createContact(companyId, input, requestId) {
      const result = await rpc('create_contact', { target_company_id: companyId, target_input: input, target_request_id: requestId }, contactCommandResultSchema, 'Không thể tạo Contact.')
      return getContact(companyId, result.contactId)
    },
    async updateContact(companyId, contactId, input, requestId) {
      await rpc('update_contact', { target_company_id: companyId, target_contact_id: contactId, target_input: input, target_request_id: requestId }, contactCommandResultSchema, 'Không thể cập nhật Contact.')
      return getContact(companyId, contactId)
    },
    async addContactMethod(companyId, contactId, input, requestId) {
      const result = await rpc('add_contact_method', { target_company_id: companyId, target_contact_id: contactId, target_input: input, target_request_id: requestId }, contactMethodCommandResultSchema, 'Không thể thêm Contact Method.')
      return mapContactMethod(await getOne('contact_methods', contactMethodColumns, companyId, result.contactMethodId, contactMethodRowSchema, 'Không thể đọc Contact Method.'))
    },
    async updateContactMethod(companyId, contactId, methodId, input, requestId) {
      await rpc('update_contact_method', { target_company_id: companyId, target_contact_id: contactId, target_method_id: methodId, target_input: input, target_request_id: requestId }, contactMethodCommandResultSchema, 'Không thể cập nhật Contact Method.')
      return mapContactMethod(await getOne('contact_methods', contactMethodColumns, companyId, methodId, contactMethodRowSchema, 'Không thể đọc Contact Method.'))
    },
    async linkContact(companyId, opportunityId, input, requestId) {
      const result = await rpc('link_opportunity_contact', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, relationshipCommandResultSchema, 'Không thể liên kết Contact.')
      return mapRelationship(await getOne('opportunity_contacts', relationshipColumns, companyId, result.relationshipId, relationshipRowSchema, 'Không thể đọc Opportunity Contact.'))
    },
    async setPrimaryContact(companyId, opportunityId, input, requestId) {
      const result = await rpc('set_opportunity_primary_contact', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, relationshipCommandResultSchema, 'Không thể đặt Primary Contact.')
      return mapRelationship(await getOne('opportunity_contacts', relationshipColumns, companyId, result.relationshipId, relationshipRowSchema, 'Không thể đọc Primary Contact.'))
    },
    async endContact(companyId, opportunityId, relationshipId, input, requestId) {
      await rpc('end_opportunity_contact', { target_company_id: companyId, target_opportunity_id: opportunityId, target_relationship_id: relationshipId, target_input: input, target_request_id: requestId }, relationshipCommandResultSchema, 'Không thể kết thúc Contact relationship.')
    },
    async addScope(companyId, opportunityId, input, requestId) {
      const result = await rpc('add_opportunity_scope', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, scopeCommandResultSchema, 'Không thể thêm Scope.')
      return mapScope(await getOne('opportunity_scopes', scopeColumns, companyId, result.scopeId, scopeRowSchema, 'Không thể đọc Scope.'))
    },
    async retireScope(companyId, opportunityId, scopeId, input, requestId) {
      await rpc('retire_opportunity_scope', { target_company_id: companyId, target_opportunity_id: opportunityId, target_scope_id: scopeId, target_input: input, target_request_id: requestId }, scopeCommandResultSchema, 'Không thể retire Scope.')
    },
    async addReferrer(companyId, opportunityId, input, requestId) {
      const result = await rpc('add_opportunity_referrer', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, referrerCommandResultSchema, 'Không thể thêm Referrer.')
      return mapReferrer(await getOne('opportunity_referrers', referrerColumns, companyId, result.referrerId, referrerRowSchema, 'Không thể đọc Referrer.'))
    },
    async setPrimaryReferrer(companyId, opportunityId, input, requestId) {
      const result = await rpc('set_opportunity_primary_referrer', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, referrerCommandResultSchema, 'Không thể đặt Primary Referrer.')
      return mapReferrer(await getOne('opportunity_referrers', referrerColumns, companyId, result.referrerId, referrerRowSchema, 'Không thể đọc Primary Referrer.'))
    },
    async endReferrer(companyId, opportunityId, referrerId, input, requestId) {
      await rpc('end_opportunity_referrer', { target_company_id: companyId, target_opportunity_id: opportunityId, target_referrer_id: referrerId, target_input: input, target_request_id: requestId }, referrerCommandResultSchema, 'Không thể kết thúc Referrer.')
    },
    async addIntakeRecord(companyId, opportunityId, input, requestId) {
      const result = await rpc('append_opportunity_intake_record', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, intakeCommandResultSchema, 'Không thể thêm Intake Record.')
      return mapIntake(await getOne('opportunity_intake_records', intakeColumns, companyId, result.intakeRecordId, intakeRowSchema, 'Không thể đọc Intake Record.'))
    },
    async correctIntakeRecord(companyId, opportunityId, recordId, input, requestId) {
      const result = await rpc('correct_opportunity_intake_record', { target_company_id: companyId, target_opportunity_id: opportunityId, target_record_id: recordId, target_input: input, target_request_id: requestId }, intakeCommandResultSchema, 'Không thể sửa Intake Record.')
      return mapIntake(await getOne('opportunity_intake_records', intakeColumns, companyId, result.intakeRecordId, intakeRowSchema, 'Không thể đọc Intake Record correction.'))
    },
    async raiseDuplicateConcern(companyId, opportunityId, input, requestId) {
      const result = await rpc('raise_opportunity_duplicate_concern', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, duplicateCommandResultSchema, 'Không thể tạo duplicate concern.')
      return mapDuplicate(await getOne('opportunity_duplicate_concerns', duplicateColumns, companyId, result.duplicateConcernId, duplicateRowSchema, 'Không thể đọc duplicate concern.'))
    },
    async resolveDuplicateConcern(companyId, opportunityId, concernId, input, requestId) {
      await rpc('resolve_opportunity_duplicate', { target_company_id: companyId, target_opportunity_id: opportunityId, target_concern_id: concernId, target_input: input, target_request_id: requestId }, duplicateCommandResultSchema.extend({ opportunityId: uuid }).strict(), 'Không thể xử lý duplicate concern.')
    },
    async invalidate(companyId, opportunityId, input, requestId) {
      await rpc('invalidate_opportunity', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, validityCommandResultSchema, 'Không thể invalidate Opportunity.')
    },
    async restore(companyId, opportunityId, input, requestId) {
      await rpc('restore_opportunity', { target_company_id: companyId, target_opportunity_id: opportunityId, target_input: input, target_request_id: requestId }, validityCommandResultSchema, 'Không thể restore Opportunity.')
    },
  }
  return repository
}
