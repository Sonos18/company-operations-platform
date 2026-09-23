<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CostEvidenceMetadata } from '../../../shared/schemas/costs/cost-evidence'
import {
  ALLOWED_FILE_EXTENSIONS,
  uploadAndFinalizeEvidence,
  validateEvidenceFile,
  type CostEvidenceKind,
} from '../../utils/costs/cost-evidence-uploader'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'

const props = defineProps<{
  projectId: string
  projectCostItemId: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'evidence-linked': []
}>()

const repositories = useRepositories()
const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabase = nuxtApp.$supabaseClient

const canSourceRead = computed(() => companyAccess.hasPermission('cost.source.read'))
const canFileRead = computed(() => companyAccess.hasPermission('cost.file.read') && companyAccess.hasPermission('cost.read'))
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const evidenceList = ref<CostEvidenceMetadata[]>([])

// Upload State
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const selectedKind = ref<CostEvidenceKind>('invoice')
const uploading = ref(false)
const uploadProgressStage = ref<string | null>(null)
const uploadError = ref<string | null>(null)
const uploadSuccess = ref<string | null>(null)

// Raw URL opening state
const openingFileId = ref<string | null>(null)

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
  if (!props.projectCostItemId || !canSourceRead.value) return

  loading.value = true
  errorMessage.value = null

  try {
    evidenceList.value = await repositories.costEvidence.listMetadata(props.projectCostItemId)
  }
  catch (err: unknown) {
    errorMessage.value = extractErrorMessage(err, 'Không thể tải danh sách chứng từ.')
  }
  finally {
    loading.value = false
  }
}

watch(
  [() => props.projectCostItemId, () => canSourceRead.value],
  () => {
    fetchEvidenceList()
  },
  { immediate: true },
)

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  uploadError.value = null
  uploadSuccess.value = null

  if (!file) {
    selectedFile.value = null
    return
  }

  const validation = validateEvidenceFile(file)
  if (!validation.valid) {
    uploadError.value = validation.error || 'Tệp không hợp lệ.'
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  selectedFile.value = file
}

async function handleUpload() {
  if (!selectedFile.value || !canPrepare.value) return

  uploading.value = true
  uploadError.value = null
  uploadSuccess.value = null
  uploadProgressStage.value = 'Đang xử lý...'

  try {
    const stageMap: Record<string, string> = {
      hashing: 'Đang tính toán mã băm SHA-256...',
      intent: 'Đang tạo ý định tải lên an toàn...',
      uploading: 'Đang tải tệp lên kho lưu trữ chứng từ...',
      finalizing: 'Đang xác thực cấu trúc tệp trên máy chủ...',
      linking: 'Đang liên kết chứng từ với chi phí...',
    }

    await uploadAndFinalizeEvidence({
      projectId: props.projectId,
      file: selectedFile.value,
      evidenceKind: selectedKind.value,
      projectCostItemId: props.projectCostItemId,
      evidenceRepo: repositories.costEvidence,
      supabaseClient: supabase,
      onProgress: (stage: 'hashing' | 'intent' | 'uploading' | 'finalizing' | 'linking') => {
        uploadProgressStage.value = stageMap[stage] || stage
      },
    })

    uploadSuccess.value = `Đã tải lên và liên kết chứng từ "${selectedFile.value.name}" thành công.`
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    emit('evidence-linked')
    await fetchEvidenceList()
  }
  catch (err: unknown) {
    uploadError.value = extractErrorMessage(err, 'Lỗi tải lên chứng từ.')
  }
  finally {
    uploading.value = false
    uploadProgressStage.value = null
  }
}

