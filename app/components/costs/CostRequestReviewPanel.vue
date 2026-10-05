<template>
  <div class="cockpit-card cost-request-panel">
    <div class="row" style="justify-content: space-between;">
      <h4>Rà soát & Đề nghị khoản chi</h4>
      <span v-if="isReadonly" class="cockpit-badge">Chỉ đọc ({{ initial?.status }})</span>
      <span v-else-if="retryReady" class="cockpit-badge warn">Chờ xác nhận kết quả gửi trước</span>
    </div>
    <div v-if="context.operationalState === 'completed'" class="alert warn">Dự án đã hoàn thành, không thể gửi yêu cầu.</div>
    <div v-if="errorMessage" class="alert error">{{ errorMessage }}</div>
    <div v-if="scanNotice" class="alert warn">{{ scanNotice }}</div>

    <form @submit.prevent="handleSubmit">
      <div class="grid">
        <label>Đối tác *
          <select v-model="partyId" :disabled="isReadonly || isSubmitting || retryReady">
            <option value="">-- Chọn đối tác --</option>
            <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }} ({{ p.kind === 'crew' ? (p.crewOwnership === 'vqh_internal' ? 'VQH' : p.crewOwnership==='external'?'Ngoài':'Chưa phân loại') : 'NCC' }})</option>
          </select>
        </label>
        <label>Hạng mục *
          <select v-model="categoryId" :disabled="isReadonly || isSubmitting || retryReady">
            <option value="">-- Chọn hạng mục --</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label>Hợp đồng căn cứ
          <select v-model="contractVersionId" :disabled="isReadonly || isSubmitting || retryReady">
            <option value="">-- Không gắn HĐ --</option>
            <option v-for="ct in filteredContracts" :key="ct.id" :value="ct.versionId">{{ ct.reference }} ({{ ct.cap }} {{ ct.currencyCode }})</option>
          </select>
        </label>
      </div>

      <div class="grid">
        <label>Số tiền * <input v-model="amount" type="text" placeholder="1000000" :disabled="isReadonly || isSubmitting || retryReady" ></label>
        <label>Tiền tệ * <input v-model="currencyCode" type="text" maxlength="3" :disabled="isReadonly || isSubmitting || retryReady" ></label>
        <label>Phân loại cơ sở chi *
          <select v-model="basisKind" :disabled="isReadonly || isSubmitting || retryReady">
            <option value="materials">Vật tư</option>
            <option value="subcontract">Hợp đồng phụ</option>
            <option value="direct_labor">Nhân công VQH</option>
            <option value="machinery">Máy thi công</option>
            <option value="other">Chi phí khác</option>
          </select>
        </label>
      </div>

      <div v-if="basisKind === 'materials'">
        <label>Địa điểm giao * <input v-model="deliverySite" :disabled="isReadonly || isSubmitting || retryReady" ></label>
        <div v-for="(l, i) in matLines" :key="i" class="row">
          <input v-model="l.description" placeholder="Tên vật tư" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="l.quantity" placeholder="SL" style="width:70px" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="l.unit" placeholder="ĐVT" style="width:60px" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="l.unitPrice" placeholder="Đơn giá" style="width:110px" :disabled="isReadonly || isSubmitting || retryReady" >
          <button v-if="!isReadonly && matLines.length > 1" type="button" @click="matLines.splice(i, 1)">Xóa</button>
        </div>
        <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn" @click="matLines.push({ description: '', quantity: '1', unit: 'cái', unitPrice: '0' })">+ Thêm dòng</button>
      </div>
      <div v-else-if="basisKind === 'subcontract'" class="grid">
        <label>Hợp đồng phụ * <select v-model="subcontractId" :disabled="isReadonly || isSubmitting || retryReady"><option value="">Chọn hợp đồng phụ</option><option v-for="contract in filteredContracts.filter(item => item.sourceSubcontractId)" :key="contract.id" :value="contract.sourceSubcontractId">{{ contract.reference }}</option></select></label>
        <label>Số BB nghiệm thu * <input v-model="acceptanceReference" :disabled="isReadonly || isSubmitting || retryReady" ></label>
        <label>Tiền giữ lại * <input v-model="retentionAmount" :disabled="isReadonly || isSubmitting || retryReady" ></label>
      </div>
      <div v-else-if="basisKind === 'direct_labor'">
        <label>Ngày đầu tuần (YYYY-MM-DD) * <input v-model="weekStart" type="date" :disabled="isReadonly || isSubmitting || retryReady" ></label>
        <div v-for="(w, i) in laborWorkers" :key="i" class="row">
          <input v-model="w.workerReference" placeholder="Thợ" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="w.days" placeholder="Công" style="width:60px" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="w.dailyRate" placeholder="Đơn giá" style="width:100px" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="w.allowance" placeholder="Phụ cấp" style="width:100px" :disabled="isReadonly || isSubmitting || retryReady" >
          <button v-if="!isReadonly && laborWorkers.length > 1" type="button" @click="laborWorkers.splice(i, 1)">Xóa</button>
        </div>
        <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn" @click="laborWorkers.push({ workerReference: '', days: '1', dailyRate: '0', allowance: '0' })">+ Thêm thợ</button>
      </div>
      <div v-else>
        <div v-for="(l, i) in genericLines" :key="i" class="row">
          <input v-model="l.description" placeholder="Diễn giải" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="l.quantity" placeholder="SL" style="width:70px" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="l.unit" placeholder="ĐVT" style="width:60px" :disabled="isReadonly || isSubmitting || retryReady" >
          <input v-model="l.unitPrice" placeholder="Đơn giá" style="width:110px" :disabled="isReadonly || isSubmitting || retryReady" >
          <button v-if="!isReadonly && genericLines.length > 1" type="button" @click="genericLines.splice(i, 1)">Xóa</button>
        </div>
        <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn" @click="genericLines.push({ description: '', quantity: '1', unit: 'lần', unitPrice: '0' })">+ Thêm dòng</button>
      </div>

      <div class="grid">
        <label>Ghi chú VAT <input v-model="vatBasis" placeholder="Tùy chọn" :disabled="isReadonly || isSubmitting || retryReady" ></label>
        <label>Ghi chú làm tròn <input v-model="roundingBasis" placeholder="Tùy chọn" :disabled="isReadonly || isSubmitting || retryReady" ></label>
        <label>Ghi chú phụ cấp <input v-model="allowanceBasis" placeholder="Tùy chọn" :disabled="isReadonly || isSubmitting || retryReady" ></label>
      </div>

      <CostWorkflowOriginalUpload v-if="!isReadonly && !retryReady" :company-id="companyId" :project-id="projectId" :target="{ kind: 'request', ...(currentRequestId ? { id: currentRequestId } : {}) }" @finalized="onEvidenceFinalized" @busy="uploadBusy = $event" />
      <div>
        <strong>Hồ sơ chứng từ gốc ({{ evidenceList.length }}):</strong>
        <div v-for="ev in evidenceList" :key="ev.id" class="evidence-row">
          <span>{{ ev.name }}</span>
          <div>
            <button type="button" class="cockpit-btn" :disabled="!companyAccess.hasPermission('cost.request.file.read')" @click="previewEvidence(ev.id)">Xem</button><button type="button" class="cockpit-btn" :disabled="!companyAccess.hasPermission('cost.request.file.read')" @click="previewEvidence(ev.id,'attachment')">Tải</button>
            <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn" :disabled="isScanning" @click="scanEvidence(ev.id)">Trích xuất gợi ý</button>
            <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn" @click="removeEvidence(ev.id)">Gỡ</button>
          </div>
        </div>
      </div>

      <div v-if="suggestedResult" class="alert warn">
        Gợi ý: {{ suggestedResult.fields.amount || '' }} {{ suggestedResult.fields.currencyCode || '' }} | Đối tác gợi ý: {{ suggestedResult.fields.partyHint || 'Chưa rõ' }} (chọn thủ công)
        <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn" @click="applySuggestion">Áp dụng dữ liệu gợi ý</button>
      </div>

      <label class="row"><input v-model="reviewed" type="checkbox" :disabled="isReadonly || isSubmitting || retryReady" ><span>Đã rà soát hợp lệ chứng từ và số liệu chi.</span></label>
      <div class="actions">
        <button type="button" class="cockpit-btn" :disabled="isSubmitting" @click="$emit('cancel')">Hủy</button>
        <button v-if="!isReadonly" type="submit" class="cockpit-btn cockpit-btn--primary" :disabled="!canSubmit">
          {{ isSubmitting ? 'Đang gửi...' : retryReady ? 'Thử lại gửi duyệt khoản chi' : 'Gửi duyệt khoản chi' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  costRequestInputSchema,
  type CostRequestInput,
  type CostBasisInput,
  type CostRequestView,
  type WorkflowContractView,
  type WorkflowProjectContext,
  type WorkflowPartyOption,
} from '../../../shared/schemas/costs/cost-workflow'
import type { ExtractionResult } from '../../../shared/schemas/costs/cost-extraction'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import { createReviewedRequestSubmission } from '../../utils/costs/cost-request-submission'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import CostWorkflowOriginalUpload from './CostWorkflowOriginalUpload.vue'

const props = defineProps<{
  companyId: string
  projectId: string
  context: WorkflowProjectContext
  parties: WorkflowPartyOption[]
  categories: Array<{ id: string; name: string }>
  contracts: WorkflowContractView[]
  initial?: CostRequestView
}>()

const emit = defineEmits<{ (e: 'submitted', requestId: string): void; (e: 'cancel'): void }>()
const repo: CostWorkflowRepository = useRepositories().costWorkflow
const companyAccess = useNuxtApp().$companyAccessStore
const permissionFingerprint = () => JSON.stringify([...companyAccess.permissions].sort())
const scopeCurrent = () => companyAccess.activeCompanyId === props.companyId && companyAccess.hasPermission('cost.request.read')
const uploadBusy = ref(false)

const partyId = ref(props.initial?.partyId || '')
const categoryId = ref(props.initial?.categoryId || '')
const contractVersionId = ref(props.initial?.contractVersionId || '')
const amount = ref(props.initial?.amount || '')
const currencyCode = ref(props.initial?.currencyCode || 'VND')
const basisKind = ref<'materials' | 'subcontract' | 'direct_labor' | 'machinery' | 'other'>(props.initial?.basis.kind || 'materials')

const deliverySite = ref(props.initial?.basis.kind === 'materials' ? props.initial.basis.deliverySite : '')
const matLines = ref(props.initial?.basis.kind === 'materials' ? props.initial.basis.lines.map(l => ({ ...l })) : [{ description: '', quantity: '1', unit: 'cái', unitPrice: '0' }])
const subcontractId = ref(props.initial?.basis.kind === 'subcontract' ? props.initial.basis.subcontractId : '')
const acceptanceReference = ref(props.initial?.basis.kind === 'subcontract' ? props.initial.basis.acceptanceReference : '')
const retentionAmount = ref(props.initial?.basis.kind === 'subcontract' ? props.initial.basis.retentionAmount : '0')
const weekStart = ref(props.initial?.basis.kind === 'direct_labor' ? props.initial.basis.weekStart : '')
const laborWorkers = ref(props.initial?.basis.kind === 'direct_labor' ? props.initial.basis.workers.map(w => ({ ...w })) : [{ workerReference: '', days: '1', dailyRate: '0', allowance: '0' }])
const genericLines = ref(props.initial?.basis.kind === 'machinery' || props.initial?.basis.kind === 'other' ? props.initial.basis.lines.map(l => ({ ...l })) : [{ description: '', quantity: '1', unit: 'lần', unitPrice: '0' }])

const vatBasis = ref(props.initial?.accountingBasis?.vatBasis || '')
const roundingBasis = ref(props.initial?.accountingBasis?.roundingBasis || '')
const allowanceBasis = ref(props.initial?.accountingBasis?.allowanceBasis || '')

const evidenceList = ref<Array<{ id: string; name: string }>>(
  props.initial?.evidenceFileIds.map((id, i) => ({ id, name: `Hồ sơ gốc #${i + 1} (${id.slice(0, 8)})` })) || []
)
const reviewed = ref(false)
const isSubmitting = ref(false)
const isScanning = ref(false)
const retryReady = ref(false)
const errorMessage = ref('')
const scanNotice = ref('')
const suggestedResult = ref<ExtractionResult | null>(null)

const currentRequestId = ref<string | null>(props.initial?.id || null)
const expectedVersion = ref<number>(props.initial?.version ?? 0)
let submission = createSession()
function createSession(initial:CostRequestView|null=props.initial??null) {
 const captured = {companyId:props.companyId,projectId:props.projectId,permissions:permissionFingerprint()}
 return createReviewedRequestSubmission({projectId:captured.projectId,repository:repo,initial:initial??undefined,isScopeCurrent:()=>scopeCurrent()&&props.companyId===captured.companyId&&props.projectId===captured.projectId&&permissionFingerprint()===captured.permissions&&companyAccess.hasPermission('cost.request.submit')})
}

const actionTracker = createAsyncRequestTracker<{ companyId: string; projectId: string }>()
const isReadonly = computed(() => props.initial?.status === 'approved' || props.initial?.status === 'submitted')
const selectedParty = computed(() => props.parties.find(p => p.id === partyId.value))
const filteredContracts = computed(() => (!partyId.value ? props.contracts : props.contracts.filter(c => c.partyId === partyId.value)))

watch(partyId, () => {
  if (selectedParty.value?.crewOwnership === 'vqh_internal' && basisKind.value !== 'direct_labor') basisKind.value = 'direct_labor'
})
const scanTracker = createAsyncRequestTracker<{companyId:string;projectId:string;fileId:string;requestId:string|null}>()
const previewTracker = createAsyncRequestTracker<{companyId:string;projectId:string;fileId:string}>()
function resetScope() {
 actionTracker.invalidate();scanTracker.invalidate();previewTracker.invalidate()
 errorMessage.value=''; scanNotice.value='';suggestedResult.value=null; reviewed.value=false
 isSubmitting.value=false;isScanning.value=false;uploadBusy.value=false;retryReady.value=false
 partyId.value='';categoryId.value='';contractVersionId.value='';amount.value='';deliverySite.value='';subcontractId.value='';acceptanceReference.value='';weekStart.value=''
 vatBasis.value='';roundingBasis.value='';allowanceBasis.value='';evidenceList.value=[]
 matLines.value=[{description:'',quantity:'1',unit:'',unitPrice:'0'}];genericLines.value=[{description:'',quantity:'1',unit:'',unitPrice:'0'}];laborWorkers.value=[{workerReference:'',days:'0',dailyRate:'0',allowance:'0'}]
 currencyCode.value='VND';basisKind.value='materials';retentionAmount.value='0';currentRequestId.value=null;expectedVersion.value=0;submission=createSession(null)
}
watch([()=>props.companyId,()=>props.projectId,()=>companyAccess.activeCompanyId,permissionFingerprint],resetScope,{flush:'sync'})
onUnmounted(()=>{actionTracker.invalidate();scanTracker.invalidate();previewTracker.invalidate()})

watch([partyId,categoryId,contractVersionId,amount,currencyCode,basisKind,deliverySite,matLines,subcontractId,acceptanceReference,retentionAmount,weekStart,laborWorkers,genericLines,vatBasis,roundingBasis,allowanceBasis,evidenceList],()=>{reviewed.value=false},{deep:true,flush:'sync'})

function onEvidenceFinalized(p: { id: string; name: string }) {
  if (!evidenceList.value.some(e => e.id === p.id)) evidenceList.value.push(p)
}
function removeEvidence(id: string) { evidenceList.value = evidenceList.value.filter(e => e.id !== id) }

async function previewEvidence(fileId:string, disposition:'inline'|'attachment'='inline') {
 if(!scopeCurrent()||!companyAccess.hasPermission('cost.request.file.read'))return
 const token=previewTracker.start({companyId:props.companyId,projectId:props.projectId,fileId})
 try {const res=await repo.readEvidenceUrl(token.identity.projectId,fileId,{disposition});if(token.isCurrent()&&scopeCurrent())window.open(res.url,'_blank','noopener,noreferrer')}
 catch(e:unknown){if(token.isCurrent()&&scopeCurrent())errorMessage.value=e instanceof Error?e.message:'Không thể mở chứng từ.'}
}
async function scanEvidence(fileId:string) {
 if(!scopeCurrent()||isScanning.value||!companyAccess.hasPermission('cost.request.submit')||!companyAccess.hasPermission('cost.request.file.read')||!companyAccess.hasPermission('cost.prepare'))return
 const token=scanTracker.start({companyId:props.companyId,projectId:props.projectId,fileId,requestId:currentRequestId.value})
 isScanning.value=true;scanNotice.value='';reviewed.value=false
 try {const res=await repo.extractEvidence(token.identity.projectId,fileId,{requestId:token.identity.requestId},{idempotencyKey:crypto.randomUUID()});if(!token.isCurrent()||!scopeCurrent())return;suggestedResult.value=res.result
  scanNotice.value=res.result.status==='unavailable'?'Ảnh hoặc PDF chưa có dịch vụ nhận dạng. Vui lòng nhập và rà soát thủ công.':'Dữ liệu chỉ là gợi ý; vui lòng rà soát trước khi gửi.'}
 catch(e:unknown){if(token.isCurrent()&&scopeCurrent())scanNotice.value=e instanceof Error?e.message:'Không thể trích xuất.'}
 finally {if(token.isCurrent()&&scopeCurrent())isScanning.value=false}
}

function applySuggestion() {
  if (!suggestedResult.value || !scopeCurrent() || isReadonly.value || retryReady.value) return
  reviewed.value=false
  const f = suggestedResult.value.fields
  if (f.amount) amount.value = f.amount
  if (f.currencyCode) currencyCode.value = f.currencyCode
  if (f.accountingBasis?.vatBasis) vatBasis.value = f.accountingBasis.vatBasis
  if (f.accountingBasis?.roundingBasis) roundingBasis.value = f.accountingBasis.roundingBasis
  if (f.accountingBasis?.allowanceBasis) allowanceBasis.value = f.accountingBasis.allowanceBasis
  if (f.basis?.kind === 'materials' && basisKind.value === 'materials') {
    if (f.basis.deliverySite) deliverySite.value = f.basis.deliverySite
    if (f.basis.lines?.length) matLines.value = f.basis.lines.map(l => ({ ...l }))
  } else if(f.basis?.kind==='direct_labor'&&basisKind.value==='direct_labor'){
    if(f.basis.weekStart)weekStart.value=f.basis.weekStart
    if(f.basis.workers.length)laborWorkers.value=f.basis.workers.map(w=>({...w}))
  } else if(f.basis?.kind==='subcontract'&&basisKind.value==='subcontract'){
    if(f.basis.acceptanceReference)acceptanceReference.value=f.basis.acceptanceReference
    if(f.basis.retentionAmount)retentionAmount.value=f.basis.retentionAmount
  } else if(f.basis&&(f.basis.kind==='machinery'||f.basis.kind==='other')&&f.basis.kind===basisKind.value){
    if(f.basis.lines.length)genericLines.value=f.basis.lines.map(l=>({...l}))
  }
}

function buildBasis(): CostBasisInput {
  if (basisKind.value === 'materials') return { kind: 'materials', deliverySite: deliverySite.value, lines: matLines.value }
  if (basisKind.value === 'subcontract') return { kind: 'subcontract', subcontractId: subcontractId.value, acceptanceReference: acceptanceReference.value, retentionAmount: retentionAmount.value }
  if (basisKind.value === 'direct_labor') return { kind: 'direct_labor', weekStart: weekStart.value, workers: laborWorkers.value }
  return { kind: basisKind.value, lines: genericLines.value }
}

function buildInput(): CostRequestInput | null {
  const p = selectedParty.value
  if (!p) return null
  const acc = { ...(vatBasis.value ? { vatBasis: vatBasis.value } : {}), ...(roundingBasis.value ? { roundingBasis: roundingBasis.value } : {}), ...(allowanceBasis.value ? { allowanceBasis: allowanceBasis.value } : {}) }
  const candidate = {
    partyId: p.id,
    partyKind: p.kind,
    ...(p.kind === 'crew' ? { crewOwnership: p.crewOwnership } : {}),
    categoryId: categoryId.value,
    ...(contractVersionId.value ? { contractVersionId: contractVersionId.value } : {}),
    amount: amount.value,
    currencyCode: currencyCode.value,
    basis: buildBasis(),
    ...(Object.keys(acc).length > 0 ? { accountingBasis: acc } : {}),
    evidenceFileIds: evidenceList.value.map(e => e.id),
  }
  const parsed = costRequestInputSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

const canSubmit = computed(() => scopeCurrent() && companyAccess.hasPermission('cost.request.submit') && !uploadBusy.value && !isScanning.value && !isReadonly.value && !isSubmitting.value && props.context.canSubmit && props.context.operationalState !== 'completed' && reviewed.value && evidenceList.value.length > 0 && buildInput() !== null)

async function handleSubmit() {
 const input=buildInput()
 if(!input||!canSubmit.value)return
 const token=actionTracker.start({companyId:props.companyId,projectId:props.projectId})
 isSubmitting.value=true;errorMessage.value=''
 try {const receipt=await submission.submit(input);if(!token.isCurrent()||!scopeCurrent())return;currentRequestId.value=receipt.requestId;expectedVersion.value=receipt.result.version;retryReady.value=false;emit('submitted',receipt.requestId)}
 catch(e:unknown){if(!token.isCurrent()||!scopeCurrent())return;currentRequestId.value=submission.requestId??null;expectedVersion.value=submission.version;retryReady.value=true;errorMessage.value=e instanceof Error&&e.message==='REQUEST_RESPONSE_UNCERTAIN'?'Chưa xác định kết quả gửi trước. Thử lại đúng dữ liệu hoặc tải lại yêu cầu trước khi chỉnh sửa.':e instanceof Error?e.message:'Không thể gửi yêu cầu.'}
 finally {if(token.isCurrent()&&scopeCurrent())isSubmitting.value=false}
}

</script>

<style scoped>
.cost-request-panel { display: flex; flex-direction: column; gap: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; gap: 6px; align-items: center; margin-top: 4px; }
.alert { padding: 8px; border-radius: 4px; font-size: 13px; }
.alert.warn { background: #fef3c7; color: #92400e; }
.alert.error { background: #fee2e2; color: #991b1b; }
.evidence-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>