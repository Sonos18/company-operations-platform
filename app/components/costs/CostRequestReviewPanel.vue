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

      <CostWorkflowOriginalUpload v-if="!isReadonly && !retryReady && !isScanning && !scanRetryReady && !ocrPending" :company-id="companyId" :project-id="projectId" :target="{ kind: 'request', ...(currentRequestId ? { id: currentRequestId } : {}) }" @finalized="onEvidenceFinalized" @busy="uploadBusy = $event" />
      <section aria-label="Chọn báo giá đã tải lên">
        <button type="button" class="cockpit-btn" :disabled="!canPickQuotation || quotationLoading" @click="listQuotations">Chọn báo giá đã tải lên</button>
        <p v-if="quotationLoading" role="status">Đang tải báo giá…</p>
        <p v-else-if="quotationError" class="alert error" role="alert">Không thể tải báo giá. Vui lòng thử lại.</p>
        <p v-else-if="quotationListed && !quotationChoices.length" role="status">Không có báo giá đã tải lên phù hợp.</p>
        <ul v-else-if="quotationChoices.length">
          <li v-for="quotation in quotationChoices" :key="quotation.id">
            <span>{{ quotation.originalFilename }} · Tải lên: <time :datetime="quotation.finalizedAt">{{ quotation.finalizedAt }}</time> · {{ quotation.sizeBytes }} bytes</span>
            <button type="button" class="cockpit-btn" :data-quotation-id="quotation.id" :disabled="!canPickQuotation || quotationLoading || evidenceList.some(ev => ev.id === quotation.id)" @click="selectQuotation(quotation)">{{ evidenceList.some(ev => ev.id === quotation.id) ? 'Đã thêm' : 'Chọn báo giá' }}</button>
          </li>
        </ul>
      </section>
      <div>
        <strong>Hồ sơ chứng từ gốc ({{ evidenceList.length }}):</strong>
        <div v-for="ev in evidenceList" :key="ev.id" class="evidence-row">
          <span>{{ ev.name }}</span>
          <div>
            <button type="button" class="cockpit-btn" :disabled="!companyAccess.hasPermission('cost.request.file.read')" @click="previewEvidence(ev.id)">Xem</button><button type="button" class="cockpit-btn" :disabled="!companyAccess.hasPermission('cost.request.file.read')" @click="previewEvidence(ev.id,'attachment')">Tải</button>
            <template v-if="!isReadonly && !retryReady">
              <label>Phạm vi quét khi tệp là PDF
                <select v-model="pdfScopes[ev.id]" :disabled="isScanning || scanRetryReady || ocrPending">
                  <option value="">-- Chọn trang PDF --</option>
                  <option value="1">Trang 1</option>
                  <option value="1-2">Trang 1–2</option>
                </select>
              </label>
              <label v-if="pdfScopes[ev.id]">Tổng số trang theo người tải (tùy chọn)
                <input v-model="pdfCounts[ev.id]" type="number" min="1" step="1" :disabled="isScanning || scanRetryReady || ocrPending">
              </label>
              <button type="button" class="cockpit-btn" :disabled="!canScanEvidence(ev)" @click="scanEvidence(ev.id)">{{ scanRetryReady && scanSession.pendingFileId === ev.id ? 'Thử lại trích xuất' : ocrPollingState.fileId === ev.id ? 'Lấy kết quả' : 'Trích xuất gợi ý' }}</button>
            </template>
            <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn" :disabled="isScanning || scanRetryReady || ocrPending" @click="removeEvidence(ev.id)">Gỡ</button>
          </div>
        </div>
      </div>

      <div v-if="suggestedResult?.warnings.includes('OCR_DOCUMENT_KIND_REQUIRED')" class="alert warn" role="status">Chứng từ chưa có loại hợp lệ để quét. Hãy kiểm tra loại chứng từ của bản gốc.</div>
      <div v-if="suggestedResult?.azurePdfCoverage" class="alert warn" role="status">
        PDF: yêu cầu trang {{ suggestedResult.azurePdfCoverage.requestedPages.join(', ') }};
        nhận trang {{ suggestedResult.azurePdfCoverage.returnedPages.join(', ') || 'chưa có' }}.
        {{ suggestedResult.azurePdfCoverage.requestedPagesMatched ? 'Khớp phạm vi đã chọn.' : 'Chưa xác nhận đủ trang đã chọn.' }}
        <span v-if="suggestedResult.azurePdfCoverage.sourcePageCount.kind === 'unknown'">Chưa biết tổng số trang của bản gốc.</span>
        <span v-else-if="suggestedResult.azurePdfCoverage.sourcePageCount.kind === 'user-declared'">Người tải khai báo {{ suggestedResult.azurePdfCoverage.sourcePageCount.count }} trang; chưa xác minh.</span>
        <span v-else>Tổng số trang từ metadata đã kiểm tra: {{ suggestedResult.azurePdfCoverage.sourcePageCount.count }}.</span>
        Kết quả chưa xác nhận đầy đủ tài liệu. Hãy kiểm tra bản gốc và số liệu trước khi gửi duyệt.
      </div>
      <div v-if="suggestedResult && ['ready', 'needs_review'].includes(suggestedResult.status) && Object.keys(suggestedResult.fields).length" class="alert warn">
        Gợi ý: {{ suggestedResult.fields.amount || '' }} {{ suggestedResult.fields.currencyCode || '' }} | Đối tác gợi ý: {{ suggestedResult.fields.partyHint || 'Chưa rõ' }} (chọn thủ công)
        <p v-if="suggestedResult.fields.amount">Tổng tiền: {{ suggestionSource('amount') }}</p>
        <p v-if="suggestedResult.fields.accountingBasis?.vatBasis">{{ suggestedResult.fields.accountingBasis.vatBasis }} — {{ suggestionSource('accountingBasis.vatBasis') }}</p>
        <section v-if="materialsSourceReview" class="material-source-review" aria-label="Rà soát dòng vật tư từ chứng từ">
          <p>{{ materialsSourceReview.lines.length }} dòng nguồn: {{ materialsSourceReview.applicableCount }} dòng có thể áp dụng; {{ materialsSourceReview.withheldCount }} dòng giữ lại để rà soát.</p>
          <p v-if="materialsSourceReview.withheldCount"><strong>Cơ sở vật tư chưa đầy đủ:</strong> {{ materialsSourceReview.withheldCount }} dòng có thành tiền in khác SL × đơn giá nên chưa được áp dụng. Đối chiếu bản gốc và hoàn thiện các dòng này thủ công trước khi xác nhận đã rà soát.</p>
          <p v-if="suggestedResult.fields.amount">Tổng tiền in trên tài liệu: {{ suggestedResult.fields.amount }} {{ suggestedResult.fields.currencyCode || '' }} (toàn phạm vi trích xuất; {{ suggestionSource('amount') }}).</p>
          <p>Tổng các dòng có thể áp dụng (chưa VAT): {{ materialsSourceReview.applicableSum }} {{ suggestedResult.fields.currencyCode || '' }}. VND: làm tròn từng dòng đến đồng, half-up.</p>
          <p>Tổng các dòng vật tư hiện trong biểu mẫu (chưa VAT): {{ currentMaterialsSum ?? 'chưa tính được vì có dữ liệu chưa hợp lệ' }} {{ currencyCode || '' }}. {{ currencyCode === 'VND' ? 'Làm tròn từng dòng đến đồng, half-up.' : 'Cộng chính xác SL × đơn giá, chưa giả định quy tắc làm tròn.' }}</p>
          <p v-if="materialsSourceReview.withheldCount">Tổng tiền tài liệu không xác nhận khớp với cơ sở vật tư chỉ gồm các dòng được áp dụng. Chưa có dòng bị giữ lại nào được tự sửa hoặc tự thêm vào biểu mẫu.</p>
          <div style="overflow-x:auto">
            <table>
              <caption>Dòng nguồn để kế toán đối chiếu; số tiền in được giữ nguyên</caption>
              <thead><tr><th scope="col">Tên vật tư</th><th scope="col">SL</th><th scope="col">ĐVT</th><th scope="col">Đơn giá</th><th scope="col">Thành tiền in</th><th scope="col">SL × đơn giá (làm tròn đến đồng)</th><th scope="col">Rà soát</th><th scope="col">Nguồn và độ tin cậy OCR</th></tr></thead>
              <tbody><tr v-for="(line, index) in materialsSourceReview.lines" :key="`${line.pageNumber}-${line.tableIndex}-${line.rowIndex}`">
                <td>{{ line.description }}</td><td>{{ line.quantity }}</td><td>{{ line.unit }}</td><td>{{ line.unitPrice }}</td><td>{{ line.printedLineAmount }}</td><td>{{ line.calculatedLineAmount }}</td>
                <td>{{ line.status === 'reconciled' ? 'Có thể áp dụng' : 'Giữ lại để rà soát' }}</td>
                <td>Trang {{ line.pageNumber }}, bảng {{ line.tableIndex + 1 }}, dòng {{ line.rowIndex + 1 }};
                  {{ suggestionSource(`basis.sourceLines.${index}.description`) }};
                  {{ suggestionSource(`basis.sourceLines.${index}.quantity`) }};
                  {{ suggestionSource(`basis.sourceLines.${index}.unit`) }};
                  {{ suggestionSource(`basis.sourceLines.${index}.unitPrice`) }};
                  {{ suggestionSource(`basis.sourceLines.${index}.printedLineAmount`) }}
                </td>
              </tr></tbody>
            </table>
          </div>
        </section>
        <details v-else-if="suggestedResult.fields.basis?.kind === 'materials' && suggestedResult.fields.basis.lines.length">
          <summary>{{ suggestedResult.fields.basis.lines.length }} dòng vật tư gợi ý — kiểm tra bản gốc trước khi áp dụng</summary>
          <div style="overflow-x:auto">
            <table>
              <thead><tr><th scope="col">Tên vật tư</th><th scope="col">SL</th><th scope="col">ĐVT</th><th scope="col">Đơn giá</th><th scope="col">Nguồn và độ tin cậy OCR</th></tr></thead>
              <tbody><tr v-for="(line, index) in suggestedResult.fields.basis.lines" :key="index">
                <td>{{ line.description }}</td><td>{{ line.quantity }}</td><td>{{ line.unit }}</td><td>{{ line.unitPrice }}</td>
                <td>{{ suggestionSource(`basis.lines.${index}.description`) }}; {{ suggestionSource(`basis.lines.${index}.quantity`) }}; {{ suggestionSource(`basis.lines.${index}.unitPrice`) }}</td>
              </tr></tbody>
            </table>
          </div>
        </details>
        <button v-if="canApplySuggestion" type="button" class="cockpit-btn" @click="applySuggestion">Áp dụng dữ liệu gợi ý</button>
      </div>

      <label class="row"><input v-model="reviewed" type="checkbox" :disabled="isReadonly || isSubmitting || retryReady || isScanning || scanRetryReady || ocrPending" ><span>Đã rà soát hợp lệ chứng từ và số liệu chi.</span></label>
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
import {costExtractionCommandSchema,type CostExtractionView,type ExtractionResult} from '../../../shared/schemas/costs/cost-extraction'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import type { WorkflowRecoverableQuotation } from '../../../shared/schemas/costs/cost-workflow-evidence'
import { createReviewedRequestSubmission } from '../../utils/costs/cost-request-submission'
import {createEvidenceExtractionSession} from '../../utils/costs/cost-extraction-session'
import {createEvidenceExtractionPolling,hasApplicableExtractionFields,type EvidenceExtractionPollingState} from '../../utils/costs/cost-extraction-polling'
import { sumMaterialReviewLines } from '../../utils/costs/cost-extraction-review'
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
const auth = useNuxtApp().$authStore
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
const suggestedFileId=ref<string|null>(null)
const pdfScopes=ref<Record<string,string>>(Object.fromEntries(evidenceList.value.map(ev=>[ev.id,''])))
const pdfCounts=ref<Record<string,string|number>>({})
const scanRetryReady=ref(false)
const ocrPollingState=ref<EvidenceExtractionPollingState>({phase:'idle',fileId:null,automaticRequests:0,manualReady:false})
const ocrPending=computed(()=>ocrPollingState.value.fileId!==null)

