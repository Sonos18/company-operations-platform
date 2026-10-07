import type {SupabaseClient} from '@supabase/supabase-js'
import type {CostWorkflowRepository} from '../../repositories/cost-workflow.contracts'
import type {CostEvidenceRepository} from '../../repositories/contracts'
import type {WorkflowEvidenceIntent} from '../../../shared/schemas/costs/cost-workflow-evidence'
import {uploadAndFinalizeEvidence,type EvidenceUploadSession,type UploadEvidenceResult} from './cost-evidence-uploader'
export interface WorkflowUploadSession{targetIdentity:string;session:EvidenceUploadSession}
export async function uploadWorkflowOriginal(options:{
 companyId:string;projectId:string;file:File;target:WorkflowEvidenceIntent['target'];evidenceKind:NonNullable<WorkflowEvidenceIntent['evidenceKind']>;repository:CostWorkflowRepository;supabaseClient:SupabaseClient;
 session?:WorkflowUploadSession|null;onSessionChange?:(session:WorkflowUploadSession)=>void;isScopeCurrent:()=>boolean
}):Promise<UploadEvidenceResult>{
 const targetIdentity=JSON.stringify({companyId:options.companyId,projectId:options.projectId,target:options.target,evidenceKind:options.evidenceKind})
 const assertCurrent=()=>{if(!options.isScopeCurrent())throw new Error('Ngữ cảnh công ty hoặc dự án đã thay đổi.')}
 const blocked=async():Promise<never>=>{throw new Error('LEGACY_EVIDENCE_LINK_FORBIDDEN')}
 const evidenceRepo:CostEvidenceRepository={
  async createUploadIntent(projectId,input,command){assertCurrent();if(projectId!==options.projectId)throw new Error('EVIDENCE_SCOPE_MISMATCH');const intent=await options.repository.createEvidenceIntent(projectId,{...input,target:options.target,evidenceKind:options.evidenceKind},command);assertCurrent();const parts=intent.objectPath.split('/');if(parts.length!==4||parts[1]!==options.companyId||parts[2]!==options.projectId||parts[3]!==intent.evidenceFileId)throw new Error('EVIDENCE_SCOPE_MISMATCH');return intent},
  async finalize(id,input,command){assertCurrent();const value=await options.repository.finalizeEvidence(options.projectId,id,input,command);assertCurrent();return value},
  link:blocked,listMetadata:blocked,linkDetail:blocked,listDetailMetadata:blocked,getReadUrl:blocked,
 }
 return uploadAndFinalizeEvidence({companyId:options.companyId,projectId:options.projectId,file:options.file,evidenceKind:'other',evidenceRepo,supabaseClient:options.supabaseClient,
  session:options.session?.targetIdentity===targetIdentity?options.session.session:null,
  onSessionChange:session=>{assertCurrent();options.onSessionChange?.({targetIdentity,session})},isCompanyContextCurrent:options.isScopeCurrent,
 })
}
