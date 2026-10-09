<template>
  <div
    class="quotation-comparison-row"
    :class="{
      'quotation-comparison-row--confirmed': mappingConfirmed,
      'quotation-comparison-row--disagreement': hasDisagreement,
      'quotation-comparison-row--disabled': disabled || isLineExhausted,
    }"
    role="region"
    :aria-label="'Đối chiếu báo giá dòng vật tư: ' + line.materialName"
  >
    <!-- Row Header / Canonical Summary -->
    <div class="line-header">
      <div class="canonical-info">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="material-name font-semibold text-slate-900">{{ line.materialName }}</span>
          <span v-if="line.specification" class="material-spec text-xs text-slate-500 font-mono">
            ({{ line.specification }})
          </span>
          <span class="cockpit-badge cockpit-badge--neutral text-xs">
            ĐVT: {{ line.unit }}
          </span>
          <span v-if="isLineExhausted" class="cockpit-badge cockpit-badge--neutral text-xs bg-slate-100 text-slate-500">
            Đã phân bổ đủ
          </span>
        </div>

        <!-- Anticipated invoice display name and source -->
        <div class="anticipated-invoice-row mt-1 flex items-center gap-2 flex-wrap text-xs text-slate-600">
          <span class="text-slate-500">Tên dự kiến HĐ:</span>
          <span class="font-medium text-slate-800">{{ line.effectiveInvoiceDisplayName }}</span>
          <span class="source-tag text-slate-400">({{ sourceLabel }})</span>
        </div>
      </div>

      <!-- Quantities summary from canonical GET -->
      <div class="quantity-stats">
        <div class="stat-pill" title="Tổng số lượng kỹ sư yêu cầu và đã được duyệt">
          <span class="stat-label">Duyệt:</span>
          <span class="stat-val font-mono font-medium">{{ formatMaterialQuantity(line.quantity) }}</span>
        </div>
        <div class="stat-pill" title="Số lượng đã phân bổ vào các đơn mua khác">
          <span class="stat-label">Đã phân bổ:</span>
          <span class="stat-val font-mono font-medium">{{ formatMaterialQuantity(line.allocatedQuantity) }}</span>
        </div>
        <div class="stat-pill stat-pill--remaining" title="Số lượng còn lại có thể tạo đơn mua">
          <span class="stat-label">Còn lại:</span>
          <span class="stat-val font-mono font-bold text-sky-700">{{ formatMaterialQuantity(line.remainingQuantity) }}</span>
        </div>
      </div>
    </div>

    <!-- Interactive Comparison & Allocation Form Grid -->
    <div class="form-grid-wrapper mt-3">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <!-- 1. Quotation Material Name from PDF -->
        <div class="form-field">
          <label :for="'quote-name-' + line.lineId" class="field-label">
            Tên trên báo giá PDF <span class="text-rose-500">*</span>
          </label>
          <input
            :id="'quote-name-' + line.lineId"
            type="text"
            class="cockpit-input text-sm w-full"
            placeholder="Sao chép từ PDF..."
            :value="quotationMaterialName"
            :disabled="disabled || isLineExhausted"
            maxlength="200"
            @input="onUpdateQuotationMaterialName"
          >
          <span class="field-hint text-xs text-slate-400">Tên vật tư ghi trên báo giá PDF</span>
        </div>

        <!-- 2. Quoted Quantity copied from PDF -->
        <div class="form-field">
          <label :for="'quote-qty-' + line.lineId" class="field-label">
            Số lượng trên PDF <span class="text-rose-500">*</span>
          </label>
          <input
            :id="'quote-qty-' + line.lineId"
            type="text"
            class="cockpit-input text-sm w-full font-mono"
            :class="{ 'border-rose-400 text-rose-700': isQuoteQtyFormatInvalid }"
            placeholder="VD: 10.0000"
            :value="quotedQuantity"
            :disabled="disabled || isLineExhausted"
            @input="onUpdateQuotedQuantity"
          >
          <span v-if="isQuoteQtyFormatInvalid" class="text-xs text-rose-600 font-medium" role="alert">
            Số lượng không hợp lệ (tối đa 16 số nguyên, 4 số thập phân, không số 0 ở đầu)
          </span>
          <span v-else class="field-hint text-xs text-slate-400">Số lượng ghi trên báo giá PDF</span>
        </div>

        <!-- 3. Allocation Quantity for this Order -->
        <div class="form-field">
          <label :for="'alloc-qty-' + line.lineId" class="field-label">
            SL phân bổ đơn này <span class="text-rose-500">*</span>
          </label>
          <input
            :id="'alloc-qty-' + line.lineId"
            type="text"
            class="cockpit-input text-sm w-full font-mono"
            :class="{ 'border-rose-400 text-rose-700': exceedsRemaining || isAllocQtyFormatInvalid }"
            placeholder="VD: 10.0000"
            :value="allocationQuantity"
            :disabled="disabled || isLineExhausted"
            @input="onUpdateAllocationQuantity"
          >
          <span v-if="exceedsRemaining" class="text-xs text-rose-600 font-medium" role="alert">
            Vượt quá còn lại ({{ formatMaterialQuantity(line.remainingQuantity) }})
          </span>
          <span v-else-if="isAllocQtyFormatInvalid" class="text-xs text-rose-600 font-medium" role="alert">
            Số lượng phân bổ không hợp lệ (tối đa 16 số nguyên, 4 số thập phân, không số 0 ở đầu)
          </span>
          <span v-else class="field-hint text-xs text-slate-400">Tối đa: {{ formatMaterialQuantity(line.remainingQuantity) }}</span>
        </div>

        <!-- 4. Unit Price -->
        <div class="form-field">
          <label :for="'unit-price-' + line.lineId" class="field-label">
            Đơn giá dự kiến <span class="text-rose-500">*</span>
          </label>
          <input
            :id="'unit-price-' + line.lineId"
            type="text"
            class="cockpit-input text-sm w-full font-mono"
            :class="{ 'border-rose-400 text-rose-700': isUnitPriceFormatInvalid }"
            placeholder="VD: 18500"
            :value="unitPrice"
            :disabled="disabled || isLineExhausted"
            @input="onUpdateUnitPrice"
          >
          <span v-if="isUnitPriceFormatInvalid" class="text-xs text-rose-600 font-medium" role="alert">
            Đơn giá không hợp lệ (tối đa 16 số nguyên, 4 số thập phân, không số 0 ở đầu)
          </span>
          <span v-else-if="lineTotalEstimate" class="field-hint text-xs text-slate-600 font-mono font-medium">
            Thành tiền: {{ lineTotalEstimate }}
          </span>
          <span v-else class="field-hint text-xs text-slate-400">Đơn giá chưa VAT / theo báo giá</span>
        </div>
      </div>
    </div>

    <!-- Comparison Outcome & Confirmation Bar -->
    <div v-if="hasInputToCompare" class="comparison-footer mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
      <!-- Variance / Comparison Status -->
      <div class="comparison-status flex items-center gap-2 flex-wrap">
        <template v-if="comparisonResult">
          <span
            class="status-chip flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium"
            :class="comparisonResult.matchesAllocation ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'"
          >
            <UIcon
              :name="comparisonResult.matchesAllocation ? 'i-lucide-check-circle' : 'i-lucide-alert-triangle'"
              class="text-sm shrink-0"
              aria-hidden="true"
            />
            <span v-if="comparisonResult.matchesAllocation">Khớp số lượng đặt hàng</span>
            <span v-else>Chênh lệch: {{ comparisonResult.varianceQuantity }} {{ line.unit }}</span>
          </span>

          <span v-if="!comparisonResult.matchesAllocation" class="text-xs text-rose-600 font-medium">
            Số lượng trên báo giá khác số lượng phân bổ cho đơn này.
          </span>
        </template>
        <template v-else>
          <span class="text-xs text-slate-400 italic">
            Nhập số lượng báo giá và phân bổ hợp lệ để đối chiếu...
          </span>
        </template>

        <!-- Offer returnRequested button when quantities disagree -->
        <button
          v-if="hasDisagreement"
          type="button"
          class="cockpit-btn cockpit-btn--secondary btn-sm"
          :disabled="disabled"
          title="Yêu cầu trả phiếu để kỹ sư lập phiếu điều chỉnh khối lượng"
          @click="emit('returnRequested')"
        >
          <UIcon name="i-lucide-corner-up-left" class="text-xs" aria-hidden="true" />
          Yêu cầu trả phiếu
        </button>
      </div>

      <!-- Explicit Per-row Confirmation Checkbox -->
      <div class="confirmation-checkbox flex items-center gap-2">
        <input
          :id="'confirm-mapping-' + line.lineId"
          type="checkbox"
          class="cockpit-checkbox h-4 w-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer disabled:cursor-not-allowed"
          :checked="mappingConfirmed"
          :disabled="disabled || !canConfirm"
          @change="onToggleConfirm"
        >
        <label
          :for="'confirm-mapping-' + line.lineId"
          class="text-xs font-medium select-none cursor-pointer"
          :class="{
            'text-slate-800': canConfirm,
            'text-slate-400 cursor-not-allowed': !canConfirm,
          }"
        >
          Xác nhận đã đối chiếu tên, quy cách, ĐVT và số lượng trên PDF
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Decimal from 'decimal.js'
import type { MaterialProposalView } from '../../../shared/schemas/costs/material-procurement'
import { workflowMoneySchema } from '../../../shared/schemas/costs/cost-workflow'
import { compareMaterialQuotation } from '../../../shared/utils/material-quotation-comparison'
import { formatMaterialQuantity } from '../../utils/materials/quantity-display'

