<template>
  <UModal
    :open="open && Boolean(request)"
    :title="decision === 'approve' ? 'Phê duyệt đề nghị chi' : 'Trả lại đề nghị chi'"
    :description="request ? `Đề nghị chi lần ${request.revisionNo} - Số tiền: ${formatVnNumber(request.amount)}` : ''"
    :dismissible="!isSubmitting"
    @update:open="onOpenChange"
  >
    <template #body>
      <div v-if="request" class="space-y-4 text-xs">
        <div v-if="submitError" class="cockpit-alert cockpit-alert--danger" role="alert">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
            <p class="font-semibold text-rose-900 m-0 flex-1">{{ submitError }}</p>
          </div>
        </div>

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

        <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-slate-600">
          <div class="flex justify-between">
            <span>Số tiền đề nghị:</span>
            <strong class="font-mono text-slate-900 text-sm">{{ formatVnNumber(request.amount) }}</strong>
          </div>
          <div class="flex justify-between">
            <span>Thời gian gửi:</span>
            <span class="text-slate-800">{{ formatDateTime(request.submittedAt) }}</span>
          </div>
          <div v-if="request.note" class="pt-1 border-t border-slate-200 text-slate-700">
            <span class="text-slate-500">Ghi chú của kế toán:</span> {{ request.note }}
          </div>
        </div>

        <!-- Only a return carries a reason: the database stores none for approvals and rejects one. -->
        <div v-if="decision === 'return'">
          <label for="decision-reason-input" class="block font-semibold text-slate-700 mb-1">
            Lý do trả lại đề nghị chi
            <span class="text-rose-500">*</span>
          </label>
          <textarea
            id="decision-reason-input"
            v-model="reason"
            rows="3"
            class="cockpit-input w-full text-xs"
            placeholder="Nhập lý do trả lại đề nghị để kế toán điều chỉnh..."
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
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2.5">
        <UButton color="neutral" variant="outline" :disabled="isSubmitting" @click="close">
          Đóng
        </UButton>
        <UButton
          :color="decision === 'approve' ? 'primary' : 'error'"
          :icon="decision === 'approve' ? 'i-lucide-check' : 'i-lucide-corner-up-left'"
          :loading="isSubmitting"
          :disabled="!canSubmit"
          @click="submitDecision"
        >
          {{ decision === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận trả lại' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type {
  MaterialPaymentRequestView,
  DecidePaymentRequestInput,
} from '../../../../shared/schemas/costs/material-finance'
import { formatDateTime } from '../../../utils/materials/date-display'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import {
  financeErrorMessage,
  isVersionConflict,
  resetCommandKeyAfterError,
  type CommandKeyKeeper,
} from '../../../utils/materials/finance-ui'

interface Props {
  projectId: string
  request: MaterialPaymentRequestView | null
  initialDecision?: 'approve' | 'return'
  open: boolean
  /** Owned by the panel (scoped per request) so the key survives closing and reopening. */
  commandKey: CommandKeyKeeper
}

const props = withDefaults(defineProps<Props>(), {
  initialDecision: 'approve',
})

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'saved'): void
  /** The request changed since it was loaded: the owner reloads and closes this dialog. */
  (e: 'stale', message: string): void
}>()

const repositories = useRepositories()
const financeRepo = repositories.materialFinance

const decision = ref<'approve' | 'return'>('approve')
const reason = ref('')
const isSubmitting = ref(false)
const submitError = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    decision.value = props.initialDecision
    reason.value = ''
    submitError.value = ''
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
    ...(decision.value === 'return' && trimmedReason ? { reason: trimmedReason } : {}),
  }
  const idempotencyKey = props.commandKey.keyFor({ requestId: request.id, ...payload })

  isSubmitting.value = true
  submitError.value = ''
  try {
    await financeRepo.decidePaymentRequest(props.projectId, request.id, payload, { idempotencyKey })
    props.commandKey.reset()
    isSubmitting.value = false
    emit('saved')
  }
  catch (err: unknown) {
    resetCommandKeyAfterError(props.commandKey, err)
    const message = financeErrorMessage(err, 'Lỗi khi ghi nhận quyết định.')
    isSubmitting.value = false
    if (isVersionConflict(err)) emit('stale', message)
    else submitError.value = message
  }
  finally {
    isSubmitting.value = false
  }
}

function close() {
  if (isSubmitting.value) return
  emit('update:open', false)
}

function onOpenChange(value: boolean) {
  if (!value) close()
}
</script>
