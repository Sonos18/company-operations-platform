<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { ProjectCostDetailKind } from '../../../shared/schemas/costs/project-costs'
import type { FinanceCategoryRow } from '../../../shared/schemas/costs/project-finance'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'

interface EditableCorrectionLine {
  lineNo: number
  detailKind: ProjectCostDetailKind
  description: string
  quantity: string
  unitCode: string
  unitPrice: string
  amount: string
  retentionKind: '' | 'warranty' | 'other'
  retentionRateBps: number | null
  retentionAmount: string
  relevantDate: string
  reference: string
  note: string
}

const props = withDefaults(defineProps<{
  open: boolean
  projectCostItemId: string
  currentVersion: number
  currentDescription: string
  currencyCode?: string
  categories?: FinanceCategoryRow[]
}>(), {
  currencyCode: 'VND',
  categories: () => [],
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'corrected': [result: { version: number }]
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const canCorrect = computed(() => companyAccess.hasPermission('cost.correct'))

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val),
})

const submitting = ref(false)
const loadingDetails = ref(false)
const errorMessage = ref<string | null>(null)
const financialCorrectionDisabledReason = 'Chưa thể hiệu chỉnh tài chính an toàn vì API hiện tại chưa cung cấp đầy đủ liên kết số liệu nguồn của bản ghi đã phát hành.'

const reason = ref('')
const includeOperational = ref(false)
const includeFinancial = ref(false)

const operational = reactive({
  description: props.currentDescription,
  workStatus: 'accepted' as 'unknown' | 'in_progress' | 'accepted',
  businessReference: '',
  relevantDate: '',
})

const financialLines = ref<EditableCorrectionLine[]>([])

async function loadExistingDetails() {
  if (!props.projectCostItemId) return
  loadingDetails.value = true
  try {
    const data = await repositories.projectCosts.details(props.projectCostItemId)
    financialLines.value = data.details.map(d => ({
      lineNo: d.lineNo,
      detailKind: d.detailKind,
      description: d.description,
      quantity: d.quantity ?? '',
      unitCode: d.unitCode ?? '',
      unitPrice: d.unitPrice ?? '',
      amount: d.amount,
      retentionKind: (d.retentionKind ?? '') as '' | 'warranty' | 'other',
      retentionRateBps: d.retentionRateBps ?? null,
      retentionAmount: d.retentionAmount ?? '',
      relevantDate: d.relevantDate ?? '',
      reference: d.reference ?? '',
      note: d.note ?? '',
    }))
  }
  catch {
    // If not found or empty, start with one line
    financialLines.value = [{
      lineNo: 1,
      detailKind: 'line_item',
      description: props.currentDescription,
      quantity: '',
      unitCode: '',
      unitPrice: '',
      amount: '0.0000',
      retentionKind: '',
      retentionRateBps: null,
      retentionAmount: '',
      relevantDate: '',
      reference: '',
      note: '',
    }]
  }
  finally {
    loadingDetails.value = false
  }
}

watch(() => props.open, (open) => {
  if (open) {
    reason.value = ''
    includeOperational.value = false
    includeFinancial.value = false
    operational.description = props.currentDescription
    operational.workStatus = 'accepted'
    operational.businessReference = ''
    operational.relevantDate = ''
    errorMessage.value = null
    loadExistingDetails()
  }
})

function addFinancialLine() {
  financialLines.value.push({
    lineNo: financialLines.value.length + 1,
    detailKind: 'line_item',
    description: '',
    quantity: '',
    unitCode: '',
    unitPrice: '',
    amount: '0.0000',
    retentionKind: '',
    retentionRateBps: null,
    retentionAmount: '',
    relevantDate: '',
    reference: '',
    note: '',
  })
}

function removeFinancialLine(index: number) {
  financialLines.value.splice(index, 1)
  financialLines.value.forEach((l: EditableCorrectionLine, i: number) => {
    l.lineNo = i + 1
  })
}

