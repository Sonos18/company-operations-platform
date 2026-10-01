<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { CostEvidenceMetadata } from '../../../shared/schemas/costs/cost-evidence'
import {
  ALLOWED_FILE_EXTENSIONS,
  uploadAndFinalizeEvidence,
  validateEvidenceFile,
  type CostEvidenceKind,
  type EvidenceUploadSession,
} from '../../utils/costs/cost-evidence-uploader'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import { isDefinitivelyRejectedError } from '../../utils/costs/cost-command-recovery'

const props = withDefaults(defineProps<{
  projectId: string
  detailId: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'evidence-linked': []
}>()

const repositories = useRepositories()
const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const authStore = nuxtApp.$authStore
const supabase = nuxtApp.$supabaseClient

const canSourceRead = computed(() => companyAccess.hasPermission('cost.source.read'))
const canFileRead = computed(() => companyAccess.hasPermission('cost.file.read') && companyAccess.hasPermission('cost.read'))
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const evidenceList = ref<CostEvidenceMetadata[]>([])
const evidenceTracker = createAsyncRequestTracker<{
  companyId: string | null
  projectId: string
  detailId: string
}>()

// Upload State
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const selectedKind = ref<CostEvidenceKind>('invoice')
const uploading = ref(false)
const uploadProgressStage = ref<string | null>(null)
const uploadError = ref<string | null>(null)
const uploadSuccess = ref<string | null>(null)
const uploadSession = ref<EvidenceUploadSession | null>(null)
const pendingDetailLink = ref<{
  companyId: string
  actorId: string
  projectId: string
  detailId: string
  idempotencyKey: string
  payload: { evidenceFileId: string, evidenceKind: CostEvidenceKind }
  originalFilename: string
} | null>(null)
let uploadContextGeneration = 0

// Raw URL opening state
const openingFileId = ref<string | null>(null)

function resetUploadState() {
  selectedFile.value = null
  selectedKind.value = 'invoice'
  uploading.value = false
  uploadProgressStage.value = null
  uploadError.value = null
  uploadSuccess.value = null
  uploadSession.value = null
  pendingDetailLink.value = null
  openingFileId.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const evidenceKindLabels: Record<CostEvidenceKind, string> = {
  contract: 'Hợp đồng (contract)',
  acceptance_record: 'Biên bản nghiệm thu (acceptance_record)',
  invoice: 'Hóa đơn GTGT (invoice)',
  accounting_support: 'Chứng từ kế toán (accounting_support)',
  payment_proof: 'Ủy nhiệm chi / Giấy nộp tiền (payment_proof)',
  source_workbook: 'Bảng tính gốc (source_workbook)',
  other: 'Khác (other)',
}

async function fetchEvidenceList() {
  const request = evidenceTracker.start({
    companyId: companyAccess.activeCompanyId,
    projectId: props.projectId,
    detailId: props.detailId,
  })

  evidenceList.value = []
  errorMessage.value = null

  if (!canSourceRead.value || !props.detailId) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    const list = await repositories.costEvidence.listDetailMetadata(props.detailId)
    if (!request.isCurrent()) return
    evidenceList.value = list
  }
  catch (err: unknown) {
    if (!request.isCurrent()) return
    errorMessage.value = extractErrorMessage(err, 'Không thể tải danh sách chứng từ.')
  }
  finally {
    if (request.isCurrent()) loading.value = false
  }
}

watch(
  [() => props.projectId, () => props.detailId, () => companyAccess.activeCompanyId, () => authStore?.user?.id, canSourceRead, canPrepare],
  () => {
    uploadContextGeneration++
    resetUploadState()
    fetchEvidenceList()
  },
  { immediate: true },
)

onUnmounted(() => {
  uploadContextGeneration++
  evidenceTracker.invalidate()
})

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  uploadError.value = null
  uploadSuccess.value = null

  if (!input.files || input.files.length === 0) {
    selectedFile.value = null
    return
  }

  const file = input.files[0]
  if (!file) {
    selectedFile.value = null
    return
  }

  const validation = validateEvidenceFile(file)
  if (!validation.valid) {
    uploadError.value = validation.error ?? 'Tệp không hợp lệ'
    selectedFile.value = null
    input.value = ''
    return
  }

  selectedFile.value = file
}