async function openEvidenceFile(fileId: string) {
  if (!canFileRead.value) return

  openingFileId.value = fileId

  try {
    const result = await repositories.costEvidence.getReadUrl(fileId, { disposition: 'inline' })
    if (result.url) {
      window.open(result.url, '_blank', 'noopener,noreferrer')
    }
  }
  catch (err: unknown) {
    errorMessage.value = extractErrorMessage(err, 'Không thể tạo đường dẫn mở tệp chứng từ.')
  }
  finally {
    openingFileId.value = null
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

defineExpose({
  refresh: fetchEvidenceList,
})
</script>

<template>
  <div class="evidence-panel cockpit-card p-4 rounded-lg space-y-4" data-testid="evidence-panel">
    <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
      <div>
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Hồ sơ chứng từ đính kèm
        </h3>
        <p class="text-xs text-gray-500">
          Đính kèm hóa đơn, biên bản nghiệm thu, hợp đồng chứng minh chi phí hợp lệ (Quyền: cost.prepare / cost.source.read).
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="fetchEvidenceList"
        >
          Làm mới
        </UButton>
      </div>
    </div>

    <!-- Error Alert -->
    <UAlert
      v-if="errorMessage"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Lỗi tải hồ sơ chứng từ"
      :description="errorMessage"
      data-testid="evidence-panel-error"
    />

    <!-- Upload Box (cost.prepare only) -->
    <div
      v-if="canPrepare && !props.disabled"
      class="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 bg-gray-50/50 dark:bg-gray-900/30 space-y-3"
      data-testid="evidence-upload-box"
    >
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1">
          <h4 class="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Tải lên chứng từ mới
          </h4>
          <p class="text-[11px] text-gray-500">
            Định dạng hỗ trợ: PDF, XLS, XLSX, PNG, JPEG. Dung lượng tối đa: 25 MiB.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <select
            v-model="selectedKind"
            :disabled="uploading"
            class="cockpit-select text-xs"
            data-testid="evidence-kind-select"
          >
            <option v-for="(label, key) in evidenceKindLabels" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </div>
      </div>

      <!-- File input and upload button -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          ref="fileInput"
          type="file"
          :accept="ALLOWED_FILE_EXTENSIONS.join(',')"
          :disabled="uploading"
          class="cockpit-input text-xs flex-1 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-950 dark:file:text-primary-300"
          data-testid="evidence-file-input"
          @change="onFileSelected"
        >

        <UButton
          color="primary"
          icon="i-lucide-upload"
          :loading="uploading"
          :disabled="!selectedFile"
          data-testid="evidence-upload-btn"
          @click="handleUpload"
        >
          Tải lên & Liên kết
        </UButton>
      </div>

      <div v-if="uploadProgressStage" class="text-xs text-primary font-medium flex items-center gap-2">
        <UIcon name="i-lucide-loader-2" class="spin" />
        <span>{{ uploadProgressStage }}</span>
      </div>

      <UAlert
        v-if="uploadError"
        role="alert"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        title="Không thể tải lên tệp"
        :description="uploadError"
        data-testid="upload-error-alert"
      />

      <UAlert
        v-if="uploadSuccess"
        role="status"
        color="success"
        variant="subtle"
        icon="i-lucide-check-circle"
        title="Tải lên thành công"
        :description="uploadSuccess"
        data-testid="upload-success-alert"
      />
    </div>

    <!-- Metadata Permission Warning -->
    <div v-if="!canSourceRead" class="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-center text-xs text-gray-500">
      <UIcon name="i-lucide-lock" class="text-xl mx-auto mb-1 text-gray-400" />
      <p>Cần quyền cost.source.read để xem danh sách chứng từ đính kèm.</p>
    </div>

    <!-- Loading list state -->
    <div v-else-if="loading" class="py-6 text-center text-xs text-gray-500" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="spin text-xl text-primary mx-auto mb-1" />
      <p>Đang tải danh sách chứng từ…</p>
    </div>

    <!-- Empty list state -->
    <div
      v-else-if="evidenceList.length === 0"
      class="py-6 text-center bg-gray-50 dark:bg-gray-900 rounded-lg"
      data-testid="evidence-list-empty"
    >
      <UIcon name="i-lucide-paperclip" class="text-2xl text-gray-400 mx-auto" />
      <h4 class="text-xs font-semibold mt-1">Chưa có chứng từ đính kèm</h4>
      <p class="text-[11px] text-gray-500 mt-0.5">
        Các chứng từ hóa đơn, nghiệm thu đã liên kết sẽ hiển thị tại đây.
      </p>
    </div>

    <!-- Evidence Table -->
    <div v-else class="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
      <table class="w-full text-left text-xs" data-testid="evidence-table">
        <thead class="bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
          <tr>
            <th class="p-2.5">Tên tệp</th>
            <th class="p-2.5">Loại chứng từ</th>
            <th class="p-2.5">Dung lượng</th>
            <th class="p-2.5">Thời điểm xác nhận</th>
            <th class="p-2.5 text-right">Xem tệp</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
          <tr v-for="item in evidenceList" :key="item.linkId" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/30" data-testid="evidence-row">
            <td class="p-2.5">
              <div class="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <UIcon name="i-lucide-file-text" class="text-gray-400" />
                <span data-testid="evidence-filename">{{ item.originalFilename }}</span>
              </div>
              <div class="text-[10px] text-gray-400 font-mono mt-0.5">
                Mã tệp: {{ item.evidenceFileId }}
              </div>
            </td>
            <td class="p-2.5">
              <span class="cockpit-badge cockpit-badge--neutral text-[11px]" data-testid="evidence-kind-badge">
                {{ evidenceKindLabels[item.evidenceKind] || item.evidenceKind }}
              </span>
            </td>
            <td class="p-2.5 font-mono text-gray-600 dark:text-gray-300">
              {{ formatBytes(item.sizeBytes) }}
            </td>
            <td class="p-2.5 text-gray-500">
              {{ new Date(item.finalizedAt).toLocaleString('vi-VN') }}
            </td>
            <td class="p-2.5 text-right">
              <UButton
                v-if="canFileRead"
                size="xs"
                color="primary"
                variant="ghost"
                icon="i-lucide-external-link"
                :loading="openingFileId === item.evidenceFileId"
                data-testid="evidence-download-btn"
                @click="openEvidenceFile(item.evidenceFileId)"
              >
                Mở tệp
              </UButton>
              <span v-else class="text-[11px] text-gray-400 italic">
                (Cần cost.read + cost.file.read)
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
