<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import {
  ALLOWED_FILE_EXTENSIONS,
  uploadAndFinalizeEvidence,
  validateEvidenceFile,
} from '../../utils/costs/cost-evidence-uploader'
import { localDateInputValue } from '../../utils/costs/local-date'

const props = withDefaults(defineProps<{
  open: boolean
  projectId: string
  subcontractId: string
  expectedSubcontractVersion: number
  currencyCode?: string
  replacesPaymentId?: string | null
}>(), {
  currencyCode: 'VND',
  replacesPaymentId: null,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'recorded': [result: { paymentId: string; version: number }]
}>()

const repositories = useRepositories()
const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabase = nuxtApp.$supabaseClient
const canRecordCash = computed(() => companyAccess.hasPermission('cost.record_cash'))
const canPrepareEvidence = computed(() => companyAccess.hasPermission('cost.prepare'))

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val),
})

const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const evidenceFileInput = ref<HTMLInputElement | null>(null)
const selectedEvidenceFile = ref<File | null>(null)
const evidenceFileError = ref<string | null>(null)

const form = reactive({
  description: '',
  paidAmount: '',
  paymentDate: localDateInputValue(),
  warrantyRetentionAmount: '',
  retentionRateBps: null as number | null,
  paymentReference: '',
  sourceReference: '',
  note: '',
})

watch([() => props.open, () => props.replacesPaymentId], ([open]) => {
  if (open) {
    form.description = props.replacesPaymentId ? 'Thanh toán thay thế' : ''
    form.paidAmount = ''
    form.paymentDate = localDateInputValue()
    form.warrantyRetentionAmount = ''
    form.retentionRateBps = null
    form.paymentReference = ''
    form.sourceReference = ''
    form.note = ''
    selectedEvidenceFile.value = null
    evidenceFileError.value = null
    errorMessage.value = null
  }
}, { immediate: true })

function onEvidenceFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  evidenceFileError.value = null

  if (!file) {
    selectedEvidenceFile.value = null
    return
  }

  const validation = validateEvidenceFile(file)
  if (!validation.valid) {
    evidenceFileError.value = validation.error || 'Tệp không hợp lệ.'
    selectedEvidenceFile.value = null
    if (evidenceFileInput.value) evidenceFileInput.value.value = ''
    return
  }

  selectedEvidenceFile.value = file
}

function removeEvidenceFile() {
  selectedEvidenceFile.value = null
  evidenceFileError.value = null
  if (evidenceFileInput.value) evidenceFileInput.value.value = ''
}

