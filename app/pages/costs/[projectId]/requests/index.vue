<template>
  <div class="cockpit-page">
    <div class="page-header cockpit-card">
      <div class="header-main">
        <NuxtLink to="/cost-requests" class="back-link">← Danh sách dự án đề nghị chi</NuxtLink>
        <div class="header-title-row">
          <h2>Đề nghị chi · {{ cash?.project.projectName || cash?.project.projectCode || 'Dự án' }}</h2>
          <span v-if="cash?.project.projectCode" class="cockpit-badge cockpit-badge--neutral">{{ cash.project.projectCode }}</span>
          <span v-if="context" class="cockpit-badge" :class="formatOperationalState(context.operationalState).badgeVariant">
            {{ formatOperationalState(context.operationalState).label }}
          </span>
        </div>
        <p class="subtitle">Theo dõi, kiểm tra chứng từ và lập hồ sơ đề nghị chi cho dự án.</p>
      </div>
      <div class="header-actions">
        <NuxtLink v-if="canCreate" :to="'/costs/'+pId+'/requests/new'" class="cockpit-btn cockpit-btn--primary">
          <UIcon name="i-lucide-plus" aria-hidden="true" />
          Tạo đề nghị mới
        </NuxtLink>
        <NuxtLink v-if="$companyAccessStore.hasPermission('cost.read')" :to="'/costs/'+pId" class="cockpit-btn cockpit-btn--secondary">
          Chi phí dự án
        </NuxtLink>
      </div>
    </div>

    <div v-if="errorMessage" class="alert error" role="alert">{{ errorMessage }}</div>
    <div v-if="isLegacy" class="alert warn" role="status">Quy trình chứng từ chưa được bật cho công ty này.</div>

    <!-- Requests list directly below header -->
    <section class="cockpit-card requests-section" aria-label="Danh sách đề nghị chi">
      <div class="section-header">
        <div class="filter-tabs" role="tablist" aria-label="Lọc trạng thái đề nghị">
          <button
            type="button"
            class="filter-tab"
            :class="{ active: selectedStatus === 'all' }"
            @click="selectedStatus = 'all'"
          >
            Tất cả <span class="tab-count">({{ statusCounts.all }})</span>
          </button>
          <button
            type="button"
            class="filter-tab"
            :class="{ active: selectedStatus === 'submitted' }"
            @click="selectedStatus = 'submitted'"
          >
            Chờ duyệt <span class="tab-count">({{ statusCounts.submitted }})</span>
          </button>
          <button
            type="button"
            class="filter-tab"
            :class="{ active: selectedStatus === 'approved_pending' }"
            @click="selectedStatus = 'approved_pending'"
          >
            Đã duyệt (Chờ chi) <span class="tab-count">({{ statusCounts.approved_pending }})</span>
          </button>
          <button
            type="button"
            class="filter-tab"
            :class="{ active: selectedStatus === 'paid' }"
            @click="selectedStatus = 'paid'"
          >
            Đã thanh toán <span class="tab-count">({{ statusCounts.paid }})</span>
          </button>
          <button
            type="button"
            class="filter-tab"
            :class="{ active: selectedStatus === 'returned' }"
            @click="selectedStatus = 'returned'"
          >
            Bị trả lại <span class="tab-count">({{ statusCounts.returned }})</span>
          </button>
          <button
            type="button"
            class="filter-tab"
            :class="{ active: selectedStatus === 'working' }"
            @click="selectedStatus = 'working'"
          >
            Bản nháp <span class="tab-count">({{ statusCounts.working }})</span>
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="cockpit-table">
          <thead>
            <tr>
              <th scope="col">Đối tác / Người nhận</th>
              <th scope="col">Cơ sở chi</th>
              <th scope="col">Số tiền đề nghị</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" style="text-align: right;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="text-center py-4 text-muted">
                <UIcon name="i-lucide-loader-2" class="spin mr-2" aria-hidden="true" />
                Đang nạp danh sách đề nghị chi...
              </td>
            </tr>
            <tr v-else-if="requests.length === 0">
              <td colspan="5">
                <div class="empty-state-box">
                  <UIcon name="i-lucide-receipt" class="empty-icon" aria-hidden="true" />
                  <h4>Chưa có đề nghị chi nào</h4>
                  <p v-if="canCreate">Dự án này chưa có hồ sơ đề nghị chi nào. Hãy tạo đề nghị đầu tiên để bắt đầu quy trình chi phí.</p>
                  <p v-else>Dự án này hiện chưa có đề nghị chi nào được ghi nhận.</p>
                  <NuxtLink v-if="canCreate" :to="'/costs/'+pId+'/requests/new'" class="cockpit-btn cockpit-btn--primary">
                    <UIcon name="i-lucide-plus" aria-hidden="true" />
                    Tạo đề nghị chi đầu tiên
                  </NuxtLink>
                </div>
              </td>
            </tr>
            <tr v-else-if="filteredRequests.length === 0">
              <td colspan="5" class="text-center py-4 text-muted">
                Không có đề nghị nào phù hợp với bộ lọc đã chọn.
              </td>
            </tr>
            <tr v-for="r in filteredRequests" :key="r.id">
              <td>
                <div class="party-cell">
                  <span class="party-name">{{ r.partyName || 'Đối tác trong hồ sơ' }}</span>
                  <span class="party-tag">{{ r.partyKind === 'crew' ? (r.crewOwnership === 'vqh_internal' ? 'Tổ đội VQH' : 'Tổ đội ngoài') : 'Nhà cung cấp' }}</span>
                </div>
              </td>
              <td>
                <span class="basis-label">{{ basisLabels[r.basis.kind] || r.basis.kind }}</span>
              </td>
              <td>
                <span class="amount-value font-medium">{{ formatFinanceMoney(r.amount, r.currencyCode, r.currencyCode === 'VND' ? 0 : 2) }}</span>
              </td>
              <td>
                <span v-if="r.status === 'working'" class="cockpit-badge cockpit-badge--neutral">Bản nháp</span>
                <span v-else-if="r.status === 'submitted'" class="cockpit-badge cockpit-badge--warning">Đã gửi duyệt</span>
                <span v-else-if="r.status === 'returned'" class="cockpit-badge cockpit-badge--danger">Bị trả lại</span>
                <template v-else-if="r.status === 'approved'">
                  <span v-if="!r.payments || r.payments.length === 0" class="cockpit-badge cockpit-badge--primary">Đã duyệt (Chờ chi)</span>
                  <span v-else-if="r.installment?.remaining === '0.0000' || (r.installment?.consumed && r.installment?.authorized && r.installment?.consumed === r.installment?.authorized)" class="cockpit-badge cockpit-badge--success">Đã thanh toán</span>
                  <span v-else class="cockpit-badge cockpit-badge--info">Đã chi một phần</span>
                </template>
              </td>
              <td style="text-align: right;">
                <NuxtLink :to="`/costs/${pId}/requests/${r.id}`" class="cockpit-btn cockpit-btn--sm">Chi tiết</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Cash overview -->
    <div v-if="cash" class="cockpit-card cash-summary">
      <h4 class="cash-summary-title">Tổng quan dòng tiền dự án</h4>
      <div class="grid-4">
        <div class="cash-stat-card">
          <span class="cash-stat-label">Đã chi</span>
          <strong class="cash-stat-val text-success">{{ formatFinanceMoney(cash.workflowCash.grossPaid, cash.project.currencyCode, cash.project.currencyCode === 'VND' ? 0 : cash.project.moneyScale) || '0' }}</strong>
        </div>
        <div class="cash-stat-card">
          <span class="cash-stat-label">Hoàn tiền</span>
          <strong class="cash-stat-val">{{ formatFinanceMoney(cash.workflowCash.confirmedRefunds, cash.project.currencyCode, cash.project.currencyCode === 'VND' ? 0 : cash.project.moneyScale) || '0' }}</strong>
        </div>
        <div class="cash-stat-card">
          <span class="cash-stat-label">Thực chi thuần</span>
          <strong class="cash-stat-val text-primary">{{ formatFinanceMoney(cash.workflowCash.netCash, cash.project.currencyCode, cash.project.currencyCode === 'VND' ? 0 : cash.project.moneyScale) || '0' }}</strong>
        </div>
        <div class="cash-stat-card">
          <span class="cash-stat-label">Chưa chi (đã duyệt)</span>
          <strong class="cash-stat-val text-warning">{{ formatFinanceMoney(cash.workflowCash.approvedUnspent, cash.project.currencyCode, cash.project.currencyCode === 'VND' ? 0 : cash.project.moneyScale) || '0' }}</strong>
        </div>
      </div>
      <p class="cash-note">
        <span>Bao phủ chứng từ: <strong>{{ coverageLabel[cash.workflowCash.coverage] }}</strong></span>
        <span class="bullet-sep">·</span>
        <span>Đối soát: <strong>{{ cash.workflowCash.unreconciledCount }}</strong> khoản ghi nhận chi phí cũ chưa có chứng từ thanh toán đối chiếu</span>
      </p>
    </div>

    <!-- On-demand adjustments / refunds -->
    <details v-if="context && !isLegacy" class="cockpit-card on-demand-section">
      <summary class="section-summary">
        <span>Điều chỉnh & Hoàn tiền dòng tiền</span>
        <span v-if="adjustments.length" class="summary-badge">{{ adjustments.length }} hồ sơ</span>
      </summary>
      <div class="section-content">
        <p v-if="requests.flatMap(r => r.payments).length === 0" class="note text-muted">
          Chưa có khoản thanh toán thực tế nào được giải ngân trong dự án để yêu cầu hoàn tiền hoặc điều chỉnh.
        </p>
        <CostCashAdjustmentsPanel
          :key="getFingerprint()"
          :company-id="companyId"
          :project-id="pId"
          :context="context"
          :adjustments="adjustments"
          :payments="requests.flatMap(r => r.payments)"
          @changed="loadData"
        />
      </div>
    </details>

    <!-- Manager assignment collapsed -->
    <details v-if="context && !isLegacy" class="cockpit-card on-demand-section">
      <summary class="section-summary">
        <span>Phân công quản lý chi phí dự án</span>
        <span v-if="context.manager" class="summary-badge">Người phụ trách duyệt: {{ context.manager.userId.slice(0, 8) }}</span>
      </summary>
      <div class="section-content">
        <ProjectCostManagerAssignmentPanel
          :company-id="companyId"
          :project-id="pId"
          :context="context"
          @changed="loadData"
        />
      </div>
    </details>

    <!-- Historical categories disclosure -->
    <details v-if="cash && $companyAccessStore.hasPermission('cost.read')" class="cockpit-card on-demand-section">
      <summary class="section-summary">
        <span>Xem các ghi nhận chi phí trước đây</span>
      </summary>
      <div class="section-content">
        <p class="note">Giá trị công việc đã ghi nhận không thay thế chứng minh thanh toán.</p>
        <div class="category-links">
          <NuxtLink
            v-for="category in cash.categories.filter(c => c.categoryId)"
            :key="category.code"
            :to="'/costs/'+pId+'/categories/'+category.categoryId"
            class="category-chip"
          >
            {{ category.name }}
          </NuxtLink>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  workflowUuidSchema,
  type CostRequestView,
  type WorkflowProjectContext,
  type WorkflowAdjustmentView,
} from '../../../../../shared/schemas/costs/cost-workflow'
import type { WorkflowFinance } from '../../../../../shared/schemas/costs/cost-workflow-reporting'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import { formatFinanceMoney, formatOperationalState } from '../../../../utils/costs/finance-display'
import CostCashAdjustmentsPanel from '../../../../components/costs/CostCashAdjustmentsPanel.vue'
import ProjectCostManagerAssignmentPanel from '../../../../components/costs/ProjectCostManagerAssignmentPanel.vue'

