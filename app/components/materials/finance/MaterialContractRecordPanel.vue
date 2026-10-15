<template>
  <section
    class="cockpit-card record-panel"
    role="region"
    aria-label="Ghi nhận hợp đồng mua hàng"
    data-testid="contract-record-panel"
  >
    <header class="panel-head">
      <UIcon name="i-lucide-file-signature" class="text-sky-600 text-xl shrink-0" aria-hidden="true" />
      <div>
        <h3 class="panel-title">Ghi nhận hợp đồng</h3>
        <p class="panel-desc">
          Tải hợp đồng và báo giá đã ký với nhà cung cấp, nhập giá trị và lịch thanh toán các đợt.
        </p>
      </div>
    </header>

    <div class="grid-2">
      <div class="field">
        <label class="field-label" for="contract-file">Hợp đồng đã ký (PDF)</label>
        <input
          id="contract-file"
          class="cockpit-input"
          type="file"
          accept="application/pdf,.pdf"
          :disabled="busy"
          @change="onFileChange(contractSlot, $event)"
        >
        <p v-if="contractSlot.fileId" class="field-hint field-hint--ok">Đã tải lên: {{ contractSlot.file?.name }}</p>
      </div>
      <div class="field">
        <label class="field-label" for="quotation-file">Báo giá có chữ ký (PDF)</label>
        <input
          id="quotation-file"
          class="cockpit-input"
          type="file"
          accept="application/pdf,.pdf"
          :disabled="busy"
          @change="onFileChange(quotationSlot, $event)"
        >
        <p v-if="quotationSlot.fileId" class="field-hint field-hint--ok">Đã tải lên: {{ quotationSlot.file?.name }}</p>
      </div>
      <div class="field">
        <label class="field-label" for="contract-no">Số hợp đồng</label>
        <input id="contract-no" v-model="contractNo" class="cockpit-input" type="text" maxlength="100" :disabled="busy">
      </div>
      <div class="field">
        <label class="field-label" for="contract-signed-on">Ngày ký</label>
        <input id="contract-signed-on" v-model="signedOn" class="cockpit-input" type="date" :disabled="busy">
      </div>
    </div>

    <div class="grid-4">
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
      <div class="field">
        <label class="field-label" for="contract-subtotal">Trước VAT</label>
        <input
          id="contract-subtotal"
          v-model="subtotal"
          class="cockpit-input"
          type="text"
          inputmode="decimal"
          :disabled="busy"
        >
      </div>
      <div class="field">
        <label class="field-label" for="contract-vat">VAT</label>
        <input
          id="contract-vat"
          v-model="vatAmount"
          class="cockpit-input"
          type="text"
          inputmode="decimal"
          :disabled="busy"
        >
      </div>
      <div class="field">
        <label class="field-label" for="contract-total">Tổng giá trị hợp đồng</label>
        <input
          id="contract-total"
          class="cockpit-input"
          type="text"
          inputmode="decimal"
          :value="total"
          :disabled="busy"
          @input="onTotalInput"
        >
        <p class="field-hint">
          <template v-if="totalTouched">
            Đã sửa tay.
            <button type="button" class="link-btn" @click="resetTotal">Tự tính lại</button>
          </template>
          <template v-else>Tự tính từ trước VAT + VAT.</template>
        </p>
      </div>
    </div>

    <p v-if="totalMismatch" class="field-error" role="alert">
      Tổng giá trị phải bằng giá trị trước VAT cộng VAT.
    </p>

    <div v-if="varianceNeeded" class="field">
      <label class="field-label" for="variance-reason">Lý do chênh lệch</label>
      <textarea
        id="variance-reason"
        v-model="varianceReason"
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

    <MaterialInstallmentEditor
      v-model="rows"
      :total="total"
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
        {{ busy ? 'Đang lưu...' : 'Lưu hợp đồng' }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import Decimal from 'decimal.js'
import type { MaterialOrderView } from '../../../../shared/schemas/costs/material-procurement'
import { recordMaterialContractInputSchema } from '../../../../shared/schemas/costs/material-finance'
import { formatMaterialQuantity } from '../../../utils/materials/quantity-display'
import { uploadMaterialEvidence, type MaterialEvidenceUploadSession } from '../../../utils/costs/material-evidence-uploader'
import MaterialInstallmentEditor, {
  createCommandKeyKeeper,
  createInstallmentRow,
  describeContractError,
  type InstallmentEditorResult,
  type InstallmentRow,
} from './MaterialInstallmentEditor.vue'

interface Props {
  companyId: string
  projectId: string
  order: MaterialOrderView
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'refresh'): void
}>()

