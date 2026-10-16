<template>
  <div class="material-payment-request-panel cockpit-card" role="region" aria-label="Quản lý đề nghị thanh toán và chi tiền">
    <!-- Panel Header -->
    <div class="panel-header border-b border-slate-200 pb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2.5">
          <UIcon name="i-lucide-credit-card" class="text-sky-600 text-xl shrink-0" aria-hidden="true" />
          <div>
            <h3 class="panel-title text-base font-bold text-slate-900 m-0">Đề nghị thanh toán & Chi tiền</h3>
            <p class="text-xs text-slate-500 m-0 mt-0.5">
              Theo dõi đề nghị thanh toán theo đợt hợp đồng, quy trình duyệt và ghi nhận thực chi.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm flex items-center gap-1.5"
            :disabled="isLoading"
            @click="loadRequests"
          >
            <UIcon v-if="isLoading" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
            <span>Làm mới</span>
          </button>

          <button
            v-if="canCreateRequest"
            type="button"
            class="cockpit-btn cockpit-btn--primary btn-sm flex items-center gap-1.5"
            :disabled="!hasInstallmentsWithRemaining"
            :title="!hasInstallmentsWithRemaining ? 'Tất cả các đợt đã hết hạn mức thanh toán' : 'Lập đề nghị chi mới'"
            @click="openCreateForm"
          >
            <UIcon name="i-lucide-plus" class="text-sm" aria-hidden="true" />
            <span>Lập đề nghị chi</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Error Banner -->
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

    <!-- Table of Requests -->
    <div class="mt-4">
      <div v-if="isLoading && requests.length === 0" class="py-8 text-center text-slate-400 text-xs">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-xl mx-auto mb-2 text-sky-600" aria-hidden="true" />
        <p class="m-0">Đang tải danh sách đề nghị thanh toán...</p>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="requests.length === 0"
        class="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200"
      >
        <UIcon name="i-lucide-banknote" class="text-slate-400 text-3xl mx-auto mb-2" aria-hidden="true" />
        <p class="text-xs text-slate-600 font-medium m-0">Chưa có đề nghị thanh toán nào cho hợp đồng này.</p>
        <p v-if="canCreateRequest" class="text-xs text-slate-400 m-0 mt-1">
          Bấm "Lập đề nghị chi" để tạo đề nghị thanh toán cho đợt đến hạn.
        </p>
      </div>

      <!-- Requests Table -->
      <div v-else class="overflow-x-auto">
        <table class="cockpit-table w-full text-left text-xs border border-slate-200 rounded-lg">
          <caption class="sr-only">Danh sách đề nghị thanh toán của hợp đồng</caption>
          <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th scope="col" class="p-2.5">Đợt thanh toán</th>
              <th scope="col" class="p-2.5 text-right">Số tiền đề nghị</th>
              <th scope="col" class="p-2.5 text-center">Trạng thái</th>
              <th scope="col" class="p-2.5">Người gửi</th>
              <th scope="col" class="p-2.5 text-center">Lần gửi</th>
              <th scope="col" class="p-2.5">Lịch sử quyết định</th>
              <th scope="col" class="p-2.5">Thông tin chi</th>
              <th scope="col" class="p-2.5 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr
              v-for="req in requests"
              :key="req.id"
              class="hover:bg-slate-50 transition-colors"
              :class="{ 'opacity-65 bg-slate-50/40': req.state === 'cancelled' }"
            >
              <!-- Installment -->
              <td class="p-2.5 font-medium text-slate-800 align-top">
                <div class="font-semibold text-slate-900">{{ getInstallmentName(req.installmentKey) }}</div>
                <div class="text-[10px] text-slate-400 font-mono">
                  Mã đợt: {{ req.installmentKey.slice(0, 8) }}...
                </div>
                <div v-if="req.note" class="text-[11px] text-slate-500 italic mt-0.5">
                  "{{ req.note }}"
                </div>
              </td>

              <!-- Amount -->
              <td class="p-2.5 font-mono font-bold text-right text-slate-900 align-top whitespace-nowrap">
                {{ formatVnNumber(req.amount) }} <span class="text-[10px] font-normal text-slate-500">{{ contract.currencyCode }}</span>
              </td>

              <!-- Status -->
              <td class="p-2.5 text-center align-top whitespace-nowrap">
                <span
                  class="cockpit-badge text-[11px] font-semibold"
                  :class="getStateBadgeClass(req.state)"
                >
                  {{ getStateLabel(req) }}
                </span>
                <div v-if="req.state === 'cancelled' && req.cancelReason" class="text-[10px] text-slate-500 mt-0.5 max-w-[140px] truncate mx-auto" :title="'Lý do hủy: ' + req.cancelReason">
                  Lý do: {{ req.cancelReason }}
                </div>
              </td>

              <!-- Submitter -->
              <td class="p-2.5 text-slate-600 align-top">
                <div v-if="req.submittedBy === actorId" class="text-[11px] font-semibold text-slate-700">Bạn</div>
                <div v-else class="font-mono text-[11px] text-slate-700" :title="req.submittedBy">{{ req.submittedBy.slice(0, 8) }}...</div>
                <div class="text-[10px] text-slate-400">{{ formatDateTime(req.submittedAt) }}</div>
              </td>

              <!-- Submission count -->
              <td class="p-2.5 text-center font-mono font-semibold text-slate-700 align-top">
                v{{ req.revisionNo }}
              </td>

              <!-- Decision history -->
              <td class="p-2.5 align-top">
                <div v-if="req.decisions && req.decisions.length > 0" class="space-y-1">
                  <div
                    v-for="(dec, dIdx) in req.decisions"
                    :key="dIdx"
                    class="text-[11px] p-1.5 rounded border"
                    :class="dec.decision === 'approve' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-rose-50 border-rose-100 text-rose-900'"
                  >
                    <div class="font-semibold flex items-center gap-1">
                      <UIcon :name="dec.decision === 'approve' ? 'i-lucide-check' : 'i-lucide-corner-up-left'" class="text-xs" aria-hidden="true" />
                      <span>{{ dec.decision === 'approve' ? 'Đã lập UNC' : 'Đã trả lại' }} (lần {{ dec.revisionNo }})</span>
                    </div>
                    <div v-if="dec.reason" class="text-[10px] mt-0.5 italic text-slate-700">
                      "{{ dec.reason }}"
                    </div>
                    <div class="text-[9px] text-slate-400 mt-0.5">
                      {{ formatDateTime(dec.decidedAt) }}
                    </div>
                  </div>
                </div>
                <span v-else class="text-slate-400 italic text-[11px]">Chưa có quyết định</span>
              </td>

              <!-- Payment info -->
              <td class="p-2.5 align-top">
                <div v-if="req.payment" class="text-[11px] space-y-0.5 bg-emerald-50/60 p-1.5 rounded border border-emerald-100">
                  <div class="font-semibold text-emerald-900 flex items-center gap-1">
                    <UIcon name="i-lucide-check-check" class="text-emerald-700 text-xs" aria-hidden="true" />
                    <span>Đã chi: {{ formatDate(req.payment.paidOn) }}</span>
                  </div>
                  <div class="text-[10px] text-slate-600">
                    Hình thức: <span class="font-medium text-slate-800">{{ req.payment.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản' }}</span>
                  </div>
                  <div v-if="req.payment.method !== 'cash'" class="text-slate-600 font-mono text-[10px]">
                    Tham chiếu: <strong class="text-slate-800">{{ req.payment.bankReference }}</strong>
                  </div>
                  <div class="pt-1">
                    <button
                      type="button"
                      class="text-sky-600 hover:text-sky-800 text-[10px] inline-flex items-center gap-1 font-medium"
                      :disabled="isFileReading === req.payment.proofFileId"
                      @click="viewProofFile(req.payment.proofFileId)"
                    >
                      <UIcon v-if="isFileReading === req.payment.proofFileId" name="i-lucide-loader-2" class="animate-spin text-[10px]" aria-hidden="true" />
                      <UIcon v-else name="i-lucide-external-link" class="text-[10px]" aria-hidden="true" />
                      <span>{{ req.payment.method === 'cash' ? 'Xem chứng từ chi' : 'Xem biên lai chuyển khoản' }}</span>
                    </button>
                  </div>
                </div>
                <span v-else class="text-slate-400 italic text-[11px]">—</span>
              </td>

              <!-- Actions -->
              <td class="p-2.5 text-center align-top whitespace-nowrap">
                <div class="flex items-center justify-center gap-1.5 flex-wrap">
                  <!-- Approve -->
                  <button
                    v-if="getRequestActions(req).includes('approve')"
                    type="button"
                    class="cockpit-btn cockpit-btn--primary btn-sm text-[11px] py-1 px-2 flex items-center gap-1"
                    :title="approveLabel"
                    @click="openDecisionDialog(req, 'approve')"
                  >
                    <UIcon name="i-lucide-check" class="text-xs" aria-hidden="true" />
                    <span>{{ approveLabel }}</span>
                  </button>

                  <!-- Return -->
                  <button
                    v-if="getRequestActions(req).includes('return')"
                    type="button"
                    class="cockpit-btn cockpit-btn--danger btn-sm text-[11px] py-1 px-2 flex items-center gap-1"
                    title="Trả lại đề nghị chi kèm lý do"
                    @click="openDecisionDialog(req, 'return')"
                  >
                    <UIcon name="i-lucide-corner-up-left" class="text-xs" aria-hidden="true" />
                    <span>Trả lại</span>
                  </button>

                  <!-- Record Payment -->
                  <button
                    v-if="getRequestActions(req).includes('record_payment')"
                    type="button"
                    class="cockpit-btn bg-emerald-600 hover:bg-emerald-700 text-white btn-sm text-[11px] py-1 px-2 flex items-center gap-1"
                    :title="recordPaymentLabel"
                    @click="openRecordPaymentDialog(req)"
                  >
                    <UIcon name="i-lucide-banknote" class="text-xs" aria-hidden="true" />
                    <span>{{ recordPaymentLabel }}</span>
                  </button>

                  <!-- Resubmit -->
                  <button
                    v-if="getRequestActions(req).includes('resubmit')"
                    type="button"
                    class="cockpit-btn cockpit-btn--secondary btn-sm text-[11px] py-1 px-2 flex items-center gap-1"
                    title="Sửa và gửi lại đề nghị chi"
                    @click="openResubmitForm(req)"
                  >
                    <UIcon name="i-lucide-rotate-cw" class="text-xs" aria-hidden="true" />
                    <span>Gửi lại</span>
                  </button>

                  <!-- Cancel -->
                  <button
                    v-if="getRequestActions(req).includes('cancel')"
                    type="button"
                    class="cockpit-btn cockpit-btn--danger btn-sm text-[11px] py-1 px-2"
                    title="Hủy đề nghị chi này"
                    @click="openCancelDialog(req)"
                  >
                    Hủy
                  </button>

                  <span v-if="getRequestActions(req).length === 0" class="text-slate-400 text-[11px]">—</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Cancel Payment Request Modal Dialog -->
    <UModal
      :open="Boolean(cancellingRequest)"
      title="Xác nhận hủy đề nghị chi"
      description="Sau khi hủy, hạn mức đề nghị sẽ được hoàn trả lại cho đợt thanh toán tương ứng."
      :dismissible="!isCancelBusy"
      @update:open="onCancelOpenChange"
    >
      <template #body>
        <div v-if="cancellingRequest" class="space-y-4 text-xs">
          <div class="text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded border border-slate-100">
            <div>Số tiền đề nghị: <strong class="font-mono text-slate-900">{{ formatVnNumber(cancellingRequest.amount) }} {{ contract.currencyCode }}</strong></div>
            <div>Đợt thanh toán: <strong class="text-slate-900">{{ getInstallmentName(cancellingRequest.installmentKey) }}</strong></div>
          </div>

          <div>
            <label for="cancel-request-reason-input" class="field-label block text-xs font-semibold text-slate-700 mb-1">
              Lý do hủy đề nghị <span class="text-rose-500">*</span>
            </label>
            <textarea
              id="cancel-request-reason-input"
              v-model="cancelReason"
              rows="3"
              class="cockpit-input w-full text-xs"
              placeholder="Nhập lý do hủy đề nghị chi..."
              :disabled="isCancelBusy"
              maxlength="1000"
            />
            <div class="text-[10px] text-slate-400 text-right mt-1">
              {{ cancelReason.length }}/1000 ký tự
            </div>
          </div>

          <div v-if="cancelError" class="cockpit-alert cockpit-alert--danger p-2 text-xs text-rose-700" role="alert">
            {{ cancelError }}
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="isCancelBusy" @click="closeCancelDialog">
            Đóng
          </UButton>
          <UButton color="error" icon="i-lucide-check" :loading="isCancelBusy" :disabled="!cancelReason.trim()" @click="confirmCancelRequest">
            Xác nhận hủy
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Create or Resubmit Request Modal Form -->
    <MaterialPaymentRequestForm
      v-if="isFormOpen"
      :project-id="projectId"
      :contract="contract"
      :open="isFormOpen"
      :command-key="commandKeys.forScope(resubmitRequestTarget ? `resubmit:${resubmitRequestTarget.id}` : `create:${contract.id}`)"
      :resubmit-request="resubmitRequestTarget"
      @update:open="val => isFormOpen = val"
      @saved="onRequestSaved"
      @stale="onStale"
    />

    <!-- Decision Modal Dialog -->
    <MaterialPaymentDecisionDialog
      v-if="isDecisionOpen"
      :project-id="projectId"
      :request="decisionRequestTarget"
      :initial-decision="decisionInitialAction"
      :open="isDecisionOpen"
      :command-key="commandKeys.forScope(`decide:${decisionRequestTarget?.id ?? ''}`)"
      @update:open="val => isDecisionOpen = val"
      @saved="onDecisionSaved"
      @stale="onStale"
    />

    <!-- Record Payment Modal Dialog -->
    <MaterialPaymentRecordDialog
      v-if="isRecordPaymentOpen"
      :project-id="projectId"
      :contract-id="contract.id"
      :contract-total="contractTotalForPayment"
      :order-subtotal-snapshot="orderSubtotalSnapshotForPayment"
      :currency-code="contract.currencyCode"
      :request="recordPaymentRequestTarget"
      :installment-name="recordPaymentRequestTarget ? getInstallmentName(recordPaymentRequestTarget.installmentKey) : ''"
      :open="isRecordPaymentOpen"
      :command-key="commandKeys.forScope(`pay:${recordPaymentRequestTarget?.id ?? ''}`)"
      @update:open="val => isRecordPaymentOpen = val"
      @saved="onRecordPaymentSaved"
      @stale="onStale"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type {
  MaterialContractView,
  MaterialInvoiceView,
  MaterialPaymentRequestView,
  CancelPaymentRequestInput,
} from '../../../../shared/schemas/costs/material-finance'
import { MATERIAL_SMALL_ORDER_THRESHOLD } from '../../../../shared/constants/material-finance'
import { canPayInCash, currentContractTotal, currentOrderSubtotalSnapshot } from '../../../utils/materials/payment-method'
import { approveActionLabel, invoiceStagesForRequest, paymentRequestStateLabel } from '../../../utils/materials/payment-request-labels'
import { paymentRequestActions } from '../../../utils/materials/payment-request-actions'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import { formatDate, formatDateTime } from '../../../utils/materials/date-display'
import {
  createScopedCommandKeys,
  financeErrorMessage,
  isVersionConflict,
  moneyGreaterThan,
  resetCommandKeyAfterError,
} from '../../../utils/materials/finance-ui'
import MaterialPaymentRequestForm from './MaterialPaymentRequestForm.vue'
import MaterialPaymentDecisionDialog from './MaterialPaymentDecisionDialog.vue'
import MaterialPaymentRecordDialog from './MaterialPaymentRecordDialog.vue'

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
const authStore = nuxtApp.$authStore
const repositories = useRepositories()
const financeRepo = repositories.materialFinance
const procurementRepo = repositories.materialProcurement

const requests = ref<MaterialPaymentRequestView[]>([])
const invoices = ref<MaterialInvoiceView[]>([])
const isLoading = ref(false)
const actionError = ref('')
const isFileReading = ref<string | null>(null)

// Dialog states
const isFormOpen = ref(false)
const resubmitRequestTarget = ref<MaterialPaymentRequestView | null>(null)

const isDecisionOpen = ref(false)
const decisionRequestTarget = ref<MaterialPaymentRequestView | null>(null)
const decisionInitialAction = ref<'approve' | 'return'>('approve')

const isRecordPaymentOpen = ref(false)
const recordPaymentRequestTarget = ref<MaterialPaymentRequestView | null>(null)

// Cancel state. The idempotency key survives an unknown outcome (lost response) so a
// retry replays the same command, and changes as soon as the payload changes.
const cancellingRequest = ref<MaterialPaymentRequestView | null>(null)
const cancelReason = ref('')
const isCancelBusy = ref(false)
const cancelError = ref('')
const commandKeys = createScopedCommandKeys()

const actorId = computed(() => authStore?.user?.id ?? '')

const canCreateRequest = computed(() => {
  return Boolean(companyAccess?.hasPermission('material.payment.request'))
})

const hasInstallmentsWithRemaining = computed(() => {
  return (props.contract?.installments ?? []).some(i => moneyGreaterThan(i.remaining, '0'))
})

const contractTotalForPayment = computed(() => {
  return currentContractTotal(props.contract) ?? MATERIAL_SMALL_ORDER_THRESHOLD
})

// A missing snapshot is treated as not small, so cash is never offered on a guess.
const orderSubtotalSnapshotForPayment = computed(() => {
  return currentOrderSubtotalSnapshot(props.contract) ?? MATERIAL_SMALL_ORDER_THRESHOLD
})

function getInstallmentName(key: string): string {
  const inst = props.contract?.installments?.find(i => i.installmentKey === key)
  return inst?.name || key.slice(0, 8) + '...'
}

// The approve button reads "...đã chi tiền mặt" only where cash is allowed (same rule as the payment dialog).
const approveLabel = computed(() => approveActionLabel(
  canPayInCash(contractTotalForPayment.value, props.contract.currencyCode, orderSubtotalSnapshotForPayment.value),
))
const recordPaymentLabel = 'Cập nhật biên lai chuyển khoản'

function getStateLabel(req: MaterialPaymentRequestView): string {
  return paymentRequestStateLabel(req.state, invoiceStagesForRequest(req, invoices.value))
}

function getStateBadgeClass(state: MaterialPaymentRequestView['state']): string {
  switch (state) {
    case 'submitted': return 'bg-amber-100 text-amber-800'
    case 'returned': return 'bg-rose-100 text-rose-800'
    case 'approved': return 'bg-sky-100 text-sky-800'
    case 'paid': return 'bg-emerald-100 text-emerald-800'
    case 'cancelled': return 'bg-slate-100 text-slate-600'
    default: return 'bg-slate-100 text-slate-700'
  }
}

// Buttons come only from the shared rule so the UI never offers what the server forbids
// (self-approval, missing permission, wrong state).
function getRequestActions(req: MaterialPaymentRequestView) {
  const permissions = (companyAccess?.permissions ?? []) as readonly string[]
  return paymentRequestActions(req, actorId.value, permissions)
}

async function loadInvoices() {
  if (!props.contract?.id) return
  try {
    invoices.value = await financeRepo.listInvoices(props.projectId, props.contract.id)
  }
  catch {
    // The invoices only refine the "waiting for the official invoice" label, so a failure keeps the plain one.
    invoices.value = []
  }
}

async function loadRequests() {
  if (!props.contract?.id) return
  isLoading.value = true
  actionError.value = ''
  try {
    const [loadedRequests] = await Promise.all([
      financeRepo.listPaymentRequests(props.projectId, props.contract.id),
      loadInvoices(),
    ])
    requests.value = loadedRequests
  }
  catch (err: unknown) {
    actionError.value = financeErrorMessage(err, 'Chưa tải được danh sách đề nghị thanh toán.')
  }
  finally {
    isLoading.value = false
  }
}

async function viewProofFile(fileId: string) {
  if (!fileId || isFileReading.value) return
  isFileReading.value = fileId
  try {
    const res = await procurementRepo.readEvidenceUrl(props.projectId, fileId)
    if (res?.url) {
      window.open(res.url, '_blank', 'noopener,noreferrer')
    }
  }
  catch (err: unknown) {
    actionError.value = financeErrorMessage(err, 'Không mở được tệp chứng từ chi.')
  }
  finally {
    isFileReading.value = null
  }
}

function openCreateForm() {
  resubmitRequestTarget.value = null
  isFormOpen.value = true
}

function openResubmitForm(req: MaterialPaymentRequestView) {
  resubmitRequestTarget.value = req
  isFormOpen.value = true
}

function openDecisionDialog(req: MaterialPaymentRequestView, action: 'approve' | 'return') {
  decisionRequestTarget.value = req
  decisionInitialAction.value = action
  isDecisionOpen.value = true
}

function openRecordPaymentDialog(req: MaterialPaymentRequestView) {
  recordPaymentRequestTarget.value = req
  isRecordPaymentOpen.value = true
}

function openCancelDialog(req: MaterialPaymentRequestView) {
  cancellingRequest.value = req
  cancelReason.value = ''
  cancelError.value = ''
}

function closeCancelDialog() {
  if (isCancelBusy.value) return
  cancellingRequest.value = null
  cancelReason.value = ''
  cancelError.value = ''
}

async function confirmCancelRequest() {
  const request = cancellingRequest.value
  if (!request || isCancelBusy.value) return
  const trimmedReason = cancelReason.value.trim()
  if (!trimmedReason) {
    cancelError.value = 'Vui lòng nhập lý do hủy đề nghị chi.'
    return
  }

  const payload: CancelPaymentRequestInput = {
    expectedVersion: request.version,
    reason: trimmedReason,
  }
  const cancelKey = commandKeys.forScope(`cancel:${request.id}`)
  const idempotencyKey = cancelKey.keyFor({ requestId: request.id, ...payload })

  isCancelBusy.value = true
  cancelError.value = ''
  try {
    await financeRepo.cancelPaymentRequest(props.projectId, request.id, payload, { idempotencyKey })
    cancelKey.reset()
    isCancelBusy.value = false
    closeCancelDialog()
    await loadRequests()
    emit('changed')
  }
  catch (err: unknown) {
    resetCommandKeyAfterError(cancelKey, err)
    const message = financeErrorMessage(err, 'Lỗi khi hủy đề nghị chi.')
    isCancelBusy.value = false
    if (isVersionConflict(err)) await onStale(message)
    else cancelError.value = message
  }
  finally {
    isCancelBusy.value = false
  }
}

function onCancelOpenChange(value: boolean) {
  if (!value) closeCancelDialog()
}

/** The request changed since it was loaded: close the dialogs, reload, and tell the user why. */
async function onStale(message: string) {
  isFormOpen.value = false
  resubmitRequestTarget.value = null
  isDecisionOpen.value = false
  decisionRequestTarget.value = null
  isRecordPaymentOpen.value = false
  recordPaymentRequestTarget.value = null
  closeCancelDialog()
  await loadRequests()
  actionError.value = message
  emit('changed')
}

function onRequestSaved() {
  isFormOpen.value = false
  resubmitRequestTarget.value = null
  void loadRequests()
  emit('changed')
}

function onDecisionSaved() {
  isDecisionOpen.value = false
  decisionRequestTarget.value = null
  void loadRequests()
  emit('changed')
}

function onRecordPaymentSaved() {
  isRecordPaymentOpen.value = false
  recordPaymentRequestTarget.value = null
  void loadRequests()
  emit('changed')
}

// An invoice officialized elsewhere on the page changes the contract's draft total.
watch(() => props.contract.totals?.draftInvoiced, () => {
  void loadInvoices()
})

onMounted(() => {
  void loadRequests()
})
</script>