const currentRequestId = ref<string | null>(props.initial?.id || null)
const expectedVersion = ref<number>(props.initial?.version ?? 0)
let lifecycleGeneration = 0
let submission = createSession()
let scanSession=createScanSession()
let scanPolling=createScanPolling()
function createScanScopeGuard(){
 const captured={companyId:props.companyId,projectId:props.projectId,requestId:currentRequestId.value,actorId:auth.user?.id,generation:lifecycleGeneration,permissions:permissionFingerprint()}
 return ()=>lifecycleGeneration===captured.generation&&scopeCurrent()&&props.companyId===captured.companyId&&props.projectId===captured.projectId&&currentRequestId.value===captured.requestId&&auth.user?.id===captured.actorId&&auth.lifecycle==='authenticated'&&permissionFingerprint()===captured.permissions&&companyAccess.hasPermission('cost.prepare')&&companyAccess.hasPermission('cost.request.submit')&&companyAccess.hasPermission('cost.request.file.read')
}
function createScanSession(){
 return createEvidenceExtractionSession({projectId:props.projectId,repository:repo,isScopeCurrent:createScanScopeGuard()})
}
function createScanPolling(){
 const session=scanSession,isScopeCurrent=createScanScopeGuard()
 return createEvidenceExtractionPolling({
  scan:(fileId,input)=>session.scan(fileId,input),isScopeCurrent,
  onStateChange:state=>{
   if(!isScopeCurrent())return
   ocrPollingState.value=state;isScanning.value=state.phase==='requesting'
   if(state.fileId&&state.phase!=='uncertain')scanNotice.value=state.phase==='limited'?'Đang xử lý OCR. Đã tạm dừng tự động lấy kết quả; bấm “Lấy kết quả” để kiểm tra lại.':'Đang xử lý OCR; hệ thống sẽ lấy kết quả trong phạm vi PDF đã chọn.'
  },
  onResult:result=>{if(isScopeCurrent())acceptScanResult(result)},
  onError:error=>{if(isScopeCurrent()){scanRetryReady.value=session.pendingFileId!==null;scanNotice.value=error instanceof Error?error.message:'Chưa xác định kết quả trích xuất. Thử lại với đúng tệp và phạm vi đã chọn.'}},
 })
}
function createSession(initial:CostRequestView|null=props.initial??null) {
 const captured = {companyId:props.companyId,projectId:props.projectId,permissions:permissionFingerprint(),generation:lifecycleGeneration}
 return createReviewedRequestSubmission({projectId:captured.projectId,repository:repo,initial:initial??undefined,isScopeCurrent:()=>lifecycleGeneration===captured.generation&&scopeCurrent()&&props.companyId===captured.companyId&&props.projectId===captured.projectId&&permissionFingerprint()===captured.permissions&&companyAccess.hasPermission('cost.request.submit')})
}

