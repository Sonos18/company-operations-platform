<template>
  <section
    class="cockpit-card record-panel"
    role="region"
    :aria-label="isQuotationOnly ? 'Ghi nhận đơn mua không hợp đồng' : 'Ghi nhận hợp đồng mua hàng'"
    data-testid="contract-record-panel"
  >
    <header class="panel-head">
      <UIcon name="i-lucide-file-signature" class="text-sky-600 text-xl shrink-0" aria-hidden="true" />
      <div>
        <h3 class="panel-title">{{ isQuotationOnly ? 'Ghi nhận đơn không hợp đồng' : 'Ghi nhận hợp đồng' }}</h3>
        <p class="panel-desc">
          {{ isQuotationOnly
            ? 'Tải báo giá có chữ ký và nhập giá trị đơn. Hệ thống tạo một đợt thanh toán 100%.'
            : 'Tải hợp đồng và báo giá đã ký với nhà cung cấp, nhập giá trị và lịch thanh toán các đợt.' }}
        </p>
      </div>
    </header>

    <div v-if="canRecordWithout" class="field mode-field" role="radiogroup" aria-label="Hình thức ghi nhận">
      <span class="field-label">Hình thức ghi nhận</span>
      <div class="mode-options">
        <label class="mode-option">
          <input
            v-model="documentationMode"
            type="radio"
            name="documentation-mode"
            value="contract"
            :disabled="busy"
            data-testid="mode-contract"
          >
          <span>Có hợp đồng</span>
        </label>
        <label class="mode-option">
          <input
            v-model="documentationMode"
            type="radio"
            name="documentation-mode"
            value="quotation_only"
            :disabled="busy"
            data-testid="mode-quotation-only"
          >
          <span>Không có hợp đồng</span>
        </label>
      </div>
    </div>

    <div class="grid-2">
      <div v-if="!isQuotationOnly" class="field">
        <label class="field-label" for="contract-file">Hợp đồng đã ký (PDF)</label>
        <input
          id="contract-file"
          class="cockpit-input"
          type="file"
          accept="application/pdf,.pdf"
          :disabled="busy"
          @change="contractSlot.selectFile(pickedFile($event))"
        >
        <p v-if="contractSlot.state.fileId" class="field-hint field-hint--ok">Đã tải lên: {{ contractSlot.state.file?.name }}</p>
      </div>
      <div class="field">
        <label class="field-label" for="quotation-file">
          {{ isQuotationOnly ? 'Báo giá có chữ ký' : 'Báo giá có chữ ký (PDF)' }}
        </label>
        <input
          id="quotation-file"
          ref="quotationFileInput"
          class="cockpit-input"
          type="file"
          :accept="isQuotationOnly ? '.pdf,.jpg,.jpeg,.png' : 'application/pdf,.pdf'"
          :disabled="busy"
          @change="quotationSlot.selectFile(pickedFile($event))"
        >
        <p v-if="isQuotationOnly" class="field-hint">Báo giá có ít nhất chữ ký bên bán</p>
        <p v-if="quotationSlot.state.fileId" class="field-hint field-hint--ok">Đã tải lên: {{ quotationSlot.state.file?.name }}</p>
      </div>
      <div v-if="!isQuotationOnly" class="field">
        <label class="field-label" for="contract-no">Số hợp đồng</label>
        <input id="contract-no" v-model="contractNo" class="cockpit-input" type="text" maxlength="100" :disabled="busy">
      </div>
      <div class="field">
        <label class="field-label" for="contract-signed-on">{{ isQuotationOnly ? 'Ngày ghi nhận' : 'Ngày ký' }}</label>
        <input id="contract-signed-on" v-model="signedOn" class="cockpit-input" type="date" :disabled="busy">
      </div>
    </div>

    <div :class="isQuotationOnly ? 'grid-2' : 'grid-4'">
      <div class="field">
        <label class="field-label" for="order-subtotal">Tổng đơn (đối chiếu)</label>
        <input
          id="order-subtotal"
          class="cockpit-input"
          type="text"
          readonly
          :value="orderSubtotalLabel"
          data-testid="order-subtotal"
        >
      </div>
      <MaterialMoneyInput
        id="contract-subtotal"
        label="Trước VAT"
        test-id="contract-subtotal"
        :model-value="money.subtotal.value"
        :disabled="busy"
        @update:model-value="money.setSubtotal"
      />
      <template v-if="!isQuotationOnly">
        <MaterialMoneyInput
          id="contract-vat"
          label="VAT"
          test-id="contract-vat"
          :model-value="money.vatAmount.value"
          :disabled="busy"
          @update:model-value="money.setVatAmount"
        />
        <div class="field">
          <MaterialMoneyInput
            id="contract-total"
            label="Tổng giá trị hợp đồng"
            test-id="contract-total"
            :model-value="money.total.value"
            :disabled="busy"
            @update:model-value="money.setTotal"
          />
          <p class="field-hint">
            <template v-if="money.totalTouched.value">
              Đã sửa tay.
              <button type="button" class="link-btn" @click="money.resetTotal">Tự tính lại</button>
            </template>
            <template v-else>Tự tính từ trước VAT + VAT.</template>
          </p>
        </div>
      </template>
    </div>

    <p v-if="!isQuotationOnly && money.totalMismatch.value" class="field-error" role="alert">
      Tổng giá trị phải bằng giá trị trước VAT cộng VAT.
    </p>

    <div v-if="money.varianceNeeded.value" class="field">
      <label class="field-label" for="variance-reason">Lý do chênh lệch</label>
      <textarea
        id="variance-reason"
        v-model="money.varianceReason.value"
        class="cockpit-textarea"
        rows="2"
        maxlength="1000"
        :disabled="busy"
        aria-required="true"
      />
      <p class="field-hint">
        Giá trị trước VAT ({{ subtotalLabel }}) khác tổng đơn ({{ orderSubtotalLabel }}), cần ghi rõ lý do.
      </p>
    </div>

    <p v-if="isQuotationOnly" class="summary-line" data-testid="quotation-only-summary">
      VAT 0 · Thanh toán 100% · Tổng {{ quotationOnlyTotalLabel }}
    </p>

    <MaterialInstallmentEditor
      v-else
      v-model="rows"
      :total="money.totalCanonical.value"
      :disabled="busy"
      :default-due-on="signedOn"
      @resolved="resolved = $event"
    />

    <ul v-if="submitAttempted && panelIssues.length" class="field-error issue-list" role="alert">
      <li v-for="issue in panelIssues" :key="issue">{{ issue }}</li>
    </ul>

    <div v-if="actionError" class="cockpit-alert-danger" role="alert" data-testid="record-error">
      {{ actionError }}
      <button v-if="needsReload" type="button" class="link-btn" @click="emit('refresh')">Tải lại</button>
    </div>

    <footer class="panel-actions">
      <button
        type="button"
        class="cockpit-btn cockpit-btn--primary"
        :disabled="busy"
        @click="save"
      >
        <UIcon v-if="busy" name="i-lucide-loader-circle" class="animate-spin" aria-hidden="true" />
        {{ busy ? 'Đang lưu...' : isQuotationOnly ? 'Lưu ghi nhận' : 'Lưu hợp đồng' }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { MaterialOrderView } from '../../../../shared/schemas/costs/material-procurement'
import { recordMaterialContractInputSchema } from '../../../../shared/schemas/costs/material-finance'
import { createCommandKeyKeeper } from '../../../utils/materials/command-key'
import { useContractMoneyFields } from '../../../utils/materials/contract-money-fields'
import { describeContractError } from '../../../utils/materials/contract-errors'
import { createEvidenceUploadSlot } from '../../../utils/materials/evidence-upload-slot'
import { createInstallmentRow, type InstallmentEditorResult, type InstallmentRow } from '../../../utils/materials/installment-rows'
import { computeOrderSubtotal } from '../../../utils/materials/order-subtotal'
import { formatVnNumber, parseVnMoney } from '../../../utils/materials/vn-number'
import { canRecordWithoutContract } from '../../../utils/materials/contract-record-mode'
import MaterialInstallmentEditor from './MaterialInstallmentEditor.vue'
import MaterialMoneyInput from './MaterialMoneyInput.vue'

interface Props {
  companyId: string
  projectId: string
  order: MaterialOrderView
}

const props = defineProps<Props>()
const emit = defineEmits<(e: 'refresh') => void>()

const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabaseClient = nuxtApp.$supabaseClient
const procurementRepo = useRepositories().materialProcurement
const financeRepo = useRepositories().materialFinance

const keyKeeper = createCommandKeyKeeper()
let disposed = false
onBeforeUnmount(() => { disposed = true })

function isScopeCurrent() {
  return !disposed && companyAccess?.activeCompanyId === props.companyId
}

function uploadContext() {
  return {
    companyId: props.companyId,
    projectId: props.projectId,
    repository: procurementRepo,
    supabaseClient,
    isScopeCurrent,
  }
}

const orderTarget = () => ({ kind: 'material_order' as const, orderId: props.order.id })
const contractSlot = createEvidenceUploadSlot({ evidenceRole: 'signed_contract', target: orderTarget, context: uploadContext })
const quotationSlot = createEvidenceUploadSlot({ evidenceRole: 'signed_quotation', target: orderTarget, context: uploadContext })

const orderSubtotal = computed(() => computeOrderSubtotal(props.order.allocations))
const orderSubtotalLabel = computed(() => `${formatVnNumber(orderSubtotal.value)} ${props.order.currencyCode}`)
const canRecordWithout = computed(() => canRecordWithoutContract(orderSubtotal.value.toFixed(), props.order.currencyCode))
const documentationMode = ref<'contract' | 'quotation_only'>('contract')
const isQuotationOnly = computed(() => canRecordWithout.value && documentationMode.value === 'quotation_only')

const quotationFileInput = ref<HTMLInputElement | null>(null)

// Clear quotation slot and DOM input when switching documentation modes to prevent stale files (e.g. JPG in contract mode).
watch(documentationMode, () => {
  quotationSlot.selectFile(null)
  if (quotationFileInput.value) quotationFileInput.value.value = ''
})

const money = useContractMoneyFields(() => orderSubtotal.value)
const subtotalLabel = computed(() => money.subtotalDecimal.value ? formatVnNumber(money.subtotalDecimal.value) : '—')
const quotationOnlyTotalLabel = computed(() => formatVnNumber(money.subtotalDecimal.value ?? '0'))

const contractNo = ref('')
const signedOn = ref('')
const rows = ref<InstallmentRow[]>([createInstallmentRow({ name: 'Thanh toán 100%', percent: '100' })])
const resolved = ref<InstallmentEditorResult>({ installments: [], issues: [] })

const busy = ref(false)
const submitAttempted = ref(false)
const actionError = ref('')
const needsReload = ref(false)

// Rows still on the signing date follow it when the date changes.
watch(signedOn, (next, previous) => {
  rows.value = rows.value.map(row => (row.dueOn === '' || row.dueOn === previous ? { ...row, dueOn: next } : row))
})

function pickedFile(event: Event) {
  return (event.target as HTMLInputElement).files?.[0] ?? null
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

const issues = computed(() => {
  const list: string[] = []
  if (isQuotationOnly.value) {
    if (!quotationSlot.state.file) list.push('Chưa chọn file báo giá có chữ ký.')
    if (!signedOn.value) list.push('Chưa chọn ngày ghi nhận.')
    if (!money.subtotal.value.trim()) {
      list.push('Chưa nhập giá trị trước VAT.')
    }
    else {
      const parsed = parseVnMoney(money.subtotal.value)
      if (!parsed.ok) {
        list.push(`Trước VAT: ${parsed.message}`)
      }
      else if (money.subtotalDecimal.value && !money.subtotalDecimal.value.greaterThan(0)) {
        list.push('Giá trị trước VAT phải lớn hơn 0.')
      }
    }
    if (money.varianceNeeded.value && !money.varianceReason.value.trim()) {
      list.push('Cần nhập lý do chênh lệch so với tổng đơn.')
    }
  }
  else {
    if (!contractSlot.state.file) list.push('Chưa chọn file hợp đồng đã ký (PDF).')
    if (!quotationSlot.state.file) {
      list.push('Chưa chọn file báo giá có chữ ký (PDF).')
    }
    else if (!isPdfFile(quotationSlot.state.file)) {
      list.push('Báo giá có chữ ký phải là file PDF khi có hợp đồng.')
    }
    if (!contractNo.value.trim()) list.push('Chưa nhập số hợp đồng.')
    if (!signedOn.value) list.push('Chưa chọn ngày ký.')
    list.push(...money.issues.value, ...resolved.value.issues)
  }
  return list
})

// The installment editor already lists its own problems; the panel shows only the rest.
const panelIssues = computed(() => {
  if (isQuotationOnly.value) return issues.value
  return issues.value.filter(issue => !resolved.value.issues.includes(issue))
})

interface EvidenceSlotLike {
  reset: () => void
}

async function submitRecord(buildInput: () => Promise<unknown>, slotsToReset: EvidenceSlotLike[]) {
  busy.value = true
  try {
    const rawInput = await buildInput()
    if (!isScopeCurrent()) return

    const parsed = recordMaterialContractInputSchema.safeParse(rawInput)
    if (!parsed.success) {
      actionError.value = describeContractError({ code: parsed.error.issues[0]?.message }).message
      return
    }

    await financeRepo.recordContract(props.projectId, props.order.id, parsed.data, {
      idempotencyKey: keyKeeper.keyFor(parsed.data),
    })
    if (isScopeCurrent()) emit('refresh')
  }
  catch (err: unknown) {
    if (!isScopeCurrent()) return
    const described = describeContractError(err)
    actionError.value = described.message
    needsReload.value = described.code === 'CONTRACT_EXISTS' || described.code === 'VERSION_CONFLICT'
    if (described.code === 'EVIDENCE_INVALID') {
      for (const slot of slotsToReset) slot.reset()
    }
  }
  finally {
    if (!disposed) busy.value = false
  }
}

async function save() {
  if (busy.value) return
  submitAttempted.value = true
  actionError.value = ''
  needsReload.value = false

  if (isQuotationOnly.value) {
    const subtotalDec = money.subtotalDecimal.value
    if (issues.value.length > 0 || !subtotalDec) return

    await submitRecord(async () => {
      const signedQuotationFileId = await quotationSlot.ensureUploaded()
      return {
        documentation: 'quotation_only',
        expectedOrderVersion: props.order.version,
        signedOn: signedOn.value,
        subtotal: subtotalDec.toFixed(4),
        varianceReason: money.varianceNeeded.value ? money.varianceReason.value.trim() : null,
        signedQuotationFileId,
      }
    }, [quotationSlot])
  }
  else {
    const payload = money.toPayload()
    if (issues.value.length > 0 || !payload) return

    await submitRecord(async () => {
      const contractFileId = await contractSlot.ensureUploaded()
      const signedQuotationFileId = await quotationSlot.ensureUploaded()
      return {
        documentation: 'contract',
        expectedOrderVersion: props.order.version,
        contractNo: contractNo.value.trim(),
        signedOn: signedOn.value,
        contractFileId,
        signedQuotationFileId,
        ...payload,
        installments: resolved.value.installments,
      }
    }, [contractSlot, quotationSlot])
  }
}
</script>

<style scoped>
.record-panel { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.panel-head { display: flex; gap: 10px; align-items: flex-start; }
.panel-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #0f172a; }
.panel-desc { margin: 2px 0 0; font-size: 0.82rem; color: #64748b; }
.mode-field { margin-bottom: 2px; }
.mode-options { display: flex; gap: 16px; align-items: center; }
.mode-option { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 500; color: #1e293b; cursor: pointer; }
.mode-option input { cursor: pointer; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field-label { font-size: 0.78rem; font-weight: 600; color: #334155; }
.field-hint { margin: 0; font-size: 0.74rem; color: #64748b; }
.field-hint--ok { color: #047857; }
.summary-line { margin: 0; padding: 10px 14px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 0.86rem; font-weight: 600; color: #334155; }
.field-error { margin: 0; font-size: 0.8rem; color: #991b1b; }
.issue-list { padding-left: 18px; }
.cockpit-alert-danger { padding: 10px 14px; border-radius: 8px; font-size: 0.86rem; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.link-btn { background: none; border: 0; padding: 0; color: #0369a1; font-weight: 600; cursor: pointer; text-decoration: underline; }
.panel-actions { display: flex; justify-content: flex-end; }
@media (max-width: 860px) {
  .grid-2, .grid-4 { grid-template-columns: minmax(0, 1fr); }
}
</style>
