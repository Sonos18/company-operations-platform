<template>
  <div class="material-invoice-panel cockpit-card" role="region" aria-label="Quản lý hóa đơn vật tư">
    <!-- Panel Header -->
    <div class="panel-header border-b border-slate-200 pb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2.5">
          <UIcon name="i-lucide-receipt" class="text-sky-600 text-xl shrink-0" aria-hidden="true" />
          <div>
            <h3 class="panel-title text-base font-bold text-slate-900 m-0">Hóa đơn nhà cung cấp</h3>
            <p class="text-xs text-slate-500 m-0 mt-0.5">
              Quản lý hóa đơn VAT từ nhà cung cấp cho {{ materialContractLabel(contract) }}.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm flex items-center gap-1.5"
            :disabled="isLoading"
            @click="loadInvoices"
          >
            <UIcon v-if="isLoading" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
            <span>Làm mới</span>
          </button>

          <button
            v-if="canRecordInvoice"
            type="button"
            class="cockpit-btn cockpit-btn--primary btn-sm flex items-center gap-1.5"
            @click="isFormOpen = true"
          >
            <UIcon name="i-lucide-plus" class="text-sm" aria-hidden="true" />
            <span>Nhập hóa đơn</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="actionError" class="cockpit-alert cockpit-alert--danger mt-4" role="alert">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
          <p class="text-xs font-semibold text-rose-900 m-0">{{ actionError }}</p>
        </div>
        <button
          type="button"
          class="text-rose-600 hover:text-rose-800 text-xs p-1"
          aria-label="Đóng thông báo lỗi"
          @click="actionError = ''"
        >
          <UIcon name="i-lucide-x" class="text-sm" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Invoices Content -->
    <div class="mt-4">
      <div v-if="isLoading && invoices.length === 0" class="py-8 text-center text-slate-400 text-xs">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-xl mx-auto mb-2 text-sky-600" aria-hidden="true" />
        <p class="m-0">Đang tải danh sách hóa đơn...</p>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="invoices.length === 0"
        class="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200"
      >
        <UIcon name="i-lucide-receipt-text" class="text-slate-400 text-3xl mx-auto mb-2" aria-hidden="true" />
        <p class="text-xs text-slate-600 font-medium m-0">Chưa có hóa đơn nào được ghi nhận cho hợp đồng này.</p>
        <p v-if="canRecordInvoice" class="text-xs text-slate-400 m-0 mt-1">
          Bấm "Nhập hóa đơn" để thêm hóa đơn mới từ nhà cung cấp.
        </p>
      </div>

      <!-- Invoices Table -->
      <div v-else class="overflow-x-auto">
        <table class="cockpit-table w-full text-left text-xs border border-slate-200 rounded-lg">
          <caption class="sr-only">Danh sách hóa đơn của hợp đồng</caption>
          <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th scope="col" class="p-2.5">Ký hiệu</th>
              <th scope="col" class="p-2.5">Số hóa đơn</th>
              <th scope="col" class="p-2.5">Ngày lập</th>
              <th scope="col" class="p-2.5 text-right">Trước VAT</th>
              <th scope="col" class="p-2.5 text-right">VAT</th>
              <th scope="col" class="p-2.5 text-right">Tổng tiền</th>
              <th scope="col" class="p-2.5 text-center">Giai đoạn</th>
              <th scope="col" class="p-2.5 text-center">Trạng thái</th>
              <th scope="col" class="p-2.5 text-center">Tệp đính kèm</th>
              <th scope="col" class="p-2.5 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr
              v-for="inv in invoices"
              :key="inv.id"
              class="hover:bg-slate-50 transition-colors"
              :class="{ 'opacity-70 bg-slate-50/50': inv.state === 'voided' }"
            >
              <td class="p-2.5 font-mono font-medium text-slate-800">
                {{ inv.invoiceSymbol }}
              </td>

              <td class="p-2.5 font-mono font-semibold text-slate-900">
                {{ inv.invoiceNo }}
              </td>

              <td class="p-2.5 text-slate-600">
                {{ formatDate(inv.issuedOn) }}
              </td>

              <td class="p-2.5 font-mono text-right text-slate-700">
                {{ formatVnNumber(inv.subtotal) }}
              </td>

              <td class="p-2.5 font-mono text-right text-slate-700">
                {{ formatVnNumber(inv.vatAmount) }}
              </td>

              <td class="p-2.5 font-mono font-bold text-right text-slate-900">
                {{ formatVnNumber(inv.total) }} <span class="text-[10px] font-normal text-slate-500">{{ contract.currencyCode }}</span>
              </td>

              <td class="p-2.5 text-center">
                <span
                  class="cockpit-badge text-[11px] font-semibold"
                  :class="inv.stage === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'"
                >
                  {{ inv.stage === 'draft' ? 'Nháp' : 'Chính thức' }}
                </span>
              </td>

              <td class="p-2.5 text-center">
                <span
                  class="cockpit-badge text-[11px] font-semibold"
                  :class="inv.state === 'recorded' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'"
                >
                  {{ inv.state === 'recorded' ? 'Đã ghi nhận' : 'Đã hủy' }}
                </span>
                <div v-if="inv.state === 'voided' && inv.voidReason" class="text-[10px] text-rose-700 mt-0.5 max-w-[160px] truncate mx-auto" :title="'Lý do hủy: ' + inv.voidReason">
                  Lý do: {{ inv.voidReason }}
                </div>
              </td>

              <td class="p-2.5 text-center space-y-1">
                <div>
                  <button
                    type="button"
                    class="text-sky-600 hover:text-sky-800 text-xs inline-flex items-center gap-1 font-medium"
                    :disabled="isFileReading === inv.fileId"
                    @click="viewInvoiceFile(inv.fileId)"
                  >
                    <UIcon v-if="isFileReading === inv.fileId" name="i-lucide-loader-2" class="animate-spin text-xs" aria-hidden="true" />
                    <UIcon v-else name="i-lucide-file-text" class="text-xs" aria-hidden="true" />
                    <span>{{ inv.officialFileId ? 'Xem file nháp' : 'Xem file' }}</span>
                  </button>
                </div>
                <div v-if="inv.officialFileId">
                  <button
                    type="button"
                    class="text-sky-600 hover:text-sky-800 text-xs inline-flex items-center gap-1 font-medium"
                    :disabled="isFileReading === inv.officialFileId"
                    @click="viewInvoiceFile(inv.officialFileId)"
                  >
                    <UIcon v-if="isFileReading === inv.officialFileId" name="i-lucide-loader-2" class="animate-spin text-xs" aria-hidden="true" />
                    <UIcon v-else name="i-lucide-file-check" class="text-xs" aria-hidden="true" />
                    <span>Xem file chính thức</span>
                  </button>
                </div>
              </td>

              <td class="p-2.5 text-center">
                <div class="flex items-center justify-center gap-1.5 flex-wrap">
                  <button
                    v-if="inv.state === 'recorded' && inv.stage === 'draft' && canRecordInvoice"
                    type="button"
                    class="cockpit-btn cockpit-btn--primary btn-sm text-[11px] py-1 px-2 flex items-center gap-1"
                    title="Cập nhật hóa đơn chính thức"
                    @click="openOfficializeDialog(inv)"
                  >
                    <UIcon name="i-lucide-file-check" class="text-xs" aria-hidden="true" />
                    <span>Cập nhật hóa đơn chính thức</span>
                  </button>

                  <button
                    v-if="inv.state === 'recorded' && canRecordInvoice"
                    type="button"
                    class="cockpit-btn cockpit-btn--danger btn-sm text-[11px] py-1 px-2"
                    @click="openVoidDialog(inv)"
                  >
                    Hủy hóa đơn
                  </button>
                  <span v-if="inv.state !== 'recorded' || !canRecordInvoice" class="text-slate-400 text-[11px]">—</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Void Invoice Modal Dialog -->
    <UModal
      :open="Boolean(voidingInvoice)"
      title="Hủy hóa đơn nhà cung cấp"
      description="Hóa đơn sau khi hủy sẽ không thể phục hồi và không được tính vào tổng giá trị đã nhận hóa đơn."
      :dismissible="!isVoidBusy"
      @update:open="onVoidOpenChange"
    >
      <template #body>
        <div v-if="voidingInvoice" class="space-y-4 text-xs">
          <div class="text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded border border-slate-100">
            <div>Hóa đơn số: <strong class="font-mono text-slate-900">{{ voidingInvoice.invoiceNo }}</strong> (Ký hiệu: {{ voidingInvoice.invoiceSymbol }})</div>
            <div>Tổng tiền: <strong class="font-mono text-slate-900">{{ formatVnNumber(voidingInvoice.total) }} {{ contract.currencyCode }}</strong></div>
          </div>

          <div>
            <label for="void-reason-input" class="field-label block text-xs font-semibold text-slate-700 mb-1">
              Lý do hủy hóa đơn <span class="text-rose-500">*</span>
            </label>
            <textarea
              id="void-reason-input"
              v-model="voidReason"
              rows="3"
              class="cockpit-input w-full text-xs"
              placeholder="Nhập lý do hủy hóa đơn (bắt buộc)..."
              :disabled="isVoidBusy"
              maxlength="1000"
            />
            <div class="text-[10px] text-slate-400 text-right mt-1">
              {{ voidReason.length }}/1000 ký tự
            </div>
          </div>

          <div v-if="voidError" class="cockpit-alert cockpit-alert--danger p-2 text-xs text-rose-700" role="alert">
            {{ voidError }}
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="isVoidBusy" @click="closeVoidDialog">
            Đóng
          </UButton>
          <UButton color="error" icon="i-lucide-check" :loading="isVoidBusy" :disabled="!voidReason.trim()" @click="confirmVoidInvoice">
            Xác nhận hủy
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- MaterialInvoiceForm Modal -->
    <MaterialInvoiceForm
      v-if="isFormOpen"
      :project-id="projectId"
      :contract="contract"
      :open="isFormOpen"
      :command-key="commandKeys.forScope(`record-invoice:${contract.id}`)"
      @update:open="val => isFormOpen = val"
      @saved="onInvoiceSaved"
      @stale="onStale"
    />

    <!-- Officialize Invoice Modal Dialog -->
    <UModal
      :open="Boolean(officializingInvoice)"
      title="Cập nhật hóa đơn chính thức"
      description="Đính kèm tệp hóa đơn chính thức từ nhà cung cấp cho hóa đơn nháp."
      :dismissible="!isOfficialBusy && !isOfficialUploading"
      @update:open="onOfficializeOpenChange"
    >
      <template #body>
        <div v-if="officializingInvoice" class="space-y-4 text-xs">
          <div class="text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded border border-slate-100">
            <div>Hóa đơn số: <strong class="font-mono text-slate-900">{{ officializingInvoice.invoiceNo }}</strong> (Ký hiệu: {{ officializingInvoice.invoiceSymbol }})</div>
            <div>Tổng tiền: <strong class="font-mono text-slate-900">{{ formatVnNumber(officializingInvoice.total) }} {{ contract.currencyCode }}</strong></div>
          </div>

          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div class="flex items-center justify-between">
              <label for="official-file-input" class="font-semibold text-slate-700 text-xs m-0 flex items-center gap-1.5">
                <UIcon name="i-lucide-file-text" class="text-sky-600" aria-hidden="true" />
                <span>Tệp hóa đơn chính thức <span class="text-rose-500">*</span></span>
              </label>
              <span v-if="finalizedOfficialFileId" class="cockpit-badge bg-emerald-100 text-emerald-800 text-[10px] font-semibold flex items-center gap-1">
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
                :key="officialFileInputKey"
                type="file"
                accept=".pdf,.xml,.jpg,.jpeg,.png,application/pdf,application/xml,text/xml,image/jpeg,image/png"
                class="cockpit-input text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
                :disabled="isOfficialBusy || isOfficialUploading"
                @change="onOfficialFileSelected"
              >

              <button
                v-if="selectedOfficialFile && !finalizedOfficialFileId"
                type="button"
                class="cockpit-btn cockpit-btn--primary btn-sm flex items-center gap-1.5"
                :disabled="isOfficialUploading || isOfficialBusy"
                @click="uploadOfficialFile"
              >
                <UIcon v-if="isOfficialUploading" name="i-lucide-loader-2" class="animate-spin text-xs" aria-hidden="true" />
                <UIcon v-else name="i-lucide-upload" class="text-xs" aria-hidden="true" />
                <span>Tải lên</span>
              </button>
            </div>

            <div v-if="selectedOfficialFile" class="text-[10px] text-slate-600 mt-1">
              Tệp: <strong>{{ selectedOfficialFile.name }}</strong> ({{ (selectedOfficialFile.size / 1024 / 1024).toFixed(2) }} MiB)
            </div>

            <div v-if="officialError" class="cockpit-alert cockpit-alert--danger p-2 text-xs text-rose-700" role="alert">
              {{ officialError }}
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="isOfficialBusy || isOfficialUploading" @click="closeOfficializeDialog">
            Đóng
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-file-check"
            :loading="isOfficialBusy"
            :disabled="!finalizedOfficialFileId"
            @click="confirmOfficializeInvoice"
          >
            Cập nhật hóa đơn chính thức
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type {
  MaterialContractView,
  MaterialInvoiceView,
  OfficializeMaterialInvoiceInput,
  VoidMaterialInvoiceInput,
} from '../../../../shared/schemas/costs/material-finance'
import {
  uploadMaterialEvidence,
  type MaterialEvidenceUploadSession,
} from '../../../utils/costs/material-evidence-uploader'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import { formatDate } from '../../../utils/materials/date-display'
import { materialContractLabel } from '../../../utils/materials/contract-label'
import {
  createScopedCommandKeys,
  financeErrorMessage,
  isVersionConflict,
  resetCommandKeyAfterError,
  uploadErrorMessage,
} from '../../../utils/materials/finance-ui'
import MaterialInvoiceForm from './MaterialInvoiceForm.vue'