async function startUploadAndLink() {
  if (uploading.value || (!selectedFile.value && !pendingDetailLink.value) || !props.detailId || !props.projectId) return
  if (!canPrepare.value) {
    uploadError.value = 'Bạn không có quyền cost.prepare để tải lên và liên kết chứng từ.'
    return
  }

  const companyId = companyAccess.activeCompanyId ?? ''
  const actorId = authStore?.user?.id ?? 'anonymous'
  const projectId = props.projectId
  const detailId = props.detailId
  const generation = uploadContextGeneration
  const isCurrent = () => uploadContextGeneration === generation
    && companyAccess.activeCompanyId === companyId
    && (authStore?.user?.id ?? 'anonymous') === actorId
    && props.projectId === projectId
    && props.detailId === detailId
    && canPrepare.value
  if (pendingDetailLink.value && (
    pendingDetailLink.value.companyId !== companyId
    || pendingDetailLink.value.actorId !== actorId
    || pendingDetailLink.value.projectId !== projectId
    || pendingDetailLink.value.detailId !== detailId
  )) return
  uploading.value = true
  uploadError.value = null
  uploadSuccess.value = null
  uploadProgressStage.value = 'Đang tính mã băm SHA-256…'

  try {
    const file = selectedFile.value
    const stageMap: Record<string, string> = {
      hashing: 'Đang tính mã băm SHA-256…',
      intent: 'Đang tạo ý định tải lên an toàn…',
      uploading: 'Đang tải tệp lên kho lưu trữ chứng từ…',
      finalizing: 'Đang xác thực cấu trúc tệp trên máy chủ…',
    }

    if (!pendingDetailLink.value) {
      if (!file) return
      const evidenceKind = selectedKind.value
      const uploadResult = await uploadAndFinalizeEvidence({
        companyId,
        projectId,
        file,
        evidenceKind,
        evidenceRepo: repositories.costEvidence,
        supabaseClient: supabase,
        session: uploadSession.value,
        isCompanyContextCurrent: isCurrent,
        onSessionChange: (session: EvidenceUploadSession) => {
          if (isCurrent()) uploadSession.value = session
        },
        onProgress: (stage: 'hashing' | 'intent' | 'uploading' | 'finalizing' | 'linking') => {
          if (isCurrent()) uploadProgressStage.value = stageMap[stage] || stage
        },
      })
      if (!isCurrent()) return
      pendingDetailLink.value = {
        companyId,
        actorId,
        projectId,
        detailId,
        idempotencyKey: globalThis.crypto.randomUUID(),
        payload: { evidenceFileId: uploadResult.evidenceFileId, evidenceKind },
        originalFilename: uploadResult.originalFilename,
      }
    }

    uploadProgressStage.value = 'Đang liên kết chứng từ với chi tiết chi phí…'

    const command = pendingDetailLink.value
    if (!command || !isCurrent()) return
    await repositories.costEvidence.linkDetail(
      command.detailId,
      command.payload,
      { idempotencyKey: command.idempotencyKey },
    )

    if (!isCurrent()) return
    resetUploadState()
    uploadSuccess.value = `Đã liên kết chứng từ "${command.originalFilename}" thành công.`
    await fetchEvidenceList()
    if (isCurrent()) emit('evidence-linked')
  }
  catch (err: unknown) {
    if (isCurrent()) {
      if (pendingDetailLink.value && isDefinitivelyRejectedError(err)) pendingDetailLink.value = null
      uploadError.value = extractErrorMessage(err, 'Lỗi khi tải lên hoặc liên kết chứng từ.')
    }
  }
  finally {
    if (isCurrent()) {
      uploading.value = false
      uploadProgressStage.value = null
    }
  }
}

async function openFile(evidenceFileId: string) {
  if (!canFileRead.value) return
  openingFileId.value = evidenceFileId

  try {
    const result = await repositories.costEvidence.getReadUrl(evidenceFileId, { disposition: 'inline' })
    if (result?.url) {
      window.open(result.url, '_blank', 'noopener,noreferrer')
    }
  }
  catch (err: unknown) {
    errorMessage.value = extractErrorMessage(err, 'Không thể tạo liên kết xem chứng từ.')
  }
  finally {
    openingFileId.value = null
  }
}
</script>