async function handleCorrect() {
  if (!canCorrect.value) {
    errorMessage.value = 'Bạn không có quyền cost.correct để điều chỉnh chi phí.'
    return
  }

  if (!reason.value.trim()) {
    errorMessage.value = 'Lý do điều chỉnh kiểm toán không được để trống.'
    return
  }

  if (includeFinancial.value) {
    errorMessage.value = financialCorrectionDisabledReason
    return
  }

  if (!includeOperational.value) {
    errorMessage.value = 'Vui lòng chọn nội dung điều chỉnh vận hành.'
    return
  }

  submitting.value = true
  errorMessage.value = null

  try {
    const payload: {
      expectedVersion: number
      reason: string
      operationalChanges?: {
        description?: string
        workStatus?: 'unknown' | 'in_progress' | 'accepted'
        businessReference?: string | null
        relevantDate?: string | null
      }
    } = {
      expectedVersion: props.currentVersion,
      reason: reason.value.trim(),
    }

    if (includeOperational.value) {
      payload.operationalChanges = {
        description: operational.description.trim() || undefined,
        workStatus: operational.workStatus,
        businessReference: operational.businessReference.trim() || null,
        relevantDate: operational.relevantDate || null,
      }
    }

    const result = await repositories.projectCosts.correct(props.projectCostItemId, payload)
    isOpen.value = false
    emit('corrected', { version: result.version })
  }
  catch (err: unknown) {
    errorMessage.value = extractErrorMessage(err, 'Lỗi trong quá trình điều chỉnh chi phí.')
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Điều chỉnh chi phí đã phát hành (Kiểm toán)"
    description="Thực hiện điều chỉnh có lý do lưu vết kiểm toán cho chi phí chính thức (Quyền: cost.correct)."
    :dismissible="!submitting"
    class="max-w-3xl"
  >
    <template #body>
      <div v-if="!canCorrect" class="p-4 text-center">
        <UAlert
          role="alert"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Không có quyền điều chỉnh"
          description="Bạn cần quyền cost.correct để thực hiện điều chỉnh chi phí đã phát hành."
        />
      </div>

      <div v-else class="space-y-4 max-h-[75vh] overflow-y-auto pr-1" data-testid="correction-modal">
        <!-- Audit Notice -->
        <div class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3 rounded-lg text-xs space-y-1">
          <div class="font-bold text-blue-900 dark:text-blue-100 flex items-center gap-1.5">
            <UIcon name="i-lucide-history" class="text-blue-600" />
            Lưu vết kiểm toán bất biến
          </div>
          <p class="text-blue-800 dark:text-blue-200">
            Hành động này sẽ tăng phiên bản chi phí (từ v{{ currentVersion }} lên v{{ currentVersion + 1 }}) và lưu lại toàn bộ ảnh chụp trước/sau cùng lý do điều chỉnh để phục vụ kiểm toán tài chính.
          </p>
        </div>

        <UAlert
          v-if="errorMessage"
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Không thể thực hiện điều chỉnh"
          :description="errorMessage"
          data-testid="correction-error-alert"
        />

        <!-- Reason Input -->
        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="correction-reason">
            Lý do điều chỉnh (Kiểm toán) <span class="text-red-500">*</span>
          </label>
          <input
            id="correction-reason"
            v-model="reason"
            type="text"
            required
            placeholder="Ví dụ: Điều chỉnh bổ sung khối lượng nghiệm thu đợt 2 theo phụ lục 01"
            class="cockpit-input w-full"
            data-testid="correction-reason-input"
          >
        </div>

        <!-- Checkbox Options -->
        <div class="space-y-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input v-model="includeOperational" type="checkbox" data-testid="toggle-op-changes">
            <span>Điều chỉnh thông tin vận hành</span>
          </label>
          <div class="space-y-1">
            <label class="flex items-center gap-2 text-xs font-semibold cursor-not-allowed opacity-60">
              <input
                v-model="includeFinancial"
                type="checkbox"
                disabled
                data-testid="toggle-fin-changes"
              >
              <span>Điều chỉnh chi tiết tài chính</span>
            </label>
            <p class="text-[11px] text-amber-600 dark:text-amber-400 pl-5" data-testid="financial-correction-disabled-notice">
              {{ financialCorrectionDisabledReason }}
            </p>
          </div>
        </div>

        <!-- Operational Changes Section -->
        <div v-if="includeOperational" class="border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-3">
          <h4 class="text-xs font-bold text-gray-900 dark:text-gray-100">
            Thay đổi thông tin vận hành
          </h4>
          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="corr-description">
              Mô tả chi phí mới
            </label>
            <input
              id="corr-description"
              v-model="operational.description"
              type="text"
              class="cockpit-input w-full"
              data-testid="corr-op-description"
            >
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div class="space-y-1">
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="corr-work-status">
                Trạng thái công việc
              </label>
              <select
                id="corr-work-status"
                v-model="operational.workStatus"
                class="cockpit-select w-full"
                data-testid="corr-op-work-status"
              >
                <option value="unknown">Chưa xác định</option>
                <option value="in_progress">Đang triển khai</option>
                <option value="accepted">Đã nghiệm thu</option>
              </select>
            </div>
            <div class="space-y-1">
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="corr-ref">
                Số tham chiếu
              </label>
              <input
                id="corr-ref"
                v-model="operational.businessReference"
                type="text"
                class="cockpit-input w-full"
              >
            </div>
            <div class="space-y-1">
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="corr-date">
                Ngày phát sinh
              </label>
              <input
                id="corr-date"
                v-model="operational.relevantDate"
                type="date"
                class="cockpit-input w-full"
              >
            </div>
          </div>
        </div>

        <!-- Financial Changes Section -->
        <div v-if="includeFinancial" class="border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-gray-900 dark:text-gray-100">
              Thay đổi chi tiết tài chính (Ảnh chụp thay thế hoàn chỉnh)
            </h4>
            <UButton size="xs" color="primary" icon="i-lucide-plus" @click="addFinancialLine">
              Thêm dòng
            </UButton>
          </div>

          <div v-if="loadingDetails" class="py-4 text-center text-xs text-gray-500">
            <UIcon name="i-lucide-loader-2" class="spin" /> Đang tải chi tiết hiện tại…
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="(line, idx) in financialLines"
              :key="idx"
              class="p-2.5 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 space-y-2 text-xs"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold text-gray-700 dark:text-gray-300">Dòng #{{ line.lineNo }}</span>
                <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="removeFinancialLine(idx)" />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label class="text-[11px] text-gray-500">Mô tả *</label>
                  <input v-model="line.description" type="text" class="cockpit-input w-full" required>
                </div>
                <div>
                  <label class="text-[11px] text-gray-500">Số tiền ({{ currencyCode }}) *</label>
                  <input v-model="line.amount" type="text" class="cockpit-input w-full font-mono font-semibold" required>
                </div>
                <div>
                  <label class="text-[11px] text-gray-500">Loại dòng</label>
                  <select v-model="line.detailKind" class="cockpit-select w-full">
                    <option value="line_item">Dòng chi tiết (line_item)</option>
                    <option value="opening_balance">Số dư / giá trị mở đầu (opening_balance)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="submitting"
            @click="() => { isOpen = false }"
          >
            Hủy
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-file-pen"
            :loading="submitting"
            :disabled="!reason.trim() || !includeOperational"
            data-testid="confirm-correction-btn"
            @click="handleCorrect"
          >
            Xác nhận điều chỉnh
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
