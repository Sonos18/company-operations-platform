<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { formatFinanceMoney } from '../../utils/costs/finance-display'

interface PaymentToVoid {
  id: string
  version: number
  description: string
  paidAmount: string
  currencyCode?: string
}

const props = defineProps<{
  open: boolean
  projectId: string
  subcontractId: string
  payment: PaymentToVoid | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'voided': [result: { paymentId: string; version: number }]
  'start-replacement': [paymentId: string]
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const canRecordCash = computed(() => companyAccess.hasPermission('cost.record_cash'))

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val),
})

const reason = ref('')
const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const voidSucceeded = ref(false)
const voidedPaymentId = ref<string | null>(null)
const pendingCommand = ref<{ fingerprint: string; idempotencyKey: string } | null>(null)

watch([() => props.open, () => props.projectId, () => props.subcontractId, () => props.payment?.id, () => props.payment?.version], ([open]) => {
  if (open) {
    reason.value = ''
    errorMessage.value = null
    voidSucceeded.value = false
    voidedPaymentId.value = null
  }
})
watch([() => props.projectId, () => props.subcontractId, () => props.payment?.id, () => props.payment?.version], () => { pendingCommand.value = null })

async function handleVoid() {
  if (!canRecordCash.value || !props.payment) return

  if (!reason.value.trim()) {
    errorMessage.value = 'Lý do hủy thanh toán không được để trống.'
    return
  }

  submitting.value = true
  errorMessage.value = null

  try {
    const input = {
      expectedVersion: props.payment.version,
      reason: reason.value.trim(),
    }
    const fingerprint = JSON.stringify({ projectId: props.projectId, subcontractId: props.subcontractId, paymentId: props.payment.id, input })
    if (pendingCommand.value?.fingerprint !== fingerprint) pendingCommand.value = { fingerprint, idempotencyKey: globalThis.crypto.randomUUID() }
    const result = await repositories.projectFinance.voidSubcontractPayment(
      props.projectId,
      props.subcontractId,
      props.payment.id,
      input,
      { idempotencyKey: pendingCommand.value.idempotencyKey },
    )

    pendingCommand.value = null
    voidSucceeded.value = true
    voidedPaymentId.value = result.paymentId
    emit('voided', { paymentId: result.paymentId, version: result.version })
  }
  catch (err: unknown) {
    errorMessage.value = extractErrorMessage(err, 'Lỗi khi hủy khoản thanh toán.')
  }
  finally {
    submitting.value = false
  }
}

function handleReplacement() {
  if (voidedPaymentId.value) {
    isOpen.value = false
    emit('start-replacement', voidedPaymentId.value)
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Hủy khoản thanh toán thầu phụ"
    description="Xác nhận hủy thanh toán có ghi nhận lý do kiểm toán (Quyền: cost.record_cash)."
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
          description="Bạn cần quyền cost.record_cash để hủy khoản thanh toán."
        />
      </div>

      <div v-else-if="voidSucceeded" class="space-y-4 py-2" data-testid="void-success-view">
        <div class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 rounded-lg text-center space-y-2">
          <UIcon name="i-lucide-check-circle-2" class="text-3xl text-emerald-600 mx-auto" />
          <h4 class="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Đã hủy khoản thanh toán thành công
          </h4>
          <p class="text-xs text-emerald-700 dark:text-emerald-300">
            Khoản thanh toán đã được đánh dấu trạng thái "voided" trong sổ thanh toán thầu phụ.
          </p>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="() => { isOpen = false }"
          >
            Đóng
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-replace"
            data-testid="start-replacement-btn"
            @click="handleReplacement"
          >
            Ghi nhận thanh toán thay thế
          </UButton>
        </div>
      </div>

      <form v-else-if="props.payment" class="space-y-4" data-testid="void-payment-form" @submit.prevent="handleVoid">
        <!-- Warning Banner -->
        <div class="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-3 rounded-lg text-xs space-y-1">
          <div class="font-bold text-red-900 dark:text-red-100 flex items-center gap-1.5">
            <UIcon name="i-lucide-alert-triangle" class="text-red-600" />
            Cảnh báo hủy thanh toán
          </div>
          <p class="text-red-800 dark:text-red-200">
            Khoản thanh toán sau khi hủy sẽ không còn được tính vào tổng chi/ứng của nhà thầu. Số tiền lịch sử được bảo lưu và không thể sửa đổi tại chỗ.
          </p>
        </div>

        <!-- Payment Info -->
        <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-xs space-y-1 border border-gray-200 dark:border-gray-800">
          <div class="flex justify-between">
            <span class="text-gray-500">Nội dung:</span>
            <span class="font-medium text-gray-900 dark:text-gray-100">{{ props.payment.description }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Số tiền chi/ứng:</span>
            <span class="font-mono font-bold text-red-600 text-sm">
              {{ formatFinanceMoney(props.payment.paidAmount, props.payment.currencyCode) }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Phiên bản hiện tại:</span>
            <span class="font-mono text-gray-700 dark:text-gray-300">v{{ props.payment.version }}</span>
          </div>
        </div>

        <UAlert
          v-if="errorMessage"
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Không thể hủy thanh toán"
          :description="errorMessage"
          data-testid="void-payment-error"
        />

        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="void-reason">
            Lý do hủy (Kiểm toán) <span class="text-red-500">*</span>
          </label>
          <input
            id="void-reason"
            v-model="reason"
            type="text"
            required
            placeholder="Ví dụ: Nhập sai số tiền chi phiếu hoặc chi nhầm tài khoản"
            class="cockpit-input w-full"
            data-testid="void-reason-input"
          >
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="submitting"
            @click="() => { isOpen = false }"
          >
            Hủy bỏ
          </UButton>
          <UButton
            type="submit"
            color="error"
            icon="i-lucide-ban"
            :loading="submitting"
            :disabled="!reason.trim()"
            data-testid="confirm-void-payment-btn"
          >
            Xác nhận hủy thanh toán
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
