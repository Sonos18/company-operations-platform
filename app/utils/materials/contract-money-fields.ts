import { computed, ref } from 'vue'
import type Decimal from 'decimal.js'
import { formatVnNumber, parseVnMoney, parseVnMoneyDecimal } from './vn-number'

interface MoneyValues {
  subtotal: string
  vatAmount: string
  total: string
}

function fieldIssue(label: string, raw: string, missing: string): string | null {
  if (!raw.trim()) return missing
  const parsed = parseVnMoney(raw)
  return parsed.ok ? null : `${label}: ${parsed.message}`
}

/**
 * Subtotal / VAT / total / variance reason fields shared by the contract record and amendment
 * forms. All fields hold the user's raw text (Vietnamese number format); the total follows
 * subtotal + VAT until the user edits it by hand.
 */
export function useContractMoneyFields(orderSubtotal: () => Decimal) {
  const subtotal = ref('')
  const vatAmount = ref('')
  const total = ref('')
  const totalTouched = ref(false)
  const varianceReason = ref('')

  const subtotalDecimal = computed(() => parseVnMoneyDecimal(subtotal.value))
  const vatDecimal = computed(() => parseVnMoneyDecimal(vatAmount.value))
  const totalDecimal = computed(() => parseVnMoneyDecimal(total.value))
  /** Canonical total for the installment editor ("" while the text is not a valid amount). */
  const totalCanonical = computed(() => totalDecimal.value?.toFixed() ?? '')

  const varianceNeeded = computed(() => subtotalDecimal.value !== null && !subtotalDecimal.value.equals(orderSubtotal()))
  const totalMismatch = computed(() => Boolean(
    subtotalDecimal.value && vatDecimal.value && totalDecimal.value
    && !subtotalDecimal.value.plus(vatDecimal.value).equals(totalDecimal.value),
  ))

  function autoTotal() {
    const sum = subtotalDecimal.value && vatDecimal.value ? subtotalDecimal.value.plus(vatDecimal.value) : null
    total.value = sum ? formatVnNumber(sum) : ''
  }

  function setSubtotal(value: string) {
    subtotal.value = value
    if (!totalTouched.value) autoTotal()
  }

  function setVatAmount(value: string) {
    vatAmount.value = value
    if (!totalTouched.value) autoTotal()
  }

  function setTotal(value: string) {
    total.value = value
    totalTouched.value = true
  }

  function resetTotal() {
    totalTouched.value = false
    autoTotal()
  }

  /** Loads canonical decimal strings (from the server) into the form. */
  function load(values: MoneyValues, variance: string | null) {
    subtotal.value = formatVnNumber(values.subtotal)
    vatAmount.value = formatVnNumber(values.vatAmount)
    total.value = formatVnNumber(values.total)
    totalTouched.value = false
    varianceReason.value = variance ?? ''
  }

  const issues = computed(() => {
    const list: string[] = []
    const subtotalIssue = fieldIssue('Trước VAT', subtotal.value, 'Chưa nhập giá trị trước VAT.')
    const vatIssue = fieldIssue('VAT', vatAmount.value, 'Chưa nhập VAT (nhập 0 nếu không có).')
    const totalIssue = fieldIssue('Tổng giá trị', total.value, 'Chưa nhập tổng giá trị.')
    for (const issue of [subtotalIssue, vatIssue, totalIssue]) if (issue) list.push(issue)
    if (subtotalDecimal.value && !subtotalDecimal.value.greaterThan(0)) list.push('Giá trị trước VAT phải lớn hơn 0.')
    if (totalDecimal.value && !totalDecimal.value.greaterThan(0)) list.push('Tổng giá trị phải lớn hơn 0.')
    if (totalMismatch.value) list.push('Tổng giá trị phải bằng giá trị trước VAT cộng VAT.')
    if (varianceNeeded.value && !varianceReason.value.trim()) list.push('Cần nhập lý do chênh lệch so với tổng đơn.')
    return list
  })

  /** Canonical 4-decimal values for the API, or null while any field is invalid. */
  function toPayload() {
    if (!subtotalDecimal.value || !vatDecimal.value || !totalDecimal.value) return null
    return {
      subtotal: subtotalDecimal.value.toFixed(4),
      vatAmount: vatDecimal.value.toFixed(4),
      total: totalDecimal.value.toFixed(4),
      varianceReason: varianceNeeded.value ? varianceReason.value.trim() : null,
    }
  }

  return {
    subtotal,
    vatAmount,
    total,
    totalTouched,
    varianceReason,
    subtotalDecimal,
    totalCanonical,
    varianceNeeded,
    totalMismatch,
    issues,
    setSubtotal,
    setVatAmount,
    setTotal,
    resetTotal,
    load,
    toPayload,
  }
}
