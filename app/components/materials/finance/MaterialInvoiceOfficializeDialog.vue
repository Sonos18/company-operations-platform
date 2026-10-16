<template>
  <UModal
    :open="open && Boolean(invoice)"
    title="Cập nhật hóa đơn chính thức"
    description="Đính kèm tệp hóa đơn chính thức từ nhà cung cấp cho hóa đơn nháp."
    :dismissible="!isBusy && !isUploading"
    @update:open="onOpenChange"
  >
    <template #body>
      <div v-if="invoice" class="space-y-4 text-xs">
        <div class="text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded border border-slate-100">
          <div>Hóa đơn số: <strong class="font-mono text-slate-900">{{ invoice.invoiceNo }}</strong> (Ký hiệu: {{ invoice.invoiceSymbol }})</div>
          <div>Tổng tiền: <strong class="font-mono text-slate-900">{{ formatVnNumber(invoice.total) }} {{ contract.currencyCode }}</strong></div>
        </div>

        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div class="flex items-center justify-between">
            <label for="official-file-input" class="font-semibold text-slate-700 text-xs m-0 flex items-center gap-1.5">
              <UIcon name="i-lucide-file-text" class="text-sky-600" aria-hidden="true" />
              <span>Tệp hóa đơn chính thức <span class="text-rose-500">*</span></span>
            </label>
            <span v-if="finalizedFileId" class="cockpit-badge bg-emerald-100 text-emerald-800 text-[10px] font-semibold flex items-center gap-1">
              <UIcon name="i-lucide-check" class="text-[10px]" aria-hidden="true" />
              Đã tải lên tệp
            </span>
          </div>

          <p class="text-[11px] text-slate-500 m-0">
            Chấp nhận tệp định dạng PDF, XML, JPG hoặc PNG (&le; 25 MiB).
          </p>

          <div class="flex items-center gap-2 flex-wrap pt-1">
            <input
              id="official-file-input"
              :key="fileInputKey"
              type="file"
              :accept="INVOICE_EVIDENCE_ACCEPT"
              class="cockpit-input text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
              :disabled="isBusy || isUploading"
              @change="onFileSelected"
            >

            <button
              v-if="selectedFile && !finalizedFileId"
              type="button"
              class="cockpit-btn cockpit-btn--primary btn-sm flex items-center gap-1.5"
              :disabled="isUploading || isBusy"
              @click="uploadFile"
            >
              <UIcon v-if="isUploading" name="i-lucide-loader-2" class="animate-spin text-xs" aria-hidden="true" />
              <UIcon v-else name="i-lucide-upload" class="text-xs" aria-hidden="true" />
              <span>Tải lên</span>
            </button>
          </div>

          <div v-if="selectedFile" class="text-[10px] text-slate-600 mt-1">
            Tệp: <strong>{{ selectedFile.name }}</strong> ({{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MiB)
          </div>

          <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger p-2 text-xs text-rose-700" role="alert">
            {{ errorMessage }}
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton color="neutral" variant="outline" :disabled="isBusy || isUploading" @click="close">
          Đóng
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-file-check"
          :loading="isBusy"
          :disabled="!finalizedFileId"
          @click="confirm"
        >
          Cập nhật hóa đơn chính thức
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import type {
  MaterialContractView,
  MaterialInvoiceView,
  OfficializeMaterialInvoiceInput,
} from '../../../../shared/schemas/costs/material-finance'
import {
  uploadMaterialEvidence,
  type MaterialEvidenceUploadSession,
} from '../../../utils/costs/material-evidence-uploader'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import {
  INVOICE_EVIDENCE_ACCEPT,
  INVOICE_EVIDENCE_MAX_BYTES,
  isInvoiceEvidenceFile,
} from '../../../utils/materials/invoice-evidence-file'
import {
  createScopedCommandKeys,
  financeErrorCode,
  financeErrorMessage,
  isVersionConflict,
  resetCommandKeyAfterError,
  uploadErrorMessage,
} from '../../../utils/materials/finance-ui'

interface Props {
  open: boolean
  invoice: MaterialInvoiceView | null
  contract: MaterialContractView
  projectId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'saved'): void
  (e: 'stale', message: string): void
}>()

const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabaseClient = nuxtApp.$supabaseClient
const repositories = useRepositories()
const financeRepo = repositories.materialFinance
const procurementRepo = repositories.materialProcurement

const selectedFile = ref<File | null>(null)
const finalizedFileId = ref<string | null>(null)
const uploadSession = ref<MaterialEvidenceUploadSession | null>(null)
const fileInputKey = ref(0)
const isUploading = ref(false)
const isBusy = ref(false)
const errorMessage = ref('')
let isDisposed = false
onBeforeUnmount(() => {
  isDisposed = true
})

const commandKeys = createScopedCommandKeys()

/** Forgets the picked file and its upload; remounting the input clears the browser file selection. */
function discardFile() {
  selectedFile.value = null
  finalizedFileId.value = null
  uploadSession.value = null
  fileInputKey.value += 1
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > INVOICE_EVIDENCE_MAX_BYTES) {
    errorMessage.value = 'Dung lượng tệp không được vượt quá 25 MiB.'
    input.value = ''
    return
  }
  if (!isInvoiceEvidenceFile(file)) {
    errorMessage.value = 'Chỉ chấp nhận tệp định dạng PDF, XML, JPG hoặc PNG.'
    input.value = ''
    return
  }

  selectedFile.value = file
  finalizedFileId.value = null
  uploadSession.value = null
  errorMessage.value = ''
}

