<template>
  <div class="cockpit-card cost-workflow-original-upload">
    <div class="cockpit-header">
      <h4 class="cockpit-title">Tải lên hồ sơ chứng từ gốc</h4>
      <span v-if="isBusy" class="cockpit-badge cockpit-badge--warning">Đang xử lý</span>
    </div>

    <div class="cockpit-body">
      <div class="cockpit-form-grid">
        <div class="cockpit-form-group">
          <label :for="inputId + '-kind'" class="cockpit-label">Loại chứng từ</label>
          <select
            :id="inputId + '-kind'"
            v-model="selectedKind"
            class="cockpit-select"
            :disabled="isBusy"
          >
            <option v-for="item in availableKinds" :key="item.kind" :value="item.kind">
              {{ item.label }}
            </option>
          </select>
        </div>

        <div class="cockpit-form-group">
          <label :for="inputId + '-file'" class="cockpit-label">Chọn tệp đính kèm</label>
          <input
            :id="inputId + '-file'"
            ref="fileInputRef"
            type="file"
            class="cockpit-input cockpit-file-input"
            :disabled="isBusy"
            @change="onFileChange"
          >
          <p v-if="selectedFile" class="cockpit-file-info">
            Tệp đã chọn: <strong>{{ selectedFile.name }}</strong> ({{ formatFileSize(selectedFile.size) }})
          </p>
        </div>
      </div>

      <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
        {{ errorMessage }}
      </div>

      <div class="cockpit-actions">
        <button
          type="button"
          class="cockpit-btn cockpit-btn--primary"
          :disabled="!selectedFile || isBusy || !companyAccess.hasPermission('cost.request.submit') || !companyAccess.hasPermission('cost.prepare')"
          @click="handleUpload"
        >
          <span v-if="isBusy">Đang tải lên và hoàn tất hồ sơ...</span>
          <span v-else-if="hasActiveSession">Thử lại tải lên hồ sơ</span>
          <span v-else>Tải lên hồ sơ gốc</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowEvidenceIntent } from '../../../shared/schemas/costs/cost-workflow-evidence'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import { uploadWorkflowOriginal, type WorkflowUploadSession } from '../../utils/costs/cost-workflow-uploader'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'

type EvidenceKind = NonNullable<WorkflowEvidenceIntent['evidenceKind']>

interface Props {
  companyId: string
  projectId: string
  target: WorkflowEvidenceIntent['target']
  allowedKinds?: EvidenceKind[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'finalized', payload: { id: string; name: string; kind: string }): void
  (e: 'busy', busy: boolean): void
}>()

const nuxtApp = useNuxtApp()
const repos = useRepositories()
const costWorkflowRepo: CostWorkflowRepository = repos.costWorkflow
const supabaseClient: SupabaseClient = nuxtApp.$supabaseClient
const companyAccess = nuxtApp.$companyAccessStore
const inputId = useId()

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isBusy = ref(false)
const errorMessage = ref('')
const currentSession = ref<WorkflowUploadSession | null>(null)

const kindCatalog: Array<{ kind: EvidenceKind; label: string }> = [
  { kind: 'invoice', label: 'Hóa đơn' },
  { kind: 'contract', label: 'Hợp đồng' },
  { kind: 'quotation', label: 'Báo giá' },
  { kind: 'source_workbook', label: 'Bảng tính gốc' },
  { kind: 'acceptance_record', label: 'Biên bản nghiệm thu' },
  { kind: 'payment_proof', label: 'Chứng từ thanh toán' },
  { kind: 'accounting_support', label: 'Chứng từ hỗ trợ kế toán' },
  { kind: 'other', label: 'Khác' },
]

const availableKinds = computed(() => {
  if (!props.allowedKinds || props.allowedKinds.length === 0) {
    return kindCatalog
  }
  return kindCatalog.filter(item => props.allowedKinds!.includes(item.kind))
})

const initialKind = computed<EvidenceKind>(() => {
  if (props.allowedKinds && props.allowedKinds.length > 0) {
    if (props.allowedKinds.includes('invoice')) return 'invoice'
    return props.allowedKinds[0] ?? 'invoice'
  }
  return 'invoice'
})

const selectedKind = ref<EvidenceKind>(initialKind.value)

watch(initialKind, (newKind) => {
  selectedKind.value = newKind
})

const tracker = createAsyncRequestTracker<{
  companyId: string
  projectId: string
  targetIdentity: string
  permissionFingerprint: string
}>()

function getPermissionFingerprint(): string {
  return JSON.stringify([...companyAccess.permissions].sort())
}

