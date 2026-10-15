<template>
  <div
    v-if="open && request"
    :ref="focusDialogElement"
    tabindex="-1"
    class="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-labelledby="record-payment-dialog-title"
    @keydown.esc="close"
  >
    <div class="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-emerald-100 text-emerald-700">
            <UIcon name="i-lucide-banknote" class="text-xl" aria-hidden="true" />
          </div>
          <div>
            <h3 id="record-payment-dialog-title" class="text-base font-bold text-slate-900 m-0">
              Ghi nhận chuyển khoản thực chi
            </h3>
            <p class="text-xs text-slate-500 m-0 mt-0.5">
              Xác nhận lệnh chi &bull; Số tiền: <strong class="font-mono text-emerald-800">{{ formatMoney(request.amount) }}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50"
          aria-label="Đóng"
          :disabled="isSubmitting || isUploading"
          @click="close"
        >
          <UIcon name="i-lucide-x" class="text-lg" aria-hidden="true" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-4 sm:p-5 space-y-4 text-xs">
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
            <strong class="font-mono text-slate-900 text-sm text-emerald-700">{{ formatMoney(request.amount) }}</strong>
          </div>
          <div class="flex justify-between">
            <span>Đợt thanh toán:</span>
            <span class="font-semibold text-slate-800">{{ installmentName || request.installmentKey.slice(0, 8) + '...' }}</span>
          </div>
          <div v-if="request.note" class="pt-1 border-t border-slate-200 text-slate-700">
            <span class="text-slate-500">Ghi chú:</span> {{ request.note }}
          </div>
        </div>

        <!-- Transfer Date (paidOn) -->
        <div>
          <label for="paid-on-input" class="block font-semibold text-slate-700 mb-1">
            Ngày chuyển khoản ngân hàng <span class="text-rose-500">*</span>
          </label>
          <input
            id="paid-on-input"
            v-model="paidOn"
            type="date"
            class="cockpit-input w-full font-mono text-xs"
            :max="todayDate"
            :disabled="isSubmitting || isUploading"
          >
          <span v-if="paidOnInvalid" class="text-[11px] font-medium text-rose-600" role="alert">Ngày chuyển phải có giá trị và không được ở tương lai</span>
          <span v-else class="text-[10px] text-slate-400">Mặc định hôm nay, không được chọn ngày trong tương lai</span>
        </div>

        <!-- Reference Number (bankReference) -->
        <div>
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

        <!-- Proof File Upload (Ủy nhiệm chi - PDF/JPG/PNG) -->
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div class="flex items-center justify-between">
            <label for="proof-file-input" class="font-semibold text-slate-700 text-xs m-0 flex items-center gap-1.5">
              <UIcon name="i-lucide-file-text" class="text-sky-600" aria-hidden="true" />
              <span>Ủy nhiệm chi / Chứng từ thanh toán <span class="text-rose-500">*</span></span>
            </label>
            <span v-if="finalizedProofFileId" class="cockpit-badge bg-emerald-100 text-emerald-800 text-[10px] font-semibold flex items-center gap-1">
              <UIcon name="i-lucide-check" class="text-[10px]" aria-hidden="true" />
              Đã tải chứng từ
            </span>
          </div>

          <p class="text-[11px] text-slate-500 m-0">
            Tải lên ủy nhiệm chi đã có dấu ngân hàng (PDF, JPG, PNG &le; 25 MiB).
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

      <!-- Footer -->
      <div class="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
        <button
          type="button"
          class="cockpit-btn cockpit-btn--secondary btn-sm"
          :disabled="isSubmitting || isUploading"
          @click="close"
        >
          Hủy bỏ
        </button>

        <button
          type="button"
          class="cockpit-btn cockpit-btn--primary btn-sm flex items-center gap-1.5"
          :disabled="!canSubmit"
          @click="submitRecord"
        >
          <UIcon v-if="isSubmitting" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
          <UIcon v-else name="i-lucide-check-check" class="text-sm" aria-hidden="true" />
          <span>Xác nhận đã chi</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type {
  MaterialPaymentRequestView,
  RecordMaterialPaymentInput,
} from '../../../../shared/schemas/costs/material-finance'
import { localDateInputValue } from '../../../utils/costs/local-date'
import {
  uploadMaterialEvidence,
  type MaterialEvidenceUploadSession,
} from '../../../utils/costs/material-evidence-uploader'
import {
  contractEvidenceScope,
  createCommandKeyTracker,
  financeErrorCode,
  financeErrorMessage,
  focusDialogElement,
  formatMoney,
  uploadErrorMessage,
} from '../../../utils/materials/finance-ui'

interface Props {
  projectId: string
  contractId: string
  request: MaterialPaymentRequestView | null
  installmentName?: string
  open: boolean
}

const props = withDefaults(defineProps<Props>(), {
  installmentName: '',
})

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'saved'): void
}>()

const maxFileBytes = 25 * 1024 * 1024

const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabaseClient = nuxtApp.$supabaseClient
const repositories = useRepositories()
const financeRepo = repositories.materialFinance
const procurementRepo = repositories.materialProcurement

const todayDate = localDateInputValue()
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
const commandKey = createCommandKeyTracker()

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
      ...contractEvidenceScope('payment_proof', props.contractId),
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
    uploadError.value = uploadErrorMessage(err, 'Lỗi khi tải tệp ủy nhiệm chi.')
  }
  finally {
    isUploading.value = false
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    paidOn.value = todayDate
    bankReference.value = ''
    discardProofFile()
    uploadError.value = ''
    submitError.value = ''
    commandKey.settle()
  },
  { immediate: true },
)

const paidOnInvalid = computed(() => !paidOn.value || paidOn.value > todayDate)

const canSubmit = computed(() => {
  if (isSubmitting.value || isUploading.value || !props.request) return false
  if (paidOnInvalid.value) return false
  if (!bankReference.value.trim()) return false
  return Boolean(finalizedProofFileId.value)
})

async function submitRecord() {
  const request = props.request
  const proofFileId = finalizedProofFileId.value
  if (!request || !proofFileId || !canSubmit.value) return

  const payload: RecordMaterialPaymentInput = {
    expectedVersion: request.version,
    paidOn: paidOn.value,
    bankReference: bankReference.value.trim(),
    proofFileId,
  }
  const idempotencyKey = commandKey.keyFor({ requestId: request.id, ...payload })

  isSubmitting.value = true
  submitError.value = ''
  try {
    await financeRepo.recordPayment(props.projectId, request.id, payload, { idempotencyKey })
    commandKey.settle()
    isSubmitting.value = false
    emit('saved')
    close()
  }
  catch (err: unknown) {
    commandKey.settleAfterError(err)
    submitError.value = financeErrorMessage(err, 'Lỗi khi ghi nhận thực chi.')
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
</script>
