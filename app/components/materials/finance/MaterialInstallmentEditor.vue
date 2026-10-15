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
              :value="isLast(index) ? effectivePercent(index) : row.percent"
              :readonly="isLast(index)"
              :disabled="disabled"
              :aria-label="`Tỷ lệ đợt ${index + 1}`"
              @input="patchRow(index, { percent: inputValue($event) })"
            >
          </template>
          <template v-else>
            <label :for="fieldId(row, 'amount')" class="field-label">Số tiền</label>
            <input
              :id="fieldId(row, 'amount')"
              class="cockpit-input"
              type="text"
              inputmode="decimal"
              :value="row.amount"
              :disabled="disabled"
              :aria-label="`Số tiền đợt ${index + 1}`"
              @input="patchRow(index, { amount: inputValue($event) })"
            >
          </template>
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

<script lang="ts">
import { computed, watch } from 'vue'
import Decimal from 'decimal.js'
import { ClientError } from '../../../errors/client-error'
import { formatMaterialQuantity } from '../../../utils/materials/quantity-display'
import { splitInstallments } from '../../../utils/materials/installment-split'

export interface InstallmentRow {
  installmentKey: string
  name: string
  mode: 'percent' | 'amount'
  percent: string
  amount: string
  dueOn: string
  isAdvance: boolean
}

export interface ResolvedInstallment {
  installmentKey: string
  name: string
  amount: string
  dueOn: string
  isAdvance: boolean
}

export interface InstallmentEditorResult {
  installments: ResolvedInstallment[]
  issues: string[]
}

export function createInstallmentRow(overrides: Partial<InstallmentRow> = {}): InstallmentRow {
  return {
    installmentKey: crypto.randomUUID(),
    name: '',
    mode: 'percent',
    percent: '',
    amount: '',
    dueOn: '',
    isAdvance: false,
    ...overrides,
  }
}

/**
 * Keeps one idempotency key per distinct payload: a retry of the same payload
 * reuses the key, a changed payload gets a new one.
 */
export function createCommandKeyKeeper() {
  let last: { signature: string, key: string } | null = null
  return {
    keyFor(payload: unknown): string {
      const signature = JSON.stringify(payload)
      if (!last || last.signature !== signature) last = { signature, key: crypto.randomUUID() }
      return last.key
    },
    reset() {
      last = null
    },
  }
}

const contractErrorMessages: Record<string, string> = {
  VARIANCE_REASON_REQUIRED: 'Giá trị trước VAT khác tổng đơn, vui lòng nhập lý do chênh lệch.',
  CONTRACT_TOTAL_MISMATCH: 'Tổng giá trị phải bằng giá trị trước VAT cộng VAT.',
  INSTALLMENT_TOTAL_MISMATCH: 'Tổng các đợt thanh toán phải bằng tổng giá trị hợp đồng.',
  CONTRACT_EXISTS: 'Đơn này đã có hợp đồng. Vui lòng tải lại trang để xem hợp đồng hiện hành.',
  ORDER_NOT_ACTIVE: 'Đơn mua không còn hoạt động nên không thể ghi hợp đồng.',
  AMENDMENT_BELOW_COMMITTED: 'Phụ lục làm một đợt thấp hơn số đã chi hoặc đang đề nghị chi.',
  INVOICE_TOTAL_EXCEEDED: 'Tổng hóa đơn đã nhận vượt giá trị hợp đồng mới.',
  EVIDENCE_INVALID: 'Tệp đính kèm không hợp lệ hoặc chưa tải lên hoàn tất. Vui lòng chọn lại tệp.',
  VERSION_CONFLICT: 'Dữ liệu đã thay đổi, vui lòng tải lại',
  PERMISSION_DENIED: 'Bạn không có quyền thực hiện thao tác này.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu trùng với một thao tác khác có nội dung khác. Vui lòng kiểm tra và thử lại.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng bấm lưu lại để thử tiếp với đúng nội dung này.',
}