interface Props {
  projectId: string
  contract: MaterialContractView
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabaseClient = nuxtApp.$supabaseClient
const repositories = useRepositories()
const financeRepo = repositories.materialFinance
const procurementRepo = repositories.materialProcurement

const canRecordInvoice = computed(() => {
  return Boolean(companyAccess?.hasPermission('material.contract.record'))
})

const invoices = ref<MaterialInvoiceView[]>([])
const isLoading = ref(false)
const actionError = ref('')
const isFileReading = ref<string | null>(null)
const isFormOpen = ref(false)

// Void dialog state. The idempotency key survives an unknown outcome (lost response)
// so a retry replays the same command, and changes as soon as the payload changes.
const voidingInvoice = ref<MaterialInvoiceView | null>(null)
const voidReason = ref('')
const isVoidBusy = ref(false)
const voidError = ref('')

// Officialize dialog state
const officializingInvoice = ref<MaterialInvoiceView | null>(null)
const selectedOfficialFile = ref<File | null>(null)
const finalizedOfficialFileId = ref<string | null>(null)
const officialUploadSession = ref<MaterialEvidenceUploadSession | null>(null)
const officialFileInputKey = ref(0)
const isOfficialUploading = ref(false)
const isOfficialBusy = ref(false)
const officialError = ref('')
let isDisposed = false
onBeforeUnmount(() => {
  isDisposed = true
})

const commandKeys = createScopedCommandKeys()

async function loadInvoices() {
  if (!props.contract?.id) return
  isLoading.value = true
  actionError.value = ''
  try {
    invoices.value = await financeRepo.listInvoices(props.projectId, props.contract.id)
  } catch (err: unknown) {
    actionError.value = financeErrorMessage(err, 'Chưa tải được danh sách hóa đơn.')
  } finally {
    isLoading.value = false
  }
}

async function viewInvoiceFile(fileId: string) {
  if (!fileId || isFileReading.value) return
  isFileReading.value = fileId
  try {
    const res = await procurementRepo.readEvidenceUrl(props.projectId, fileId)
    if (res?.url) {
      window.open(res.url, '_blank', 'noopener,noreferrer')
    }
  } catch (err: unknown) {
    actionError.value = financeErrorMessage(err, 'Không mở được tệp hóa đơn.')
  } finally {
    isFileReading.value = null
  }
}

function openVoidDialog(inv: MaterialInvoiceView) {
  voidingInvoice.value = inv
  voidReason.value = ''
  voidError.value = ''
}

function closeVoidDialog() {
  if (isVoidBusy.value) return
  voidingInvoice.value = null
  voidReason.value = ''
  voidError.value = ''
}

async function confirmVoidInvoice() {
  const invoice = voidingInvoice.value
  if (!invoice || isVoidBusy.value) return
  const trimmedReason = voidReason.value.trim()
  if (!trimmedReason) {
    voidError.value = 'Vui lòng nhập lý do hủy hóa đơn.'
    return
  }

  const payload: VoidMaterialInvoiceInput = {
    expectedVersion: invoice.version,
    reason: trimmedReason,
  }
  const voidKey = commandKeys.forScope(`void:${invoice.id}`)
  const idempotencyKey = voidKey.keyFor({ invoiceId: invoice.id, ...payload })

  isVoidBusy.value = true
  voidError.value = ''
  try {
    await financeRepo.voidInvoice(props.projectId, invoice.id, payload, { idempotencyKey })
    voidKey.reset()
    isVoidBusy.value = false
    closeVoidDialog()
    await loadInvoices()
    emit('changed')
  } catch (err: unknown) {
    resetCommandKeyAfterError(voidKey, err)
    const message = financeErrorMessage(err, 'Lỗi khi hủy hóa đơn.')
    isVoidBusy.value = false
    if (isVersionConflict(err)) await onStale(message)
    else voidError.value = message
  } finally {
    isVoidBusy.value = false
  }
}

function onVoidOpenChange(value: boolean) {
  if (!value) closeVoidDialog()
}

function openOfficializeDialog(inv: MaterialInvoiceView) {
  officializingInvoice.value = inv
  selectedOfficialFile.value = null
  finalizedOfficialFileId.value = null
  officialUploadSession.value = null
  officialError.value = ''
  officialFileInputKey.value += 1
}

function closeOfficializeDialog() {
  if (isOfficialBusy.value || isOfficialUploading.value) return
  officializingInvoice.value = null
  selectedOfficialFile.value = null
  finalizedOfficialFileId.value = null
  officialUploadSession.value = null
  officialError.value = ''
}

function onOfficialFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > 25 * 1024 * 1024) {
    officialError.value = 'Dung lượng tệp không được vượt quá 25 MiB.'
    input.value = ''
    return
  }

  const name = file.name.toLowerCase()
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf'
  const isXml = name.endsWith('.xml') || file.type === 'application/xml' || file.type === 'text/xml'
  const isJpg = name.endsWith('.jpg') || name.endsWith('.jpeg') || file.type === 'image/jpeg'
  const isPng = name.endsWith('.png') || file.type === 'image/png'
  if (!isPdf && !isXml && !isJpg && !isPng) {
    officialError.value = 'Chỉ chấp nhận tệp định dạng PDF, XML, JPG hoặc PNG.'
    input.value = ''
    return
  }

  selectedOfficialFile.value = file
  finalizedOfficialFileId.value = null
  officialUploadSession.value = null
  officialError.value = ''
}

