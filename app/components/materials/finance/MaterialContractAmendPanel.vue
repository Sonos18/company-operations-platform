<template>
  <section class="cockpit-card amend-panel" role="region" aria-label="Phụ lục hợp đồng" data-testid="contract-amend-panel">
    <header class="amend-head">
      <div>
        <h3 class="amend-title">Phụ lục hợp đồng</h3>
        <p class="amend-desc">Thay đổi giá trị hoặc lịch thanh toán bằng phụ lục. Mỗi phụ lục tạo một phiên bản mới.</p>
      </div>
      <button
        v-if="!open"
        type="button"
        class="cockpit-btn cockpit-btn--outline"
        @click="openForm"
      >
        <UIcon name="i-lucide-file-plus" aria-hidden="true" />
        Thêm phụ lục
      </button>
    </header>

    <form v-if="open" class="amend-form" novalidate @submit.prevent="save">
      <div class="grid-2">
        <div class="field">
          <label class="field-label" for="amendment-file">Phụ lục đã ký (PDF)</label>
          <input
            id="amendment-file"
            class="cockpit-input"
            type="file"
            accept="application/pdf,.pdf"
            :disabled="busy"
            @change="onFileChange"
          >
          <p v-if="slot.fileId" class="field-hint field-hint--ok">Đã tải lên: {{ slot.file?.name }}</p>
        </div>
        <div class="field">
          <label class="field-label" for="amendment-reason">Lý do phụ lục</label>
          <textarea
            id="amendment-reason"
            v-model="reason"
            class="cockpit-textarea"
            rows="2"
            maxlength="1000"
            :disabled="busy"
          />
        </div>
      </div>

      <div class="grid-4">
        <div class="field">
          <label class="field-label" for="amendment-order-subtotal">Tổng đơn (đối chiếu)</label>
          <input
            id="amendment-order-subtotal"
            class="cockpit-input"
            type="text"
            readonly
            :value="orderSubtotalLabel"
          >
        </div>
        <div class="field">
          <label class="field-label" for="amendment-subtotal">Trước VAT mới</label>
          <input id="amendment-subtotal" v-model="subtotal" class="cockpit-input" type="text" inputmode="decimal" :disabled="busy">
        </div>
        <div class="field">
          <label class="field-label" for="amendment-vat">VAT mới</label>
          <input id="amendment-vat" v-model="vatAmount" class="cockpit-input" type="text" inputmode="decimal" :disabled="busy">
        </div>
        <div class="field">
          <label class="field-label" for="amendment-total">Tổng giá trị mới</label>
          <input
            id="amendment-total"
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

      <p v-if="totalMismatch" class="field-error" role="alert">Tổng giá trị phải bằng giá trị trước VAT cộng VAT.</p>

      <div v-if="varianceNeeded" class="field">
        <label class="field-label" for="amendment-variance">Lý do chênh lệch</label>
        <textarea
          id="amendment-variance"
          v-model="varianceReason"
          class="cockpit-textarea"
          rows="2"
          maxlength="1000"
          :disabled="busy"
          aria-required="true"
        />
        <p class="field-hint">Giá trị trước VAT khác tổng đơn ({{ orderSubtotalLabel }}), cần ghi rõ lý do.</p>
      </div>

      <MaterialInstallmentEditor
        v-model="rows"
        :total="total"
        :floors="floors"
        :disabled="busy"
        :default-due-on="contract.signedOn"
        @resolved="resolved = $event"
      />

      <ul v-if="submitAttempted && panelIssues.length" class="field-error issue-list" role="alert">
        <li v-for="issue in panelIssues" :key="issue">{{ issue }}</li>
      </ul>

      <div v-if="actionError" class="cockpit-alert-danger" role="alert" data-testid="amend-error">
        {{ actionError }}
        <button v-if="needsReload" type="button" class="link-btn" @click="emit('refresh')">Tải lại</button>
      </div>

      <footer class="panel-actions">
        <button type="button" class="cockpit-btn cockpit-btn--ghost" :disabled="busy" @click="closeForm">Hủy</button>
        <button type="submit" class="cockpit-btn cockpit-btn--primary" :disabled="busy">
          <UIcon v-if="busy" name="i-lucide-loader-circle" class="animate-spin" aria-hidden="true" />
          {{ busy ? 'Đang lưu...' : 'Lưu phụ lục' }}
        </button>
      </footer>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import Decimal from 'decimal.js'
import type {
  MaterialEvidenceIntentInput,
  MaterialEvidenceRole,
} from '../../../../shared/schemas/costs/material-procurement'
import {
  amendMaterialContractInputSchema,
  type MaterialContractView,
} from '../../../../shared/schemas/costs/material-finance'
import { formatMaterialQuantity } from '../../../utils/materials/quantity-display'
import { uploadMaterialEvidence, type MaterialEvidenceUploadSession } from '../../../utils/costs/material-evidence-uploader'
import MaterialInstallmentEditor, {
  createCommandKeyKeeper,
  describeContractError,
  type InstallmentEditorResult,
  type InstallmentRow,
} from './MaterialInstallmentEditor.vue'