function getTargetIdentity(): string {
  return JSON.stringify({
    companyId: props.companyId,
    projectId: props.projectId,
    target: props.target,
    kind: selectedKind.value,
  })
}

const hasActiveSession = computed(() => currentSession.value !== null)

function setBusy(val: boolean) {
  isBusy.value = val
  emit('busy', val)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function resetAllState() {
  tracker.invalidate()
  currentSession.value = null
  selectedFile.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
  errorMessage.value = ''
  setBusy(false)
}

watch(
  () => JSON.stringify([props.companyId, props.projectId, props.target, props.allowedKinds, companyAccess.activeCompanyId, getPermissionFingerprint()]),
  () => {
    resetAllState()
  },
  { flush: 'sync' }
)

onUnmounted(() => {
  resetAllState()
})

function onFileChange(event: Event) {
  errorMessage.value = ''
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0] ?? null
  } else {
    selectedFile.value = null
  }
}

async function handleUpload() {
  if (!selectedFile.value || isBusy.value || companyAccess.activeCompanyId !== props.companyId || !companyAccess.hasPermission('cost.request.submit') || !companyAccess.hasPermission('cost.prepare')) return
  errorMessage.value = ''

  const capturedCompanyId = props.companyId
  const capturedProjectId = props.projectId
  const capturedTarget = props.target
  const capturedKind = selectedKind.value
  const capturedFile = selectedFile.value
  const capturedTargetIdentity = getTargetIdentity()
  const capturedPermission = getPermissionFingerprint()

  const token = tracker.start({
    companyId: capturedCompanyId,
    projectId: capturedProjectId,
    targetIdentity: capturedTargetIdentity,
    permissionFingerprint: capturedPermission,
  })

  setBusy(true)

  try {
    const isScopeCurrent = (): boolean => {
      return (
        token.isCurrent() &&
        companyAccess.activeCompanyId === capturedCompanyId &&
        companyAccess.hasPermission('cost.request.submit') && companyAccess.hasPermission('cost.prepare') &&
        props.companyId === capturedCompanyId &&
        props.projectId === capturedProjectId &&
        getTargetIdentity() === capturedTargetIdentity &&
        getPermissionFingerprint() === capturedPermission
      )
    }

    const uploadResult = await uploadWorkflowOriginal({
      companyId: capturedCompanyId,
      projectId: capturedProjectId,
      file: capturedFile,
      target: capturedTarget,
      evidenceKind: capturedKind,
      repository: costWorkflowRepo,
      supabaseClient,
      session: currentSession.value,
      onSessionChange: (session) => {
        if (isScopeCurrent()) {
          currentSession.value = session
        }
      },
      isScopeCurrent,
    })

    if (!token.isCurrent() || !isScopeCurrent()) {
      return
    }

    const finalizedId = uploadResult.evidenceFileId

    emit('finalized', {
      id: finalizedId,
      name: capturedFile.name,
      kind: capturedKind,
    })

    currentSession.value = null
    selectedFile.value = null
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  } catch (err: unknown) {
    if (!token.isCurrent()) return
    const msg = err instanceof Error ? err.message : String(err)
    errorMessage.value = `Tải lên hồ sơ thất bại: ${msg}`
  } finally {
    if (token.isCurrent()) {
      setBusy(false)
    }
  }
}
</script>

<style scoped>
.cost-workflow-original-upload {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background-color: #ffffff;
  padding: 16px;
  margin-bottom: 16px;
}

.cockpit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.cockpit-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.cockpit-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 4px;
}

.cockpit-badge--warning {
  background-color: #fef3c7;
  color: #92400e;
}

.cockpit-form-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 12px;
  margin-bottom: 12px;
}

@media (max-width: 640px) {
  .cockpit-form-grid {
    grid-template-columns: 1fr;
  }
}

.cockpit-form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cockpit-label {
  font-size: 13px;
  font-weight: 500;
  color: #475569;
}

.cockpit-select,
.cockpit-input {
  height: 38px;
  padding: 6px 10px;
  font-size: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background-color: #ffffff;
  color: #0f172a;
  outline: none;
}

.cockpit-select:focus,
.cockpit-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}

.cockpit-file-input {
  padding: 4px 6px;
}

.cockpit-file-info {
  font-size: 12px;
  color: #64748b;
  margin: 4px 0 0 0;
}

.cockpit-alert {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 12px;
}

.cockpit-alert--danger {
  background-color: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.cockpit-actions {
  display: flex;
  justify-content: flex-end;
}

.cockpit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cockpit-btn--primary {
  background-color: #2563eb;
  color: #ffffff;
}

.cockpit-btn--primary:hover:not(:disabled) {
  background-color: #1d4ed8;
}

.cockpit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>