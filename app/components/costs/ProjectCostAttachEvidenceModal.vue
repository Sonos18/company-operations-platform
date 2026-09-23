<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ALLOWED_FILE_EXTENSIONS,
  uploadAndFinalizeEvidence,
  validateEvidenceFile,
  type CostEvidenceKind,
} from '../../utils/costs/cost-evidence-uploader'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'

const props = defineProps<{
  open: boolean
  projectId: string
  projectCostItemId: string
  itemDescription?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'attached': []
}>()

const repositories = useRepositories()
const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabase = nuxtApp.$supabaseClient

const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val),
})

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const selectedKind = ref<CostEvidenceKind>('invoice')
const uploading = ref(false)
const uploadProgressStage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

const evidenceKindLabels: Record<CostEvidenceKind, string> = {
  contract: 'Hợp đồng (contract)',
  acceptance_record: 'Biên bản nghiệm thu (acceptance_record)',
  invoice: 'Hóa đơn GTGT (invoice)',
  accounting_support: 'Chứng từ kế toán (accounting_support)',
  payment_proof: 'Ủy nhiệm chi / Giấy nộp tiền (payment_proof)',
  source_workbook: 'Bảng tính gốc (source_workbook)',
  other: 'Khác (other)',
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  errorMessage.value = null

  if (!file) {
    selectedFile.value = null
    return
  }

  const validation = validateEvidenceFile(file)
  if (!validation.valid) {
    errorMessage.value = validation.error || 'Tệp không hợp lệ.'
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  selectedFile.value = file
}

async function handleUploadAndLink() {
  if (!selectedFile.value || !canPrepare.value) return

  uploading.value = true
  errorMessage.value = null
  uploadProgressStage.value = 'Đang xử lý...'

  try {
    const stageMap: Record<string, string> = {
      hashing: 'Đang tính toán mã băm SHA-256...',
      intent: 'Đang tạo ý định tải lên an toàn...',
      uploading: 'Đang tải tệp lên kho lưu trữ chứng từ...',
      finalizing: 'Đang xác thực cấu trúc tệp trên máy chủ...',
      linking: 'Đang liên kết chứng từ với chi phí đã phát hành...',
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

    isOpen.value = false
    emit('attached')
  }
  catch (err: unknown) {
    errorMessage.value = extractErrorMessage(err, 'Lỗi khi tải lên và liên kết chứng từ.')
  }
  finally {
    uploading.value = false
    uploadProgressStage.value = null
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Đính kèm chứng từ vào chi phí đã phát hành"
    description="Thêm tài liệu chứng từ bổ sung mà không làm thay đổi số tiền, phiên bản hay trạng thái phát hành của chi phí."
    :dismissible="!uploading"
  >
    <template #body>
      <div v-if="!canPrepare" class="p-4 text-center">
        <UAlert
          role="alert"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Không có quyền"
          description="Bạn cần quyền cost.prepare để đính kèm chứng từ vào chi phí."
        />
      </div>

      <div v-else class="space-y-4" data-testid="attach-evidence-modal">
        <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-xs space-y-1">
          <div class="text-gray-500">Mục chi phí liên kết:</div>
          <div class="font-semibold text-gray-900 dark:text-gray-100">
            {{ itemDescription || projectCostItemId }}
          </div>
        </div>

        <UAlert
          v-if="errorMessage"
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Không thể đính kèm chứng từ"
          :description="errorMessage"
          data-testid="attach-evidence-error"
        />

        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="attach-kind">
            Loại chứng từ <span class="text-red-500">*</span>
          </label>
          <select
            id="attach-kind"
            v-model="selectedKind"
            :disabled="uploading"
            class="cockpit-select w-full"
            data-testid="attach-kind-select"
          >
            <option v-for="(label, key) in evidenceKindLabels" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </div>

        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="attach-file">
            Chọn tệp chứng từ <span class="text-red-500">*</span>
          </label>
          <input
            id="attach-file"
            ref="fileInput"
            type="file"
            :accept="ALLOWED_FILE_EXTENSIONS.join(',')"
            :disabled="uploading"
            class="cockpit-input w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-950 dark:file:text-primary-300"
            data-testid="attach-file-input"
            @change="onFileSelected"
          >
          <p class="text-[11px] text-gray-500">
            Hỗ trợ: PDF, XLS, XLSX, PNG, JPEG (tối đa 25 MiB).
          </p>
        </div>

        <div v-if="uploadProgressStage" class="text-xs text-primary font-medium flex items-center gap-2">
          <UIcon name="i-lucide-loader-2" class="spin" />
          <span>{{ uploadProgressStage }}</span>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="uploading"
            @click="() => { isOpen = false }"
          >
            Hủy
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-upload"
            :loading="uploading"
            :disabled="!selectedFile"
            data-testid="attach-submit-btn"
            @click="handleUploadAndLink"
          >
            Tải lên & Đính kèm
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
