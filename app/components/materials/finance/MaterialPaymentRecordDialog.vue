<template>
  <UModal
    :open="open && Boolean(request)"
    :title="method === 'cash' ? 'Ghi nhận chi tiền mặt' : 'Cập nhật biên lai chuyển khoản'"
    :description="request ? `Xác nhận lệnh chi - Số tiền: ${formatVnNumber(request.amount)}` : ''"
    :dismissible="!isSubmitting && !isUploading"
    @update:open="onOpenChange"
  >
    <template #body>
      <div v-if="request" class="space-y-4 text-xs">
        <!-- Error Alert -->
        <div v-if="submitError" class="cockpit-alert cockpit-alert--danger" role="alert">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
            <div class="flex-1">
              <p class="font-semibold text-rose-900 m-0">{{ submitError }}</p>
            </div>
          </div>
        </div>

        <!-- Request Summary Card -->
        <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-slate-600">
          <div class="flex justify-between">
            <span>Số tiền chi:</span>
            <strong class="font-mono text-slate-900 text-sm text-emerald-700">{{ formatVnNumber(request.amount) }}</strong>
          </div>
          <div class="flex justify-between">
            <span>Đợt thanh toán:</span>
            <span class="font-semibold text-slate-800">{{ installmentName || request.installmentKey.slice(0, 8) + '...' }}</span>
          </div>
          <div v-if="request.note" class="pt-1 border-t border-slate-200 text-slate-700">
            <span class="text-slate-500">Ghi chú:</span> {{ request.note }}
          </div>
        </div>

        <!-- Payment Method Selection (when cash is allowed) -->
        <fieldset v-if="allowCash" class="space-y-1.5 border-0 p-0 m-0">
          <legend class="block font-semibold text-slate-700 text-xs mb-1.5">
            Hình thức chi <span class="text-rose-500">*</span>
          </legend>
          <div class="grid grid-cols-2 gap-2">
            <label
              class="p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500"
              :class="method === 'bank_transfer'
                ? 'border-sky-500 bg-sky-50/70 text-sky-900 font-semibold ring-1 ring-sky-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'"
            >
              <input
                type="radio"
                name="payment-record-method"
                value="bank_transfer"
                :checked="method === 'bank_transfer'"
                :disabled="isSubmitting || isUploading"
                class="h-4 w-4 cursor-pointer text-sky-600 focus:ring-sky-500"
                @change="method = 'bank_transfer'"
              >
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-building-2" class="text-sky-600 text-base" aria-hidden="true" />
                <span>Chuyển khoản</span>
              </div>
            </label>

            <label
              class="p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500"
              :class="method === 'cash'
                ? 'border-sky-500 bg-sky-50/70 text-sky-900 font-semibold ring-1 ring-sky-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'"
            >
              <input
                type="radio"
                name="payment-record-method"
                value="cash"
                :checked="method === 'cash'"
                :disabled="isSubmitting || isUploading"
                class="h-4 w-4 cursor-pointer text-sky-600 focus:ring-sky-500"
                @change="method = 'cash'"
              >
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-banknote" class="text-emerald-600 text-base" aria-hidden="true" />
                <span>Tiền mặt</span>
              </div>
            </label>
          </div>
        </fieldset>

        <!-- Transfer Date (paidOn) -->
        <div>
          <label for="paid-on-input" class="block font-semibold text-slate-700 mb-1">
            {{ method === 'cash' ? 'Ngày chi tiền mặt' : 'Ngày chuyển khoản ngân hàng' }} <span class="text-rose-500">*</span>
          </label>
          <input
            id="paid-on-input"
            v-model="paidOn"
            type="date"
            class="cockpit-input w-full font-mono text-xs"
            :max="todayDate"
            :disabled="isSubmitting || isUploading"
          >
          <span v-if="paidOnInvalid" class="text-[11px] font-medium text-rose-600" role="alert">
            {{ method === 'cash' ? 'Ngày chi phải có giá trị và không được ở tương lai' : 'Ngày chuyển phải có giá trị và không được ở tương lai' }}
          </span>
          <span v-else class="text-[10px] text-slate-400">Mặc định hôm nay, không được chọn ngày trong tương lai</span>
        </div>

        <!-- Reference Number (bankReference) - hidden in cash mode -->
        <div v-if="method === 'bank_transfer'">
          <label for="bank-reference-input" class="block font-semibold text-slate-700 mb-1">
            Số tham chiếu / Mã giao dịch ngân hàng <span class="text-rose-500">*</span>
          </label>
          <input
            id="bank-reference-input"
            v-model="bankReference"
            type="text"
            class="cockpit-input w-full font-mono text-xs"
            placeholder="VD: FT241015000189 hoặc UNC-2024-001"
            maxlength="100"
            :disabled="isSubmitting || isUploading"
          >
          <div class="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>Số bút toán, mã FT hoặc số ủy nhiệm chi trên sao kê</span>
            <span>{{ bankReference.length }}/100 ký tự</span>
          </div>
        </div>

        <!-- Proof File Upload (Biên lai chuyển khoản hoặc Hóa đơn bán hàng / Phiếu chi hộ) -->
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div class="flex items-center justify-between">
            <label for="proof-file-input" class="font-semibold text-slate-700 text-xs m-0 flex items-center gap-1.5">
              <UIcon name="i-lucide-file-text" class="text-sky-600" aria-hidden="true" />
              <span>{{ method === 'cash' ? 'Hóa đơn bán hàng hoặc phiếu chi hộ' : 'Biên lai chuyển khoản' }} <span class="text-rose-500">*</span></span>
            </label>
            <span v-if="finalizedProofFileId" class="cockpit-badge bg-emerald-100 text-emerald-800 text-[10px] font-semibold flex items-center gap-1">
              <UIcon name="i-lucide-check" class="text-[10px]" aria-hidden="true" />
              Đã tải chứng từ
            </span>
          </div>

          <p class="text-[11px] text-slate-500 m-0">
            {{ method === 'cash'
              ? 'Tải lên hóa đơn bán hàng hoặc phiếu chi hộ (PDF, JPG, PNG ≤ 25 MiB).'
              : 'Tải lên biên lai chuyển khoản của ngân hàng (PDF, JPG, PNG ≤ 25 MiB).' }}
          </p>

          <div class="flex items-center gap-2 flex-wrap pt-1">
            <input
              id="proof-file-input"
              :key="fileInputKey"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              class="cockpit-input text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
              :disabled="isSubmitting || isUploading"
              @change="onFileSelected"
            >

            <button
              v-if="selectedFile && !finalizedProofFileId"
              type="button"
              class="cockpit-btn cockpit-btn--primary btn-sm flex items-center gap-1.5"
              :disabled="isUploading || isSubmitting"
              @click="uploadProof"
            >
              <UIcon v-if="isUploading" name="i-lucide-loader-2" class="animate-spin text-xs" aria-hidden="true" />
              <UIcon v-else name="i-lucide-upload" class="text-xs" aria-hidden="true" />
              <span>Tải lên</span>
            </button>
          </div>

          <div v-if="selectedFile" class="text-[10px] text-slate-600 mt-1">
            Tệp: <strong>{{ selectedFile.name }}</strong> ({{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MiB)
          </div>

          <div v-if="uploadError" class="text-[11px] text-rose-600 font-medium" role="alert">
            {{ uploadError }}
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2.5">
        <UButton color="neutral" variant="outline" :disabled="isSubmitting || isUploading" @click="close">
          Hủy bỏ
        </UButton>
        <UButton icon="i-lucide-check-check" :loading="isSubmitting" :disabled="!canSubmit" @click="submitRecord">
          Xác nhận đã chi
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type {
  MaterialPaymentMethod,
  MaterialPaymentRequestView,
  RecordMaterialPaymentInput,
} from '../../../../shared/schemas/costs/material-finance'
import { vietnamToday } from '../../../../shared/utils/material-finance-summary'
import {
  uploadMaterialEvidence,
  type MaterialEvidenceUploadSession,
} from '../../../utils/costs/material-evidence-uploader'
import { canPayInCash } from '../../../utils/materials/payment-method'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import {
  financeErrorCode,
  financeErrorMessage,
  isVersionConflict,
  resetCommandKeyAfterError,
  type CommandKeyKeeper,
  uploadErrorMessage,
} from '../../../utils/materials/finance-ui'

interface Props {
  projectId: string
  contractId: string
  contractTotal: string
  orderSubtotalSnapshot: string
  currencyCode: string
  request: MaterialPaymentRequestView | null
  installmentName?: string
  open: boolean
  /** Owned by the panel (scoped per action and target) so the key survives closing and reopening. */
  commandKey: CommandKeyKeeper
}

const props = withDefaults(defineProps<Props>(), {
  installmentName: '',
})

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'saved'): void
  /** The record changed since it was loaded: the owner reloads and closes this dialog. */
  (e: 'stale', message: string): void
}>()

