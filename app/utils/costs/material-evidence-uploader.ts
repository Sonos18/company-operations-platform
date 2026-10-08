import type { SupabaseClient } from '@supabase/supabase-js'
import type { MaterialProcurementRepository } from '../../repositories/material-procurement.contracts'
import {
  materialEvidenceIntentInputSchema,
  type MaterialEvidenceRole,
  type MaterialEvidenceIntentInput,
} from '../../../shared/schemas/costs/material-procurement'
import type { CostEvidenceRepository } from '../../repositories/contracts'
import {
  uploadAndFinalizeEvidence,
  type EvidenceUploadSession,
  type UploadEvidenceResult,
} from './cost-evidence-uploader'

export interface MaterialEvidenceUploadSession {
  targetIdentity: string
  session: EvidenceUploadSession
}

export async function uploadMaterialEvidence(options: {
  companyId: string
  projectId: string
  file: File
  evidenceRole: MaterialEvidenceRole
  target: MaterialEvidenceIntentInput['target']
  repository: MaterialProcurementRepository
  supabaseClient: SupabaseClient
  session?: MaterialEvidenceUploadSession | null
  onSessionChange?: (session: MaterialEvidenceUploadSession) => void
  isScopeCurrent: () => boolean
}): Promise<UploadEvidenceResult> {
  const targetIdentity = JSON.stringify({
    companyId: options.companyId,
    projectId: options.projectId,
    evidenceRole: options.evidenceRole,
    target: options.target,
  })
  const assertCurrent = () => {
    if (!options.isScopeCurrent()) throw new Error('Ngữ cảnh công ty hoặc dự án đã thay đổi.')
  }
  const blocked = async (): Promise<never> => { throw new Error('LEGACY_EVIDENCE_LINK_FORBIDDEN') }
  const evidenceRepo: CostEvidenceRepository = {
    async createUploadIntent(projectId, input, command) {
      assertCurrent()
      if (projectId !== options.projectId) throw new Error('EVIDENCE_SCOPE_MISMATCH')
      const materialInput = materialEvidenceIntentInputSchema.parse({
        ...input,
        evidenceRole: options.evidenceRole,
        target: options.target,
      })
      const intent = await options.repository.createEvidenceIntent(projectId, materialInput, command)
      assertCurrent()
      const parts = intent.objectPath.split('/')
      if (parts.length !== 4
        || parts[1] !== options.companyId
        || parts[2] !== options.projectId
        || parts[3] !== intent.evidenceFileId) throw new Error('EVIDENCE_SCOPE_MISMATCH')
      return intent
    },
    async finalize(fileId, input, command) {
      assertCurrent()
      const value = await options.repository.finalizeEvidence(options.projectId, fileId, input, command)
      assertCurrent()
      return value
    },
    link: blocked,
    listMetadata: blocked,
    linkDetail: blocked,
    listDetailMetadata: blocked,
    getReadUrl: blocked,
  }
  return uploadAndFinalizeEvidence({
    companyId: options.companyId,
    projectId: options.projectId,
    file: options.file,
    evidenceKind: 'other',
    evidenceRepo,
    supabaseClient: options.supabaseClient,
    session: options.session?.targetIdentity === targetIdentity ? options.session.session : null,
    onSessionChange: session => {
      assertCurrent()
      options.onSessionChange?.({ targetIdentity, session })
    },
    isCompanyContextCurrent: options.isScopeCurrent,
  })
}
