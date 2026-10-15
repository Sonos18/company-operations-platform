import { reactive } from 'vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MaterialEvidenceIntentInput,
  MaterialEvidenceRole,
  MaterialProcurementRepository,
} from '../../../shared/schemas/costs/material-procurement'
import { uploadMaterialEvidence, type MaterialEvidenceUploadSession } from '../costs/material-evidence-uploader'

export interface EvidenceUploadContext {
  companyId: string
  projectId: string
  repository: MaterialProcurementRepository
  supabaseClient: SupabaseClient
  isScopeCurrent: () => boolean
}

interface SlotState {
  file: File | null
  fingerprint: string
  session: MaterialEvidenceUploadSession | null
  fileId: string | null
}

/**
 * Upload state of one file input. The finalized evidence id and the upload session are kept
 * until the file changes, so a retry after a failed command does not upload the file again.
 */
export function createEvidenceUploadSlot(options: {
  evidenceRole: MaterialEvidenceRole
  target: () => MaterialEvidenceIntentInput['target']
  context: () => EvidenceUploadContext
}) {
  const state = reactive<SlotState>({ file: null, fingerprint: '', session: null, fileId: null })

  function reset() {
    state.session = null
    state.fileId = null
  }

  function selectFile(file: File | null) {
    const fingerprint = file ? `${file.name}:${file.size}:${file.lastModified}` : ''
    if (file && fingerprint === state.fingerprint) return
    state.file = file
    state.fingerprint = fingerprint
    reset()
  }

  async function ensureUploaded(): Promise<string> {
    if (state.fileId) return state.fileId
    if (!state.file) throw new Error('Chưa chọn tệp.')
    const result = await uploadMaterialEvidence({
      ...options.context(),
      file: state.file,
      evidenceRole: options.evidenceRole,
      target: options.target(),
      session: state.session,
      onSessionChange: (session) => { state.session = session },
    })
    state.fileId = result.evidenceFileId
    return result.evidenceFileId
  }

  return { state, selectFile, ensureUploaded, reset }
}
