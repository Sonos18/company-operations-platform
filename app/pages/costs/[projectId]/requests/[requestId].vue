<template>
  <div class="cockpit-page" data-testid="cost-request-detail">
    <div class="page-header">
      <NuxtLink :to="`/costs/${pId}/requests`">← Danh sách đề nghị</NuxtLink>
      <h3>Chi tiết Đề nghị khoản chi</h3>
      <span v-if="req" class="cockpit-badge">{{ statusMap[req.status] }}</span>
    </div>
    <div v-if="errorMessage" class="alert error">{{ errorMessage }}</div>
    <div v-if="isCompleted" class="alert info">Dự án đã hoàn thành, chỉ hiển thị đối soát thanh toán hiện hữu.</div>

    <CostRequestReviewPanel
      v-if="isEditable && req && context" :key="`${getFingerprint()}::${req.id}::${req.version}`"
      :company-id="companyId"
      :project-id="pId"
      :context="context"
      :parties="parties"
      :categories="categories"
      :contracts="contracts"
      :initial="req"
      @submitted="loadData"
      @cancel="loadData"
    />
    <div v-else-if="req" class="detail-grid">
      <div class="cockpit-card">
        <h4>Thông tin chung</h4>
        <p>Đối tác: {{ req.partyName || 'Đối tác trong hồ sơ' }}</p>
        <p v-if="req.latestDecision?.reason">Lý do trả lại: {{ req.latestDecision.reason }}</p>
        <p>Số tiền: <strong>{{ req.amount }} {{ req.currencyCode }}</strong> | Cơ sở: <strong>{{ basisLabels[req.basis.kind] }}</strong></p>
        <div v-if="req.basis.kind === 'materials'">
          <p>Nơi giao: {{ req.basis.deliverySite }}</p>
          <div v-for="(l, i) in req.basis.lines" :key="i">- {{ l.description }}: {{ l.quantity }} {{ l.unit }} x {{ l.unitPrice }}</div>
        </div>
        <div v-else-if="req.basis.kind === 'subcontract'">
          <p>Nghiệm thu: {{ req.basis.acceptanceReference }} | Giữ lại: {{ req.basis.retentionAmount }}</p>
        </div>
        <div v-else-if="req.basis.kind === 'direct_labor'">
          <p>Tuần: {{ req.basis.weekStart }}</p>
          <div v-for="(w, i) in req.basis.workers" :key="i">- {{ w.workerReference }}: {{ w.days }} công x {{ w.dailyRate }} (+{{ w.allowance }})</div>
        </div>
        <div v-else>
          <div v-for="(l, i) in req.basis.lines" :key="i">- {{ l.description }}: {{ l.quantity }} {{ l.unit }} x {{ l.unitPrice }}</div>
        </div>
      </div>

      <div class="cockpit-card">
        <h4>Hồ sơ chứng từ gốc</h4>
        <div v-for="id in req.evidenceFileIds" :key="id" class="row">
          <span>Hồ sơ đã lưu ({{ id.slice(0, 8) }})</span>
          <button v-if="hasFileRead" type="button" class="cockpit-btn" @click="openEvidence(id)">Xem</button>
          <button v-if="hasFileRead" type="button" class="cockpit-btn" @click="openEvidence(id, 'attachment')">Tải bản gốc</button>
        </div>
      </div>

      <div v-if="canDecide && req.status === 'submitted'" class="cockpit-card">
        <h4>Phê duyệt / Trả lại</h4>
        <input v-model="decisionReason" :disabled="decisionBusy || Boolean(decPending)" placeholder="Lý do (bắt buộc khi trả lại)" style="margin-bottom: 8px; width: 100%;" >
        <div class="row">
          <button type="button" class="cockpit-btn cockpit-btn--primary" :disabled="decisionBusy" @click="handleDecision('approve')">Phê duyệt</button>
          <button type="button" class="cockpit-btn" :disabled="decisionBusy" @click="handleDecision('return')">Trả lại</button>
        </div>
      </div>

      <div v-if="req.installment" class="cockpit-card">
        <h4>Đợt giải ngân</h4>
        <p>Hạn mức: {{ req.installment.authorized }} | Đã chi: {{ req.installment.consumed }} | Còn lại: {{ req.installment.remaining }}</p>
        <button v-if="canRecordCash" type="button" class="cockpit-btn" @click="showPayment = true">Ghi nhận thanh toán</button>
        <div v-for="pay in req.payments" :key="pay.id">
          <p>{{ pay.paymentDate }}: {{ pay.amount }} {{ pay.currencyCode }} (Hiệu chỉnh: {{ pay.correctedCash }}, Hoàn: {{ pay.refunded }})</p>
          <div v-for="(fileId, index) in pay.evidenceFileIds" :key="fileId" class="row">
            <span>Chứng từ thanh toán #{{ index + 1 }}</span>
            <button v-if="hasFileRead" type="button" class="cockpit-btn" @click="openEvidence(fileId)">Xem</button>
            <button v-if="hasFileRead" type="button" class="cockpit-btn" @click="openEvidence(fileId, 'attachment')">Tải bản gốc</button>
          </div>
        </div>
      </div>

      <div class="cockpit-card">
        <h4>Lịch sử phiên</h4>
        <div v-for="h in history" :key="h.id" class="hist-row">
          v{{ h.version }} - {{ h.submittedAt }} - {{ h.decision ? (h.decision.decision === 'approve' ? 'Đã duyệt' : 'Trả lại') : 'Chờ duyệt' }}
          <span v-if="h.decision?.reason">({{ h.decision.reason }})</span>
        </div>
      </div>
    </div>

    <CostInstallmentPaymentModal
      v-if="showPayment && req"
      :company-id="companyId"
      :project-id="pId"
      :request="req"
      :operational-state="context?.operationalState || ''"
      @paid="onPaid"
      @cancel="showPayment = false"
      @reload="loadData"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { workflowUuidSchema, type CostRequestView, type WorkflowProjectContext, type WorkflowPartyOption, type WorkflowContractView, type WorkflowRequestHistory, type WorkflowDecisionInput } from '../../../../../shared/schemas/costs/cost-workflow'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import CostRequestReviewPanel from '../../../../components/costs/CostRequestReviewPanel.vue'
