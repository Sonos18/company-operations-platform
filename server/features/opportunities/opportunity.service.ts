import type { PermissionCode } from '../../../shared/constants/permissions'
import type {
  AddContactMethodInput,
  AddOpportunityReferrerInput,
  AddOpportunityScopeInput,
  AppendIntakeRecordInput,
  CorrectIntakeRecordInput,
  CreateContactInput,
  CreateOpportunityInput,
  EndOpportunityContactInput,
  EndOpportunityReferrerInput,
  InvalidateOpportunityInput,
  LinkOpportunityContactInput,
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
import { AppApiError } from '../../utils/api-error'
import type { Stage01ServiceContext } from '../stage01/stage01.service'
import type { OpportunityDataRepository } from './opportunity.repository'

function requirePermission(context: Stage01ServiceContext, permission: PermissionCode): void {
  if (!context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

function notFound(): never {
  throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', 'Không tìm thấy Opportunity.')
}

export function createOpportunityService(repository: OpportunityDataRepository) {
  return {
    async list(context: Stage01ServiceContext) {
      requirePermission(context, 'opportunity.read')
      return repository.list(context.companyId)
    },
    async get(context: Stage01ServiceContext, opportunityId: string) {
      requirePermission(context, 'opportunity.read')
      return await repository.getById(context.companyId, opportunityId) ?? notFound()
    },
    async create(context: Stage01ServiceContext, input: CreateOpportunityInput) {
      requirePermission(context, 'opportunity.create')
      return repository.create(context.companyId, input, context.requestId)
    },
    async update(context: Stage01ServiceContext, opportunityId: string, input: UpdateOpportunityInput) {
      requirePermission(context, 'opportunity.update')
      return repository.update(context.companyId, opportunityId, input, context.requestId)
    },
    async createContact(context: Stage01ServiceContext, input: CreateContactInput) {
      requirePermission(context, 'opportunity.contact.manage')
      return repository.createContact(context.companyId, input, context.requestId)
    },
    async updateContact(context: Stage01ServiceContext, contactId: string, input: UpdateContactInput) {
      requirePermission(context, 'opportunity.contact.manage')
      return repository.updateContact(context.companyId, contactId, input, context.requestId)
    },
    async addContactMethod(context: Stage01ServiceContext, contactId: string, input: AddContactMethodInput) {
      requirePermission(context, 'opportunity.contact.manage')
      return repository.addContactMethod(context.companyId, contactId, input, context.requestId)
    },
    async updateContactMethod(context: Stage01ServiceContext, contactId: string, methodId: string, input: UpdateContactMethodInput) {
      requirePermission(context, 'opportunity.contact.manage')
      return repository.updateContactMethod(context.companyId, contactId, methodId, input, context.requestId)
    },
    async linkContact(context: Stage01ServiceContext, opportunityId: string, input: LinkOpportunityContactInput) {
      requirePermission(context, 'opportunity.contact.manage')
      return repository.linkContact(context.companyId, opportunityId, input, context.requestId)
    },
    async setPrimaryContact(context: Stage01ServiceContext, opportunityId: string, input: SetPrimaryContactInput) {
      requirePermission(context, 'opportunity.contact.manage')
      return repository.setPrimaryContact(context.companyId, opportunityId, input, context.requestId)
    },
    async endContact(context: Stage01ServiceContext, opportunityId: string, relationshipId: string, input: EndOpportunityContactInput) {
      requirePermission(context, 'opportunity.contact.manage')
      return repository.endContact(context.companyId, opportunityId, relationshipId, input, context.requestId)
    },
    async addScope(context: Stage01ServiceContext, opportunityId: string, input: AddOpportunityScopeInput) {
      requirePermission(context, 'opportunity.scope.manage')
      return repository.addScope(context.companyId, opportunityId, input, context.requestId)
    },
    async retireScope(context: Stage01ServiceContext, opportunityId: string, scopeId: string, input: RetireOpportunityScopeInput) {
      requirePermission(context, 'opportunity.scope.manage')
      return repository.retireScope(context.companyId, opportunityId, scopeId, input, context.requestId)
    },
    async addReferrer(context: Stage01ServiceContext, opportunityId: string, input: AddOpportunityReferrerInput) {
      requirePermission(context, 'opportunity.referrer.manage')
      return repository.addReferrer(context.companyId, opportunityId, input, context.requestId)
    },
    async setPrimaryReferrer(context: Stage01ServiceContext, opportunityId: string, input: SetPrimaryReferrerInput) {
      requirePermission(context, 'opportunity.referrer.manage')
      return repository.setPrimaryReferrer(context.companyId, opportunityId, input, context.requestId)
    },
    async endReferrer(context: Stage01ServiceContext, opportunityId: string, referrerId: string, input: EndOpportunityReferrerInput) {
      requirePermission(context, 'opportunity.referrer.manage')
      return repository.endReferrer(context.companyId, opportunityId, referrerId, input, context.requestId)
    },
    async addIntakeRecord(context: Stage01ServiceContext, opportunityId: string, input: AppendIntakeRecordInput) {
      requirePermission(context, 'opportunity.intake_record.create')
      return repository.addIntakeRecord(context.companyId, opportunityId, input, context.requestId)
    },
    async correctIntakeRecord(context: Stage01ServiceContext, opportunityId: string, recordId: string, input: CorrectIntakeRecordInput) {
      requirePermission(context, 'opportunity.intake_record.create')
      return repository.correctIntakeRecord(context.companyId, opportunityId, recordId, input, context.requestId)
    },
    async raiseDuplicateConcern(context: Stage01ServiceContext, opportunityId: string, input: RaiseDuplicateConcernInput) {
      requirePermission(context, 'opportunity.duplicate.raise')
      return repository.raiseDuplicateConcern(context.companyId, opportunityId, input, context.requestId)
    },
    async resolveDuplicateConcern(context: Stage01ServiceContext, opportunityId: string, concernId: string, input: ResolveDuplicateConcernInput) {
      requirePermission(context, 'opportunity.duplicate.resolve')
      return repository.resolveDuplicateConcern(context.companyId, opportunityId, concernId, input, context.requestId)
    },
    async invalidate(context: Stage01ServiceContext, opportunityId: string, input: InvalidateOpportunityInput) {
      requirePermission(context, 'opportunity.invalidate')
      return repository.invalidate(context.companyId, opportunityId, input, context.requestId)
    },
    async restore(context: Stage01ServiceContext, opportunityId: string, input: RestoreOpportunityInput) {
      requirePermission(context, 'opportunity.restore')
      return repository.restore(context.companyId, opportunityId, input, context.requestId)
    },
  }
}