definePageMeta({ requiredPermission: 'cost.request.read' })

const route = useRoute()
const repo = useRepositories().costWorkflow
const $companyAccessStore = useNuxtApp().$companyAccessStore

const pId = computed(() => workflowUuidSchema.safeParse(route.params.projectId).success ? String(route.params.projectId) : '')
const companyId = computed(() => $companyAccessStore?.activeCompanyId || '')

const requests = ref<CostRequestView[]>([])
const adjustments = ref<WorkflowAdjustmentView[]>([])
const context = ref<WorkflowProjectContext | null>(null)
const cash = ref<WorkflowFinance | null>(null)
const isLegacy = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const selectedStatus = ref<'all' | 'submitted' | 'approved_pending' | 'paid' | 'returned' | 'working'>('all')

const coverageLabel = {
  complete: 'Đã đối soát đầy đủ chứng từ thanh toán',
  partial: 'Đối soát một phần chứng từ',
  not_recorded: 'Chưa có chứng minh dòng tiền',
}

const basisLabels: Record<string, string> = {
  materials: 'Vật tư',
  subcontract: 'Hợp đồng phụ',
  direct_labor: 'Nhân công VQH',
  machinery: 'Máy thi công',
  other: 'Chi phí khác',
}

function getRequestDetailedStatus(r: CostRequestView): 'working' | 'submitted' | 'returned' | 'approved_pending' | 'paid' | 'paid_partial' {
  if (r.status === 'working') return 'working'
  if (r.status === 'submitted') return 'submitted'
  if (r.status === 'returned') return 'returned'
  if (r.status === 'approved') {
    if (!r.payments || r.payments.length === 0) return 'approved_pending'
    if (r.installment?.remaining === '0.0000' || (r.installment?.consumed && r.installment?.authorized && r.installment?.consumed === r.installment?.authorized)) return 'paid'
    return 'paid_partial'
  }
  return 'working'
}

