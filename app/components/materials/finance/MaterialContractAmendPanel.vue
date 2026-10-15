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
            @change="amendmentSlot.selectFile(pickedFile($event))"
          >
          <p v-if="amendmentSlot.state.fileId" class="field-hint field-hint--ok">Đã tải lên: {{ amendmentSlot.state.file?.name }}</p>
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
        <MaterialMoneyInput
          id="amendment-subtotal"
          label="Trước VAT mới"
          test-id="amendment-subtotal"
          :model-value="money.subtotal.value"
          :disabled="busy"
          @update:model-value="money.setSubtotal"
        />
        <MaterialMoneyInput
          id="amendment-vat"
          label="VAT mới"
          test-id="amendment-vat"
          :model-value="money.vatAmount.value"
          :disabled="busy"
          @update:model-value="money.setVatAmount"
        />
        <div class="field">
          <MaterialMoneyInput
            id="amendment-total"
            label="Tổng giá trị mới"
            test-id="amendment-total"
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
      </div>

      <p v-if="money.totalMismatch.value" class="field-error" role="alert">Tổng giá trị phải bằng giá trị trước VAT cộng VAT.</p>

      <div v-if="money.varianceNeeded.value" class="field">
        <label class="field-label" for="amendment-variance">Lý do chênh lệch</label>
        <textarea
          id="amendment-variance"
          v-model="money.varianceReason.value"
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
        :total="money.totalCanonical.value"
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
import { computed, onBeforeUnmount, ref } from 'vue'
import Decimal from 'decimal.js'
import {
  amendMaterialContractInputSchema,
  type MaterialContractView,
} from '../../../../shared/schemas/costs/material-finance'
import { createCommandKeyKeeper } from '../../../utils/materials/command-key'
import { useContractMoneyFields } from '../../../utils/materials/contract-money-fields'
import { describeContractError } from '../../../utils/materials/contract-errors'
import { createEvidenceUploadSlot } from '../../../utils/materials/evidence-upload-slot'
import type { InstallmentEditorResult, InstallmentRow } from '../../../utils/materials/installment-rows'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import MaterialInstallmentEditor from './MaterialInstallmentEditor.vue'
import MaterialMoneyInput from './MaterialMoneyInput.vue'

interface Props {
  companyId: string
  projectId: string
  contract: MaterialContractView
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

const amendmentSlot = createEvidenceUploadSlot({
  evidenceRole: 'contract_amendment',
  target: () => ({ kind: 'material_contract' as const, contractId: props.contract.id }),
  context: () => ({
    companyId: props.companyId,
    projectId: props.projectId,
    repository: procurementRepo,
    supabaseClient,
    isScopeCurrent,
  }),
})

const currentVersion = computed(() =>
  props.contract.versions.find(version => version.versionNo === props.contract.currentVersionNo)
  ?? props.contract.versions[props.contract.versions.length - 1])

const orderSubtotal = computed(() => new Decimal(currentVersion.value?.orderSubtotalSnapshot ?? '0'))
const orderSubtotalLabel = computed(() => `${formatVnNumber(orderSubtotal.value)} ${props.contract.currencyCode}`)
const money = useContractMoneyFields(() => orderSubtotal.value)

/** Paid plus pending per installment: the amendment may neither delete nor go below it. */
const floors = computed<Record<string, string>>(() => Object.fromEntries(
  props.contract.installments.map(item => [item.installmentKey, new Decimal(item.paid).plus(item.pending).toFixed(4)]),
))

const open = ref(false)
const busy = ref(false)
const submitAttempted = ref(false)
const actionError = ref('')
const needsReload = ref(false)
const reason = ref('')
const rows = ref<InstallmentRow[]>([])
const resolved = ref<InstallmentEditorResult>({ installments: [], issues: [] })

function pickedFile(event: Event) {
  return (event.target as HTMLInputElement).files?.[0] ?? null
}

function openForm() {
  const version = currentVersion.value
  amendmentSlot.selectFile(null)
  reason.value = ''
  if (version) {
    money.load(version, version.varianceReason)
  }
  rows.value = [...props.contract.installments]
    .sort((a, b) => a.seq - b.seq)
    .map(item => ({
      installmentKey: item.installmentKey,
      name: item.name,
      mode: 'amount' as const,
      percent: '',
      amount: formatVnNumber(item.amount),
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

const issues = computed(() => {
  const list: string[] = []
  if (!amendmentSlot.state.file) list.push('Chưa chọn file phụ lục (PDF).')
  if (!reason.value.trim()) list.push('Chưa nhập lý do phụ lục.')
  list.push(...money.issues.value, ...resolved.value.issues)
  return list
})

// The installment editor already lists its own problems; the panel shows only the rest.
const panelIssues = computed(() => issues.value.filter(issue => !resolved.value.issues.includes(issue)))

async function save() {
  if (busy.value) return
  submitAttempted.value = true
  actionError.value = ''
  needsReload.value = false
  const payload = money.toPayload()
  if (issues.value.length > 0 || !payload) return

  busy.value = true
  try {
    const amendmentFileId = await amendmentSlot.ensureUploaded()
    if (!isScopeCurrent()) return

    const parsed = amendMaterialContractInputSchema.safeParse({
      expectedVersion: props.contract.version,
      amendmentFileId,
      reason: reason.value.trim(),
      ...payload,
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
    if (described.code === 'EVIDENCE_INVALID') amendmentSlot.reset()
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
