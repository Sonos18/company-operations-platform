import type { Company, CompanyConfig } from '../features/companies/company.types'
import type { AddDrawingVersionInput, DrawingFile } from '../features/drawings/drawing.types'
import type { ProjectMedia } from '../features/media/media.types'
import type { ProjectDetail, ProjectSummary } from '../features/projects/project.types'
import type { ProjectTask, TaskStatus } from '../features/tasks/task.types'
import type { CompanyContext } from '../features/tenancy/tenancy.types'
import type { EmployeeDetail, EmployeeSummary, EmployeeUpdateInput } from '../features/employees/employee.types'
import type {
  AddContactMethodInput, AddOpportunityReferrerInput, AddOpportunityScopeInput,
  AppendIntakeRecordInput, Contact, ContactMethod, CorrectIntakeRecordInput,
  CreateContactInput, CreateOpportunityInput, CreateStage01OpportunityResult, DuplicateConcern,
  EndOpportunityContactInput, EndOpportunityReferrerInput, InvalidateOpportunityInput,
  IntakeRecord, LinkOpportunityContactInput, OpportunityContact, OpportunityDetail,
  OpportunityReferrer, OpportunityScope, OpportunitySummary, RaiseDuplicateConcernInput,
  ResolveDuplicateConcernInput, RestoreOpportunityInput, RetireOpportunityScopeInput,
  SetPrimaryContactInput, SetPrimaryReferrerInput, UpdateContactInput,
  UpdateContactMethodInput, UpdateOpportunityInput,
} from '../features/opportunities/opportunity.types'
import type { OpportunityCreateOptions } from '../../shared/schemas/opportunity-create-options'
import type {
  AssignWorkflowNodeInput, CompleteWorkflowNodeInput, EndWorkflowAssignmentInput,
  RaiseWorkflowBlockerInput, ReopenWorkflowNodeInput, ResolveWorkflowBlockerInput,
  RevalidateWorkflowNodeInput, StartWorkflowNodeInput, WorkflowNodeRuntime, WorkflowRuntime,
} from '../features/workflow/workflow.types'
import type {
  CriterionEvaluationRevisionInput, ReactivateStage01Input, RecordFinalDecisionInput,
  ReturnForClarificationInput, Stage01OperationalDetail, SubmitRecommendationInput,
} from '../features/stage01/stage01.types'
import type {
  CreateStage01ConfigDraftInput, DiscardStage01ConfigDraftInput, PublishStage01ConfigDraftInput,
  PublishStage01ConfigResult, Stage01BusinessConfigView, Stage01ConfigDraft,
  UpdateStage01ConfigDraftInput,
} from '../../shared/schemas/stage01-config'

export interface CompanyRepository {
  getCurrent(): Promise<Company>
  getConfig(): Promise<CompanyConfig>
}

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>
  getById(projectId: string): Promise<ProjectDetail | null>
}

export interface DrawingRepository {
  listByStage(stageId: string): Promise<DrawingFile[]>
  addVersion(input: AddDrawingVersionInput): Promise<DrawingFile>
  setCustomerApproved(fileId: string, approved: boolean): Promise<void>
  setCurrent(fileId: string): Promise<void>
}

export interface TaskRepository {
  listMine(): Promise<ProjectTask[]>
  setStatus(taskId: string, status: TaskStatus): Promise<void>
}

export interface MediaRepository {
  listByStage(stageId: string): Promise<ProjectMedia[]>
}

export interface EmployeeRepository {
  list(): Promise<EmployeeSummary[]>
  getById(employeeId: string): Promise<EmployeeDetail | null>
  update(employeeId: string, input: EmployeeUpdateInput): Promise<EmployeeDetail>
}

export interface PrototypeRepository {
  reset(): Promise<void>
}

