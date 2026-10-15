<template>
  <div class="installment-editor" role="group" aria-label="Lịch thanh toán các đợt">
    <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
      <h4 class="text-sm font-bold text-slate-900 m-0">Lịch thanh toán</h4>
      <button
        type="button"
        class="cockpit-btn cockpit-btn--outline cockpit-btn--sm"
        :disabled="disabled || rows.length >= MAX_ROWS"
        @click="addRow"
      >
        <UIcon name="i-lucide-plus" aria-hidden="true" />
        Thêm đợt
      </button>
    </div>

    <ol class="installment-list" role="list">
      <li
        v-for="(row, index) in rows"
        :key="row.installmentKey"
        class="installment-row"
        :data-testid="`installment-row-${index + 1}`"
      >
        <div class="field field--name">
          <label :for="fieldId(row, 'name')" class="field-label">Tên đợt {{ index + 1 }}</label>
          <input
            :id="fieldId(row, 'name')"
            class="cockpit-input"
            type="text"
            maxlength="200"
            :value="row.name"
            :disabled="disabled"
            :aria-label="`Tên đợt ${index + 1}`"
            @input="patchRow(index, { name: inputValue($event) })"
          >
        </div>

        <div class="field field--mode">
          <label :for="fieldId(row, 'mode')" class="field-label">Cách nhập</label>
          <select
            :id="fieldId(row, 'mode')"
            class="cockpit-select"
            :value="row.mode"
            :disabled="disabled"
            :aria-label="`Cách nhập đợt ${index + 1}`"
            @change="patchRow(index, { mode: inputValue($event) === 'amount' ? 'amount' : 'percent' })"
          >
            <option value="percent">Theo %</option>
            <option value="amount">Số tiền</option>
          </select>
        </div>

        <div class="field field--value">
          <template v-if="row.mode === 'percent'">
            <label :for="fieldId(row, 'percent')" class="field-label">
              {{ isLast(index) ? 'Phần còn lại (%)' : 'Tỷ lệ (%)' }}
            </label>
            <input
              :id="fieldId(row, 'percent')"
              class="cockpit-input"
              type="text"
              inputmode="decimal"
              placeholder="VD: 30 hoặc 33,5"
              :value="isLast(index) ? effectivePercent(index) : row.percent"
              :readonly="isLast(index)"
              :disabled="disabled"
              :aria-label="`Tỷ lệ đợt ${index + 1}`"
              @input="patchRow(index, { percent: inputValue($event) })"
            >
          </template>
          <MaterialMoneyInput
            v-else
            :id="fieldId(row, 'amount')"
            label="Số tiền"
            :aria-label="`Số tiền đợt ${index + 1}`"
            :model-value="row.amount"
            :disabled="disabled"
            @update:model-value="patchRow(index, { amount: $event })"
          />
        </div>

        <div class="field field--resolved">
          <span class="field-label">Thành tiền</span>
          <output class="resolved-amount" :data-testid="`installment-amount-${index + 1}`">
            {{ resolvedAmountLabel(index) }}
          </output>
        </div>

        <div class="field field--due">
          <label :for="fieldId(row, 'due')" class="field-label">Hạn đợt {{ index + 1 }}</label>
          <input
            :id="fieldId(row, 'due')"
            class="cockpit-input"
            type="date"
            :value="row.dueOn"
            :disabled="disabled"
            :aria-label="`Hạn đợt ${index + 1}`"
            @input="patchRow(index, { dueOn: inputValue($event) })"
          >
        </div>

        <div class="field field--advance">
          <label class="advance-check">
            <input
              type="checkbox"
              :checked="row.isAdvance"
              :disabled="disabled"
              :aria-label="`Tạm ứng đợt ${index + 1}`"
              @change="patchRow(index, { isAdvance: checkedValue($event) })"
            >
            <span>Tạm ứng</span>
          </label>
        </div>

        <div class="field field--remove">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--ghost cockpit-btn--sm"
            :disabled="disabled || !canRemove(row)"
            :aria-label="`Xóa đợt ${index + 1}`"
            @click="removeRow(index)"
          >
            <UIcon name="i-lucide-trash-2" aria-hidden="true" />
          </button>
        </div>

        <p v-if="floorFor(row) !== null" class="row-note" :data-testid="`installment-floor-${index + 1}`">
          Đã chi và đang đề nghị {{ floorLabel(row) }}: không thể xóa đợt này hoặc hạ số tiền xuống dưới mức đó.
        </p>
      </li>
    </ol>

    <div class="balance" :class="balanceClass" role="status" data-testid="installment-balance">
      <span>Tổng các đợt: <strong>{{ sumLabel }}</strong></span>
      <span>Tổng hợp đồng: <strong>{{ totalLabel }}</strong></span>
      <span v-if="balanceLabel" class="balance-delta">{{ balanceLabel }}</span>
      <button
        v-if="canBalanceIntoLast"
        type="button"
        class="cockpit-btn cockpit-btn--ghost cockpit-btn--xs"
        :disabled="disabled"
        @click="balanceIntoLast"
      >
        Dồn chênh lệch vào đợt cuối
      </button>
    </div>

    <ul v-if="visibleIssues.length" class="issue-list" role="alert">
      <li v-for="issue in visibleIssues" :key="issue">{{ issue }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import type Decimal from 'decimal.js'
import { MoneyDecimal } from '../../../../shared/utils/money-decimal'
import {
  createInstallmentRow,
  MAX_INSTALLMENT_ROWS,
  type InstallmentEditorResult,
  type InstallmentRow,
} from '../../../utils/materials/installment-rows'
import { splitInstallments } from '../../../utils/materials/installment-split'
import { formatVnNumber, parseVnMoney, parseVnNumber, vnPercentOptions } from '../../../utils/materials/vn-number'
import MaterialMoneyInput from './MaterialMoneyInput.vue'

interface Props {
  modelValue: InstallmentRow[]
  /** Contract total as a canonical decimal string ("110", "1250000.5"). Empty or invalid: amounts cannot be computed yet. */
  total: string
  /** Minimum amount per installment key (paid + pending). Rows with a floor cannot be removed. */
  floors?: Record<string, string>
  disabled?: boolean
  /** Default due date for rows added through "Thêm đợt". */
  defaultDueOn?: string
}

const props = withDefaults(defineProps<Props>(), {
  floors: () => ({}),
  disabled: false,
  defaultDueOn: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', rows: InstallmentRow[]): void
  (e: 'resolved', result: InstallmentEditorResult): void
}>()

const MAX_ROWS = MAX_INSTALLMENT_ROWS
const canonicalPattern = /^\d{1,16}(\.\d{1,4})?$/

const rows = computed(() => props.modelValue)

function isLast(index: number) {
  return index === rows.value.length - 1
}

function fieldId(row: InstallmentRow, field: string) {
  return `inst-${row.installmentKey}-${field}`
}

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function checkedValue(event: Event) {
  return (event.target as HTMLInputElement).checked
}

function patchRow(index: number, patch: Partial<InstallmentRow>) {
  emit('update:modelValue', rows.value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
}

function addRow() {
  emit('update:modelValue', [...rows.value, createInstallmentRow({ dueOn: props.defaultDueOn })])
}

function floorFor(row: InstallmentRow): string | null {
  const floor = props.floors[row.installmentKey]
  if (floor === undefined) return null
  return new MoneyDecimal(floor).greaterThan(0) ? floor : null
}

function floorLabel(row: InstallmentRow) {
  const floor = floorFor(row)
  return floor === null ? '' : formatVnNumber(floor)
}

function canRemove(row: InstallmentRow) {
  return rows.value.length > 1 && floorFor(row) === null
}

function removeRow(index: number) {
  const row = rows.value[index]
  if (!row || !canRemove(row)) return
  emit('update:modelValue', rows.value.filter((_, i) => i !== index))
}

const totalDecimal = computed<Decimal | null>(() => {
  const value = props.total.trim()
  if (!canonicalPattern.test(value)) return null
  const parsed = new MoneyDecimal(value)
  return parsed.greaterThan(0) ? parsed : null
})

/** Evaluates every row to a 4-decimal amount; a last percent row absorbs the rounding difference. */
const evaluation = computed(() => {
  const issues: string[] = []
  const total = totalDecimal.value
  const amounts: Array<Decimal | null> = rows.value.map(() => null)

  if (!total) {
    issues.push('Chưa có tổng giá trị hợp đồng hợp lệ để chia đợt.')
    return { amounts, issues, sum: null as Decimal | null }
  }

  const last = rows.value.length - 1
  const parts = rows.value.map((row, index) => {
    const label = `Đợt ${index + 1}`
    if (row.mode === 'percent') {
      if (index === last) return { percent: '0' }
      const percent = parseVnNumber(row.percent, vnPercentOptions)
      if (!percent.ok) {
        issues.push(`${label}: tỷ lệ không hợp lệ. ${percent.message}`)
        return { percent: '0' }
      }
      if (new MoneyDecimal(percent.value).greaterThan(100)) {
        issues.push(`${label}: tỷ lệ không được lớn hơn 100%.`)
        return { percent: '0' }
      }
      return { percent: percent.value }
    }
    const amount = parseVnMoney(row.amount)
    if (!amount.ok) {
      issues.push(`${label}: số tiền không hợp lệ. ${amount.message}`)
      return { amount: '0' }
    }
    return { amount: amount.value }
  })

  // splitInstallments lets the final element absorb the difference. A fixed-amount last row
  // keeps its own value instead.
  const split = splitInstallments(total.toFixed(4), parts)
  rows.value.forEach((_, index) => {
    amounts[index] = new MoneyDecimal(split[index] ?? '0')
  })
  const lastRow = rows.value[last]
  const lastAmount = parts[last]?.amount
  if (lastRow && lastRow.mode === 'amount' && lastAmount !== undefined) {
    amounts[last] = new MoneyDecimal(lastAmount).toDecimalPlaces(4, MoneyDecimal.ROUND_HALF_UP)
  }

  const sum = amounts.reduce<Decimal>((acc, value) => acc.plus(value ?? 0), new MoneyDecimal(0))

  rows.value.forEach((row, index) => {
    const label = `Đợt ${index + 1}`
    const amount = amounts[index]
    if (!row.name.trim()) issues.push(`${label}: chưa nhập tên đợt.`)
    if (!row.dueOn) issues.push(`${label}: chưa chọn hạn thanh toán.`)
    if (!amount || !amount.greaterThan(0)) issues.push(`${label}: số tiền phải lớn hơn 0.`)
    const floor = floorFor(row)
    if (floor !== null && amount && amount.lessThan(floor)) {
      issues.push(`${label}: không được thấp hơn ${floorLabel(row)} (đã chi và đang đề nghị).`)
    }
  })
  if (!sum.equals(total)) {
    issues.push(sum.lessThan(total)
      ? `Tổng các đợt còn thiếu ${formatVnNumber(total.minus(sum))}.`
      : `Tổng các đợt đang dư ${formatVnNumber(sum.minus(total))}.`)
  }
  return { amounts, issues, sum }
})

const result = computed<InstallmentEditorResult>(() => ({
  installments: rows.value.map((row, index) => ({
    installmentKey: row.installmentKey,
    name: row.name.trim(),
    amount: (evaluation.value.amounts[index] ?? new MoneyDecimal(0)).toFixed(4),
    dueOn: row.dueOn,
    isAdvance: row.isAdvance,
  })),
  issues: evaluation.value.issues,
}))

watch(result, value => emit('resolved', value), { immediate: true })

// The balance line already reports a total mismatch, so only row-level problems are listed.
const visibleIssues = computed(() => evaluation.value.issues.filter(issue => !issue.startsWith('Tổng các đợt')))

function resolvedAmountLabel(index: number) {
  const amount = evaluation.value.amounts[index]
  return amount ? formatVnNumber(amount) : '—'
}

function effectivePercent(index: number) {
  const amount = evaluation.value.amounts[index]
  const total = totalDecimal.value
  if (!amount || !total) return ''
  return formatVnNumber(amount.dividedBy(total).times(100).toDecimalPlaces(4, MoneyDecimal.ROUND_HALF_UP))
}

const totalLabel = computed(() => totalDecimal.value ? formatVnNumber(totalDecimal.value) : '—')
const sumLabel = computed(() => evaluation.value.sum ? formatVnNumber(evaluation.value.sum) : '—')

const balanceDelta = computed(() => {
  const total = totalDecimal.value
  const sum = evaluation.value.sum
  return total && sum ? total.minus(sum) : null
})

const balanceLabel = computed(() => {
  const delta = balanceDelta.value
  if (!delta) return ''
  if (delta.isZero()) return 'Khớp'
  return delta.greaterThan(0)
    ? `Còn thiếu ${formatVnNumber(delta)}`
    : `Dư ${formatVnNumber(delta.abs())}`
})

const balanceClass = computed(() => ({
  'balance--ok': balanceDelta.value?.isZero() === true,
  'balance--bad': balanceDelta.value !== null && !balanceDelta.value.isZero(),
}))

const canBalanceIntoLast = computed(() => {
  const delta = balanceDelta.value
  const lastRow = rows.value[rows.value.length - 1]
  return Boolean(delta && !delta.isZero() && lastRow && lastRow.mode === 'amount')
})

function balanceIntoLast() {
  const delta = balanceDelta.value
  const index = rows.value.length - 1
  const amount = evaluation.value.amounts[index]
  if (!delta || !amount) return
  patchRow(index, { amount: formatVnNumber(amount.plus(delta)) })
}
</script>

<style scoped>
.installment-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.installment-row {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
  padding: 12px;
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 10px;
  background: var(--color-bg-secondary, #f8fafc);
}
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field--name { grid-column: span 4; }
.field--mode { grid-column: span 2; }
.field--value { grid-column: span 2; }
.field--resolved { grid-column: span 2; }
.field--due { grid-column: span 3; }
.field--advance { grid-column: span 2; }
.field--remove { grid-column: span 1; align-items: flex-end; }
.field-label { font-size: 0.74rem; font-weight: 600; color: #475569; }
.resolved-amount {
  display: flex;
  align-items: center;
  min-height: 38px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-weight: 700;
  color: #0f172a;
}
.advance-check { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; font-size: 0.82rem; }
.row-note { grid-column: 1 / -1; margin: 0; font-size: 0.76rem; color: #92400e; }
.balance {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.84rem;
  background: #f1f5f9;
  color: #334155;
}
.balance--ok { background: #ecfdf5; color: #065f46; }
.balance--bad { background: #fef2f2; color: #991b1b; }
.balance-delta { font-weight: 700; }
.issue-list { margin: 8px 0 0; padding-left: 18px; font-size: 0.8rem; color: #991b1b; }
@media (max-width: 860px) {
  .field--name, .field--due { grid-column: span 12; }
  .field--mode, .field--value, .field--resolved { grid-column: span 6; }
  .field--advance { grid-column: span 8; }
  .field--remove { grid-column: span 4; }
}
</style>