async function uploadFile() {
  const file = selectedFile.value
  if (!file || isUploading.value || !props.invoice) return
  const companyId = companyAccess?.activeCompanyId
  if (!companyId) {
    errorMessage.value = 'Chưa chọn công ty làm việc.'
    return
  }

  isUploading.value = true
  errorMessage.value = ''
  const projectId = props.projectId
  try {
    const result = await uploadMaterialEvidence({
      companyId,
      projectId,
      file,
      evidenceRole: 'invoice',
      target: { kind: 'material_contract', contractId: props.contract.id },
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
    finalizedFileId.value = result.evidenceFileId
  }
  catch (err: unknown) {
    if (isDisposed) return
    errorMessage.value = uploadErrorMessage(err, 'Lỗi khi tải tệp hóa đơn chính thức.')
  }
  finally {
    isUploading.value = false
  }
}

async function confirm() {
  const invoice = props.invoice
  const officialFileId = finalizedFileId.value
  if (!invoice || !officialFileId || isBusy.value) return

  const payload: OfficializeMaterialInvoiceInput = {
    expectedVersion: invoice.version,
    officialFileId,
  }
  const officializeKey = commandKeys.forScope(`officialize:${invoice.id}`)
  const idempotencyKey = officializeKey.keyFor({ invoiceId: invoice.id, ...payload })

  isBusy.value = true
  errorMessage.value = ''
  try {
    await financeRepo.officializeInvoice(props.projectId, invoice.id, payload, { idempotencyKey })
    officializeKey.reset()
    isBusy.value = false
    emit('saved')
  }
  catch (err: unknown) {
    resetCommandKeyAfterError(officializeKey, err)
    const message = financeErrorMessage(err, 'Lỗi khi cập nhật hóa đơn chính thức.')
    isBusy.value = false
    if (isVersionConflict(err)) {
      emit('stale', message)
      return
    }
    errorMessage.value = message
    // A refused file would be refused again: the user must pick another one.
    if (financeErrorCode(err) === 'EVIDENCE_INVALID') discardFile()
  }
  finally {
    isBusy.value = false
  }
}

function close() {
  if (isBusy.value || isUploading.value) return
  emit('update:open', false)
}

function onOpenChange(value: boolean) {
  if (!value) close()
}
</script>