export function describeContractError(err: unknown): { code: string | null, message: string } {
  const code = err instanceof ClientError
    ? err.code
    : (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : null)
  const mapped = code ? contractErrorMessages[code] : undefined
  if (mapped) return { code, message: mapped }
  const message = err instanceof Error && err.message ? err.message : 'Không thể hoàn tất thao tác. Vui lòng thử lại.'
  return { code, message }
}

export const MAX_INSTALLMENT_ROWS = 50
</script>

<script setup lang="ts">
interface Props {
  modelValue: InstallmentRow[]
  /** Contract total (decimal string). Empty or invalid means amounts cannot be computed yet. */
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
const amountPattern = /^\d{1,16}(\.\d{1,4})?$/
const percentPattern = /^\d{1,3}(\.\d{1,6})?$/

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
  return new Decimal(floor).greaterThan(0) ? floor : null
}

function floorLabel(row: InstallmentRow) {
  const floor = floorFor(row)
  return floor === null ? '' : formatMaterialQuantity(new Decimal(floor).toFixed(4))
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
  if (!amountPattern.test(value)) return null
  const parsed = new Decimal(value)
  return parsed.greaterThan(0) ? parsed : null
})

/** Evaluates every row to a 4-decimal amount; the last percent row absorbs rounding. */
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
      const percent = row.percent.trim()
      if (index === last) return { percent: '0' }
      if (!percentPattern.test(percent) || new Decimal(percent).greaterThan(100)) {
        issues.push(`${label}: tỷ lệ phải là số từ 0 đến 100.`)
        return { percent: '0' }
      }
      return { percent }
    }
    const amount = row.amount.trim()
    if (!amountPattern.test(amount)) {
      issues.push(`${label}: số tiền không hợp lệ.`)
      return { amount: '0' }
    }
    return { amount }
  })

  // splitInstallments always lets the final element absorb the difference. It is
  // used for every row except a fixed-amount last row, which keeps its own value.
  const lastRow = rows.value[last]
  const split = splitInstallments(total.toFixed(4), parts)
  rows.value.forEach((_, index) => {
    amounts[index] = new Decimal(split[index] ?? '0')
  })
  if (lastRow && lastRow.mode === 'amount' && parts[last]?.amount !== undefined) {
    amounts[last] = new Decimal(parts[last].amount ?? '0').toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
  }

  const sum = amounts.reduce<Decimal>((acc, value) => acc.plus(value ?? 0), new Decimal(0))

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
      ? `Tổng các đợt còn thiếu ${formatMaterialQuantity(total.minus(sum).toFixed(4))}.`
      : `Tổng các đợt đang dư ${formatMaterialQuantity(sum.minus(total).toFixed(4))}.`)
  }
  return { amounts, issues, sum }
})

const result = computed<InstallmentEditorResult>(() => ({
  installments: rows.value.map((row, index) => ({
    installmentKey: row.installmentKey,
    name: row.name.trim(),
    amount: (evaluation.value.amounts[index] ?? new Decimal(0)).toFixed(4),
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
  return amount ? formatMaterialQuantity(amount.toFixed(4)) : '—'
}

function effectivePercent(index: number) {
  const amount = evaluation.value.amounts[index]
  const total = totalDecimal.value
  if (!amount || !total) return ''
  return formatMaterialQuantity(amount.dividedBy(total).times(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4))
}

const totalLabel = computed(() => totalDecimal.value ? formatMaterialQuantity(totalDecimal.value.toFixed(4)) : '—')
const sumLabel = computed(() => evaluation.value.sum ? formatMaterialQuantity(evaluation.value.sum.toFixed(4)) : '—')

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
    ? `Còn thiếu ${formatMaterialQuantity(delta.toFixed(4))}`
    : `Dư ${formatMaterialQuantity(delta.abs().toFixed(4))}`
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
  patchRow(index, { amount: formatMaterialQuantity(amount.plus(delta).toFixed(4)) })
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