const statusCounts = computed(() => {
  const counts = { all: requests.value.length, submitted: 0, approved_pending: 0, paid: 0, returned: 0, working: 0 }
  for (const r of requests.value) {
    const s = getRequestDetailedStatus(r)
    if (s === 'submitted') counts.submitted++
    else if (s === 'approved_pending') counts.approved_pending++
    else if (s === 'paid' || s === 'paid_partial') counts.paid++
    else if (s === 'returned') counts.returned++
    else if (s === 'working') counts.working++
  }
  return counts
})

const filteredRequests = computed(() => {
  if (selectedStatus.value === 'all') return requests.value
  return requests.value.filter(r => {
    const s = getRequestDetailedStatus(r)
    if (selectedStatus.value === 'submitted') return s === 'submitted'
    if (selectedStatus.value === 'approved_pending') return s === 'approved_pending'
    if (selectedStatus.value === 'paid') return s === 'paid' || s === 'paid_partial'
    if (selectedStatus.value === 'returned') return s === 'returned'
    if (selectedStatus.value === 'working') return s === 'working'
    return true
  })
})

const canCreate = computed(() => Boolean(context.value?.canSubmit && context.value?.operationalState === 'active'))
const tracker = createAsyncRequestTracker<{ companyId: string; projectId: string; fp: string }>()