import CostInstallmentPaymentModal from '../../../../components/costs/CostInstallmentPaymentModal.vue'

definePageMeta({ requiredPermission: 'cost.request.read' })

const route = useRoute()
const repo = useRepositories().costWorkflow
const $companyAccessStore = useNuxtApp().$companyAccessStore

const pId = computed(() => workflowUuidSchema.safeParse(route.params.projectId).success ? String(route.params.projectId) : '')
const rId = computed(() => workflowUuidSchema.safeParse(route.params.requestId).success ? String(route.params.requestId) : '')
const companyId = computed(() => $companyAccessStore?.activeCompanyId || '')

const req = ref<CostRequestView | null>(null)
const context = ref<WorkflowProjectContext | null>(null)
const history = ref<WorkflowRequestHistory>([])
const parties = ref<WorkflowPartyOption[]>([])
const contracts = ref<WorkflowContractView[]>([])
const categories = ref<Array<{ id: string; name: string }>>([])
const decisionReason = ref('')
const showPayment = ref(false)
const errorMessage = ref('')
const decisionBusy=ref(false)
let decPending:{key:string;input:WorkflowDecisionInput;fp:string}|null=null
const previewTracker=createAsyncRequestTracker<{fp:string;projectId:string}>()
const decisionTracker=createAsyncRequestTracker<{fp:string;projectId:string;requestId:string}>()

const tracker = createAsyncRequestTracker<{ companyId: string; projectId: string; requestId: string; fp: string }>()

function getFingerprint() {
  const p = $companyAccessStore?.permissions ? [...$companyAccessStore.permissions].sort().join(',') : ''
  return `${companyId.value}::${pId.value}::${rId.value}::${p}`
}

const statusMap={working:'Chưa gửi',submitted:'Chờ duyệt',returned:'Trả lại',approved:'Đã duyệt'}
const basisLabels={materials:'Vật tư',subcontract:'Thầu phụ',direct_labor:'Nhân công VQH',machinery:'Máy móc',other:'Chi phí khác'}
const hasFileRead = computed(() => Boolean($companyAccessStore?.permissions?.includes('cost.request.file.read')))
const canDecide = computed(() => Boolean(context.value?.canDecide && $companyAccessStore?.permissions?.includes('cost.request.decide')))
const canRecordCash = computed(() => Boolean(context.value?.mode==='document_backed_v1' && req.value?.installment && /[1-9]/.test(req.value.installment.remaining) && $companyAccessStore.hasPermission('cost.record_cash') && $companyAccessStore.hasPermission('cost.request.submit')))
const isCompleted = computed(() => context.value?.operationalState === 'completed')
const isEditable = computed(() => Boolean((req.value?.status === 'working' || req.value?.status === 'returned') && context.value?.canSubmit && !isCompleted.value))