const maxFileBytes = 25 * 1024 * 1024

const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabaseClient = nuxtApp.$supabaseClient
const repositories = useRepositories()
const financeRepo = repositories.materialFinance
const procurementRepo = repositories.materialProcurement

const todayDate = vietnamToday()
let isDisposed = false
onBeforeUnmount(() => {
  isDisposed = true
})

const paidOn = ref(todayDate)
const bankReference = ref('')
const selectedFile = ref<File | null>(null)
const finalizedProofFileId = ref<string | null>(null)
const uploadSession = ref<MaterialEvidenceUploadSession | null>(null)
const fileInputKey = ref(0)
const isUploading = ref(false)
const uploadError = ref('')

const isSubmitting = ref(false)
const submitError = ref('')

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > maxFileBytes) {
    uploadError.value = 'Dung lượng tệp không được vượt quá 25 MiB.'
    input.value = ''
    return
  }

  const name = file.name.toLowerCase()
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf'
  const isJpg = name.endsWith('.jpg') || name.endsWith('.jpeg') || file.type === 'image/jpeg'
  const isPng = name.endsWith('.png') || file.type === 'image/png'
  if (!isPdf && !isJpg && !isPng) {
    uploadError.value = 'Chỉ chấp nhận tệp định dạng PDF, JPG hoặc PNG.'
    input.value = ''
    return
  }

  selectedFile.value = file
  finalizedProofFileId.value = null
  uploadSession.value = null
  uploadError.value = ''
}