type MaterialProposalLineView = MaterialProposalView['lines'][number]

interface Props {
  line: MaterialProposalLineView
  allocationQuantity: string
  unitPrice: string
  quotedQuantity: string
  quotationMaterialName: string
  mappingConfirmed: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:allocationQuantity', value: string): void
  (e: 'update:unitPrice', value: string): void
  (e: 'update:quotedQuantity', value: string): void
  (e: 'update:quotationMaterialName', value: string): void
  (e: 'update:mappingConfirmed', value: boolean): void
  (e: 'returnRequested'): void
}>()

function isValidPositiveDecimal(val: string): boolean {
  const trimmed = (val ?? '').trim()
  if (!trimmed) return false
  const parseRes = workflowMoneySchema.safeParse(trimmed)
  if (!parseRes.success) return false
  try {
    return new Decimal(trimmed).gt(0)
  } catch {
    return false
  }
}

const isAllocQtyFormatInvalid = computed(() => {
  const trimmed = (props.allocationQuantity ?? '').trim()
  if (!trimmed) return false
  return !isValidPositiveDecimal(trimmed)
})

const isQuoteQtyFormatInvalid = computed(() => {
  const trimmed = (props.quotedQuantity ?? '').trim()
  if (!trimmed) return false
  return !isValidPositiveDecimal(trimmed)
})