const actionTracker = createAsyncRequestTracker<{ companyId: string; projectId: string }>()
const isReadonly = computed(() => props.initial?.status === 'approved' || props.initial?.status === 'submitted')
const quotationChoices = ref<WorkflowRecoverableQuotation[]>([])
const quotationLoading = ref(false)
const quotationListed = ref(false)
const quotationError = ref(false)
const quotationTracker = createAsyncRequestTracker<{ scope: string; requestId: string | null; requestVersion: number | null }>()
let quotationChoiceToken: ReturnType<typeof quotationTracker.start> | null = null
const quotationScope = computed(() => JSON.stringify({
 actorId: auth.user?.id, authLifecycle: auth.lifecycle, activeCompanyId: companyAccess.activeCompanyId,
 companyId: props.companyId, projectId: props.projectId, permissions: permissionFingerprint(), generation: lifecycleGeneration,
 requestId: currentRequestId.value, requestVersion: expectedVersion.value,
 initialId: props.initial?.id, initialVersion: props.initial?.version, initialStatus: props.initial?.status,
 mode: props.context.mode, operationalState: props.context.operationalState, canSubmit: props.context.canSubmit,
}))
const quotationBusy = computed(() => isReadonly.value || isSubmitting.value || retryReady.value || uploadBusy.value || isScanning.value || scanRetryReady.value || ocrPending.value)
const canPickQuotation = computed(() => scopeCurrent() && !!auth.user?.id && auth.lifecycle === 'authenticated'
 && companyAccess.hasPermission('cost.prepare') && companyAccess.hasPermission('cost.request.submit') && companyAccess.hasPermission('cost.request.file.read')
 && props.context.mode === 'document_backed_v1' && props.context.operationalState === 'active' && props.context.canSubmit && !quotationBusy.value
 && (!props.initial || (props.initial.id === currentRequestId.value && props.initial.version === expectedVersion.value)))