function discardProofFile() {
  selectedFile.value = null
  finalizedProofFileId.value = null
  uploadSession.value = null
  // Remounting the input clears the browser's file selection.
  fileInputKey.value += 1
}

async function uploadProof() {
  const file = selectedFile.value
  if (!file || isUploading.value) return
  const companyId = companyAccess?.activeCompanyId
  if (!companyId) {
    uploadError.value = 'Chưa chọn công ty làm việc.'
    return
  }

  isUploading.value = true
  uploadError.value = ''
  const projectId = props.projectId
  try {
    const result = await uploadMaterialEvidence({
      companyId,
      projectId,
      file,
      evidenceRole: 'payment_proof',
      target: { kind: 'material_contract', contractId: props.contractId },
      repository: procurementRepo,
      supabaseClient,
      session: uploadSession.value,
      onSessionChange: (session) => {
        if (!isDisposed) uploadSession.value = session
      },
      isScopeCurrent: () => !isDisposed
        && companyAccess?.activeCompanyId === companyId
        && props.projectId === projectId,
    })
    if (isDisposed || selectedFile.value !== file) return
    finalizedProofFileId.value = result.evidenceFileId
  }
  catch (err: unknown) {
    if (isDisposed) return
    uploadError.value = uploadErrorMessage(err, 'Lỗi khi tải tệp chứng từ chi.')
  }
  finally {
    isUploading.value = false
  }
}

const allowCash = computed(() => {
  return canPayInCash(props.contractTotal, props.currencyCode, props.orderSubtotalSnapshot)
})

const method = ref<MaterialPaymentMethod>('bank_transfer')

watch(allowCash, (allowed) => {
  if (!allowed && method.value === 'cash') {
    method.value = 'bank_transfer'
  }
})

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    method.value = 'bank_transfer'
    paidOn.value = todayDate
    bankReference.value = ''
    discardProofFile()
    uploadError.value = ''
    submitError.value = ''
  },
  { immediate: true },
)

const paidOnInvalid = computed(() => !paidOn.value || paidOn.value > todayDate)

const canSubmit = computed(() => {
  if (isSubmitting.value || isUploading.value || !props.request) return false
  if (paidOnInvalid.value) return false
  if (method.value === 'bank_transfer' && !bankReference.value.trim()) return false
  return Boolean(finalizedProofFileId.value)
})

async function submitRecord() {
  const request = props.request
  const proofFileId = finalizedProofFileId.value
  if (!request || !proofFileId || !canSubmit.value) return

  const payload: RecordMaterialPaymentInput = method.value === 'cash'
    ? {
        expectedVersion: request.version,
        paidOn: paidOn.value,
        method: 'cash',
        bankReference: null,
        proofFileId,
      }
    : {
        expectedVersion: request.version,
        paidOn: paidOn.value,
        method: 'bank_transfer',
        bankReference: bankReference.value.trim(),
        proofFileId,
      }
  const idempotencyKey = props.commandKey.keyFor({ requestId: request.id, ...payload })

  isSubmitting.value = true
  submitError.value = ''
  try {
    await financeRepo.recordPayment(props.projectId, request.id, payload, { idempotencyKey })
    props.commandKey.reset()
    isSubmitting.value = false
    emit('saved')
    close()
  }
  catch (err: unknown) {
    resetCommandKeyAfterError(props.commandKey, err)
    const message = financeErrorMessage(err, 'Lỗi khi ghi nhận thực chi.')
    if (isVersionConflict(err)) emit('stale', message)
    else submitError.value = message
    // The proof is single use: after a duplicate-proof refusal the user must pick another file.
    if (financeErrorCode(err) === 'PROOF_ALREADY_USED') discardProofFile()
  }
  finally {
    isSubmitting.value = false
  }
}

function close() {
  if (isSubmitting.value || isUploading.value) return
  emit('update:open', false)
}

function onOpenChange(value: boolean) {
  if (!value) close()
}
</script>