<template>
  <div class="cockpit-card p-6 rounded-lg space-y-4" data-testid="detail-evidence-panel">
    <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
      <div>
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
          Chứng từ kế toán đính kèm
        </h3>
        <p class="text-xs text-gray-500">
          Hóa đơn, hợp đồng, biên bản nghiệm thu hoặc chứng từ chứng minh chi phí.
        </p>
      </div>
      <span v-if="canSourceRead" class="text-xs font-semibold text-gray-500">
        {{ evidenceList.length }} chứng từ
      </span>
    </div>

    <!-- Permission notice if no cost.source.read -->
    <div v-if="!canSourceRead" class="text-xs text-gray-500 py-2">
      Cần quyền <code>cost.source.read</code> để xem danh sách chứng từ đính kèm.
    </div>

    <template v-if="canPrepare || canSourceRead">
      <UAlert
        v-if="canSourceRead && errorMessage"
        color="error"
        variant="subtle"
        :description="errorMessage"
        data-testid="evidence-error-alert"
      />

      <!-- Evidence Upload Form (cost.prepare) -->
      <div v-if="canPrepare" class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg space-y-3" data-testid="evidence-upload-section">
        <div class="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Thêm chứng từ mới
        </div>

        <UAlert
          v-if="uploadError"
          color="error"
          variant="subtle"
          :description="uploadError"
          data-testid="evidence-upload-error"
        />
        <UAlert
          v-if="uploadSuccess"
          color="success"
          variant="subtle"
          :description="uploadSuccess"
          data-testid="evidence-upload-success"
        />

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="space-y-1">
            <label for="detail-evidence-kind" class="block text-xs text-gray-500">Loại chứng từ</label>
            <select
              id="detail-evidence-kind"
              v-model="selectedKind"
              class="cockpit-select w-full"
              :disabled="disabled || uploading || !!pendingDetailLink"
              data-testid="detail-evidence-kind-select"
            >
              <option v-for="(label, kind) in evidenceKindLabels" :key="kind" :value="kind">
                {{ label }}
              </option>
            </select>
          </div>

          <div class="space-y-1 md:col-span-2">
            <label for="detail-evidence-file" class="block text-xs text-gray-500">
              Chọn tệp (PDF, Excel, PNG, JPEG &le; 25 MiB)
            </label>
            <input
              id="detail-evidence-file"
              ref="fileInput"
              type="file"
              class="cockpit-input w-full text-xs"
              :accept="ALLOWED_FILE_EXTENSIONS.join(',')"
              :disabled="disabled || uploading || !!pendingDetailLink"
              data-testid="detail-evidence-file-input"
              @change="onFileSelected"
            >
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <div class="text-xs text-gray-500">
            <span v-if="uploadProgressStage" class="text-primary-600 font-semibold animate-pulse">
              {{ uploadProgressStage }}
            </span>
          </div>
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-upload"
            :loading="uploading"
            :disabled="disabled || uploading || (!selectedFile && !pendingDetailLink)"
            data-testid="upload-evidence-btn"
            @click="startUploadAndLink"
          >
            Tải lên &amp; Liên kết
          </UButton>
        </div>
      </div>

      <!-- Evidence Table -->
      <template v-if="canSourceRead">
      <div v-if="loading" class="text-center py-4 text-xs text-gray-500">
        Đang tải danh sách chứng từ…
      </div>
      <div v-else-if="evidenceList.length === 0" class="text-center py-4 text-xs text-gray-500" data-testid="evidence-empty-message">
        Chưa có chứng từ nào được liên kết với chi tiết chi phí này.
      </div>
      <div v-else class="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
        <table class="w-full text-left text-xs" data-testid="detail-evidence-table">
          <thead class="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
            <tr>
              <th class="p-2.5">Tệp chứng từ</th>
              <th class="p-2.5">Phân loại</th>
              <th class="p-2.5">Dung lượng</th>
              <th class="p-2.5">Mã băm SHA-256</th>
              <th class="p-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-for="item in evidenceList" :key="item.linkId" :data-testid="`evidence-row-${item.linkId}`">
              <td class="p-2.5 font-semibold text-gray-900 dark:text-gray-100">
                {{ item.originalFilename }}
              </td>
              <td class="p-2.5 text-gray-600 dark:text-gray-400">
                {{ evidenceKindLabels[item.evidenceKind as CostEvidenceKind] ?? item.evidenceKind }}
              </td>
              <td class="p-2.5 font-mono text-gray-500">
                {{ (item.sizeBytes / 1024).toFixed(1) }} KB
              </td>
              <td class="p-2.5 font-mono text-gray-400 text-[10px]" :title="item.sha256">
                {{ item.sha256.substring(0, 12) }}…
              </td>
              <td class="p-2.5 text-right">
                <UButton
                  v-if="canFileRead"
                  size="xs"
                  variant="outline"
                  icon="i-lucide-external-link"
                  :loading="openingFileId === item.evidenceFileId"
                  :disabled="disabled || openingFileId === item.evidenceFileId"
                  :data-testid="`open-evidence-${item.linkId}`"
                  @click="openFile(item.evidenceFileId)"
                >
                  Xem tệp
                </UButton>
                <span v-else class="text-gray-400 text-[10px]">
                  Cần cost.file.read
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </template>
    </template>
  </div>
</template>