interface Props {
  companyId: string
  projectId: string
  contract: MaterialContractView
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const supabaseClient = nuxtApp.$supabaseClient
const procurementRepo = useRepositories().materialProcurement
const financeRepo = useRepositories().materialFinance

const moneyPattern = /^\d{1,16}(\.\d{1,4})?$/
const keyKeeper = createCommandKeyKeeper()
let disposed = false
onBeforeUnmount(() => { disposed = true })

const open = ref(false)
const busy = ref(false)
const submitAttempted = ref(false)
const actionError = ref('')
const needsReload = ref(false)

const slot = reactive<{ file: File | null, fingerprint: string, session: MaterialEvidenceUploadSession | null, fileId: string | null }>({
  file: null, fingerprint: '', session: null, fileId: null,
})
const reason = ref('')
const subtotal = ref('')
const vatAmount = ref('')
const total = ref('')
const totalTouched = ref(false)
const varianceReason = ref('')
const rows = ref<InstallmentRow[]>([])
const resolved = ref<InstallmentEditorResult>({ installments: [], issues: [] })

function parseMoney(value: string): Decimal | null {
  const trimmed = value.trim()
  return moneyPattern.test(trimmed) ? new Decimal(trimmed) : null
}

const currentVersion = computed(() =>
  props.contract.versions.find(version => version.versionNo === props.contract.currentVersionNo)
  ?? props.contract.versions[props.contract.versions.length - 1])

const orderSubtotal = computed(() => new Decimal(currentVersion.value?.orderSubtotalSnapshot ?? '0'))
const orderSubtotalLabel = computed(() => `${formatMaterialQuantity(orderSubtotal.value.toFixed(4))} ${props.contract.currencyCode}`)

/** Paid plus pending per installment: the amendment may neither delete nor go below it. */
const floors = computed<Record<string, string>>(() => Object.fromEntries(
  props.contract.installments.map(item => [item.installmentKey, new Decimal(item.paid).plus(item.pending).toFixed(4)]),
))

const subtotalDecimal = computed(() => parseMoney(subtotal.value))
const vatDecimal = computed(() => parseMoney(vatAmount.value))
const totalDecimal = computed(() => parseMoney(total.value))
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

function openForm() {
  const version = currentVersion.value
  slot.file = null
  slot.fingerprint = ''
  slot.session = null
  slot.fileId = null
  reason.value = ''
  varianceReason.value = version?.varianceReason ?? ''
  subtotal.value = version ? formatMaterialQuantity(version.subtotal) : ''
  vatAmount.value = version ? formatMaterialQuantity(version.vatAmount) : ''
  total.value = version ? formatMaterialQuantity(version.total) : ''
  totalTouched.value = false
  rows.value = [...props.contract.installments]
    .sort((a, b) => a.seq - b.seq)
    .map(item => ({
      installmentKey: item.installmentKey,
      name: item.name,
      mode: 'amount' as const,
      percent: '',
      amount: formatMaterialQuantity(item.amount),
      dueOn: item.dueOn,
      isAdvance: item.isAdvance,
    }))
  submitAttempted.value = false
  actionError.value = ''
  needsReload.value = false
  keyKeeper.reset()
  open.value = true
}

function closeForm() {
  if (busy.value) return
  open.value = false
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  const fingerprint = file ? `${file.name}:${file.size}:${file.lastModified}` : ''
  if (file && fingerprint === slot.fingerprint) return
  slot.file = file
  slot.fingerprint = fingerprint
  slot.session = null
  slot.fileId = null
}

const issues = computed(() => {
  const list: string[] = []
  if (!slot.file) list.push('Chưa chọn file phụ lục (PDF).')
  if (!reason.value.trim()) list.push('Chưa nhập lý do phụ lục.')
  if (!subtotalDecimal.value || !subtotalDecimal.value.greaterThan(0)) list.push('Giá trị trước VAT phải là số lớn hơn 0.')
  if (!vatDecimal.value) list.push('Chưa nhập VAT (nhập 0 nếu không có).')
  if (!totalDecimal.value || !totalDecimal.value.greaterThan(0)) list.push('Tổng giá trị phải là số lớn hơn 0.')
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

async function ensureUploaded(): Promise<string> {
  if (slot.fileId) return slot.fileId
  if (!slot.file) throw new Error('Chưa chọn tệp.')
  const result = await uploadMaterialEvidence({
    companyId: props.companyId,
    projectId: props.projectId,
    file: slot.file,
    // The contract-amendment role and the material_contract target are added to the
    // evidence schema by the evidence-policy task (Task 4); until it merges the local
    // union does not list them, so this single call site is cast to the schema type.
    evidenceRole: 'contract_amendment' as unknown as MaterialEvidenceRole,
    target: { kind: 'material_contract', contractId: props.contract.id } as unknown as MaterialEvidenceIntentInput['target'],
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
    const amendmentFileId = await ensureUploaded()
    if (!isScopeCurrent()) return

    const parsed = amendMaterialContractInputSchema.safeParse({
      expectedVersion: props.contract.version,
      amendmentFileId,
      reason: reason.value.trim(),
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

    await financeRepo.amendContract(props.projectId, props.contract.id, parsed.data, {
      idempotencyKey: keyKeeper.keyFor(parsed.data),
    })
    if (isScopeCurrent()) {
      open.value = false
      emit('refresh')
    }
  }
  catch (err: unknown) {
    if (!isScopeCurrent()) return
    const described = describeContractError(err)
    actionError.value = described.message
    needsReload.value = described.code === 'VERSION_CONFLICT'
    if (described.code === 'EVIDENCE_INVALID') {
      slot.fileId = null
      slot.session = null
    }
  }
  finally {
    if (!disposed) busy.value = false
  }
}
</script>

<style scoped>
.amend-panel { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.amend-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.amend-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #0f172a; }
.amend-desc { margin: 2px 0 0; font-size: 0.82rem; color: #64748b; }
.amend-form { display: flex; flex-direction: column; gap: 16px; }
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
.panel-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 860px) {
  .grid-2, .grid-4 { grid-template-columns: minmax(0, 1fr); }
}
</style>
