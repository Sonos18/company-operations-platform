<template>
  <div class="cockpit-card contract-basis-panel">
    <div class="panel-header">
      <h4>Hợp đồng & Căn cứ phê duyệt chi phí</h4>
      <span class="cockpit-badge">{{ context.operationalState === 'active' ? 'Đang hoạt động' : context.operationalState === 'completed' ? 'Đã hoàn thành' : 'Chưa sẵn sàng' }}</span>
    </div>

    <div v-if="!canSubmitCommands" class="alert info">
      <span v-if="context.mode !== 'document_backed_v1'">Quy trình chứng từ chưa được bật; chưa thể thiết lập căn cứ.</span>
      <span v-else-if="context.operationalState === 'completed'">Dự án đã kết thúc, không thể lập thêm căn cứ hoặc điều chỉnh.</span>
      <span v-else>Bạn không có quyền lập hoặc điều chỉnh hợp đồng căn cứ trong dự án này.</span>
    </div>

    <div v-if="actionError" class="alert error" role="alert">{{ actionError }}</div>

    <div class="section">
      <h5>Danh sách Hợp đồng / Căn cứ hiện hữu ({{ contracts.length }})</h5>
      <div v-if="contracts.length === 0" class="empty">Chưa có hợp đồng hoặc căn cứ nào được thiết lập.</div>
      <table v-else class="cockpit-table">
        <thead>
          <tr>
            <th>Số hiệu / Tên căn cứ</th>
            <th>Đối tác</th>
            <th>Hạn mức</th>
            <th>Phiên bản</th>
            <th v-if="canSubmitCommands">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in contracts" :key="c.id">
            <td><strong>{{ c.reference }}</strong></td>
            <td>{{ getPartyName(c.partyId) }}</td>
            <td>{{ c.cap }} {{ c.currencyCode }}</td>
            <td>v{{ c.version }}</td>
            <td v-if="canSubmitCommands">
              <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="isBusy || uploadBusy" @click="startAdjustment(c)">
                {{ adjustingContract?.id === c.id ? 'Đang chọn' : 'Điều chỉnh' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="adjustingContract && canSubmitCommands" class="section adjust-box">
      <h5>Điều chỉnh hạn mức Hợp đồng: {{ adjustingContract.reference }} (v{{ adjustingContract.version }})</h5>
      <form @submit.prevent="handleSubmitAdjustment">
        <div class="grid-2">
          <div>
            <label class="label">Hạn mức đề xuất mới *</label>
            <input v-model="adjustCap" type="text" class="cockpit-input" placeholder="Ví dụ: 120000000" :disabled="isBusy || uploadBusy" required >
          </div>
          <div>
            <label class="label">Lý do điều chỉnh *</label>
            <input v-model="adjustReason" type="text" class="cockpit-input" placeholder="Lý do thay đổi hạn mức" :disabled="isBusy || uploadBusy" required >
          </div>
        </div>

        <div class="upload-wrap">
          <label class="label">Hồ sơ chứng từ điều chỉnh (tối thiểu 1 chứng từ) *</label>
          <CostWorkflowOriginalUpload
            :company-id="companyId"
            :project-id="projectId"
            :target="{ kind: 'request' }"
            :allowed-kinds="['contract', 'quotation']"
            @finalized="onAdjustFileFinalized"
            @busy="uploadBusy = $event"
          />
          <div v-if="adjustFiles.length > 0" class="file-list">
            <div v-for="f in adjustFiles" :key="f.id" class="file-row">
              <span>{{ f.name }}</span>
              <div class="btn-group">
                <button v-if="canReadFile" type="button" class="cockpit-btn cockpit-btn--sm" @click="openEvidence(f.id)">Xem</button>
                <button v-if="canReadFile" type="button" class="cockpit-btn" @click="openEvidence(f.id, 'attachment')">Tải bản gốc</button>
                <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="isBusy || uploadBusy" @click="removeAdjustFile(f.id)">Gỡ</button>
              </div>
            </div>
          </div>
        </div>

        <label class="check-row">
          <input v-model="adjustReviewed" type="checkbox" :disabled="isBusy || uploadBusy" >
          <span>Tôi đã rà soát đầy đủ căn cứ và hồ sơ pháp lý điều chỉnh hạn mức.</span>
        </label>

        <div class="actions">
          <button type="button" class="cockpit-btn" :disabled="isBusy || uploadBusy" @click="cancelAdjustment">Hủy</button>
          <button type="submit" class="cockpit-btn cockpit-btn--primary" :disabled="!canSubmitAdjustment || isBusy">
            {{ isBusy ? 'Đang gửi...' : 'Gửi đề nghị điều chỉnh' }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="canSubmitCommands && !adjustingContract" class="section create-box">
      <h5>Thiết lập Hợp đồng / Căn cứ chi phí mới</h5>
      <p>Căn cứ này chưa phê duyệt khoản chi hoặc ghi nhận thanh toán. Chi theo tuần của tổ đội VQH không cần tạo hợp đồng giả.</p>
      <form @submit.prevent="handleCreateBasis">
        <div class="grid-2">
          <div>
            <label class="label">Đối tác ký kết *</label>
            <select v-model="createPartyId" class="cockpit-select" :disabled="isBusy || uploadBusy" required>
              <option value="" disabled>-- Chọn đối tác --</option>
              <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }} ({{ formatParty(p) }})</option>
            </select>
          </div>
          <div>
            <label class="label">Số hiệu HĐ / Báo giá *</label>
            <input v-model="createReference" type="text" class="cockpit-input" placeholder="Ví dụ: HĐKT-2026/01" :disabled="isBusy || uploadBusy" required >
          </div>
          <div>
            <label class="label">Hạn mức hợp đồng căn cứ *</label>
            <input v-model="createAmount" type="text" class="cockpit-input" placeholder="Ví dụ: 500000000" :disabled="isBusy || uploadBusy" required >
          </div>
          <div>
            <label class="label">Loại tiền tệ *</label>
            <input v-model="createCurrency" type="text" maxlength="3" class="cockpit-input" placeholder="VND" :disabled="isBusy || uploadBusy" required >
          </div>
        </div>

        <div class="upload-wrap">
          <label class="label">Chứng từ gốc hợp đồng / báo giá (tối thiểu 1) *</label>
          <CostWorkflowOriginalUpload
            :company-id="companyId"
            :project-id="projectId"
            :target="{ kind: 'request' }"
            :allowed-kinds="['contract', 'quotation']"
            @finalized="onCreateFileFinalized"
            @busy="uploadBusy = $event"
          />
          <div v-if="createFiles.length > 0" class="file-list">
            <div v-for="f in createFiles" :key="f.id" class="file-row">
              <span>{{ f.name }}</span>
              <div class="btn-group">
                <button v-if="canReadFile" type="button" class="cockpit-btn cockpit-btn--sm" @click="openEvidence(f.id)">Xem</button>
                <button v-if="canReadFile" type="button" class="cockpit-btn" @click="openEvidence(f.id, 'attachment')">Tải bản gốc</button>
                <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="isBusy || uploadBusy" @click="removeCreateFile(f.id)">Gỡ</button>
              </div>
            </div>
          </div>
        </div>

        <label class="check-row">
          <input v-model="createReviewed" type="checkbox" :disabled="isBusy || uploadBusy" >
          <span>Tôi đã rà soát tính hợp pháp và đầy đủ của hồ sơ căn cứ hợp đồng này.</span>
        </label>

        <div class="actions">
          <button type="submit" class="cockpit-btn cockpit-btn--primary" :disabled="!canSubmitCreate || isBusy">
            {{ isBusy ? 'Đang thiết lập...' : 'Thiết lập căn cứ hợp đồng' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  contractBasisInputSchema,
  contractAdjustmentInputSchema,
  type WorkflowProjectContext,
  type WorkflowPartyOption,
  type WorkflowContractView,
  type ContractBasisInput,
  type ContractAdjustmentInput,
} from '../../../shared/schemas/costs/cost-workflow'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import CostWorkflowOriginalUpload from './CostWorkflowOriginalUpload.vue'

const props = defineProps<{
  companyId: string
  projectId: string
  context: WorkflowProjectContext
  parties: WorkflowPartyOption[]
  contracts: WorkflowContractView[]
}>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const repo: CostWorkflowRepository = useRepositories().costWorkflow
const $companyAccessStore = useNuxtApp().$companyAccessStore

function hasPerm(perm: import('../../../shared/constants/permissions').PermissionCode): boolean {
  return $companyAccessStore?.hasPermission ? $companyAccessStore.hasPermission(perm) : Boolean($companyAccessStore?.permissions?.includes(perm))
}

function getFingerprint(): string {
  const p = $companyAccessStore?.permissions ? [...$companyAccessStore.permissions].sort().join(',') : ''
  return `${$companyAccessStore?.activeCompanyId || ''}::${props.companyId}::${props.projectId}::${p}`
}

const canReadFile = computed(() => hasPerm('cost.request.file.read'))
const canSubmitCommands = computed(() => {
  return (
    props.context.mode === 'document_backed_v1' &&
    props.context.operationalState === 'active' &&
    props.context.canSubmit &&
    $companyAccessStore?.activeCompanyId === props.companyId &&
    hasPerm('cost.request.submit') && hasPerm('cost.prepare')
  )
})

const previewTracker=createAsyncRequestTracker<{fp:string;projectId:string}>()
interface EvidenceEntry { id: string; name: string }

const createPartyId = ref('')
const createReference = ref('')
const createAmount = ref('')
const createCurrency = ref('VND')
const createFiles = ref<EvidenceEntry[]>([])
const createReviewed = ref(false)

const adjustingContract = ref<WorkflowContractView | null>(null)
const adjustCap = ref('')
const adjustReason = ref('')
const adjustFiles = ref<EvidenceEntry[]>([])
const adjustReviewed = ref(false)

const isBusy = ref(false)
const uploadBusy = ref(false)
const actionError = ref('')

let createCmdKey = crypto.randomUUID()
let lastCreatePayload = ''
let adjustCmdKey = crypto.randomUUID()
let lastAdjustPayload = ''

const actionTracker = createAsyncRequestTracker<{ companyId: string; projectId: string; fp: string }>()

function getPartyName(pId: string): string {
  const party = props.parties.find(p => p.id === pId)
  return party ? party.name : 'Đối tác thụ hưởng'
}

function formatParty(p: WorkflowPartyOption): string {
  return p.kind === 'crew' ? (p.crewOwnership === 'vqh_internal' ? 'Tổ đội VQH' : p.crewOwnership === 'external' ? 'Tổ đội ngoài' : 'Chưa phân loại') : 'Nhà cung cấp'
}

function resetForm() {
  actionTracker.invalidate()
  createPartyId.value = ''; createReference.value = ''; createAmount.value = ''; createCurrency.value = 'VND'; createFiles.value = []; createReviewed.value = false
  adjustingContract.value = null; adjustCap.value = ''; adjustReason.value = ''; adjustFiles.value = []; adjustReviewed.value = false
  actionError.value = ''; isBusy.value = false;uploadBusy.value=false;previewTracker.invalidate()
  createCmdKey = crypto.randomUUID(); lastCreatePayload = ''; adjustCmdKey = crypto.randomUUID(); lastAdjustPayload = ''
}

watch([() => props.companyId, () => props.projectId, () => $companyAccessStore.activeCompanyId, () => getFingerprint()], resetForm, {flush:'sync'})
watch([createPartyId, createReference, createAmount, createCurrency, createFiles], () => { createReviewed.value=false }, { deep: true,flush:'sync' })
watch([adjustCap, adjustReason, adjustFiles], () => { adjustReviewed.value=false }, { deep: true,flush:'sync' })
onUnmounted(() => {actionTracker.invalidate();previewTracker.invalidate()})

function onCreateFileFinalized(f: { id: string; name: string }) {
  if (!createFiles.value.some(e => e.id === f.id)) createFiles.value.push(f)
}
function removeCreateFile(id: string) { createFiles.value = createFiles.value.filter(e => e.id !== id) }

function onAdjustFileFinalized(f: { id: string; name: string }) {
  if (!adjustFiles.value.some(e => e.id === f.id)) adjustFiles.value.push(f)
}
function removeAdjustFile(id: string) { adjustFiles.value = adjustFiles.value.filter(e => e.id !== id) }

async function openEvidence(fileId:string,disposition:'inline'|'attachment'='inline'){
 if(!canReadFile.value||$companyAccessStore.activeCompanyId!==props.companyId)return
 const token=previewTracker.start({fp:getFingerprint(),projectId:props.projectId})
 try{const result=await repo.readEvidenceUrl(token.identity.projectId,fileId,{disposition});if(token.isCurrent()&&getFingerprint()===token.identity.fp&&canReadFile.value)window.open(result.url,'_blank','noopener,noreferrer')}
 catch{if(token.isCurrent()&&getFingerprint()===token.identity.fp)actionError.value='Không thể mở chứng từ. Kiểm tra quyền truy cập.'}
}

function startAdjustment(c: WorkflowContractView) {
  if(lastCreatePayload||lastAdjustPayload){actionError.value='Kết quả thao tác trước chưa rõ. Thử lại đúng dữ liệu hoặc tải lại trang.';return}
  actionError.value = ''; adjustingContract.value = c; adjustCap.value = c.cap; adjustReason.value = ''; adjustFiles.value = []; adjustReviewed.value = false
  adjustCmdKey = crypto.randomUUID()
}
function cancelAdjustment() { adjustingContract.value = null; actionError.value = '' }

const canSubmitCreate = computed(() => {
  if (uploadBusy.value || !canSubmitCommands.value || !createReviewed.value || createFiles.value.length === 0) return false
  const input: ContractBasisInput = {
    partyId: createPartyId.value,
    reference: createReference.value.trim(),
    referenceAmount: createAmount.value.trim(),
    currencyCode: createCurrency.value.trim().toUpperCase(),
    evidenceFileIds: createFiles.value.map(f => f.id),
  }
  return contractBasisInputSchema.safeParse(input).success
})

const canSubmitAdjustment = computed(() => {
  if (uploadBusy.value || !canSubmitCommands.value || !adjustingContract.value || !adjustReviewed.value || adjustFiles.value.length === 0) return false
  const input: ContractAdjustmentInput = {
    expectedVersion: adjustingContract.value.version,
    proposedCap: adjustCap.value.trim(),
    reason: adjustReason.value.trim(),
    evidenceFileIds: adjustFiles.value.map(f => f.id),
  }
  return contractAdjustmentInputSchema.safeParse(input).success
})

async function handleCreateBasis() {
  if (!canSubmitCreate.value || isBusy.value) return
  actionError.value = ''
  const token = actionTracker.start({ companyId: props.companyId, projectId: props.projectId, fp: getFingerprint() })
  const input: ContractBasisInput = {
    partyId: createPartyId.value,
    reference: createReference.value.trim(),
    referenceAmount: createAmount.value.trim(),
    currencyCode: createCurrency.value.trim().toUpperCase(),
    evidenceFileIds: createFiles.value.map(f => f.id),
  }
  const payloadStr = JSON.stringify(input)
  if(lastCreatePayload&&lastCreatePayload!==payloadStr){actionError.value='Kết quả thiết lập trước chưa rõ. Thử lại đúng dữ liệu hoặc tải lại trang.';return}
  lastCreatePayload=payloadStr;isBusy.value=true

  try {
    if (!canSubmitCommands.value) throw new Error('Ngữ cảnh hoặc quyền hạn đã thay đổi.')
    await repo.createContractBasis(token.identity.projectId, input, { idempotencyKey: createCmdKey })
    if (!token.isCurrent() || getFingerprint()!==token.identity.fp) return
    createCmdKey = crypto.randomUUID(); lastCreatePayload = ''; resetForm(); emit('changed')
  } catch {
    if (!token.isCurrent() || getFingerprint()!==token.identity.fp) return
    actionError.value = 'Chưa xác định kết quả thiết lập. Thử lại đúng dữ liệu hoặc tải lại trang.'
  } finally {
    if (token.isCurrent() && getFingerprint()===token.identity.fp) isBusy.value = false
  }
}

async function handleSubmitAdjustment() {
  if (!canSubmitAdjustment.value || !adjustingContract.value || isBusy.value) return
  actionError.value = ''
  const token = actionTracker.start({ companyId: props.companyId, projectId: props.projectId, fp: getFingerprint() })
  const input: ContractAdjustmentInput = {
    expectedVersion: adjustingContract.value.version,
    proposedCap: adjustCap.value.trim(),
    reason: adjustReason.value.trim(),
    evidenceFileIds: adjustFiles.value.map(f => f.id),
  }
  const payloadStr = JSON.stringify(input)
  if(lastAdjustPayload&&lastAdjustPayload!==payloadStr){actionError.value='Kết quả điều chỉnh trước chưa rõ. Thử lại đúng dữ liệu hoặc tải lại trang.';return}
  lastAdjustPayload=payloadStr;isBusy.value=true

  try {
    if (!canSubmitCommands.value) throw new Error('Ngữ cảnh hoặc quyền hạn đã thay đổi.')
    await repo.submitContractAdjustment(token.identity.projectId, adjustingContract.value.id, input, { idempotencyKey: adjustCmdKey })
    if (!token.isCurrent() || getFingerprint()!==token.identity.fp) return
    adjustCmdKey = crypto.randomUUID(); lastAdjustPayload = ''; resetForm(); emit('changed')
  } catch {
    if (!token.isCurrent() || getFingerprint()!==token.identity.fp) return
    actionError.value = 'Chưa xác định kết quả điều chỉnh. Thử lại đúng dữ liệu hoặc tải lại trang.'
  } finally {
    if (token.isCurrent() && getFingerprint()===token.identity.fp) isBusy.value = false
  }
}
</script>

<style scoped>
.contract-basis-panel { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; }
.section { display: flex; flex-direction: column; gap: 8px; }
.empty { font-size: 13px; color: #64748b; font-style: italic; }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.label { font-size: 12px; font-weight: 500; color: #334155; display: block; margin-bottom: 2px; }
.upload-wrap { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; }
.file-list { display: flex; flex-direction: column; gap: 4px; }
.file-row { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
.btn-group { display: flex; gap: 4px; }
.check-row { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 4px 0; cursor: pointer; }
.actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.alert { padding: 6px 10px; border-radius: 4px; font-size: 13px; }
.alert.info { background: #e0f2fe; color: #0369a1; }
.alert.error { background: #fee2e2; color: #991b1b; }
.adjust-box, .create-box { border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style>