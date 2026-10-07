import { z } from 'zod'
import { workflowUuidSchema } from './cost-workflow'
const version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const reason=z.string().trim().min(1).max(2000)
export const workflowCompanyConfigurationSchema=z.object({expectedVersion:version,notificationRecipientId:workflowUuidSchema,reason}).strict()
export const workflowCrewClassificationSchema=z.object({expectedPartyVersion:version,expectedClassificationVersion:version,crewOwnership:z.enum(['vqh_internal','external']),reason}).strict()
export const workflowCompanyActivationSchema=z.object({expectedVersion:version,expectedSnapshotHash:z.string().regex(/^[a-f0-9]{64}$/),historyPolicy:z.literal('preserve_readonly_unknown'),reason}).strict()
export const workflowCompanyCommandResultSchema=z.object({companyId:workflowUuidSchema,mode:z.enum(['legacy','document_backed_v1']),version,replayed:z.boolean()}).strict()
export const workflowClassificationResultSchema=z.object({classificationId:workflowUuidSchema,version:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),replayed:z.boolean()}).strict()
export const workflowCutoverSnapshotSchema=z.object({companyId:workflowUuidSchema,snapshotHash:z.string().regex(/^[a-f0-9]{64}$/),configurationVersion:version,mode:z.enum(['legacy','document_backed_v1']),notificationRecipientId:workflowUuidSchema.nullable(),projectCount:version,activeCrewCount:version,unclassifiedCrewCount:version,pendingLegacyUploads:version,historyPolicy:z.literal('preserve_readonly_unknown')}).strict()
export type WorkflowCompanyConfiguration=z.infer<typeof workflowCompanyConfigurationSchema>
export type WorkflowCrewClassification=z.infer<typeof workflowCrewClassificationSchema>
export type WorkflowCompanyActivation=z.infer<typeof workflowCompanyActivationSchema>
export type WorkflowCompanyCommandResult=z.infer<typeof workflowCompanyCommandResultSchema>
export type WorkflowClassificationResult=z.infer<typeof workflowClassificationResultSchema>
export type WorkflowCutoverSnapshot=z.infer<typeof workflowCutoverSnapshotSchema>

export const workflowCutoverCrewSchema=z.object({id:workflowUuidSchema,code:z.string().min(1),name:z.string().min(1),partyVersion:version,classificationVersion:version,crewOwnership:z.enum(['vqh_internal','external']).nullable(),classificationReviewedAt:z.string().datetime({offset:true}).nullable()}).strict()
export const workflowCutoverCrewsSchema=z.array(workflowCutoverCrewSchema).max(1000)
export type WorkflowCutoverCrew=z.infer<typeof workflowCutoverCrewSchema>
