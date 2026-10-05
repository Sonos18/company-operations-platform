<template>
  <div class="cockpit-card payment-modal" role="group" aria-label="Ghi nhận thanh toán đợt chi">
    <div class="header">
      <h4>Ghi nhận thanh toán đợt chi</h4>
      <span class="cockpit-badge">{{ request.currencyCode }}</span>
    </div>
    <div v-if="isCompleted" class="alert info">Dự án đã kết thúc, khoản thanh toán chỉ nhằm mục đích đối soát tất toán hiện hữu.</div>
    <div v-if="!canRecordCash" class="alert error">Bạn không có quyền ghi nhận thanh toán </div>
    <div v-if="errorMessage" class="alert error">{{ errorMessage }}</div>
    <div v-if="request.installment" class="installment-info">
      <p>Hạn mức đợt: <strong>{{ request.installment.authorized }}</strong> | Còn lại: <strong>{{ request.installment.remaining }} {{ request.currencyCode }}</strong></p>
    </div>
    <form @submit.prevent="handleConfirm">
      <div class="grid">
        <label>Số tiền thanh toán * <input v-model="amount" type="text" placeholder="0.00" :disabled="isBusy || commandPending" required ></label>
        <label>Ngày thanh toán * <input v-model="paymentDate" type="date" :disabled="isBusy || commandPending" required ></label>
        <label>Mã / Số tham chiếu * <input v-model="reference" type="text" placeholder="Ủy nhiệm chi / Mã GD" :disabled="isBusy || commandPending" required ></label>
      </div>
      <CostWorkflowOriginalUpload
        v-if="request.installment && !commandPending"
        :company-id="companyId"
        :project-id="projectId"
        :target="{ kind: 'payment', id: request.installment?.id || '' }"
        :allowed-kinds="['payment_proof']"
        @finalized="onProofFinalized"
        @busy="uploadBusy = $event"
      />
      <div class="proof-list">
        <span>Chứng từ thanh toán ({{ proofs.length }}):</span>
        <span v-for="p in proofs" :key="p.id" class="proof-tag">{{ p.name }} <button type="button" :disabled="isBusy || uploadBusy || commandPending" @click="proofs = proofs.filter(x => x.id !== p.id)">×</button></span>
      </div>
      <button v-if="commandPending" type="button" :disabled="isBusy" class="cockpit-btn" @click="emit('reload')">Tải lại hồ sơ để kiểm tra kết quả</button>
      <div class="actions">
        <button type="button" class="cockpit-btn" :disabled="isBusy || uploadBusy || commandPending" @click="$emit('cancel')">Hủy bỏ</button>
        <button type="submit" class="cockpit-btn cockpit-btn--primary" :disabled="!isValidForm || isBusy">
          {{ isBusy ? 'Đang xác nhận...' : 'Xác nhận thanh toán' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { createFrozenWorkflowCommand } from '../../utils/costs/frozen-workflow-command'
import Decimal from 'decimal.js'
import { workflowPaymentInputSchema, type CostRequestView, type WorkflowPaymentInput } from '../../../shared/schemas/costs/cost-workflow'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import CostWorkflowOriginalUpload from './CostWorkflowOriginalUpload.vue'

const props = defineProps<{ companyId: string; projectId: string; request: CostRequestView; operationalState: string }>()
const emit = defineEmits<{ (e: 'paid' | 'cancel' | 'reload'): void }>()
const repo: CostWorkflowRepository = useRepositories().costWorkflow
const $companyAccessStore = useNuxtApp().$companyAccessStore

const amount = ref('')
const paymentDate = ref(new Date().toISOString().slice(0, 10))
const reference = ref('')
const proofs = ref<Array<{ id: string; name: string }>>([])
const isBusy = ref(false)
const uploadBusy = ref(false)
const errorMessage = ref('')
const commandPending=ref(false)

const tracker = createAsyncRequestTracker<{ companyId: string; projectId: string; targetId: string; fp: string }>()

function getFingerprint() {
  const perms = $companyAccessStore?.permissions ? [...$companyAccessStore.permissions].sort().join(',') : ''
  return `${$companyAccessStore?.activeCompanyId || ''}::${perms}`
}

const isCompleted = computed(() => props.operationalState === 'completed')
const canRecordCash = computed(() => $companyAccessStore?.activeCompanyId === props.companyId && $companyAccessStore.hasPermission('cost.record_cash') && $companyAccessStore.hasPermission('cost.request.submit'))

function makeCommand(){
 const companyId=props.companyId,projectId=props.projectId,installmentId=props.request.installment?.id,fp=getFingerprint()
 return createFrozenWorkflowCommand<WorkflowPaymentInput,unknown>({isScopeCurrent:()=>canRecordCash.value&&props.companyId===companyId&&props.projectId===projectId&&props.request.installment?.id===installmentId&&getFingerprint()===fp,send:(id,input,key)=>repo.confirmPayment(projectId,id,input,{idempotencyKey:key})})
}
let command=makeCommand()

const isValidForm = computed(() => {
  if (uploadBusy.value || !canRecordCash.value || !props.request.installment || proofs.value.length === 0) return false
  try {
    const payAmt = new Decimal(amount.value)
    const remAmt = new Decimal(props.request.installment.remaining)
    if (payAmt.lessThanOrEqualTo(0) || payAmt.greaterThan(remAmt)) return false
  } catch { return false }
  return workflowPaymentInputSchema.safeParse(buildPayload()).success
})

function buildPayload(): WorkflowPaymentInput {
  return {
    amount: amount.value.trim(),
    currencyCode: props.request.currencyCode,
    paymentDate: paymentDate.value,
    reference: reference.value.trim(),
    evidenceFileIds: proofs.value.map(p => p.id),
    expectedVersion: props.request.installment?.version ?? 0,
  }
}

function onProofFinalized(p: { id: string; name: string }) {
  if (!proofs.value.some(x => x.id === p.id)) proofs.value.push(p)
}

function reset() {
  tracker.invalidate()
  errorMessage.value = ''
  isBusy.value = false
  proofs.value = []
  amount.value = ''; reference.value = ''; uploadBusy.value = false;commandPending.value=false;command=makeCommand()
}

watch([() => props.companyId, () => props.projectId, () => props.request.installment?.version, () => props.request.installment?.id, () => $companyAccessStore?.activeCompanyId, () => getFingerprint()], reset, { flush: 'sync' })
onUnmounted(() => tracker.invalidate())

async function handleConfirm() {
  if (!isValidForm.value || !props.request.installment || isBusy.value) return
  const token = tracker.start({ companyId: props.companyId, projectId: props.projectId, targetId: props.request.installment.id, fp: getFingerprint() })
  isBusy.value = true
  errorMessage.value = ''
  const payload = buildPayload()
  commandPending.value=true
  try {
    if ($companyAccessStore?.activeCompanyId !== props.companyId || !canRecordCash.value) throw new Error('Ngữ cảnh hoặc quyền hạn đã thay đổi.')
    await command.attempt(props.request.installment.id,payload)
    if (!token.isCurrent() || $companyAccessStore.activeCompanyId !== token.identity.companyId || props.companyId !== token.identity.companyId || props.projectId !== token.identity.projectId || getFingerprint() !== token.identity.fp) return
    commandPending.value=false
    emit('paid')
  } catch {
    if (!token.isCurrent() || getFingerprint() !== token.identity.fp || props.companyId !== token.identity.companyId || props.projectId !== token.identity.projectId) return
    errorMessage.value = 'Chưa xác định kết quả thanh toán. Thử lại cùng dữ liệu hoặc tải lại hồ sơ để kiểm tra.'
  } finally {
    if (token.isCurrent() && getFingerprint() === token.identity.fp) isBusy.value = false
  }
}
</script>

<style scoped>
.payment-modal { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.header { display: flex; justify-content: space-between; align-items: center; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
.alert { padding: 6px 10px; border-radius: 4px; font-size: 13px; }
.alert.info { background: #e0f2fe; color: #0369a1; }
.alert.error { background: #fee2e2; color: #991b1b; }
.proof-tag { display: inline-flex; align-items: center; gap: 4px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-size: 12px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
</style>