function clearQuotationChoices() {
 quotationTracker.invalidate(); quotationChoiceToken = null
 quotationChoices.value = []; quotationLoading.value = false; quotationListed.value = false; quotationError.value = false
}
watch([quotationScope, quotationBusy], clearQuotationChoices, { flush: 'sync' })
function quotationTokenCurrent(token: ReturnType<typeof quotationTracker.start>) {
 return token.isCurrent() && token.identity.scope === quotationScope.value && canPickQuotation.value
}
async function listQuotations() {
 if (!canPickQuotation.value || quotationLoading.value) return
 clearQuotationChoices()
 const token = quotationTracker.start({ scope: quotationScope.value, requestId: currentRequestId.value, requestVersion: currentRequestId.value === null ? null : expectedVersion.value })
 quotationLoading.value = true
 try {
  const choices = await repo.listRecoverableQuotations(props.projectId, { requestId: token.identity.requestId, requestVersion: token.identity.requestVersion })
  if (!quotationTokenCurrent(token)) return
  // Copy each response so retained buttons cannot reuse a row from a later list.
  quotationChoices.value = choices.map(quotation => ({ ...quotation })); quotationChoiceToken = token; quotationListed.value = true
 } catch {
  if (quotationTokenCurrent(token)) quotationError.value = true
 } finally {
  if (quotationTokenCurrent(token)) quotationLoading.value = false
 }
}
function selectQuotation(quotation: WorkflowRecoverableQuotation) {
 if (!quotationChoiceToken || !quotationTokenCurrent(quotationChoiceToken) || quotationLoading.value || !quotationChoices.value.includes(quotation) || evidenceList.value.some(ev => ev.id === quotation.id)) return
 onEvidenceFinalized({ id: quotation.id, name: quotation.originalFilename })
 Reflect.deleteProperty(pdfCounts.value, quotation.id)
}
const selectedParty = computed(() => props.parties.find(p => p.id === partyId.value))
const filteredContracts = computed(() => (!partyId.value ? props.contracts : props.contracts.filter(c => c.partyId === partyId.value)))