async function uploadOfficialFile() {
  const file = selectedOfficialFile.value
  if (!file || isOfficialUploading.value || !officializingInvoice.value) return
  const companyId = companyAccess?.activeCompanyId
  if (!companyId) {
    officialError.value = 'Chưa chọn công ty làm việc.'
    return
  }

  isOfficialUploading.value = true
  officialError.value = ''
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
      session: officialUploadSession.value,
      onSessionChange: (session) => {
        if (!isDisposed) officialUploadSession.value = session
      },
      isScopeCurrent: () => !isDisposed
        && companyAccess?.activeCompanyId === companyId
        && props.projectId === projectId,
    })
    if (isDisposed || selectedOfficialFile.value !== file) return
    finalizedOfficialFileId.value = result.evidenceFileId
  }
  catch (err: unknown) {
    if (isDisposed) return
    officialError.value = uploadErrorMessage(err, 'Lỗi khi tải tệp hóa đơn chính thức.')
  }
  finally {
    isOfficialUploading.value = false
  }
}

async function confirmOfficializeInvoice() {
  const invoice = officializingInvoice.value
  const officialFileId = finalizedOfficialFileId.value
  if (!invoice || !officialFileId || isOfficialBusy.value) return

  const payload: OfficializeMaterialInvoiceInput = {
    expectedVersion: invoice.version,
    officialFileId,
  }
  const officializeKey = commandKeys.forScope(`officialize:${invoice.id}`)
  const idempotencyKey = officializeKey.keyFor({ invoiceId: invoice.id, ...payload })

  isOfficialBusy.value = true
  officialError.value = ''
  try {
    await financeRepo.officializeInvoice(props.projectId, invoice.id, payload, { idempotencyKey })
    officializeKey.reset()
    isOfficialBusy.value = false
    closeOfficializeDialog()
    await loadInvoices()
    emit('changed')
  }
  catch (err: unknown) {
    resetCommandKeyAfterError(officializeKey, err)
    const message = financeErrorMessage(err, 'Lỗi khi cập nhật hóa đơn chính thức.')
    isOfficialBusy.value = false
    if (isVersionConflict(err)) await onStale(message)
    else officialError.value = message
  }
  finally {
    isOfficialBusy.value = false
  }
}

function onOfficializeOpenChange(value: boolean) {
  if (!value) closeOfficializeDialog()
}

/** The invoice changed since it was loaded: close the dialogs, reload, and tell the user why. */
async function onStale(message: string) {
  isFormOpen.value = false
  closeVoidDialog()
  closeOfficializeDialog()
  await loadInvoices()
  actionError.value = message
  emit('changed')
}

function onInvoiceSaved() {
  isFormOpen.value = false
  void loadInvoices()
  emit('changed')
}

onMounted(() => {
  void loadInvoices()
})
</script>