const isUnitPriceFormatInvalid = computed(() => {
  const trimmed = (props.unitPrice ?? '').trim()
  if (!trimmed) return false
  return !isValidPositiveDecimal(trimmed)
})

const isLineExhausted = computed(() => {
  try {
    return new Decimal(props.line.remainingQuantity ?? '0').lte(0)
  } catch {
    return false
  }
})

const sourceLabel = computed(() => {
  switch (props.line.invoiceDisplayNameSource) {
    case 'buyer':
      return 'Người mua hàng đề xuất'
    case 'engineer':
      return 'Kỹ sư đề xuất'
    case 'canonical':
    default:
      return 'Tên vật tư chuẩn'
  }
})

const exceedsRemaining = computed(() => {
  const allocTrimmed = (props.allocationQuantity ?? '').trim()
  if (!allocTrimmed || !isValidPositiveDecimal(allocTrimmed)) return false
  try {
    return new Decimal(allocTrimmed).gt(props.line.remainingQuantity)
  } catch {
    return false
  }
})

const comparisonResult = computed(() => {
  const allocTrimmed = (props.allocationQuantity ?? '').trim()
  const quoteTrimmed = (props.quotedQuantity ?? '').trim()

  if (!isValidPositiveDecimal(allocTrimmed) || !isValidPositiveDecimal(quoteTrimmed)) {
    return null
  }

  try {
    return compareMaterialQuotation({
      proposalLineId: props.line.lineId,
      allocationQuantity: allocTrimmed,
      quotedQuantity: quoteTrimmed,
    })
  } catch {
    return null
  }
})

