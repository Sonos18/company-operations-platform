<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { PrepareProjectCostDetailFinancialsInput } from '../../../shared/schemas/costs/project-costs'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { areExactDecimalValuesEqual, deriveRetentionAmount, deriveUnitPrice, formatFinanceMoney, isDecimalGreaterThan } from '../../utils/costs/finance-display'

export interface DetailFinancialsModel {
  amount: string | null
  quantity?: string | null
  unitCode?: string | null
  unitPrice?: string | null
  retentionKind?: 'warranty' | 'other' | null
  retentionRateBps?: number | null
  retentionAmount?: string | null
  sourceFigureIds?: string[]
}

const props = withDefaults(defineProps<{
  detailId: string
  version: number
  financials: DetailFinancialsModel
  stashedFinancials?: DetailFinancialsModel | Record<string, unknown> | null
  currencyCode?: string
  disabled?: boolean
}>(), {
  stashedFinancials: null,
  currencyCode: 'VND',
  disabled: false,
})

const emit = defineEmits<{
  'saved': [result: { version: number }]
  'refresh-requested': []
  'dirty-change': [isDirty: boolean]
  'discarded': []
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))

const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const isVersionConflict = ref(false)

const isServerEmpty = props.financials.amount === null || props.financials.amount === ''
const initialSource = isServerEmpty && props.stashedFinancials
  ? props.stashedFinancials
  : props.financials

interface FinancialFormState {
  amount: string
  quantity: string
  unitCode: string
  unitPrice: string
  retentionKind: '' | 'warranty' | 'other'
  retentionRateBps: number | null
  retentionAmount: string
}

const form = reactive<FinancialFormState>({
  amount: (initialSource.amount as string) ?? '',
  quantity: (initialSource.quantity as string) ?? '',
  unitCode: (initialSource.unitCode as string) ?? '',
  unitPrice: (initialSource.unitPrice as string) ?? '',
  retentionKind: ((initialSource.retentionKind as string) ?? '') as '' | 'warranty' | 'other',
  retentionRateBps: (initialSource.retentionRateBps as number) ?? null,
  retentionAmount: (initialSource.retentionAmount as string) ?? '',
})

const hasChanges = computed(() => {
  const isAmtChanged = !areExactDecimalValuesEqual(props.financials.amount, form.amount)
  const isQtyChanged = !areExactDecimalValuesEqual(props.financials.quantity, form.quantity)
  const isPriceChanged = !areExactDecimalValuesEqual(props.financials.unitPrice, form.unitPrice)
  const isRetAmtChanged = !areExactDecimalValuesEqual(props.financials.retentionAmount, form.retentionAmount)

  const isUnitChanged = (props.financials.unitCode ?? '').trim() !== form.unitCode.trim()
  const isKindChanged = (props.financials.retentionKind ?? '') !== form.retentionKind
  const isRateChanged = (props.financials.retentionRateBps ?? null) !== form.retentionRateBps

  return isAmtChanged
    || isQtyChanged
    || isUnitChanged
    || isPriceChanged
    || isKindChanged
    || isRateChanged
    || isRetAmtChanged
})

watch(hasChanges, (dirty) => {
  emit('dirty-change', dirty)
}, { immediate: true })

watch(() => props.financials, (f) => {
  if (hasChanges.value) {
    // Preserve dirty edits across background/props refreshes
    return
  }
  form.amount = f.amount ?? ''
  form.quantity = f.quantity ?? ''
  form.unitCode = f.unitCode ?? ''
  form.unitPrice = f.unitPrice ?? ''
  form.retentionKind = (f.retentionKind ?? '') as '' | 'warranty' | 'other'
  form.retentionRateBps = f.retentionRateBps ?? null
  form.retentionAmount = f.retentionAmount ?? ''
  isVersionConflict.value = false
  errorMessage.value = null
}, { deep: true })

function discardChanges() {
  form.amount = props.financials.amount ?? ''
  form.quantity = props.financials.quantity ?? ''
  form.unitCode = props.financials.unitCode ?? ''
  form.unitPrice = props.financials.unitPrice ?? ''
  form.retentionKind = (props.financials.retentionKind ?? '') as '' | 'warranty' | 'other'
  form.retentionRateBps = props.financials.retentionRateBps ?? null
  form.retentionAmount = props.financials.retentionAmount ?? ''
  isVersionConflict.value = false
  errorMessage.value = null
  emit('discarded')
}

