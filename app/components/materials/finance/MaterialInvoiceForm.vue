<template>
  <UModal
    :open="open"
    title="Nhập hóa đơn nhà cung cấp"
    :description="`${materialContractLabel(contract)} - Nhà cung cấp: ${contract.supplierName}`"
    :dismissible="!isSubmitting && !isUploading"
    :ui="{ content: 'max-w-3xl' }"
    @update:open="onOpenChange"
  >
    <template #body>
      <div class="space-y-6 text-xs">
        <!-- Error Banner -->
        <div v-if="submitError" class="cockpit-alert cockpit-alert--danger" role="alert">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
            <div class="flex-1">
              <p class="font-semibold text-rose-900 m-0">{{ submitError }}</p>
            </div>
          </div>
        </div>

        <!-- Section 1: File Upload (PDF / XML / JPG / PNG) -->
        <section class="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-lg" aria-labelledby="section-file-title">
          <div class="flex items-center justify-between">
            <h4 id="section-file-title" class="font-bold text-slate-900 text-xs m-0 flex items-center gap-1.5">
              <UIcon name="i-lucide-file-up" class="text-sky-600" aria-hidden="true" />
              <span>1. Tệp hóa đơn (PDF, XML, JPG, PNG) <span class="text-rose-500">*</span></span>
            </h4>
            <span v-if="finalizedFileId" class="cockpit-badge bg-emerald-100 text-emerald-800 text-[11px] font-semibold flex items-center gap-1">
              <UIcon name="i-lucide-check" class="text-xs" aria-hidden="true" />
              Đã tải lên tệp
            </span>
          </div>

          <p class="text-slate-500 text-[11px] m-0">
            Chấp nhận tệp định dạng PDF, XML, JPG hoặc PNG (&le; 25 MiB).
          </p>

          <div class="flex items-center gap-3 flex-wrap pt-1">
            <input
              id="invoice-file-input"
              aria-label="Chọn tệp hóa đơn PDF, XML, JPG hoặc PNG"
              type="file"
              :accept="INVOICE_EVIDENCE_ACCEPT"
              class="cockpit-input text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
              :disabled="isSubmitting || isUploading"
              @change="onFileSelected"
            >

            <button
              v-if="selectedFile && !finalizedFileId"
              type="button"
              class="cockpit-btn cockpit-btn--primary btn-sm flex items-center gap-1.5"
              :disabled="isUploading || isSubmitting"
              @click="uploadFile"
            >
              <UIcon v-if="isUploading" name="i-lucide-loader-2" class="animate-spin text-xs" aria-hidden="true" />
              <UIcon v-else name="i-lucide-upload" class="text-xs" aria-hidden="true" />
              <span>Tải lên tệp</span>
            </button>
          </div>

          <div v-if="selectedFile" class="text-[11px] text-slate-600 mt-1 flex items-center gap-2">
            <span>Tệp: <strong>{{ selectedFile.name }}</strong> ({{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MiB)</span>
          </div>

          <div v-if="uploadError" class="text-[11px] text-rose-600 font-medium" role="alert">
            {{ uploadError }}
          </div>
        </section>

        <!-- Section 2: Invoice Numbers and Financial Details -->
        <section class="space-y-3" aria-labelledby="section-info-title">
          <h4 id="section-info-title" class="font-bold text-slate-900 text-xs m-0 flex items-center gap-1.5">
            <UIcon name="i-lucide-hash" class="text-sky-600" aria-hidden="true" />
            <span>2. Thông tin và giá trị hóa đơn</span>
          </h4>

          <!-- Stage Selection: draft (default) vs official -->
          <fieldset class="space-y-1.5 border-0 p-0 m-0">
            <legend class="block font-semibold text-slate-700 text-xs mb-1.5">
              Giai đoạn hóa đơn <span class="text-rose-500">*</span>
            </legend>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                class="p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500"
                :class="stage === 'draft'
                  ? 'border-sky-500 bg-sky-50/70 text-sky-900 font-semibold ring-1 ring-sky-500'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'"
              >
                <input
                  type="radio"
                  name="invoice-stage"
                  value="draft"
                  :checked="stage === 'draft'"
                  :disabled="isSubmitting"
                  class="h-4 w-4 cursor-pointer text-sky-600 focus:ring-sky-500"
                  @change="stage = 'draft'"
                >
                <span>Bản nháp / bản đã ký (chờ bản chính thức)</span>
              </label>

              <label
                class="p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500"
                :class="stage === 'official'
                  ? 'border-sky-500 bg-sky-50/70 text-sky-900 font-semibold ring-1 ring-sky-500'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'"
              >
                <input
                  type="radio"
                  name="invoice-stage"
                  value="official"
                  :checked="stage === 'official'"
                  :disabled="isSubmitting"
                  class="h-4 w-4 cursor-pointer text-sky-600 focus:ring-sky-500"
                  @change="stage = 'official'"
                >
                <span>Hóa đơn chính thức</span>
              </label>
            </div>
          </fieldset>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label for="inv-symbol-input" class="field-label block font-semibold text-slate-700 mb-1">
                Ký hiệu mẫu số/ký hiệu <span class="text-rose-500">*</span>
              </label>
              <input
                id="inv-symbol-input"
                v-model="invoiceSymbol"
                type="text"
                class="cockpit-input w-full font-mono text-xs"
                placeholder="VD: 1C24TAA"
                maxlength="20"
                :disabled="isSubmitting"
              >
            </div>

            <div>
              <label for="inv-no-input" class="field-label block font-semibold text-slate-700 mb-1">
                Số hóa đơn <span class="text-rose-500">*</span>
              </label>
              <input
                id="inv-no-input"
                v-model="invoiceNo"
                type="text"
                class="cockpit-input w-full font-mono text-xs"
                placeholder="VD: 0000123"
                maxlength="50"
                :disabled="isSubmitting"
              >
            </div>

            <div>
              <label for="inv-date-input" class="field-label block font-semibold text-slate-700 mb-1">
                Ngày lập hóa đơn <span class="text-rose-500">*</span>
              </label>
              <input
                id="inv-date-input"
                v-model="issuedOn"
                type="date"
                class="cockpit-input w-full text-xs font-mono"
                :max="todayDate"
                :disabled="isSubmitting"
              >
            </div>
          </div>

          <!-- Financial amounts: before VAT, VAT, Total (Vietnamese number format) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <MaterialMoneyInput
              id="inv-subtotal-input"
              v-model="subtotal"
              label="Trước VAT"
              test-id="inv-subtotal"
              :disabled="isSubmitting"
            />
            <MaterialMoneyInput
              id="inv-vat-input"
              v-model="vatAmount"
              label="Tiền VAT"
              test-id="inv-vat"
              :disabled="isSubmitting"
            />
            <MaterialMoneyInput
              id="inv-total-input"
              v-model="total"
              label="Tổng tiền hóa đơn"
              test-id="inv-total"
              :disabled="isSubmitting"
            />
          </div>
          <p class="m-0 text-[10px] text-slate-400">Tổng tiền tự tính từ Trước VAT + VAT và vẫn có thể sửa.</p>

          <!-- Consistency check warning (kiểm khớp) -->
          <div
            v-if="isTotalMismatched"
            class="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center justify-between gap-2"
            role="alert"
          >
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-sm shrink-0" aria-hidden="true" />
              <span><strong>Cảnh báo kiểm khớp:</strong> Tổng tiền ({{ total || '0' }}) chưa bằng Trước VAT ({{ subtotal || '0' }}) + VAT ({{ vatAmount || '0' }}).</span>
            </div>
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm text-[11px] shrink-0"
              @click="recalculateTotal"
            >
              Tự động khớp
            </button>
          </div>
        </section>

        <!-- Section 3: Table of material names per order line -->
        <section class="space-y-2 pt-2 border-t border-slate-200" aria-labelledby="section-lines-title">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h4 id="section-lines-title" class="font-bold text-slate-900 text-xs m-0 flex items-center gap-1.5">
              <UIcon name="i-lucide-list-checks" class="text-sky-600" aria-hidden="true" />
              <span>3. Tên vật tư trên hóa đơn theo dòng đơn hàng</span>
            </h4>
            <span class="text-[11px] text-slate-500 italic">
              Ô để trống có nghĩa là dòng đó không gửi trong hóa đơn này.
            </span>
          </div>

          <div v-if="isLoadingLines" class="py-4 text-center text-slate-400">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-base mx-auto mb-1 text-sky-600" aria-hidden="true" />
            <p class="m-0 text-[11px]">Đang tải danh mục dòng đơn hàng và gợi ý...</p>
          </div>

          <div v-else-if="linesError" class="p-3 bg-rose-50 rounded border border-rose-200 text-rose-800" role="alert">
            {{ linesError }} Bạn vẫn có thể ghi nhận hóa đơn không kèm tên vật tư.
          </div>

          <div v-else-if="orderAllocations.length === 0" class="p-3 bg-slate-50 rounded border border-slate-200 text-slate-500 text-center">
            Không tìm thấy dòng vật tư nào cho đơn hàng này.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="alloc in orderAllocations"
              :key="alloc.orderLineId"
              class="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2"
            >
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="font-semibold text-slate-900 text-xs">
                  {{ alloc.materialName }}
                  <span v-if="alloc.specification" class="text-slate-500 font-normal font-mono text-[11px]">
                    ({{ alloc.specification }})
                  </span>
                  <span class="cockpit-badge bg-slate-100 text-slate-600 text-[10px] ml-1.5 font-normal">
                    ĐVT: {{ alloc.unit }}
                  </span>
                </div>

                <div class="text-[11px] text-slate-600 font-mono">
                  SL đặt: <strong>{{ formatMaterialQuantity(alloc.quantity) }}</strong>
                </div>
              </div>

              <!-- Input for invoiceMaterialName -->
              <div>
                <label :for="'line-name-' + alloc.proposalLineId" class="block text-[11px] text-slate-600 mb-1">
                  Tên vật tư trên hóa đơn:
                </label>
                <input
                  :id="'line-name-' + alloc.proposalLineId"
                  v-model="lineMaterialNames[alloc.proposalLineId]"
                  type="text"
                  class="cockpit-input w-full text-xs"
                  placeholder="Nhập tên vật tư ghi trên hóa đơn (để trống nếu dòng này không có trên HĐ)..."
                  maxlength="300"
                  :disabled="isSubmitting"
                >
              </div>

              <!-- Suggestions chips: Saved supplier names, then the canonical materialName -->
              <div class="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px]">
                <span class="text-slate-400">Gợi ý:</span>

                <!-- Saved supplier invoice names -->
                <button
                  v-for="(savedName, sIdx) in getSupplierSuggestions(alloc.materialId)"
                  :key="'sup-' + sIdx"
                  type="button"
                  class="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors cursor-pointer flex items-center gap-1"
                  :title="'Gợi ý từ hóa đơn NCC trước: ' + savedName"
                  @click="lineMaterialNames[alloc.proposalLineId] = savedName"
                >
                  <UIcon name="i-lucide-sparkles" class="text-[10px]" aria-hidden="true" />
                  <span>NCC: {{ savedName }}</span>
                </button>

                <!-- Canonical material name from the proposal line -->
                <button
                  v-if="getProposalLineName(alloc.proposalLineId)"
                  type="button"
                  class="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1"
                  :title="'Tên dự kiến theo đề xuất: ' + getProposalLineName(alloc.proposalLineId)"
                  @click="lineMaterialNames[alloc.proposalLineId] = getProposalLineName(alloc.proposalLineId)"
                >
                  <UIcon name="i-lucide-file-text" class="text-[10px]" aria-hidden="true" />
                  <span>Đề xuất: {{ getProposalLineName(alloc.proposalLineId) }}</span>
                </button>

                <!-- Clear button -->
                <button
                  v-if="lineMaterialNames[alloc.proposalLineId]"
                  type="button"
                  class="text-slate-400 hover:text-slate-600 px-1 py-0.5 text-[10px]"
                  title="Xóa ô này"
                  @click="lineMaterialNames[alloc.proposalLineId] = ''"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <div class="text-[11px] text-slate-500">
          <span v-if="includedLinesCount > 0" class="text-sky-700 font-semibold">
            Đã nhập {{ includedLinesCount }} dòng vật tư gửi kèm hóa đơn
          </span>
          <span v-else class="text-slate-400">
            (Chưa có dòng vật tư nào được nhập tên)
          </span>
        </div>
        <div class="flex items-center gap-2.5">
          <UButton color="neutral" variant="outline" :disabled="isSubmitting || isUploading" @click="close">
            Hủy bỏ
          </UButton>
          <UButton icon="i-lucide-save" :loading="isSubmitting" :disabled="!canSubmit" @click="submitInvoice">
            Ghi nhận hóa đơn
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type {
  MaterialContractView,
  MaterialInvoiceStage,
  RecordMaterialInvoiceInput,
} from '../../../../shared/schemas/costs/material-finance'
import type { MaterialOrderView } from '../../../../shared/schemas/costs/material-procurement'
import { formatMaterialQuantity } from '../../../utils/materials/quantity-display'
import { vietnamToday } from '../../../../shared/utils/material-finance-summary'
import {
  uploadMaterialEvidence,
  type MaterialEvidenceUploadSession,
} from '../../../utils/costs/material-evidence-uploader'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import { INVOICE_EVIDENCE_ACCEPT, INVOICE_EVIDENCE_MAX_BYTES, isInvoiceEvidenceFile } from '../../../utils/materials/invoice-evidence-file'
import { materialContractLabel } from '../../../utils/materials/contract-label'
import MaterialMoneyInput from './MaterialMoneyInput.vue'
import {
  financeErrorMessage,
  isPositiveMoney,
  moneyEquals,
  moneySum,
  parseMoneyOrNull,
  isVersionConflict,
  resetCommandKeyAfterError,
  type CommandKeyKeeper,
  uploadErrorMessage,
} from '../../../utils/materials/finance-ui'

type OrderAllocation = MaterialOrderView['allocations'][number]

interface Props {
  projectId: string
  contract: MaterialContractView
  open: boolean
  /** Owned by the panel (scoped per action and target) so the key survives closing and reopening. */
  commandKey: CommandKeyKeeper
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'saved'): void
  /** The record changed since it was loaded: the owner reloads and closes this dialog. */
  (e: 'stale', message: string): void
}>()


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

// Form fields
const stage = ref<MaterialInvoiceStage>('draft')
const invoiceSymbol = ref('')
const invoiceNo = ref('')
const issuedOn = ref(todayDate)
const subtotal = ref('')
const vatAmount = ref('0')
const total = ref('')

// File upload state. The upload session lets a retry resume the same evidence file.
const selectedFile = ref<File | null>(null)
const finalizedFileId = ref<string | null>(null)
const uploadSession = ref<MaterialEvidenceUploadSession | null>(null)
const isUploading = ref(false)
const uploadError = ref('')

// Order allocations and suggestion data
const isLoadingLines = ref(false)
const linesError = ref('')
const orderAllocations = ref<OrderAllocation[]>([])
const proposalLineNames = ref<Record<string, string>>({})
const supplierNamesByMaterial = ref<Record<string, string[]>>({})
const lineMaterialNames = ref<Record<string, string>>({})

// Submission state
const isSubmitting = ref(false)
const submitError = ref('')

const parsedSubtotal = computed(() => parseMoneyOrNull(subtotal.value))
const parsedVat = computed(() => parseMoneyOrNull(vatAmount.value.trim() === '' ? '0' : vatAmount.value))
const parsedTotal = computed(() => parseMoneyOrNull(total.value))

const isTotalMismatched = computed(() => {
  const s = parsedSubtotal.value
  const v = parsedVat.value
  const t = parsedTotal.value
  if (s === null || v === null || t === null) return false
  return !moneyEquals(moneySum(s, v), t)
})

function onSubtotalOrVatChange() {
  const s = parsedSubtotal.value
  const v = parsedVat.value
  if (s !== null && v !== null) total.value = formatVnNumber(moneySum(s, v))
}

function recalculateTotal() {
  onSubtotalOrVatChange()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > INVOICE_EVIDENCE_MAX_BYTES) {
    uploadError.value = 'Dung lượng tệp không được vượt quá 25 MiB.'
    input.value = ''
    return
  }

  if (!isInvoiceEvidenceFile(file)) {
    uploadError.value = 'Chỉ chấp nhận tệp định dạng PDF, XML, JPG hoặc PNG.'
    input.value = ''
    return
  }

  selectedFile.value = file
  finalizedFileId.value = null
  uploadSession.value = null
  uploadError.value = ''
}