interface UploadSlot {
  file: File | null
  fingerprint: string
  session: MaterialEvidenceUploadSession | null
  fileId: string | null
}

const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabaseClient = nuxtApp.$supabaseClient
const procurementRepo = useRepositories().materialProcurement
const financeRepo = useRepositories().materialFinance

const moneyPattern = /^\d{1,16}(\.\d{1,4})?$/
const keyKeeper = createCommandKeyKeeper()
let disposed = false
onBeforeUnmount(() => { disposed = true })

const contractSlot = reactive<UploadSlot>({ file: null, fingerprint: '', session: null, fileId: null })
const quotationSlot = reactive<UploadSlot>({ file: null, fingerprint: '', session: null, fileId: null })

const contractNo = ref('')
const signedOn = ref('')
const subtotal = ref('')
const vatAmount = ref('')
const total = ref('')
const totalTouched = ref(false)
const varianceReason = ref('')
const rows = ref<InstallmentRow[]>([createInstallmentRow({ name: 'Thanh toán 100%', percent: '100' })])
const resolved = ref<InstallmentEditorResult>({ installments: [], issues: [] })

const busy = ref(false)
const submitAttempted = ref(false)
const actionError = ref('')
const needsReload = ref(false)

function parseMoney(value: string): Decimal | null {
  const trimmed = value.trim()
  return moneyPattern.test(trimmed) ? new Decimal(trimmed) : null
}

const orderSubtotal = computed(() => props.order.allocations
  .reduce((acc, line) => acc.plus(new Decimal(line.quantity).times(line.unitPrice)), new Decimal(0))
  .toDecimalPlaces(4, Decimal.ROUND_HALF_UP))

const orderSubtotalLabel = computed(() => `${formatMaterialQuantity(orderSubtotal.value.toFixed(4))} ${props.order.currencyCode}`)
const subtotalDecimal = computed(() => parseMoney(subtotal.value))
const vatDecimal = computed(() => parseMoney(vatAmount.value))
const totalDecimal = computed(() => parseMoney(total.value))
const subtotalLabel = computed(() => subtotalDecimal.value ? formatMaterialQuantity(subtotalDecimal.value.toFixed(4)) : '—')

const varianceNeeded = computed(() => subtotalDecimal.value !== null && !subtotalDecimal.value.equals(orderSubtotal.value))
const totalMismatch = computed(() => Boolean(
  subtotalDecimal.value && vatDecimal.value && totalDecimal.value
  && !subtotalDecimal.value.plus(vatDecimal.value).equals(totalDecimal.value),
))

function autoTotal() {
  const sum = subtotalDecimal.value && vatDecimal.value ? subtotalDecimal.value.plus(vatDecimal.value) : null
  total.value = sum ? formatMaterialQuantity(sum.toFixed(4)) : ''
}

watch([subtotal, vatAmount], () => {
  if (!totalTouched.value) autoTotal()
})

function onTotalInput(event: Event) {
  total.value = (event.target as HTMLInputElement).value
  totalTouched.value = true
}

function resetTotal() {
  totalTouched.value = false
  autoTotal()
}

// Rows still on the signing date follow it when the date changes.
watch(signedOn, (next, previous) => {
  rows.value = rows.value.map(row => (row.dueOn === '' || row.dueOn === previous ? { ...row, dueOn: next } : row))
})

function slotFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function onFileChange(slot: UploadSlot, event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (file && slotFingerprint(file) === slot.fingerprint) return
  slot.file = file
  slot.fingerprint = file ? slotFingerprint(file) : ''
  slot.session = null
  slot.fileId = null
}