function getFingerprint() {
  const p = $companyAccessStore?.permissions ? [...$companyAccessStore.permissions].sort().join(',') : ''
  return `${companyId.value}::${pId.value}::${p}`
}

function clear() {
  tracker.invalidate()
  requests.value = []
  adjustments.value = []
  context.value = null
  cash.value = null
  isLegacy.value = false
  loading.value = false
  errorMessage.value = ''
}

watch([pId, companyId, () => getFingerprint()], () => {
  clear()
  void loadData()
}, { immediate: true, flush: 'sync' })

onUnmounted(() => tracker.invalidate())

async function loadData() {
  clear()
  if (!pId.value || !companyId.value) {
    errorMessage.value = 'Mã dự án hoặc phiên không hợp lệ.'
    return
  }
  const token = tracker.start({ companyId: companyId.value, projectId: pId.value, fp: getFingerprint() })
  loading.value = true
  try {
    const ctx = await repo.readProjectContext(pId.value)
    if (!token.isCurrent() || getFingerprint() !== token.identity.fp) return
    context.value = ctx
    if (ctx.mode === 'legacy') {
      isLegacy.value = true
      return
    }

    const [reqList, cashData, adjustmentList] = await Promise.all([
      repo.listRequests(token.identity.projectId),
      repo.readCash(token.identity.projectId),
      repo.listAdjustments(token.identity.projectId),
    ])
    if (!token.isCurrent() || getFingerprint() !== token.identity.fp) return
    requests.value = reqList
    adjustments.value = adjustmentList
    cash.value = cashData
  }
  catch {
    if (token.isCurrent() && getFingerprint() === token.identity.fp) {
      errorMessage.value = 'Không thể tải danh sách đề nghị. Kiểm tra quyền truy cập hoặc thử lại.'
    }
  }
  finally {
    if (token.isCurrent() && getFingerprint() === token.identity.fp) loading.value = false
  }
}
</script>

<style scoped>
.cockpit-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 20px;
}

.header-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.back-link {
  font-size: 13px;
  color: #2563eb;
  text-decoration: none;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.header-title-row h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.subtitle {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.alert {
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
}
.alert.warn {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
.alert.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.requests-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 10px;
}

.filter-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-tab {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.filter-tab:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.filter-tab.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.filter-tab.active .tab-count {
  color: rgba(255, 255, 255, 0.85);
}

.tab-count {
  font-size: 12px;
  color: #64748b;
}

.table-wrap {
  overflow-x: auto;
  border-radius: 6px;
}

.cockpit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.cockpit-table th {
  background: #f8fafc;
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.cockpit-table td {
  padding: 12px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.party-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.party-name {
  font-weight: 600;
  color: #0f172a;
}

.party-tag {
  font-size: 11px;
  color: #64748b;
}

.basis-label {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f1f5f9;
  font-size: 12px;
  color: #334155;
}

.empty-state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  gap: 8px;
}

.empty-icon {
  font-size: 36px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.empty-state-box h4 {
  margin: 0;
  font-size: 16px;
  color: #1e293b;
}

.empty-state-box p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  max-width: 440px;
}

.cash-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
}

.cash-summary-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.grid-4 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.cash-stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.cash-stat-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.cash-stat-val {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.cash-note {
  font-size: 12px;
  color: #64748b;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.bullet-sep {
  color: #cbd5e1;
}

.on-demand-section {
  padding: 12px 16px;
  border-radius: 6px;
}

.section-summary {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.summary-badge {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 12px;
}

.section-content {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}

.category-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.category-chip {
  padding: 4px 10px;
  border-radius: 4px;
  background: #f1f5f9;
  font-size: 12px;
  color: #2563eb;
  text-decoration: none;
}

.category-chip:hover {
  background: #e2e8f0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>