async function uploadFile() {
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
    uploadError.value = uploadErrorMessage(err, 'Lỗi khi tải tệp hóa đơn.')
  }
  finally {
    isUploading.value = false
  }
}

async function loadProposalLineNames(proposalId: string): Promise<Record<string, string>> {
  try {
    const proposal = await procurementRepo.readProposal(props.projectId, proposalId)
    return Object.fromEntries(proposal.lines.map(line => [line.lineId, line.materialName]))
  }
  catch {
    return {}
  }
}

async function loadSupplierInvoiceNames(allocations: OrderAllocation[]): Promise<Record<string, string[]>> {
  const materialIds = Array.from(new Set(allocations.map(a => a.materialId)))
  const entries = await Promise.all(materialIds.map(async (materialId) => {
    try {
      const names = await procurementRepo.listSupplierNames(materialId)
      const invoiceNames = names
        .filter(item => item.documentKind === 'invoice' && item.supplierId === props.contract.supplierId)
        .map(item => item.name)
      return [materialId, Array.from(new Set(invoiceNames))] as const
    }
    catch {
      return [materialId, []] as const
    }
  }))
  return Object.fromEntries(entries)
}

async function loadLinesAndSuggestions() {
  if (!props.contract?.orderId) return
  isLoadingLines.value = true
  linesError.value = ''
  try {
    const order = await procurementRepo.readOrder(props.projectId, props.contract.orderId)
    if (isDisposed) return
    orderAllocations.value = order.allocations
    for (const alloc of order.allocations) {
      if (lineMaterialNames.value[alloc.proposalLineId] === undefined) {
        lineMaterialNames.value[alloc.proposalLineId] = ''
      }
    }

    // Suggestions are best effort: a failure must not block recording the invoice.
    const [proposalNames, supplierNames] = await Promise.all([
      loadProposalLineNames(order.proposalId),
      loadSupplierInvoiceNames(order.allocations),
    ])
    if (isDisposed) return
    proposalLineNames.value = proposalNames
    supplierNamesByMaterial.value = supplierNames
  }
  catch (err: unknown) {
    if (isDisposed) return
    linesError.value = financeErrorMessage(err, 'Chưa tải được các dòng của đơn hàng.')
  }
  finally {
    isLoadingLines.value = false
  }
}

