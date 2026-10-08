<template>
  <div class="cockpit-page" data-testid="cost-request-detail">
    <div class="page-header">
      <NuxtLink :to="`/costs/${pId}/requests`">← Danh sách đề nghị</NuxtLink>
      <h3>{{ kindLabels[link.kind] }}</h3>
      <span v-if="req" class="cockpit-badge" :class="statusBadgeClass">{{ statusText }}</span>
    </div>
    <div v-if="errorMessage" class="alert error">{{ errorMessage }}</div>
    <div v-if="isCompleted" class="alert info">Dự án đã hoàn thành, chỉ hiển thị đối soát thanh toán hiện hữu.</div>

    <div v-if="adjustment && adjustmentSnapshot" class="detail-grid" data-testid="cost-adjustment-detail">
      <div class="cockpit-card">
        <h4>{{ kindLabels[adjustment.kind] }}</h4>
        <p>Phiên hồ sơ: {{ adjustmentSnapshot.id }}</p>
        <p v-if="'proposedCap' in adjustmentSnapshot.input">Hạn mức đề xuất: <strong>{{ adjustmentSnapshot.input.proposedCap }}</strong></p>
        <p v-else-if="'requestedAmount' in adjustmentSnapshot.input">Số tiền đề nghị hoàn: <strong>{{ adjustmentSnapshot.input.requestedAmount }}</strong></p>
        <p v-else-if="'correctedOutgoing' in adjustmentSnapshot.input">Số tiền chi sau hiệu chỉnh: <strong>{{ adjustmentSnapshot.input.correctedOutgoing }}</strong></p>
        <p v-if="'reason' in adjustmentSnapshot.input">Lý do: {{ adjustmentSnapshot.input.reason }}</p>
        <p>Quyết định: {{ adjustmentSnapshot.decision?.decision === 'approve' ? 'Đã duyệt' : adjustmentSnapshot.decision?.decision === 'return' ? 'Trả lại' : 'Chờ duyệt' }}</p>
        <p v-if="adjustmentSnapshot.decision?.reason">{{ adjustmentSnapshot.decision.reason }}</p>
        <p>Phê duyệt độc lập với xác nhận thu/chi thực tế. Xử lý thu/chi tại hồ sơ dự án.</p>
      </div>
      <div class="cockpit-card">
        <h4>Hồ sơ chứng từ gốc của phiên đã gửi</h4>
        <div v-for="id in adjustmentSnapshot.evidenceFileIds" :key="id" class="row">
          <span>Hồ sơ đã lưu ({{ id.slice(0, 8) }})</span>
          <button v-if="hasFileRead" type="button" class="cockpit-btn" @click="openEvidence(id)">Xem</button>
          <button v-if="hasFileRead" type="button" class="cockpit-btn" @click="openEvidence(id, 'attachment')">Tải bản gốc</button>
        </div>
      </div>
    </div>

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
        <p>Số tiền: <strong>{{ formatFinanceMoney(req.amount, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }}</strong> | Cơ sở: <strong>{{ basisLabels[req.basis.kind] }}</strong></p>
        <div v-if="req.basis.kind === 'materials'">
          <p>Nơi giao: {{ req.basis.deliverySite }}</p>
          <div v-for="(l, i) in req.basis.lines" :key="i">- {{ l.description }}: {{ l.quantity }} {{ l.unit }} x {{ formatFinanceMoney(l.unitPrice, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }}</div>
        </div>
        <div v-else-if="req.basis.kind === 'subcontract'">
          <p>Nghiệm thu: {{ req.basis.acceptanceReference }} | Giữ lại: {{ formatFinanceMoney(req.basis.retentionAmount, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }}</p>
        </div>
        <div v-else-if="req.basis.kind === 'direct_labor'">
          <p>Tuần: {{ req.basis.weekStart }}</p>
          <div v-for="(w, i) in req.basis.workers" :key="i">- {{ w.workerReference }}: {{ w.days }} công x {{ formatFinanceMoney(w.dailyRate, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }} (+{{ formatFinanceMoney(w.allowance, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }})</div>
        </div>
        <div v-else>
          <div v-for="(l, i) in req.basis.lines" :key="i">- {{ l.description }}: {{ l.quantity }} {{ l.unit }} x {{ formatFinanceMoney(l.unitPrice, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }}</div>
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
        <p>Hạn mức: {{ formatFinanceMoney(req.installment.authorized, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }} | Đã chi: {{ formatFinanceMoney(req.installment.consumed, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }} | Còn lại: {{ formatFinanceMoney(req.installment.remaining, req.currencyCode, req.currencyCode === 'VND' ? 0 : 2) }}</p>
        <button v-if="canRecordCash" type="button" class="cockpit-btn cockpit-btn--primary" @click="showPayment = true">Ghi nhận thanh toán</button>
        <div v-for="pay in req.payments" :key="pay.id">
          <p>{{ pay.paymentDate }}: {{ formatFinanceMoney(pay.amount, pay.currencyCode, pay.currencyCode === 'VND' ? 0 : 2) }} (Hiệu chỉnh: {{ formatFinanceMoney(pay.correctedCash, pay.currencyCode, pay.currencyCode === 'VND' ? 0 : 2) }}, Hoàn: {{ formatFinanceMoney(pay.refunded, pay.currencyCode, pay.currencyCode === 'VND' ? 0 : 2) }})</p>
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
import { workflowUuidSchema, type CostRequestView, type WorkflowProjectContext, type WorkflowPartyOption, type WorkflowContractView, type WorkflowRequestHistory, type WorkflowDecisionInput, type WorkflowAdjustmentView } from '../../../../../shared/schemas/costs/cost-workflow'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import CostRequestReviewPanel from '../../../../components/costs/CostRequestReviewPanel.vue'
import CostInstallmentPaymentModal from '../../../../components/costs/CostInstallmentPaymentModal.vue'
import { formatFinanceMoney } from '../../../../utils/costs/finance-display'

definePageMeta({ requiredPermission: 'cost.request.read' })

const route = useRoute()
const repo = useRepositories().costWorkflow
const $companyAccessStore = useNuxtApp().$companyAccessStore

const pId = computed(() => workflowUuidSchema.safeParse(route.params.projectId).success ? String(route.params.projectId) : '')
const rId = computed(() => workflowUuidSchema.safeParse(route.params.requestId).success ? String(route.params.requestId) : '')
const companyId = computed(() => $companyAccessStore?.activeCompanyId || '')

type RequestKind='installment'|'contract_adjustment'|'refund'|'correction'
const kindLabels:Record<RequestKind,string>={installment:'Chi tiết Đề nghị khoản chi',contract_adjustment:'Chi tiết Điều chỉnh hạn mức',refund:'Chi tiết Đề nghị hoàn tiền',correction:'Chi tiết Hiệu chỉnh tiền chi'}
const link=computed(()=>{
 const rawKind=route.query.kind,rawVersion=route.query.submittedVersionId
 const kind:RequestKind=typeof rawKind==='string'&&Object.hasOwn(kindLabels,rawKind)?rawKind as RequestKind:'installment'
 const validKind=rawKind===undefined||(typeof rawKind==='string'&&Object.hasOwn(kindLabels,rawKind))
 const validVersion=rawVersion===undefined||(typeof rawVersion==='string'&&workflowUuidSchema.safeParse(rawVersion).success)
 return {kind,versionId:typeof rawVersion==='string'?rawVersion:null,valid:validKind&&validVersion}
})
const req = ref<CostRequestView | null>(null)
const adjustment=ref<WorkflowAdjustmentView|null>(null)
const adjustmentSnapshot=ref<WorkflowRequestHistory[number]|null>(null)
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
  return `${companyId.value}::${pId.value}::${rId.value}::${JSON.stringify(route.query.kind)}::${JSON.stringify(route.query.submittedVersionId)}::${p}`
}

const statusMap={working:'Chưa gửi',submitted:'Chờ duyệt',returned:'Trả lại',approved:'Đã duyệt'}
const statusText = computed(() => {
  if (!req.value) return ''
  if (req.value.status === 'approved') {
    if (!req.value.payments || req.value.payments.length === 0) return 'Đã duyệt (Chờ chi)'
    if (req.value.installment?.remaining === '0.0000' || (req.value.installment?.consumed && req.value.installment?.authorized && req.value.installment?.consumed === req.value.installment?.authorized)) return 'Đã thanh toán'
    return 'Đã chi một phần'
  }
  return statusMap[req.value.status] || req.value.status
})
const statusBadgeClass = computed(() => {
  if (!req.value) return ''
  if (req.value.status === 'working') return 'cockpit-badge--neutral'
  if (req.value.status === 'submitted') return 'cockpit-badge--warning'
  if (req.value.status === 'returned') return 'cockpit-badge--danger'
  if (req.value.status === 'approved') {
    if (!req.value.payments || req.value.payments.length === 0) return 'cockpit-badge--primary'
    return 'cockpit-badge--success'
  }
  return ''
})
const basisLabels={materials:'Vật tư',subcontract:'Thầu phụ',direct_labor:'Nhân công VQH',machinery:'Máy móc',other:'Chi phí khác'}
const hasFileRead = computed(() => Boolean($companyAccessStore?.permissions?.includes('cost.request.file.read')))
const canDecide = computed(() => Boolean(context.value?.canDecide && $companyAccessStore?.permissions?.includes('cost.request.decide')))
const canRecordCash = computed(() => Boolean(context.value?.mode==='document_backed_v1' && req.value?.installment && /[1-9]/.test(req.value.installment.remaining) && $companyAccessStore.hasPermission('cost.record_cash') && $companyAccessStore.hasPermission('cost.request.submit')))
const isCompleted = computed(() => context.value?.operationalState === 'completed')
const isEditable = computed(() => Boolean(!link.value.versionId && (req.value?.status === 'working' || req.value?.status === 'returned') && context.value?.canSubmit && !isCompleted.value))

function clear() {
  tracker.invalidate(); req.value = null; adjustment.value=null;adjustmentSnapshot.value=null; context.value = null; history.value = []; showPayment.value=false;decisionReason.value='';decPending=null;decisionBusy.value=false;previewTracker.invalidate();decisionTracker.invalidate(); parties.value = []; contracts.value = []; categories.value = []; errorMessage.value = ''
}
watch([pId, rId, companyId, () => getFingerprint()], () => {clear();void loadData()}, {immediate:true,flush:'sync'})
onUnmounted(() => {tracker.invalidate();previewTracker.invalidate();decisionTracker.invalidate()})

async function loadData() {
  clear()
  if (!pId.value || !rId.value || !companyId.value || !link.value.valid) { errorMessage.value = 'Mã yêu cầu hoặc phiên không hợp lệ.'; return }
  const token = tracker.start({ companyId: companyId.value, projectId: pId.value, requestId: rId.value, fp: getFingerprint() })
  try {
    const ctx = await repo.readProjectContext(pId.value)
    if (!token.isCurrent() || getFingerprint()!==token.identity.fp) return
    context.value = ctx
    if (ctx.mode === 'legacy') return

    if(link.value.kind!=='installment'){
      const kind=link.value.kind,versionId=link.value.versionId
      const [aData,hData]=await Promise.all([repo.readAdjustment(token.identity.projectId,token.identity.requestId),repo.readRequestHistory(token.identity.projectId,token.identity.requestId)])
      if(!token.isCurrent()||getFingerprint()!==token.identity.fp)return
      const snapshot=hData.find(value=>value.id===(versionId??aData.submittedVersionId))
      const matchesKind=snapshot&&(kind==='contract_adjustment'?'proposedCap' in snapshot.input:'kind' in snapshot.input&&snapshot.input.kind===kind)
      if(aData.id!==token.identity.requestId||aData.kind!==kind||!snapshot||!matchesKind||(snapshot.decision&&snapshot.decision.submittedVersionId!==snapshot.id)){
        errorMessage.value='Không tìm thấy đúng hồ sơ và phiên đã gửi trong liên kết.';return
      }
      adjustment.value=aData;adjustmentSnapshot.value=snapshot;history.value=hData
      return
    }
    const [rData, hData, cts, cash] = await Promise.all([
      repo.readRequest(pId.value, rId.value),
      repo.readRequestHistory(pId.value, rId.value),
      repo.listContracts(pId.value),
      repo.readCash(pId.value),
    ])
    if (!token.isCurrent() || getFingerprint()!==token.identity.fp) return
    if(rData.id!==token.identity.requestId||(link.value.versionId&&rData.submittedVersionId!==link.value.versionId)){
      errorMessage.value='Không tìm thấy đúng hồ sơ và phiên đã gửi trong liên kết.';return
    }
    if(link.value.versionId){
      const snapshot=hData.find(value=>value.id===link.value.versionId)
      if(!snapshot||!('basis' in snapshot.input)||(snapshot.decision&&snapshot.decision.submittedVersionId!==snapshot.id)){
        errorMessage.value='Không tìm thấy đúng hồ sơ và phiên đã gửi trong liên kết.';return
      }
      req.value={...rData,...snapshot.input,evidenceFileIds:snapshot.evidenceFileIds,latestDecision:snapshot.decision,status:snapshot.decision?.decision==='return'?'returned':snapshot.decision?.decision==='approve'?'approved':'submitted'}
    }else req.value=rData
    history.value = hData
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