async function submit() {
  if (!canRecordCash.value) {
    errorMessage.value = 'Bạn không có quyền cost.record_cash để ghi nhận thanh toán.'
    return
  }

  if (!form.description.trim()) {
    errorMessage.value = 'Vui lòng nhập nội dung thanh toán.'
    return
  }

  if (!form.paidAmount || !/^\d+(\.\d{1,4})?$/u.test(form.paidAmount) || Number(form.paidAmount) <= 0) {
    errorMessage.value = 'Số tiền thanh toán phải là số dương hợp lệ.'
    return
  }

  submitting.value = true
  errorMessage.value = null

  try {
    const evidenceFileIds: string[] = []

    // Atomic payment evidence flow: upload & finalize only if canPrepareEvidence and file selected
    if (canPrepareEvidence.value && selectedEvidenceFile.value) {
      const uploadResult = await uploadAndFinalizeEvidence({
        projectId: props.projectId,
        file: selectedEvidenceFile.value,
        evidenceKind: 'payment_proof',
        evidenceRepo: repositories.costEvidence,
        supabaseClient: supabase,
      })
      evidenceFileIds.push(uploadResult.evidenceFileId)
    }

    const input = {
      expectedSubcontractVersion: props.expectedSubcontractVersion,
      description: form.description.trim(),
      paidAmount: form.paidAmount.trim(),
      currencyCode: props.currencyCode,
      paymentDate: form.paymentDate,
      warrantyRetentionAmount: form.warrantyRetentionAmount.trim() || undefined,
      retentionRateBps: form.retentionRateBps != null && form.retentionRateBps !== ('' as unknown as number) ? Number(form.retentionRateBps) : undefined,
      paymentReference: form.paymentReference.trim() || undefined,
      sourceReference: form.sourceReference.trim() || undefined,
      note: form.note.trim() || undefined,
      replacesPaymentId: props.replacesPaymentId || undefined,
      evidenceFileIds: evidenceFileIds.length > 0 ? evidenceFileIds : undefined,
    }

    const result = await repositories.projectFinance.recordSubcontractPayment(
      props.projectId,
      props.subcontractId,
      input,
    )

    isOpen.value = false
    emit('recorded', { paymentId: result.paymentId, version: result.version })
  }
  catch (err: unknown) {
    errorMessage.value = extractErrorMessage(err, 'Lỗi ghi nhận thanh toán thầu phụ.')
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="replacesPaymentId ? 'Ghi nhận thanh toán thay thế' : 'Ghi nhận thanh toán thầu phụ'"
    description="Ghi nhận đợt chi/ứng tiền thực tế vào sổ theo dõi thầu phụ (Quyền: cost.record_cash)."
    :dismissible="!submitting"
  >
    <template #body>
      <div v-if="!canRecordCash" class="p-4 text-center">
        <UAlert
          role="alert"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Không có quyền"
          description="Bạn cần quyền cost.record_cash để ghi nhận thanh toán."
        />
      </div>

      <form v-else class="space-y-4" data-testid="record-payment-form" @submit.prevent="submit">
        <!-- Replaces banner if replacement flow -->
        <div v-if="replacesPaymentId" class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3 rounded-lg text-xs space-y-1">
          <div class="font-bold text-blue-900 dark:text-blue-100 flex items-center gap-1.5">
            <UIcon name="i-lucide-replace" class="text-blue-600" />
            Thay thế cho khoản đã hủy
          </div>
          <p class="text-blue-800 dark:text-blue-200">
            Khoản thanh toán mới này sẽ được liên kết thay thế cho khoản đã hủy: <span class="font-mono">{{ replacesPaymentId }}</span>.
          </p>
        </div>

        <UAlert
          v-if="errorMessage"
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Không thể ghi nhận thanh toán"
          :description="errorMessage"
          data-testid="record-payment-error"
        />

        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-description">
            Nội dung thanh toán <span class="text-red-500">*</span>
          </label>
          <input
            id="pay-description"
            v-model="form.description"
            type="text"
            required
            placeholder="Ví dụ: Tạm ứng đợt 1 thi công ép cọc"
            class="cockpit-input w-full"
            data-testid="pay-description-input"
          >
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-amount">
              Số tiền chi/ứng ({{ currencyCode }}) <span class="text-red-500">*</span>
            </label>
            <input
              id="pay-amount"
              v-model="form.paidAmount"
              type="text"
              required
              placeholder="0.0000"
              class="cockpit-input w-full font-mono font-semibold"
              data-testid="pay-amount-input"
            >
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-date">
              Ngày thanh toán <span class="text-red-500">*</span>
            </label>
            <input
              id="pay-date"
              v-model="form.paymentDate"
              type="date"
              required
              class="cockpit-input w-full"
              data-testid="pay-date-input"
            >
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-retention-amount">
              Giữ lại bảo hành (nếu có)
            </label>
            <input
              id="pay-retention-amount"
              v-model="form.warrantyRetentionAmount"
              type="text"
              placeholder="0.0000"
              class="cockpit-input w-full font-mono"
              data-testid="pay-retention-amount-input"
            >
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-retention-bps">
              Tỷ lệ bảo hành (bps, vd 500 = 5%)
            </label>
            <input
              id="pay-retention-bps"
              v-model.number="form.retentionRateBps"
              type="number"
              min="0"
              max="10000"
              placeholder="500"
              class="cockpit-input w-full font-mono"
            >
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-ref">
              Số phiếu chi / Tham chiếu
            </label>
            <input
              id="pay-ref"
              v-model="form.paymentReference"
              type="text"
              placeholder="PC-..."
              class="cockpit-input w-full"
              data-testid="pay-ref-input"
            >
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-src-ref">
              Mã giao dịch ngân hàng
            </label>
            <input
              id="pay-src-ref"
              v-model="form.sourceReference"
              type="text"
              placeholder="FT..."
              class="cockpit-input w-full"
            >
          </div>
        </div>

        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-note">
            Ghi chú
          </label>
          <input
            id="pay-note"
            v-model="form.note"
            type="text"
            class="cockpit-input w-full"
          >
        </div>

        <!-- Evidence Attachment for Subcontract Payment (Atomic Linkage) -->
        <div class="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800" data-testid="pay-evidence-section">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="pay-evidence-file">
              Chứng từ thanh toán / Ủy nhiệm chi (Không bắt buộc)
            </label>
            <span class="text-[11px] text-gray-400">PDF, XLS, XLSX, PNG, JPEG (tối đa 25 MiB)</span>
          </div>

          <div v-if="!canPrepareEvidence" class="p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300" data-testid="pay-evidence-permission-notice">
            <div class="flex items-center gap-1.5 font-medium">
              <UIcon name="i-lucide-info" class="shrink-0" />
              <span>Cần quyền cost.prepare để tải lên chứng từ thanh toán.</span>
            </div>
          </div>

          <template v-else>
            <div v-if="!selectedEvidenceFile" class="flex items-center gap-2">
              <input
                id="pay-evidence-file"
                ref="evidenceFileInput"
                type="file"
                :accept="ALLOWED_FILE_EXTENSIONS.join(',')"
                :disabled="submitting"
                class="cockpit-input text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300"
                data-testid="pay-evidence-file-input"
                @change="onEvidenceFileSelected"
              >
            </div>

            <div v-else class="flex items-center justify-between p-2.5 rounded bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs">
              <div class="flex items-center gap-2 truncate">
                <UIcon name="i-lucide-paperclip" class="text-primary shrink-0" />
                <span class="font-medium text-gray-800 dark:text-gray-200 truncate">{{ selectedEvidenceFile.name }}</span>
                <span class="text-gray-400 text-[11px] shrink-0">({{ (selectedEvidenceFile.size / 1024).toFixed(1) }} KB)</span>
              </div>
              <UButton
                size="xs"
                color="error"
                variant="ghost"
                icon="i-lucide-x"
                :disabled="submitting"
                @click="removeEvidenceFile"
              >
                Gỡ
              </UButton>
            </div>

            <p v-if="evidenceFileError" class="text-xs text-red-600 dark:text-red-400" role="alert">
              {{ evidenceFileError }}
            </p>
          </template>
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
            type="submit"
            color="primary"
            icon="i-lucide-check"
            :loading="submitting"
            :disabled="!form.description.trim() || !form.paidAmount"
            data-testid="confirm-record-payment-btn"
          >
            Ghi nhận thanh toán
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