watch(partyId, () => {
  if (selectedParty.value?.crewOwnership === 'vqh_internal' && basisKind.value !== 'direct_labor') basisKind.value = 'direct_labor'
})
const scanTracker = createAsyncRequestTracker<{companyId:string;projectId:string;fileId:string;requestId:string|null}>()
const previewTracker = createAsyncRequestTracker<{companyId:string;projectId:string;fileId:string}>()
function resetScope() {
 scanPolling.cancel()
 lifecycleGeneration++
 actionTracker.invalidate();scanTracker.invalidate();previewTracker.invalidate()
 errorMessage.value=''; scanNotice.value='';suggestedResult.value=null;suggestedFileId.value=null;pdfScopes.value={};pdfCounts.value={};scanRetryReady.value=false;ocrPollingState.value={phase:'idle',fileId:null,automaticRequests:0,manualReady:false}; reviewed.value=false
 isSubmitting.value=false;isScanning.value=false;uploadBusy.value=false;retryReady.value=false
 partyId.value='';categoryId.value='';contractVersionId.value='';amount.value='';deliverySite.value='';subcontractId.value='';acceptanceReference.value='';weekStart.value=''
 vatBasis.value='';roundingBasis.value='';allowanceBasis.value='';evidenceList.value=[]
 matLines.value=[{description:'',quantity:'1',unit:'',unitPrice:'0'}];genericLines.value=[{description:'',quantity:'1',unit:'',unitPrice:'0'}];laborWorkers.value=[{workerReference:'',days:'0',dailyRate:'0',allowance:'0'}]
 currencyCode.value='VND';basisKind.value='materials';retentionAmount.value='0';currentRequestId.value=null;expectedVersion.value=0;submission=createSession(null);scanSession=createScanSession();scanPolling=createScanPolling()
}
watch([()=>props.companyId,()=>props.projectId,()=>companyAccess.activeCompanyId,permissionFingerprint,()=>auth.user?.id,()=>auth.lifecycle],resetScope,{flush:'sync'})
onUnmounted(()=>{scanPolling.cancel();lifecycleGeneration++;actionTracker.invalidate();scanTracker.invalidate();previewTracker.invalidate();clearQuotationChoices()})