// Compute unitPrice automatically if quantity and amount are entered and unitPrice is empty
function onAmountOrQuantityBlur() {
  if (form.amount !== '' && form.quantity !== '') {
    const derived = deriveUnitPrice(form.amount, form.quantity)
    if (derived !== null && !form.unitPrice) form.unitPrice = derived
  }
}

// Compute retentionAmount automatically if retentionRateBps and amount are entered
function onRetentionRateChange() {
  if (form.amount !== '' && form.retentionRateBps !== null) {
    const derived = deriveRetentionAmount(form.amount, form.retentionRateBps)
    if (derived !== null) form.retentionAmount = derived
  }
}

const isAmountValid = computed(() => {
  const val = form.amount.trim()
  if (val === '') return false
  return /^-?\d+(?:\.\d+)?$/.test(val)
})

async function save() {
  if (!canPrepare.value) {
    errorMessage.value = 'Bạn không có quyền cost.prepare để cập nhật dữ liệu tài chính.'
    return
  }

  const amtTrimmed = form.amount.trim()
  if (amtTrimmed === '' || !/^-?\d+(?:\.\d+)?$/.test(amtTrimmed)) {
    errorMessage.value = 'Vui lòng nhập số tiền hợp lệ (chấp nhận số tiền bằng 0).'
    return
  }

  // Validate retention logic
  if (form.retentionKind) {
    if (!form.retentionAmount || Number.isNaN(Number(form.retentionAmount))) {
      errorMessage.value = 'Vui lòng nhập số tiền tạm giữ bảo hành hợp lệ.'
      return
    }
    if (isDecimalGreaterThan(form.retentionAmount, amtTrimmed)) {
      errorMessage.value = 'Số tiền tạm giữ không được lớn hơn tổng số tiền chi tiết.'
      return
    }
  }

  submitting.value = true
  errorMessage.value = null
  successMessage.value = null
  isVersionConflict.value = false

  try {
    const input: PrepareProjectCostDetailFinancialsInput = {
      expectedVersion: props.version,
      amount: amtTrimmed,
      quantity: form.quantity.trim() ? form.quantity.trim() : null,
      unitCode: form.unitCode.trim() ? form.unitCode.trim() : null,
      unitPrice: form.unitPrice.trim() ? form.unitPrice.trim() : null,
      retentionKind: form.retentionKind ? form.retentionKind : null,
      retentionRateBps: form.retentionKind && form.retentionRateBps !== null ? form.retentionRateBps : null,
      retentionAmount: form.retentionKind && form.retentionAmount.trim() ? form.retentionAmount.trim() : null,
    }

    const result = await repositories.projectCosts.prepareDetailFinancials(props.detailId, input)
    successMessage.value = 'Đã lưu chi tiết tài chính thành công.'
    emit('saved', { version: result.version })
  }
  catch (err: unknown) {
    const msg = extractErrorMessage(err)
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'VERSION_CONFLICT') {
      isVersionConflict.value = true
      errorMessage.value = 'Xung đột phiên bản: Dữ liệu đã được cập nhật bởi thao tác khác. Dữ liệu tài chính vừa nhập vẫn được giữ nguyên. Vui lòng bấm "Lấy phiên bản mới nhất" để cập nhật phiên bản trước khi lưu lại.'
    }
    else {
      errorMessage.value = msg
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="cockpit-card p-6 rounded-lg space-y-4" data-testid="detail-financial-form">
    <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
      <div>
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
          Chi tiết tài chính
        </h3>
        <p class="text-xs text-gray-500">
          Số tiền, khối lượng, đơn giá và cấu hình giữ bảo hành.
        </p>
      </div>
      <span class="text-xs font-mono text-gray-500" data-testid="financial-version-badge">
        v{{ version }}
      </span>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :description="errorMessage"
      data-testid="financial-error-alert"
    />
    <UAlert
      v-if="successMessage"
      color="success"
      variant="subtle"
      :description="successMessage"
      data-testid="financial-success-alert"
    />

    <div v-if="isVersionConflict" class="flex justify-end">
      <UButton
        size="sm"
        color="warning"
        variant="outline"
        icon="i-lucide-refresh-cw"
        data-testid="refresh-financial-version-btn"
        @click="emit('refresh-requested')"
      >
        Lấy phiên bản mới nhất
      </UButton>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="space-y-1 md:col-span-3">
        <label for="fin-amount" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          Số tiền ({{ currencyCode }}) <span class="text-red-500">*</span>
        </label>
        <div class="relative">
          <input
            id="fin-amount"
            v-model="form.amount"
            type="text"
            class="cockpit-input w-full font-mono text-lg font-bold"
            :disabled="disabled || submitting || !canPrepare"
            placeholder="0"
            data-testid="detail-amount-input"
            @blur="onAmountOrQuantityBlur"
          >
          <div v-if="isAmountValid" class="text-xs text-gray-500 mt-1 font-mono">
            Định dạng hiển thị: {{ formatFinanceMoney(form.amount.trim(), currencyCode) }}
          </div>
        </div>
      </div>

      <div class="space-y-1">
        <label for="fin-qty" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          Khối lượng / Số lượng
        </label>
        <input
          id="fin-qty"
          v-model="form.quantity"
          type="text"
          class="cockpit-input w-full font-mono"
          :disabled="disabled || submitting || !canPrepare"
          placeholder="Ví dụ: 10.5"
          data-testid="detail-quantity-input"
          @blur="onAmountOrQuantityBlur"
        >
      </div>

      <div class="space-y-1">
        <label for="fin-unit" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          Đơn vị tính
        </label>
        <input
          id="fin-unit"
          v-model="form.unitCode"
          type="text"
          class="cockpit-input w-full"
          :disabled="disabled || submitting || !canPrepare"
          placeholder="m2, tấn, cái, bộ..."
          data-testid="detail-unit-input"
        >
      </div>

      <div class="space-y-1">
        <label for="fin-price" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          Đơn giá ({{ currencyCode }})
        </label>
        <input
          id="fin-price"
          v-model="form.unitPrice"
          type="text"
          class="cockpit-input w-full font-mono"
          :disabled="disabled || submitting || !canPrepare"
          placeholder="Ví dụ: 250000"
          data-testid="detail-unit-price-input"
        >
      </div>

      <!-- Retention Section -->
      <div class="md:col-span-3 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
        <div class="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Tạm giữ bảo hành (Tùy chọn)
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="space-y-1">
            <label for="fin-ret-kind" class="block text-xs text-gray-500">Loại tạm giữ</label>
            <select
              id="fin-ret-kind"
              v-model="form.retentionKind"
              class="cockpit-select w-full"
              :disabled="disabled || submitting || !canPrepare"
              data-testid="detail-retention-kind-select"
            >
              <option value="">Không tạm giữ</option>
              <option value="warranty">Bảo hành (warranty)</option>
              <option value="other">Tạm giữ khác (other)</option>
            </select>
          </div>

          <div v-if="form.retentionKind" class="space-y-1">
            <label for="fin-ret-rate" class="block text-xs text-gray-500">Tỷ lệ giữ (bps, 100 = 1%)</label>
            <input
              id="fin-ret-rate"
              v-model.number="form.retentionRateBps"
              type="number"
              min="0"
              max="10000"
              class="cockpit-input w-full font-mono"
              :disabled="disabled || submitting || !canPrepare"
              placeholder="Ví dụ: 500 (= 5%)"
              data-testid="detail-retention-rate-input"
              @input="onRetentionRateChange"
            >
          </div>

          <div v-if="form.retentionKind" class="space-y-1">
            <label for="fin-ret-amt" class="block text-xs text-gray-500">Số tiền tạm giữ ({{ currencyCode }})</label>
            <input
              id="fin-ret-amt"
              v-model="form.retentionAmount"
              type="text"
              class="cockpit-input w-full font-mono"
              :disabled="disabled || submitting || !canPrepare"
              data-testid="detail-retention-amount-input"
            >
          </div>
        </div>
      </div>
    </div>

    <div v-if="canPrepare" class="flex items-center justify-end gap-2 pt-2">
      <UButton
        v-if="hasChanges"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="disabled || submitting"
        data-testid="discard-financials-btn"
        @click="discardChanges"
      >
        Hủy thay đổi
      </UButton>
      <UButton
        color="primary"
        size="sm"
        :loading="submitting"
        :disabled="disabled || submitting || !isAmountValid || !hasChanges"
        data-testid="save-financials-btn"
        @click="save"
      >
        Lưu dữ liệu tài chính
      </UButton>
    </div>
  </div>
</template>