function getSupplierSuggestions(materialId: string): string[] {
  return supplierNamesByMaterial.value[materialId] ?? []
}

function getProposalLineName(proposalLineId: string): string {
  return proposalLineNames.value[proposalLineId] ?? ''
}

const includedLinesCount = computed(() => {
  return Object.values(lineMaterialNames.value).filter(n => n.trim().length > 0).length
})

const canSubmit = computed(() => {
  if (isSubmitting.value || isUploading.value) return false
  if (!finalizedFileId.value) return false
  if (!invoiceSymbol.value.trim() || !invoiceNo.value.trim() || !issuedOn.value) return false
  if (!isPositiveMoney(parsedSubtotal.value)) return false
  if (parsedVat.value === null) return false
  if (!isPositiveMoney(parsedTotal.value)) return false
  if (isTotalMismatched.value) return false
  return true
})

async function submitInvoice() {
  const subtotalValue = parsedSubtotal.value
  const vatValue = parsedVat.value
  const totalValue = parsedTotal.value
  const fileId = finalizedFileId.value
  if (!canSubmit.value || !subtotalValue || vatValue === null || !totalValue || !fileId) return

  const lines = Object.entries(lineMaterialNames.value)
    .map(([proposalLineId, name]) => ({ proposalLineId, invoiceMaterialName: name.trim() }))
    .filter(line => line.invoiceMaterialName.length > 0)

  const input: RecordMaterialInvoiceInput = {
    stage: stage.value,
    invoiceSymbol: invoiceSymbol.value.trim(),
    invoiceNo: invoiceNo.value.trim(),
    issuedOn: issuedOn.value,
    subtotal: subtotalValue,
    vatAmount: vatValue,
    total: totalValue,
    fileId,
    lines,
  }
  const idempotencyKey = props.commandKey.keyFor({ contractId: props.contract.id, ...input })

  isSubmitting.value = true
  submitError.value = ''
  try {
    await financeRepo.recordInvoice(props.projectId, props.contract.id, input, { idempotencyKey })
    props.commandKey.reset()
    isSubmitting.value = false
    emit('saved')
    close()
  }
  catch (err: unknown) {
    resetCommandKeyAfterError(props.commandKey, err)
    const message = financeErrorMessage(err, 'Lỗi khi ghi nhận hóa đơn.')
    if (isVersionConflict(err)) emit('stale', message)
    else submitError.value = message
  }
  finally {
    isSubmitting.value = false
  }
}

function close() {
  if (isSubmitting.value || isUploading.value) return
  emit('update:open', false)
}

watch([subtotal, vatAmount], onSubtotalOrVatChange)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      stage.value = 'draft'
      void loadLinesAndSuggestions()
    }
  },
  { immediate: true },
)

function onOpenChange(value: boolean) {
  if (!value) close()
}
</script>