const issues = computed(() => {
  const list: string[] = []
  if (!contractSlot.file) list.push('Chưa chọn file hợp đồng đã ký (PDF).')
  if (!quotationSlot.file) list.push('Chưa chọn file báo giá có chữ ký (PDF).')
  if (!contractNo.value.trim()) list.push('Chưa nhập số hợp đồng.')
  if (!signedOn.value) list.push('Chưa chọn ngày ký.')
  if (!subtotalDecimal.value || !subtotalDecimal.value.greaterThan(0)) list.push('Giá trị trước VAT phải là số lớn hơn 0.')
  if (!vatDecimal.value) list.push('Chưa nhập VAT (nhập 0 nếu không có).')
  if (!totalDecimal.value || !totalDecimal.value.greaterThan(0)) list.push('Tổng giá trị hợp đồng phải là số lớn hơn 0.')
  if (totalMismatch.value) list.push('Tổng giá trị phải bằng giá trị trước VAT cộng VAT.')
  if (varianceNeeded.value && !varianceReason.value.trim()) list.push('Cần nhập lý do chênh lệch so với tổng đơn.')
  list.push(...resolved.value.issues)
  return list
})

// The installment editor already lists its own problems; the panel shows only the rest.
const panelIssues = computed(() => issues.value.filter(issue => !resolved.value.issues.includes(issue)))

function isScopeCurrent() {
  return !disposed && companyAccess?.activeCompanyId === props.companyId
}

async function ensureUploaded(slot: UploadSlot, role: 'signed_contract' | 'signed_quotation'): Promise<string> {
  if (slot.fileId) return slot.fileId
  if (!slot.file) throw new Error('Chưa chọn tệp.')
  const result = await uploadMaterialEvidence({
    companyId: props.companyId,
    projectId: props.projectId,
    file: slot.file,
    evidenceRole: role,
    target: { kind: 'material_order', orderId: props.order.id },
    repository: procurementRepo,
    supabaseClient,
    session: slot.session,
    onSessionChange: (session) => { slot.session = session },
    isScopeCurrent,
  })
  slot.fileId = result.evidenceFileId
  return result.evidenceFileId
}

async function save() {
  if (busy.value) return
  submitAttempted.value = true
  actionError.value = ''
  needsReload.value = false
  if (issues.value.length > 0 || !subtotalDecimal.value || !vatDecimal.value || !totalDecimal.value) return

  busy.value = true
  try {
    const contractFileId = await ensureUploaded(contractSlot, 'signed_contract')
    const signedQuotationFileId = await ensureUploaded(quotationSlot, 'signed_quotation')
    if (!isScopeCurrent()) return

    const parsed = recordMaterialContractInputSchema.safeParse({
      expectedOrderVersion: props.order.version,
      contractNo: contractNo.value.trim(),
      signedOn: signedOn.value,
      contractFileId,
      signedQuotationFileId,
      subtotal: subtotalDecimal.value.toFixed(4),
      vatAmount: vatDecimal.value.toFixed(4),
      total: totalDecimal.value.toFixed(4),
      varianceReason: varianceNeeded.value ? varianceReason.value.trim() : null,
      installments: resolved.value.installments,
    })
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
      for (const slot of [contractSlot, quotationSlot]) {
        slot.fileId = null
        slot.session = null
      }
    }
  }
  finally {
    if (!disposed) busy.value = false
  }
}
</script>

<style scoped>
.record-panel { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.panel-head { display: flex; gap: 10px; align-items: flex-start; }
.panel-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #0f172a; }
.panel-desc { margin: 2px 0 0; font-size: 0.82rem; color: #64748b; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field-label { font-size: 0.78rem; font-weight: 600; color: #334155; }
.field-hint { margin: 0; font-size: 0.74rem; color: #64748b; }
.field-hint--ok { color: #047857; }
.field-error { margin: 0; font-size: 0.8rem; color: #991b1b; }
.issue-list { padding-left: 18px; }
.cockpit-alert-danger { padding: 10px 14px; border-radius: 8px; font-size: 0.86rem; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.link-btn { background: none; border: 0; padding: 0; color: #0369a1; font-weight: 600; cursor: pointer; text-decoration: underline; }
.panel-actions { display: flex; justify-content: flex-end; }
@media (max-width: 860px) {
  .grid-2, .grid-4 { grid-template-columns: minmax(0, 1fr); }
}
</style>
