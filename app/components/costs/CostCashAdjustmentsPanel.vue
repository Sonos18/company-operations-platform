<template>
  <div class="cockpit-card cash-adjustments-panel">
    <div class="header">
      <h4>Điều chỉnh dòng tiền & Hoàn tiền</h4>
      <span class="cockpit-badge">{{ isCompleted ? 'Đã hoàn thành' : 'Đang hoạt động' }}</span>
    </div>

    <div v-if="isCompleted" class="alert info">
      Dự án đã kết thúc: Chỉ cho phép xử lý hoàn tiền hoặc hiệu chỉnh gắn với các khoản thanh toán hiện hữu.
    </div>
    <div v-if="actionError" class="alert error" role="alert">{{ actionError }}</div>

    <div class="section">
      <h5>Hồ sơ điều chỉnh & hoàn tiền ({{ adjustments.length }})</h5>
      <div v-if="adjustments.length === 0" class="empty">Chưa có bản ghi điều chỉnh nào.</div>
      <div v-for="adj in adjustments" :key="adj.id" class="adj-item">
        <div class="adj-header">
          <strong>{{ formatKind(adj.kind) }}</strong>
          <span class="cockpit-badge">{{ formatStatus(adj.status) }}</span>
        </div>
        <p class="adj-desc">
          Số tiền: <strong>{{ getAdjustmentAmount(adj) }}</strong> | Lý do: {{ getAdjustmentReason(adj) }}
        </p>

        <div v-if="adj.input.evidenceFileIds?.length" class="evidence-row">
          <span>Hồ sơ gốc ({{ adj.input.evidenceFileIds.length }}):</span>
          <span v-for="(fId, idx) in adj.input.evidenceFileIds" :key="fId">
            <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="!canReadFile" @click="openEvidence(fId)">Xem chứng từ #{{ idx + 1 }}</button>
            <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="!canReadFile" @click="openEvidence(fId, 'attachment')">Tải bản gốc</button>
          </span>
        </div>

        <div v-if="canDecide && adj.status === 'submitted'" class="decision-box">
          <input
            v-model="decisionReasons[adj.id]"
            type="text"
            class="cockpit-input"
            placeholder="Lý do (bắt buộc khi trả lại hồ sơ)"
            :disabled="isBusy || uploadBusy"
          >
          <div class="btn-group">
            <button type="button" class="cockpit-btn cockpit-btn--sm cockpit-btn--primary" :disabled="isBusy || uploadBusy" @click="handleDecide(adj, 'approve')">
              Phê duyệt
            </button>
            <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="isBusy || uploadBusy" @click="handleDecide(adj, 'return')">
              Trả lại
            </button>
          </div>
        </div>

        <div v-if="adj.kind === 'refund' && adj.status === 'approved' && (hasUnreceivedRefund(adj) || pendingRefund?.id === adj.id) && canConfirmRefund" class="action-box">
          <button v-if="confirmingRefundId !== adj.id" type="button" class="cockpit-btn cockpit-btn--sm" :disabled="isBusy || uploadBusy || Boolean(pendingRefund)" @click="startConfirmRefund(adj)">
            Ghi nhận nhận hoàn tiền thực tế
          </button>
          <div v-else class="confirm-form">
            <h6>Xác nhận nhận tiền hoàn thực tế</h6>
            <div class="grid-2">
              <input v-model="confirmAmount" type="text" class="cockpit-input" placeholder="Số tiền thực nhận" :disabled="isBusy || uploadBusy || Boolean(pendingRefund)" >
              <input v-model="confirmDate" type="date" class="cockpit-input" :disabled="isBusy || uploadBusy || Boolean(pendingRefund)" >
            </div>
            <p v-if="pendingRefund" class="alert warn">Lệnh xác nhận đang chờ kiểm tra kết quả. Giữ nguyên dữ liệu và bấm Xác nhận hoàn tất để thử lại, hoặc tải lại hồ sơ.</p>
            <p v-else-if="refundAmountError" class="alert error">{{ refundAmountError }}</p>
            <CostWorkflowOriginalUpload
              v-if="!pendingRefund"
              :key="adj.id"
              :company-id="companyId"
              :project-id="projectId" :target="{ kind: 'adjustment', id: adj.id }"
              :allowed-kinds="['payment_proof']"
              @finalized="onConfirmFileFinalized" @busy="uploadBusy=$event"
            />
            <div class="actions">
              <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="isBusy || uploadBusy || Boolean(pendingRefund)" @click="confirmingRefundId = null">Hủy</button>
              <button type="button" class="cockpit-btn cockpit-btn--sm cockpit-btn--primary" :disabled="isBusy || !canSubmitConfirmRefund" @click="submitConfirmRefund(adj)">
                Xác nhận hoàn tất
              </button>
            </div>
          </div>
        </div>

        <div v-if="adj.kind === 'correction' && adj.status === 'approved' && !adj.correctionApplied && canApplyCorrection" class="action-box">
          <button type="button" class="cockpit-btn cockpit-btn--sm cockpit-btn--primary" :disabled="isBusy || uploadBusy" @click="handleApplyCorrection(adj)">
            Áp dụng số tiền hiệu chỉnh vào sổ
          </button>
        </div>
      </div>
    </div>

    <div v-if="canCreate" class="section create-box">
      <h5>Lập đề nghị điều chỉnh chi phí / Hoàn tiền</h5>
      <p v-if="frozenCreate" class="alert warn">
        Đang có lệnh gửi gián đoạn.
        <button type="button" class="link-btn" @click="emit('changed')">Tải lại hồ sơ để kiểm tra kết quả</button>
      </p>

      <form @submit.prevent="handleCreateAdjustment">
        <div class="grid-2">
          <div>
            <label class="label">Khoản thanh toán gốc *</label>
            <select :key="getFingerprint()" v-model="selectedPaymentId" class="cockpit-select" :disabled="isBusy || uploadBusy" required>
              <option value="" disabled>-- Chọn khoản thanh toán gốc --</option>
              <option v-for="p in payments" :key="p.id" :value="p.id">
                {{ p.paymentDate }} - {{ p.amount }} {{ p.currencyCode }}
              </option>
            </select>
          </div>
          <div>
            <label class="label">Loại điều chỉnh *</label>
            <select v-model="adjKind" class="cockpit-select" :disabled="isBusy || uploadBusy">
              <option value="refund">Yêu cầu hoàn tiền</option>
              <option value="correction">Hiệu chỉnh tiền chi</option>
            </select>
          </div>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">{{ adjKind === 'refund' ? 'Số tiền yêu cầu hoàn *' : 'Số tiền chi thực tế sau sửa *' }}</label>
            <input v-model="adjAmount" type="text" class="cockpit-input" placeholder="0.00" :disabled="isBusy || uploadBusy" required >
          </div>
          <div>
            <label class="label">Lý do điều chỉnh *</label>
            <input v-model="adjReason" type="text" class="cockpit-input" placeholder="Nhập lý do chi tiết" :disabled="isBusy || uploadBusy" required >
          </div>
        </div>

        <div v-if="selectedPaymentId" class="upload-area">
          <label class="label">Chứng từ gốc đính kèm (tối thiểu 1 hồ sơ) *</label>
          <CostWorkflowOriginalUpload
            :key="selectedPaymentId"
            :company-id="companyId"
            :project-id="projectId" :target="{ kind: 'adjustment', sourcePaymentId: selectedPaymentId }"
            :allowed-kinds="['payment_proof', 'accounting_support']"
            @finalized="onCreateFileFinalized" @busy="uploadBusy=$event"
          />
          <div v-if="adjFiles.length > 0" class="file-list">
            <div v-for="f in adjFiles" :key="f.id" class="file-item">
              <span>{{ f.name }}</span>
              <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="isBusy || uploadBusy" @click="adjFiles = adjFiles.filter(x => x.id !== f.id)">Gỡ</button>
            </div>
          </div>
        </div>

        <label><input v-model="createReviewed" type="checkbox" :disabled="isBusy || uploadBusy"> Tôi đã rà soát đề nghị và chứng từ gốc.</label>
        <div class="actions">
          <button type="submit" class="cockpit-btn cockpit-btn--primary" :disabled="!canSubmitCreate || isBusy">
            {{ isBusy ? 'Đang gửi...' : 'Gửi đề nghị điều chỉnh' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import Decimal from 'decimal.js'
import { createFrozenWorkflowCommand } from '../../utils/costs/frozen-workflow-command'
import { ref, shallowRef, computed, watch, onUnmounted } from 'vue'
import {
  cashAdjustmentInputSchema,
  workflowRefundConfirmationSchema,
  workflowCommandVersionSchema,
  workflowDecisionInputSchema,
  type WorkflowProjectContext,
  type WorkflowAdjustmentView,
  type WorkflowPaymentView,
  type WorkflowDecisionInput,
  type CashAdjustmentInput,
  type WorkflowRefundConfirmation,
  type WorkflowCommandVersion,
} from '../../../shared/schemas/costs/cost-workflow'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import CostWorkflowOriginalUpload from './CostWorkflowOriginalUpload.vue'

const props = defineProps<{
  companyId: string
  projectId: string
  context: WorkflowProjectContext
  adjustments: WorkflowAdjustmentView[]
  payments: (WorkflowPaymentView & { version: number })[]
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

const scopeCurrent=()=> $companyAccessStore.activeCompanyId===props.companyId&&props.context.mode==='document_backed_v1'
const isCompleted=computed(()=>props.context.operationalState==='completed')
const canDecide=computed(()=>scopeCurrent()&&props.context.canDecide&&hasPerm('cost.request.decide'))
const canCreate=computed(()=>scopeCurrent()&&hasPerm('cost.correct')&&hasPerm('cost.request.submit')&&hasPerm('cost.prepare')&&(props.context.operationalState==='active'||isCompleted.value))
const canConfirmRefund=computed(()=>scopeCurrent()&&hasPerm('cost.record_cash')&&hasPerm('cost.request.submit'))
const canApplyCorrection=computed(()=>scopeCurrent()&&hasPerm('cost.correct')&&hasPerm('cost.request.submit'))
const canReadFile=computed(()=>scopeCurrent()&&hasPerm('cost.request.file.read'))
type EvidenceEntry={id:string;name:string}
const selectedPaymentId=ref(''),adjKind=ref<'refund'|'correction'>('refund'),adjAmount=ref(''),adjReason=ref(''),adjFiles=ref<EvidenceEntry[]>([])
const createReviewed=ref(false),decisionReasons=ref<Record<string,string>>({}),confirmingRefundId=ref<string|null>(null),confirmAmount=ref(''),confirmDate=ref(new Date().toISOString().slice(0,10)),confirmRefundFiles=ref<EvidenceEntry[]>([])
const isBusy=ref(false),uploadBusy=ref(false),actionError=ref(''),frozenCreate=ref(false)
const pendingRefund=shallowRef<{id:string;input:WorkflowRefundConfirmation}|null>(null)
let mounted=true
const tracker=createAsyncRequestTracker<{fp:string}>()
const previewTracker=createAsyncRequestTracker<{fp:string;projectId:string}>()
const capturedFp=getFingerprint()
const commandScope=()=>mounted&&scopeCurrent()&&getFingerprint()===capturedFp
const createSession=createFrozenWorkflowCommand<CashAdjustmentInput,unknown>({isScopeCurrent:commandScope,send:(id,input,key)=>repo.createCashAdjustment(props.projectId,id,input,{idempotencyKey:key})})
const decisionSession=createFrozenWorkflowCommand<{contractId:string|null;kind:string;input:WorkflowDecisionInput},unknown>({isScopeCurrent:commandScope,send:(id,p,key)=>p.kind==='contract_adjustment'&&p.contractId?repo.decideContractAdjustment(props.projectId,p.contractId,id,p.input,{idempotencyKey:key}):repo.decideCashAdjustment(props.projectId,id,p.input,{idempotencyKey:key})})
const refundSession=createFrozenWorkflowCommand<WorkflowRefundConfirmation,unknown>({isScopeCurrent:commandScope,send:(id,input,key)=>repo.confirmRefund(props.projectId,id,input,{idempotencyKey:key})})
const correctionSession=createFrozenWorkflowCommand<WorkflowCommandVersion,unknown>({isScopeCurrent:commandScope,send:(id,input,key)=>repo.applyCashCorrection(props.projectId,id,input,{idempotencyKey:key})})
function formatKind(k:string){return k==='refund'?'Hoàn tiền':k==='correction'?'Hiệu chỉnh tiền chi':'Điều chỉnh hạn mức'}
function formatStatus(s:string){return ({working:'Chưa gửi',submitted:'Chờ duyệt',returned:'Trả lại',approved:'Đã duyệt'} as Record<string,string>)[s]??'Chưa xác định'}
function getAdjustmentAmount(adj:WorkflowAdjustmentView){const input=adj.input;return 'kind' in input?(input.kind==='refund'?input.requestedAmount:input.correctedOutgoing):input.proposedCap}
function getAdjustmentReason(adj:WorkflowAdjustmentView){return adj.input.reason}
function hasUnreceivedRefund(adj:WorkflowAdjustmentView){return adj.kind==='refund'&&new Decimal(getAdjustmentAmount(adj)).gt(adj.confirmedRefund)}
function resetCreateForm(){selectedPaymentId.value='';adjAmount.value='';adjReason.value='';adjFiles.value=[];createReviewed.value=false}
function clearAll(){tracker.invalidate();previewTracker.invalidate();resetCreateForm();decisionReasons.value={};confirmingRefundId.value=null;confirmAmount.value='';confirmRefundFiles.value=[];pendingRefund.value=null;isBusy.value=false;uploadBusy.value=false;actionError.value=''}
watch([()=>props.companyId,()=>props.projectId,()=>$companyAccessStore.activeCompanyId,getFingerprint],clearAll,{flush:'sync'})
watch([selectedPaymentId,adjKind],()=>{adjFiles.value=[];createReviewed.value=false},{flush:'sync'})
watch([adjAmount,adjReason,adjFiles],()=>{createReviewed.value=false},{deep:true,flush:'sync'})
onUnmounted(()=>{mounted=false;tracker.invalidate();previewTracker.invalidate()})
function onCreateFileFinalized(f:EvidenceEntry){if(scopeCurrent()&&!adjFiles.value.some(e=>e.id===f.id))adjFiles.value.push(f)}
function onConfirmFileFinalized(f:EvidenceEntry){if(commandScope()&&!pendingRefund.value&&!confirmRefundFiles.value.some(e=>e.id===f.id))confirmRefundFiles.value.push(f)}
async function openEvidence(fileId:string,disposition:'inline'|'attachment'='inline'){
 if(!canReadFile.value)return
 const token=previewTracker.start({fp:getFingerprint(),projectId:props.projectId})
 try{const value=await repo.readEvidenceUrl(token.identity.projectId,fileId,{disposition});if(token.isCurrent()&&getFingerprint()===token.identity.fp&&canReadFile.value)window.open(value.url,'_blank','noopener,noreferrer')}
 catch{if(token.isCurrent()&&getFingerprint()===token.identity.fp)actionError.value='Không thể mở chứng từ. Kiểm tra quyền truy cập.'}
}
const selectedPayment=computed(()=>props.payments.find(p=>p.id===selectedPaymentId.value))
function createInput(){const pay=selectedPayment.value;return pay?cashAdjustmentInputSchema.safeParse({kind:adjKind.value,...(adjKind.value==='refund'?{requestedAmount:adjAmount.value.trim()}:{correctedOutgoing:adjAmount.value.trim()}),reason:adjReason.value.trim(),evidenceFileIds:adjFiles.value.map(f=>f.id),expectedVersion:pay.version}):null}
const canSubmitCreate=computed(()=>canCreate.value&&createReviewed.value&&!uploadBusy.value&&createInput()?.success)
async function run(action:()=>Promise<unknown>){
 if(isBusy.value||uploadBusy.value||!commandScope())return
 const token=tracker.start({fp:getFingerprint()});isBusy.value=true;actionError.value=''
 try{await action();if(token.isCurrent()&&getFingerprint()===token.identity.fp)emit('changed')}
 catch{if(token.isCurrent()&&getFingerprint()===token.identity.fp)actionError.value='Chưa xác định kết quả thao tác. Thử lại cùng dữ liệu hoặc tải lại hồ sơ để kiểm tra.'}
 finally{if(token.isCurrent()&&getFingerprint()===token.identity.fp)isBusy.value=false}
}
async function handleCreateAdjustment(){const input=createInput(),pay=selectedPayment.value;if(!canSubmitCreate.value||!input?.success||!pay)return;frozenCreate.value=true;await run(()=>createSession.attempt(pay.id,input.data))}
async function handleDecide(adj:WorkflowAdjustmentView,decision:'approve'|'return'){
 if(!canDecide.value||adj.status!=='submitted'||!adj.submittedVersionId)return
 const reason=decisionReasons.value[adj.id]?.trim()
 const input=workflowDecisionInputSchema.safeParse({submittedVersionId:adj.submittedVersionId,decision,...(reason?{reason}:{})})
 if(!input.success){actionError.value='Cần nhập lý do trả lại hồ sơ.';return}
 if(adj.kind==='contract_adjustment'&&!adj.contractId)return
 await run(()=>decisionSession.attempt(adj.id,{kind:adj.kind,contractId:adj.contractId,input:input.data}))
}
function startConfirmRefund(adj:WorkflowAdjustmentView){
 if(!canConfirmRefund.value||isBusy.value||uploadBusy.value||pendingRefund.value||adj.kind!=='refund'||adj.status!=='approved')return
 confirmingRefundId.value=adj.id
 confirmAmount.value=new Decimal(getAdjustmentAmount(adj)).minus(adj.confirmedRefund).toFixed()
 confirmDate.value=new Date().toISOString().slice(0,10);confirmRefundFiles.value=[]
}
const selectedRefund=computed(()=>props.adjustments.find(adj=>adj.id===confirmingRefundId.value&&adj.kind==='refund'&&adj.status==='approved'))
const refundAmountError=computed(()=>{
 if(pendingRefund.value)return ''
 const adj=selectedRefund.value
 if(!adj)return 'Không tìm thấy đề nghị hoàn tiền đã duyệt.'
 try{
  const amount=new Decimal(confirmAmount.value.trim())
  const remaining=new Decimal(getAdjustmentAmount(adj)).minus(adj.confirmedRefund)
  if(!amount.isFinite()||amount.lte(0))return 'Số tiền thực nhận phải lớn hơn 0.'
  if(amount.gt(remaining))return 'Số tiền thực nhận vượt phần hoàn tiền đã duyệt chưa nhận.'
 }catch{return 'Số tiền thực nhận không hợp lệ.'}
 return ''
})
const canSubmitConfirmRefund=computed(()=>{
 if(!canConfirmRefund.value||!commandScope()||uploadBusy.value)return false
 if(pendingRefund.value)return pendingRefund.value.id===confirmingRefundId.value
 return Boolean(selectedRefund.value)&&!refundAmountError.value&&confirmRefundFiles.value.length>0&&workflowRefundConfirmationSchema.safeParse({amount:confirmAmount.value.trim(),receivedDate:confirmDate.value,evidenceFileIds:confirmRefundFiles.value.map(f=>f.id),expectedVersion:selectedRefund.value?.version}).success
})
async function submitConfirmRefund(adj:WorkflowAdjustmentView){
 if(!canSubmitConfirmRefund.value||isBusy.value||adj.status!=='approved'||adj.kind!=='refund')return
 if(!pendingRefund.value){
  const input=workflowRefundConfirmationSchema.safeParse({amount:confirmAmount.value.trim(),receivedDate:confirmDate.value,evidenceFileIds:confirmRefundFiles.value.map(f=>f.id),expectedVersion:adj.version})
  if(!input.success||refundAmountError.value)return
  pendingRefund.value={id:adj.id,input:input.data}
 }
 const pending=pendingRefund.value
 if(pending.id!==adj.id)return
 await run(async()=>{
  const receipt=await refundSession.attempt(pending.id,pending.input)
  if(commandScope()&&pendingRefund.value===pending){
   pendingRefund.value=null;confirmingRefundId.value=null;confirmRefundFiles.value=[]
  }
  return receipt
 })
}
async function handleApplyCorrection(adj:WorkflowAdjustmentView){if(!canApplyCorrection.value||adj.status!=='approved'||adj.kind!=='correction'||adj.correctionApplied)return;const input=workflowCommandVersionSchema.parse({expectedVersion:adj.version});await run(()=>correctionSession.attempt(adj.id,input))}

</script>

<style scoped>
.cash-adjustments-panel { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.header { display: flex; justify-content: space-between; align-items: center; }
.section { display: flex; flex-direction: column; gap: 8px; }
.empty { font-size: 13px; color: #64748b; font-style: italic; }
.adj-item { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.adj-header { display: flex; justify-content: space-between; align-items: center; }
.adj-desc { font-size: 13px; margin: 0; }
.evidence-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.decision-box { display: flex; gap: 8px; margin-top: 6px; }
.action-box { margin-top: 6px; }
.confirm-form { background: #f8fafc; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
.label { font-size: 12px; font-weight: 500; color: #334155; display: block; margin-bottom: 2px; }
.upload-area { margin: 6px 0; display: flex; flex-direction: column; gap: 4px; }
.file-list { display: flex; flex-direction: column; gap: 4px; }
.file-item { display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
.actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.btn-group { display: flex; gap: 6px; }
.link-btn { background: none; border: none; color: #2563eb; text-decoration: underline; cursor: pointer; padding: 0; font-size: 13px; }
.alert { padding: 6px 10px; border-radius: 4px; font-size: 13px; }
.alert.info { background: #e0f2fe; color: #0369a1; }
.alert.warn { background: #fef3c7; color: #92400e; }
.alert.error { background: #fee2e2; color: #991b1b; }
.create-box { border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style>