<template>
  <div
    v-if="open"
    :ref="focusDialogElement"
    tabindex="-1"
    class="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-labelledby="payment-request-form-title"
    @keydown.esc="close"
  >
    <div class="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-sky-100 text-sky-700">
            <UIcon name="i-lucide-file-text" class="text-xl" aria-hidden="true" />
          </div>
          <div>
            <h3 id="payment-request-form-title" class="text-base font-bold text-slate-900 m-0">
              {{ resubmitRequest ? 'Gửi lại đề nghị thanh toán' : 'Lập đề nghị thanh toán chi' }}
            </h3>
            <p class="text-xs text-slate-500 m-0 mt-0.5">
              Hợp đồng số: <strong class="font-mono text-slate-700">{{ contract.contractNo }}</strong> &bull; Nhà cung cấp: <strong class="text-slate-700">{{ contract.supplierName }}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50"
          aria-label="Đóng"
          :disabled="isSubmitting"
          @click="close"
        >
          <UIcon name="i-lucide-x" class="text-lg" aria-hidden="true" />
        </button>
      </div>

      <!-- Form Body -->
      <div class="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs">
        <!-- Error Alert -->
        <div v-if="submitError" class="cockpit-alert cockpit-alert--danger" role="alert">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
            <div class="flex-1">
              <p class="font-semibold text-rose-900 m-0">{{ submitError }}</p>
            </div>
          </div>
        </div>

        <!-- 1. Installment Selection -->
        <fieldset class="space-y-2 border-0 p-0 m-0">
          <legend class="block font-semibold text-slate-800 text-xs mb-2">
            1. Chọn đợt thanh toán hợp đồng <span class="text-rose-500">*</span>
          </legend>

          <div v-if="availableInstallments.length === 0" class="p-3 bg-amber-50 rounded border border-amber-200 text-amber-800">
            Không có đợt thanh toán nào còn hạn mức (số tiền còn lại &gt; 0) để lập đề nghị chi.
          </div>

          <div v-else class="space-y-2">
            <label
              v-for="inst in availableInstallments"
              :key="inst.installmentKey"
              class="p-3 rounded-lg border text-left transition-all flex items-start justify-between gap-3"
              :class="[
                selectedInstallmentKey === inst.installmentKey
                  ? 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-500'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
                resubmitRequest ? 'cursor-default' : 'cursor-pointer',
              ]"
            >
              <div class="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="payment-request-installment"
                  class="mt-0.5 h-4 w-4 cursor-pointer"
                  :value="inst.installmentKey"
                  :checked="selectedInstallmentKey === inst.installmentKey"
                  :disabled="isSubmitting || Boolean(resubmitRequest)"
                  @change="selectInstallment(inst)"
                >
                <div class="space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-slate-900 text-xs">{{ inst.name }}</span>
                    <span
                      class="cockpit-badge text-[10px]"
                      :class="inst.isAdvance ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'"
                    >
                      {{ inst.isAdvance ? 'Tạm ứng' : 'Thanh toán' }}
                    </span>
                    <span
                      v-if="inst.dueStatus === 'overdue'"
                      class="cockpit-badge bg-rose-100 text-rose-800 text-[10px] font-semibold"
                    >
                      Quá hạn
                    </span>
                    <span
                      v-else-if="inst.dueStatus === 'due_soon'"
                      class="cockpit-badge bg-amber-100 text-amber-800 text-[10px] font-semibold"
                    >
                      Sắp đến hạn
                    </span>
                  </div>

                  <div class="text-[11px] text-slate-500">
                    Hạn thanh toán: <span class="font-mono text-slate-700">{{ formatDate(inst.dueOn) }}</span> &bull; Giá trị đợt: <span class="font-mono text-slate-700">{{ formatMoney(inst.amount) }}</span>
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0">
                <div class="text-[10px] text-slate-400">Còn lại có thể chi:</div>
                <div class="font-mono font-bold text-sm text-sky-700">
                  {{ formatMoney(inst.remaining) }} <span class="text-[10px] font-normal text-slate-500">{{ contract.currencyCode }}</span>
                </div>
              </div>
            </label>
          </div>
        </fieldset>

        <!-- 2. Payment Amount Input -->
        <section v-if="selectedInstallment" class="space-y-1.5 pt-2 border-t border-slate-200">
          <div class="flex items-center justify-between">
            <label for="request-amount-input" class="block font-semibold text-slate-800 text-xs">
              2. Số tiền đề nghị chi <span class="text-rose-500">*</span>
            </label>
            <span class="text-[11px] text-slate-500">
              Hạn mức tối đa còn lại: <strong class="font-mono text-slate-800">{{ formatMoney(selectedInstallment.remaining) }}</strong> {{ contract.currencyCode }}
            </span>
          </div>

          <div class="relative">
            <input
              id="request-amount-input"
              v-model="amount"
              type="text"
              inputmode="decimal"
              class="cockpit-input w-full font-mono font-bold text-sm text-right pr-14"
              :class="{ 'border-rose-400 text-rose-700': amountProblem !== null }"
              :aria-invalid="amountProblem !== null"
              aria-describedby="request-amount-hint"
              placeholder="VD: 50000000"
              :disabled="isSubmitting"
            >
            <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 font-medium">
              {{ contract.currencyCode }}
            </div>
          </div>

          <div id="request-amount-hint">
            <div v-if="amountProblem === 'invalid'" class="text-rose-600 text-[11px] font-medium" role="alert">
              Số tiền chỉ gồm chữ số, tối đa 4 chữ số thập phân (dùng dấu chấm) và phải lớn hơn 0.
            </div>
            <div v-else-if="amountProblem === 'exceeded'" class="text-rose-600 text-[11px] font-medium" role="alert">
              Số tiền đề nghị ({{ amount }}) không được vượt quá số dư còn lại của đợt ({{ formatMoney(selectedInstallment.remaining) }}).
            </div>
            <div v-else class="text-[11px] text-slate-400">
              Số tiền mặc định lấy bằng hạn mức còn lại của đợt. Có thể điều chỉnh giảm nếu chi làm nhiều lần.
            </div>
          </div>
        </section>

        <!-- 3. Invoice Selection (required for non-advance installments) -->
        <fieldset v-if="selectedInstallment" class="space-y-2 pt-2 border-t border-slate-200 border-x-0 border-b-0 m-0 px-0 pb-0">
          <legend class="block font-semibold text-slate-800 text-xs pt-2">
            3. Chọn hóa đơn đính kèm
            <span v-if="!selectedInstallment.isAdvance" class="text-rose-500">* (Bắt buộc)</span>
            <span v-else class="text-slate-400 font-normal">(Tùy chọn)</span>
          </legend>

          <p
            class="m-0 text-[11px] font-medium"
            :class="selectedInstallment.isAdvance ? 'text-slate-500' : 'text-amber-700'"
          >
            {{ selectedInstallment.isAdvance
              ? 'Đợt tạm ứng: không bắt buộc đính kèm hóa đơn.'
              : 'Đợt không phải tạm ứng: bắt buộc chọn ít nhất một hóa đơn đã ghi nhận.' }}
          </p>

          <div v-if="isLoadingInvoices" class="py-4 text-center text-slate-400">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-base mx-auto mb-1 text-sky-600" aria-hidden="true" />
            <p class="m-0 text-[11px]">Đang tải danh sách hóa đơn đã ghi nhận...</p>
          </div>

          <div v-else-if="invoicesError" class="p-3 bg-rose-50 rounded-lg border border-rose-200 text-rose-800" role="alert">
            {{ invoicesError }}
            <button type="button" class="ml-2 underline font-semibold" @click="loadRecordedInvoices">Tải lại</button>
          </div>

          <div v-else-if="recordedInvoices.length === 0" class="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800">
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p class="font-semibold m-0">Chưa có hóa đơn nào ở trạng thái "Đã ghi nhận"!</p>
                <p v-if="!selectedInstallment.isAdvance" class="m-0 mt-0.5 text-[11px]">
                  Vì đợt này không phải là tạm ứng, bạn cần quay lại bảng "Hóa đơn" và nhập hóa đơn trước khi lập đề nghị chi.
                </p>
                <p v-else class="m-0 mt-0.5 text-[11px]">
                  Với đợt tạm ứng, bạn vẫn có thể lập đề nghị chi mà không cần chọn hóa đơn.
                </p>
              </div>
            </div>
          </div>

          <!-- Invoices Selection Table -->
          <div v-else class="space-y-1.5 max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
            <label
              v-for="inv in recordedInvoices"
              :key="inv.id"
              class="flex items-center justify-between p-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <div class="flex items-center gap-2.5">
                <input
                  v-model="selectedInvoiceIds"
                  type="checkbox"
                  :value="inv.id"
                  class="cockpit-checkbox h-4 w-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
                  :disabled="isSubmitting"
                >
                <div>
                  <div class="font-semibold text-slate-900 font-mono">
                    {{ inv.invoiceNo }} <span class="text-slate-400 font-normal">({{ inv.invoiceSymbol }})</span>
                  </div>
                  <div class="text-[10px] text-slate-500">
                    Ngày lập: {{ formatDate(inv.issuedOn) }}
                  </div>
                </div>
              </div>

              <div class="text-right font-mono font-semibold text-slate-800 text-xs">
                {{ formatMoney(inv.total) }} <span class="text-[10px] font-normal text-slate-500">{{ contract.currencyCode }}</span>
              </div>
            </label>
          </div>

          <p v-if="invoiceMissing" class="m-0 text-[11px] font-semibold text-rose-600" role="alert">
            Cần chọn ít nhất một hóa đơn
          </p>
        </fieldset>

        <!-- 4. Note Input -->
        <section class="space-y-1 pt-2 border-t border-slate-200">
          <label for="request-note-input" class="block font-semibold text-slate-800 text-xs">
            4. Ghi chú đề nghị chi (tùy chọn)
          </label>
          <textarea
            id="request-note-input"
            v-model="note"
            rows="2"
            class="cockpit-input w-full text-xs"
            placeholder="Nhập nội dung thanh toán hoặc lưu ý cho thủ quỹ duyệt chi..."
            :disabled="isSubmitting"
            maxlength="1000"
          />
          <div class="text-[10px] text-slate-400 text-right">
            {{ note.length }}/1000 ký tự
          </div>
        </section>
      </div>

      <!-- Footer -->
      <div class="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
        <div class="text-[11px] text-slate-500">
          <span v-if="selectedInstallment">
            Đợt: <strong class="text-slate-800">{{ selectedInstallment.name }}</strong>
          </span>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm"
            :disabled="isSubmitting"
            @click="close"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            class="cockpit-btn cockpit-btn--primary btn-sm flex items-center gap-1.5"
            :disabled="!canSubmit"
            @click="submitRequest"
          >
            <UIcon v-if="isSubmitting" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-send" class="text-sm" aria-hidden="true" />
            <span>{{ resubmitRequest ? 'Gửi lại đề nghị' : 'Gửi đề nghị chi' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type {
  MaterialContractView,
  MaterialInstallmentView,
  MaterialInvoiceView,
  MaterialPaymentRequestView,
  CreatePaymentRequestInput,
  ResubmitPaymentRequestInput,
} from '../../../../shared/schemas/costs/material-finance'
import {
  createCommandKeyTracker,
  financeErrorMessage,
  focusDialogElement,
  formatDate,
  formatMoney,
  isPositiveMoney,
  moneyGreaterThan,
  parseMoneyInput,
} from '../../../utils/materials/finance-ui'

interface Props {
  projectId: string
  contract: MaterialContractView
  open: boolean
  resubmitRequest?: MaterialPaymentRequestView | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'saved'): void
}>()

const repositories = useRepositories()
const financeRepo = repositories.materialFinance

const selectedInstallmentKey = ref('')
const amount = ref('')
const selectedInvoiceIds = ref<string[]>([])
const note = ref('')

const recordedInvoices = ref<MaterialInvoiceView[]>([])
const isLoadingInvoices = ref(false)
const invoicesError = ref('')

const isSubmitting = ref(false)
const submitError = ref('')
const commandKey = createCommandKeyTracker()

// A returned request no longer holds installment capacity (only submitted and approved
// requests do), so a resubmission is bounded by the installment's current remaining amount.
// Resubmitting never changes the installment, so only that installment is offered.
const availableInstallments = computed<MaterialInstallmentView[]>(() => {
  const all = props.contract?.installments ?? []
  if (props.resubmitRequest) {
    const targetKey = props.resubmitRequest.installmentKey
    return all.filter(i => i.installmentKey === targetKey)
  }
  return all.filter(i => moneyGreaterThan(i.remaining, '0'))
})

const selectedInstallment = computed<MaterialInstallmentView | undefined>(() => {
  return availableInstallments.value.find(i => i.installmentKey === selectedInstallmentKey.value)
})

function selectInstallment(inst: MaterialInstallmentView) {
  selectedInstallmentKey.value = inst.installmentKey
  amount.value = moneyGreaterThan(inst.remaining, '0') ? (parseMoneyInput(inst.remaining) ?? '') : ''
}

const parsedAmount = computed(() => parseMoneyInput(amount.value))

const amountProblem = computed<'invalid' | 'exceeded' | null>(() => {
  if (!selectedInstallment.value || amount.value.trim() === '') return null
  const value = parsedAmount.value
  if (!isPositiveMoney(value)) return 'invalid'
  return moneyGreaterThan(value, selectedInstallment.value.remaining) ? 'exceeded' : null
})

const invoiceMissing = computed(() => {
  return Boolean(selectedInstallment.value && !selectedInstallment.value.isAdvance && selectedInvoiceIds.value.length === 0)
})

const canSubmit = computed(() => {
  if (isSubmitting.value || !selectedInstallment.value) return false
  if (!isPositiveMoney(parsedAmount.value) || amountProblem.value !== null) return false
  return !invoiceMissing.value
})

async function loadRecordedInvoices() {
  if (!props.contract?.id) return
  isLoadingInvoices.value = true
  invoicesError.value = ''
  try {
    const res = await financeRepo.listInvoices(props.projectId, props.contract.id)
    recordedInvoices.value = res.filter(inv => inv.state === 'recorded')
    const recordedIds = new Set(recordedInvoices.value.map(inv => inv.id))
    selectedInvoiceIds.value = selectedInvoiceIds.value.filter(id => recordedIds.has(id))
  }
  catch (err: unknown) {
    recordedInvoices.value = []
    invoicesError.value = financeErrorMessage(err, 'Chưa tải được danh sách hóa đơn.')
  }
  finally {
    isLoadingInvoices.value = false
  }
}

async function submitRequest() {
  const installment = selectedInstallment.value
  const amountValue = parsedAmount.value
  if (!canSubmit.value || !installment || !amountValue) return

  const requestTarget = props.resubmitRequest
  const body = {
    amount: amountValue,
    invoiceIds: [...selectedInvoiceIds.value],
    note: note.value.trim() || null,
  }

  isSubmitting.value = true
  submitError.value = ''
  try {
    if (requestTarget) {
      const payload: ResubmitPaymentRequestInput = { expectedVersion: requestTarget.version, ...body }
      const idempotencyKey = commandKey.keyFor({ requestId: requestTarget.id, ...payload })
      await financeRepo.resubmitPaymentRequest(props.projectId, requestTarget.id, payload, { idempotencyKey })
    }
    else {
      const payload: CreatePaymentRequestInput = { installmentKey: installment.installmentKey, ...body }
      const idempotencyKey = commandKey.keyFor({ contractId: props.contract.id, ...payload })
      await financeRepo.createPaymentRequest(props.projectId, props.contract.id, payload, { idempotencyKey })
    }
    commandKey.settle()
    isSubmitting.value = false
    emit('saved')
    close()
  }
  catch (err: unknown) {
    commandKey.settleAfterError(err)
    submitError.value = financeErrorMessage(err, 'Lỗi khi gửi đề nghị thanh toán.')
  }
  finally {
    isSubmitting.value = false
  }
}

function close() {
  if (isSubmitting.value) return
  emit('update:open', false)
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    submitError.value = ''
    commandKey.settle()
    void loadRecordedInvoices()

    const target = props.resubmitRequest
    if (target) {
      selectedInstallmentKey.value = target.installmentKey
      amount.value = parseMoneyInput(target.amount) ?? ''
      selectedInvoiceIds.value = [...target.invoiceIds]
      note.value = target.note ?? ''
      return
    }

    selectedInvoiceIds.value = []
    note.value = ''
    const first = availableInstallments.value[0]
    if (first) {
      selectInstallment(first)
    }
    else {
      selectedInstallmentKey.value = ''
      amount.value = ''
    }
  },
  { immediate: true },
)
</script>