function clear() {
  tracker.invalidate(); req.value = null; context.value = null; history.value = []; showPayment.value=false;decisionReason.value='';decPending=null;decisionBusy.value=false;previewTracker.invalidate();decisionTracker.invalidate(); parties.value = []; contracts.value = []; categories.value = []; errorMessage.value = ''
}
watch([pId, rId, companyId, () => getFingerprint()], () => {clear();void loadData()}, {immediate:true,flush:'sync'})
onUnmounted(() => {tracker.invalidate();previewTracker.invalidate();decisionTracker.invalidate()})

async function loadData() {
  clear()
  if (!pId.value || !rId.value || !companyId.value) { errorMessage.value = 'Mã yêu cầu hoặc phiên không hợp lệ.'; return }
  const token = tracker.start({ companyId: companyId.value, projectId: pId.value, requestId: rId.value, fp: getFingerprint() })
  try {
    const ctx = await repo.readProjectContext(pId.value)
    if (!token.isCurrent() || getFingerprint()!==token.identity.fp) return
    context.value = ctx
    if (ctx.mode === 'legacy') return

    const [rData, hData, cts, cash] = await Promise.all([
      repo.readRequest(pId.value, rId.value),
      repo.readRequestHistory(pId.value, rId.value),
      repo.listContracts(pId.value),
      repo.readCash(pId.value),
    ])
    if (!token.isCurrent() || getFingerprint()!==token.identity.fp) return
    req.value = rData; history.value = hData
    contracts.value = cts
    categories.value = cash.categories.flatMap(c => c.categoryId ? [{id:c.categoryId,name:c.name}] : [])
    if ($companyAccessStore?.permissions?.includes('cost.party.read')) {
      const found=await repo.listParties(token.identity.projectId)
      if(token.isCurrent()&&getFingerprint()===token.identity.fp)parties.value=found
    }
  } catch {
    if (token.isCurrent()) errorMessage.value = 'Không thể tải hồ sơ đề nghị. Kiểm tra quyền truy cập hoặc thử lại.'
  }
}

async function openEvidence(fileId:string,disposition:'inline'|'attachment'='inline') {
 if(!hasFileRead.value)return
 const token=previewTracker.start({fp:getFingerprint(),projectId:pId.value})
 try{const res=await repo.readEvidenceUrl(token.identity.projectId,fileId,{disposition});if(token.isCurrent()&&getFingerprint()===token.identity.fp&&hasFileRead.value)window.open(res.url,'_blank','noopener,noreferrer')}
 catch{if(token.isCurrent()&&getFingerprint()===token.identity.fp)errorMessage.value='Không thể mở chứng từ. Quyền truy cập có thể đã thay đổi.'}
}
async function handleDecision(decision:'approve'|'return') {
 if(!canDecide.value||decisionBusy.value||!req.value?.submittedVersionId)return
 const fp=getFingerprint()
 if(decPending&&decPending.input.decision!==decision){errorMessage.value='Kết quả lần duyệt trước chưa rõ. Thử lại cùng thao tác hoặc tải lại hồ sơ.';return}
 if(decision==='return'&&!decisionReason.value.trim()){errorMessage.value='Cần nhập lý do trả lại.';return}
 decPending??={key:crypto.randomUUID(),fp,input:{submittedVersionId:req.value.submittedVersionId,decision,...(decisionReason.value.trim()?{reason:decisionReason.value.trim()}:{})}}
 const pending=decPending
 const token=decisionTracker.start({fp,projectId:pId.value,requestId:rId.value})
 decisionBusy.value=true
 try{await repo.decideRequest(token.identity.projectId,token.identity.requestId,pending.input,{idempotencyKey:pending.key});if(!token.isCurrent()||getFingerprint()!==fp)return;decPending=null;await loadData()}
 catch{if(token.isCurrent()&&getFingerprint()===fp)errorMessage.value='Chưa xác định kết quả duyệt. Thử lại cùng thao tác hoặc tải lại hồ sơ.'}
 finally{if(token.isCurrent()&&getFingerprint()===fp)decisionBusy.value=false}
}

function onPaid() { showPayment.value = false; loadData() }
</script>

<style scoped>
.cockpit-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.page-header { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; }
.alert { padding: 8px 12px; border-radius: 4px; font-size: 13px; }
.alert.info { background: #e0f2fe; color: #0369a1; }
.alert.error { background: #fee2e2; color: #991b1b; }
.detail-grid { display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; padding: 4px 0; }
.hist-row { font-size: 13px; color: #475569; padding: 2px 0; }
</style>