watch([partyId,categoryId,contractVersionId,amount,currencyCode,basisKind,deliverySite,matLines,subcontractId,acceptanceReference,retentionAmount,weekStart,laborWorkers,genericLines,vatBasis,roundingBasis,allowanceBasis,evidenceList],()=>{reviewed.value=false},{deep:true,flush:'sync'})

function onEvidenceFinalized(p: { id: string; name: string }) {
  if (!evidenceList.value.some(e => e.id === p.id)){evidenceList.value.push(p);pdfScopes.value[p.id]=''}
}
function removeEvidence(id: string) { if(isScanning.value||scanRetryReady.value||ocrPending.value)return;evidenceList.value = evidenceList.value.filter(e => e.id !== id);if(suggestedFileId.value===id){suggestedResult.value=null;suggestedFileId.value=null;reviewed.value=false} }

async function previewEvidence(fileId:string, disposition:'inline'|'attachment'='inline') {
 if(!scopeCurrent()||!companyAccess.hasPermission('cost.request.file.read'))return
 const token=previewTracker.start({companyId:props.companyId,projectId:props.projectId,fileId})
 try {const res=await repo.readEvidenceUrl(token.identity.projectId,fileId,{disposition});if(token.isCurrent()&&scopeCurrent())window.open(res.url,'_blank','noopener,noreferrer')}
 catch(e:unknown){if(token.isCurrent()&&scopeCurrent())errorMessage.value=e instanceof Error?e.message:'Không thể mở chứng từ.'}
}
function scanInput(fileId:string){
 const scope=pdfScopes.value[fileId],count=String(pdfCounts.value[fileId]??'').trim()
 return costExtractionCommandSchema.safeParse({requestId:currentRequestId.value,...(scope?{pdfPageScope:scope}:{}),...(count?{pdfDeclaredPageCount:Number(count)}:{})})
}
function canScanEvidence(ev:{id:string;name:string}){
 if(!scopeCurrent()||isSubmitting.value||uploadBusy.value||isScanning.value||!companyAccess.hasPermission('cost.prepare')||!companyAccess.hasPermission('cost.request.submit')||!companyAccess.hasPermission('cost.request.file.read'))return false
 if(ocrPending.value)return ocrPollingState.value.fileId===ev.id&&ocrPollingState.value.manualReady
 return (!scanRetryReady.value||scanSession.pendingFileId===ev.id)&&(!/\.pdf$/i.test(ev.name)||!!pdfScopes.value[ev.id])&&scanInput(ev.id).success
}
watch([pdfScopes,pdfCounts],()=>{if(!isScanning.value&&!scanRetryReady.value){scanPolling.cancel();suggestedResult.value=null;suggestedFileId.value=null;scanNotice.value='';reviewed.value=false}},{deep:true,flush:'sync'})
function acceptScanResult(res:CostExtractionView){
 suggestedResult.value=res.result;suggestedFileId.value=res.fileId;scanRetryReady.value=false;reviewed.value=false
 if(res.result.warnings.includes('OCR_RESPONSE_UNCERTAIN'))scanNotice.value='Chưa xác định kết quả OCR trước đó. Kiểm tra lại kết quả trước khi tiếp tục.'
 else if(res.result.warnings.includes('OCR_PROVIDER_NOT_CONFIGURED'))scanNotice.value='Dịch vụ OCR chưa được cấu hình; vui lòng kiểm tra bản gốc, nhập và rà soát thủ công.'
 else if(res.result.status==='unavailable'||res.result.status==='failed')scanNotice.value='Chưa có dữ liệu nhận dạng hợp lệ; vui lòng kiểm tra bản gốc, nhập và rà soát thủ công.'
 else if(!hasApplicableExtractionFields(res.result,basisKind.value))scanNotice.value='Chưa có dữ liệu gợi ý có thể áp dụng. Hãy kiểm tra bản gốc và nhập dữ liệu cần thiết trước khi rà soát.'
 else scanNotice.value='Dữ liệu chỉ là gợi ý; vui lòng rà soát trước khi gửi.'
}
async function scanEvidence(fileId:string) {
 if(!scopeCurrent()||isSubmitting.value||uploadBusy.value||isScanning.value||!companyAccess.hasPermission('cost.request.submit')||!companyAccess.hasPermission('cost.request.file.read')||!companyAccess.hasPermission('cost.prepare'))return
 if(ocrPending.value){if(ocrPollingState.value.fileId===fileId)await scanPolling.continue();return}
 const selected=scanInput(fileId);if(!selected.success)return
 const token=scanTracker.start({companyId:props.companyId,projectId:props.projectId,fileId,requestId:currentRequestId.value})
 isScanning.value=true;scanNotice.value='';reviewed.value=false
 try {
  const res=await scanSession.scan(fileId,selected.data);if(!token.isCurrent()||!scopeCurrent())return
  acceptScanResult(res);scanPolling.start(fileId,selected.data,res)
 }
 catch(e:unknown){if(token.isCurrent()&&scopeCurrent()){scanRetryReady.value=scanSession.pendingFileId!==null;scanNotice.value=e instanceof Error?e.message:'Không thể trích xuất.'}}
 finally {if(token.isCurrent()&&scopeCurrent())isScanning.value=false}
}
const canApplySuggestion=computed(()=>!!suggestedResult.value&&scopeCurrent()&&!isReadonly.value&&!isSubmitting.value&&!retryReady.value&&!isScanning.value&&!scanRetryReady.value&&!ocrPending.value&&evidenceList.value.some(ev=>ev.id===suggestedFileId.value)&&hasApplicableExtractionFields(suggestedResult.value,basisKind.value))
const materialsSourceReview = computed(() => {
  const basis = suggestedResult.value?.fields.basis
  if (basis?.kind !== 'materials' || !basis.sourceLines?.length) return null
  return {
    lines: basis.sourceLines,
    applicableCount: basis.lines.length,
    withheldCount: basis.sourceLines.filter(line => line.status === 'printed_amount_mismatch').length,
    applicableSum: sumMaterialReviewLines(basis.lines, 'VND'),
  }
})
const currentMaterialsSum = computed(() => basisKind.value === 'materials' ? sumMaterialReviewLines(matLines.value, currencyCode.value) : null)
function suggestionSource(field: string): string {
  const sources = suggestedResult.value?.providerLocations?.filter(source => source.field === field) ?? []
  if (!sources.length) return 'Nguồn OCR hoặc độ tin cậy chưa xác định'
  const pages = [...new Set(sources.map(source => source.pageNumber))].join(', ')
  const known = sources.every(source => source.confidence !== undefined)
  return `Trang ${pages}; ${known ? `độ tin cậy OCR ${Math.floor(Math.min(...sources.map(source => source.confidence!)) * 100)}%` : 'độ tin cậy OCR chưa xác định'}`
}

function applySuggestion() {
  if (!suggestedResult.value || !canApplySuggestion.value) return
  reviewed.value=false
  const f = suggestedResult.value.fields
  if (f.amount) amount.value = f.amount
  if (f.currencyCode) currencyCode.value = f.currencyCode
  if (f.accountingBasis?.vatBasis) vatBasis.value = f.accountingBasis.vatBasis
  if (f.accountingBasis?.roundingBasis) roundingBasis.value = f.accountingBasis.roundingBasis
  if (f.accountingBasis?.allowanceBasis) allowanceBasis.value = f.accountingBasis.allowanceBasis
  if (f.basis?.kind === 'materials' && basisKind.value === 'materials') {
    if (f.basis.deliverySite) deliverySite.value = f.basis.deliverySite
    if (f.basis.lines?.length) matLines.value = f.basis.lines.map(l => ({ description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice }))
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

const canSubmit = computed(() => scopeCurrent() && companyAccess.hasPermission('cost.request.submit') && !uploadBusy.value && !isScanning.value && !scanRetryReady.value && !ocrPending.value && !isReadonly.value && !isSubmitting.value && props.context.canSubmit && props.context.operationalState !== 'completed' && reviewed.value && evidenceList.value.length > 0 && buildInput() !== null)

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