const hasDisagreement = computed(() => {
  if (!comparisonResult.value) return false
  return !comparisonResult.value.matchesAllocation
})

const hasInputToCompare = computed(() => {
  return Boolean(
    (props.quotationMaterialName ?? '').trim() ||
    (props.quotedQuantity ?? '').trim() ||
    (props.allocationQuantity ?? '').trim() ||
    (props.unitPrice ?? '').trim()
  )
})

const canConfirm = computed(() => {
  if (props.disabled || isLineExhausted.value) return false
  const nameTrimmed = (props.quotationMaterialName ?? '').trim()
  const allocTrimmed = (props.allocationQuantity ?? '').trim()
  const quoteTrimmed = (props.quotedQuantity ?? '').trim()
  const priceTrimmed = (props.unitPrice ?? '').trim()

  if (!nameTrimmed) return false
  if (!isValidPositiveDecimal(allocTrimmed)) return false
  if (!isValidPositiveDecimal(quoteTrimmed)) return false
  if (!isValidPositiveDecimal(priceTrimmed)) return false
  if (exceedsRemaining.value) return false
  if (!comparisonResult.value || !comparisonResult.value.matchesAllocation) return false
  return true
})

const lineTotalEstimate = computed(() => {
  const allocTrimmed = (props.allocationQuantity ?? '').trim()
  const priceTrimmed = (props.unitPrice ?? '').trim()
  if (!isValidPositiveDecimal(allocTrimmed) || !isValidPositiveDecimal(priceTrimmed)) return null
  try {
    return new Decimal(allocTrimmed).times(priceTrimmed).toFixed(4)
  } catch {
    return null
  }
})

function onUpdateQuotationMaterialName(event: Event) {
  const val = (event.target as HTMLInputElement).value
  emit('update:quotationMaterialName', val)
  if (props.mappingConfirmed) {
    emit('update:mappingConfirmed', false)
  }
}

function onUpdateQuotedQuantity(event: Event) {
  const val = (event.target as HTMLInputElement).value
  emit('update:quotedQuantity', val)
  if (props.mappingConfirmed) {
    emit('update:mappingConfirmed', false)
  }
}

function onUpdateAllocationQuantity(event: Event) {
  const val = (event.target as HTMLInputElement).value
  emit('update:allocationQuantity', val)
  if (props.mappingConfirmed) {
    emit('update:mappingConfirmed', false)
  }
}

function onUpdateUnitPrice(event: Event) {
  const val = (event.target as HTMLInputElement).value
  emit('update:unitPrice', val)
  if (props.mappingConfirmed) {
    emit('update:mappingConfirmed', false)
  }
}

function onToggleConfirm(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  if (checked && !canConfirm.value) {
    emit('update:mappingConfirmed', false)
    return
  }
  emit('update:mappingConfirmed', checked)
}
</script>

<style scoped>
.quotation-comparison-row {
  padding: 14px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.quotation-comparison-row--confirmed {
  border-color: #a7f3d0;
  background: #f0fdf4;
}

.quotation-comparison-row--disagreement {
  border-color: #fecdd3;
  background: #fff1f2;
}

.quotation-comparison-row--disabled {
  opacity: 0.7;
}

.line-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.quantity-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 0.75rem;
}

.stat-pill--remaining {
  background: #f0f9ff;
  border-color: #bae6fd;
}

.stat-label {
  color: #64748b;
}

.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 4px;
}

.field-hint {
  display: block;
  margin-top: 3px;
}

.cockpit-input {
  padding: 7px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #0f172a;
  background: #ffffff;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.cockpit-input:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
}

.cockpit-input:disabled {
  background: #f1f5f9;
  cursor: not-allowed;
  opacity: 0.7;
}

.cockpit-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.cockpit-badge--neutral {
  background: #f1f5f9;
  color: #475569;
}

.cockpit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s ease;
}

.cockpit-btn--secondary {
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.cockpit-btn--secondary:hover:not(:disabled) {
  background: #f8fafc;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 0.78rem;
}
</style>