export interface OpportunityRepository {
  list(): Promise<OpportunitySummary[]>
  getCreateOptions(): Promise<OpportunityCreateOptions>
  getById(id: string): Promise<OpportunityDetail | null>
  create(input: CreateOpportunityInput): Promise<CreateStage01OpportunityResult>
  update(id: string, input: UpdateOpportunityInput): Promise<OpportunityDetail>
  createContact(input: CreateContactInput): Promise<Contact>
  updateContact(id: string, input: UpdateContactInput): Promise<Contact>
  addContactMethod(contactId: string, input: AddContactMethodInput): Promise<ContactMethod>
  updateContactMethod(contactId: string, methodId: string, input: UpdateContactMethodInput): Promise<ContactMethod>
  linkContact(opportunityId: string, input: LinkOpportunityContactInput): Promise<OpportunityContact>
  setPrimaryContact(opportunityId: string, input: SetPrimaryContactInput): Promise<OpportunityContact>
  endContactRelationship(opportunityId: string, id: string, input: EndOpportunityContactInput): Promise<void>
  addScope(opportunityId: string, input: AddOpportunityScopeInput): Promise<OpportunityScope>
  retireScope(opportunityId: string, id: string, input: RetireOpportunityScopeInput): Promise<void>
  addReferrer(opportunityId: string, input: AddOpportunityReferrerInput): Promise<OpportunityReferrer>
  setPrimaryReferrer(opportunityId: string, input: SetPrimaryReferrerInput): Promise<OpportunityReferrer>
  endReferrer(opportunityId: string, id: string, input: EndOpportunityReferrerInput): Promise<void>
  addIntakeRecord(opportunityId: string, input: AppendIntakeRecordInput): Promise<IntakeRecord>
  correctIntakeRecord(opportunityId: string, id: string, input: CorrectIntakeRecordInput): Promise<IntakeRecord>
  raiseDuplicateConcern(opportunityId: string, input: RaiseDuplicateConcernInput): Promise<DuplicateConcern>
  resolveDuplicateConcern(opportunityId: string, id: string, input: ResolveDuplicateConcernInput): Promise<void>
  invalidate(opportunityId: string, input: InvalidateOpportunityInput): Promise<void>
  restore(opportunityId: string, input: RestoreOpportunityInput): Promise<void>
}

export interface WorkflowRepository {
  getForOpportunity(opportunityId: string): Promise<WorkflowRuntime>
  startNode(nodeExecutionId: string, input: StartWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  completeNode(nodeExecutionId: string, input: CompleteWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  reopenNode(nodeExecutionId: string, input: ReopenWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  revalidateNode(nodeExecutionId: string, input: RevalidateWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  assign(nodeExecutionId: string, input: AssignWorkflowNodeInput): Promise<void>
  endAssignment(assignmentId: string, input: EndWorkflowAssignmentInput): Promise<void>
  raiseBlocker(nodeExecutionId: string, input: RaiseWorkflowBlockerInput): Promise<void>
  resolveBlocker(blockerId: string, input: ResolveWorkflowBlockerInput): Promise<void>
}

export interface Stage01Repository {
  get(opportunityId: string): Promise<Stage01OperationalDetail>
  evaluateCriterion(opportunityId: string, criterionKey: string, input: CriterionEvaluationRevisionInput): Promise<void>
  submitRecommendation(opportunityId: string, input: SubmitRecommendationInput): Promise<void>
  returnForClarification(opportunityId: string, input: ReturnForClarificationInput): Promise<void>
  recordFinalDecision(opportunityId: string, input: RecordFinalDecisionInput): Promise<void>
  reactivate(opportunityId: string, input: ReactivateStage01Input): Promise<void>
}

export interface Stage01ConfigRepository {
  get(): Promise<Stage01BusinessConfigView>
  createDraft(input: CreateStage01ConfigDraftInput): Promise<Stage01ConfigDraft>
  updateDraft(input: UpdateStage01ConfigDraftInput): Promise<Stage01ConfigDraft>
  discardDraft(input: DiscardStage01ConfigDraftInput): Promise<void>
  publishDraft(input: PublishStage01ConfigDraftInput): Promise<PublishStage01ConfigResult>
}

export interface RepositoryRegistry {
  context: Readonly<CompanyContext>
  company: CompanyRepository
  projects: ProjectRepository
  drawings: DrawingRepository
  tasks: TaskRepository
  media: MediaRepository
  employees: EmployeeRepository
  opportunities: OpportunityRepository
  workflow: WorkflowRepository
  stage01: Stage01Repository
  stage01Config: Stage01ConfigRepository
  prototype: PrototypeRepository
}

export type PrototypeRepositoryRegistry = Omit<RepositoryRegistry, 'opportunities' | 'workflow' | 'stage01' | 'stage01Config'>
