<template>
  <div
    v-if="open && request"
    :ref="focusDialogElement"
    tabindex="-1"
    class="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-labelledby="decision-dialog-title"
    @keydown.esc="close"
  >
    <div class="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div class="flex items-center gap-2.5">
          <div
            class="p-2 rounded-lg"
            :class="decision === 'approve' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'"
          >
            <UIcon
              :name="decision === 'approve' ? 'i-lucide-check-circle' : 'i-lucide-corner-up-left'"
              class="text-xl"
              aria-hidden="true"
            />
          </div>
          <div>
            <h3 id="decision-dialog-title" class="text-base font-bold text-slate-900 m-0">
              {{ decision === 'approve' ? 'Phê duyệt đề nghị chi' : 'Trả lại đề nghị chi' }}
            </h3>
            <p class="text-xs text-slate-500 m-0 mt-0.5">
              Đề nghị chi lần {{ request.revisionNo }} &bull; Số tiền: <strong class="font-mono text-slate-800">{{ formatMoney(request.amount) }}</strong>
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

        <!-- Decision Toggle -->
        <div role="group" aria-labelledby="decision-kind-label">
          <div id="decision-kind-label" class="block font-semibold text-slate-700 mb-1.5">Loại quyết định <span class="text-rose-500">*</span></div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              :aria-pressed="decision === 'approve'"
              class="p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer"
              :class="decision === 'approve'
                ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-semibold ring-1 ring-emerald-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'"
              @click="decision = 'approve'"
            >
              <UIcon name="i-lucide-check" class="text-emerald-600 text-base" aria-hidden="true" />
              <span>Duyệt đề nghị</span>
            </button>

            <button
              type="button"
              :aria-pressed="decision === 'return'"
              class="p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer"
              :class="decision === 'return'
                ? 'border-rose-500 bg-rose-50/70 text-rose-900 font-semibold ring-1 ring-rose-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'"
              @click="decision = 'return'"
            >
              <UIcon name="i-lucide-corner-up-left" class="text-rose-600 text-base" aria-hidden="true" />
              <span>Trả lại cho kế toán</span>
            </button>
          </div>
        </div>

        <!-- Request Details Summary -->
        <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-slate-600">
          <div class="flex justify-between">
            <span>Số tiền đề nghị:</span>
            <strong class="font-mono text-slate-900 text-sm">{{ formatMoney(request.amount) }}</strong>
          </div>
          <div class="flex justify-between">
            <span>Thời gian gửi:</span>
            <span class="text-slate-800">{{ formatDateTime(request.submittedAt) }}</span>
          </div>
          <div v-if="request.note" class="pt-1 border-t border-slate-200 text-slate-700">
            <span class="text-slate-500">Ghi chú của kế toán:</span> {{ request.note }}
          </div>
        </div>

        <!-- Reason Textarea -->
        <div>
          <label for="decision-reason-input" class="block font-semibold text-slate-700 mb-1">
            {{ decision === 'return' ? 'Lý do trả lại đề nghị chi' : 'Ghi chú / ý kiến duyệt (tùy chọn)' }}
            <span v-if="decision === 'return'" class="text-rose-500">*</span>
          </label>
          <textarea
            id="decision-reason-input"
            v-model="reason"
            rows="3"
            class="cockpit-input w-full text-xs"
            :placeholder="decision === 'return' ? 'Nhập lý do trả lại đề nghị để kế toán điều chỉnh...' : 'Nhập ý kiến hoặc ghi chú bổ sung...'"
            :disabled="isSubmitting"
            maxlength="1000"
          />
          <div class="flex items-center justify-between gap-2 mt-1">
            <p v-if="reasonMissing" class="m-0 text-[11px] font-medium text-rose-600" role="alert">
              Cần nhập lý do khi trả lại đề nghị
            </p>
            <span v-else />
            <span class="text-[10px] text-slate-400">{{ reason.length }}/1000 ký tự</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
        <button
          type="button"
          class="cockpit-btn cockpit-btn--secondary btn-sm"
          :disabled="isSubmitting"
          @click="close"
        >
          Đóng
        </button>

        <button
          type="button"
          class="cockpit-btn btn-sm flex items-center gap-1.5"
          :class="decision === 'approve' ? 'cockpit-btn--primary' : 'cockpit-btn--danger'"
          :disabled="!canSubmit"
          @click="submitDecision"
        >
          <UIcon v-if="isSubmitting" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
          <UIcon v-else :name="decision === 'approve' ? 'i-lucide-check' : 'i-lucide-corner-up-left'" class="text-sm" aria-hidden="true" />
          <span>{{ decision === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận trả lại' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type {
  MaterialPaymentRequestView,
  DecidePaymentRequestInput,
} from '../../../../shared/schemas/costs/material-finance'
import {
  createCommandKeyTracker,
  financeErrorMessage,
  focusDialogElement,
  formatDateTime,
  formatMoney,
} from '../../../utils/materials/finance-ui'

interface Props {
  projectId: string
  request: MaterialPaymentRequestView | null
  initialDecision?: 'approve' | 'return'
  open: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialDecision: 'approve',
})

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'saved'): void
}>()

const repositories = useRepositories()
const financeRepo = repositories.materialFinance

const decision = ref<'approve' | 'return'>('approve')
const reason = ref('')
const isSubmitting = ref(false)
const submitError = ref('')
const commandKey = createCommandKeyTracker()

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    decision.value = props.initialDecision
    reason.value = ''
    submitError.value = ''
    commandKey.settle()
  },
  { immediate: true },
)

const reasonMissing = computed(() => decision.value === 'return' && !reason.value.trim())

const canSubmit = computed(() => {
  if (isSubmitting.value || !props.request) return false
  return !reasonMissing.value
})

async function submitDecision() {
  const request = props.request
  if (!request || !canSubmit.value) return

  const trimmedReason = reason.value.trim()
  const payload: DecidePaymentRequestInput = {
    expectedVersion: request.version,
    decision: decision.value,
    ...(trimmedReason ? { reason: trimmedReason } : {}),
  }
  const idempotencyKey = commandKey.keyFor({ requestId: request.id, ...payload })

  isSubmitting.value = true
  submitError.value = ''
  try {
    await financeRepo.decidePaymentRequest(props.projectId, request.id, payload, { idempotencyKey })
    commandKey.settle()
    isSubmitting.value = false
    emit('saved')
    close()
  }
  catch (err: unknown) {
    commandKey.settleAfterError(err)
    submitError.value = financeErrorMessage(err, 'Lỗi khi ghi nhận quyết định.')
  }
  finally {
    isSubmitting.value = false
  }
}

function close() {
  if (isSubmitting.value) return
  emit('update:open', false)
}
</script>
