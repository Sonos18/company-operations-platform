<template>
  <div class="cockpit-page">
    <div class="page-header">
      <h2>Danh sách Đề nghị khoản chi</h2>
      <div class="flex flex-wrap gap-2">
        <NuxtLink v-if="$companyAccessStore.hasPermission('cost.read')" :to="'/costs/'+pId" class="cockpit-btn cockpit-btn--secondary">Chi phí dự án</NuxtLink>
        <NuxtLink v-if="canCreate" :to="'/costs/'+pId+'/requests/new'" class="cockpit-btn cockpit-btn--primary">+ Tạo đề nghị mới</NuxtLink>
      </div>
    </div>
    <div v-if="errorMessage" class="alert error">{{ errorMessage }}</div>
    <div v-if="isLegacy" class="alert warn">Quy trình chứng từ chưa được bật cho công ty này.</div>

    <ProjectCostManagerAssignmentPanel v-if="context && !isLegacy" :company-id="companyId" :project-id="pId" :context="context" @changed="loadData" />

    <div v-if="cash" class="cockpit-card cash-summary">
      <h4>Tổng quan dòng tiền</h4>
      <div class="grid-4">
        <div>Đã chi: <strong>{{ cash.workflowCash.grossPaid }}</strong></div>
        <div>Hoàn tiền: <strong>{{ cash.workflowCash.confirmedRefunds }}</strong></div>
        <div>Thực chi thuần: <strong>{{ cash.workflowCash.netCash }}</strong></div>
        <div>Chưa chi (duyệt): <strong>{{ cash.workflowCash.approvedUnspent }}</strong></div>
      </div>
      <p class="note">Bao phủ: {{ coverageLabel[cash.workflowCash.coverage] }} | Chưa đối soát: {{ cash.workflowCash.unreconciledCount }}</p>
    </div>

    <CostCashAdjustmentsPanel v-if="context && !isLegacy" :key="getFingerprint()" :company-id="companyId" :project-id="pId" :context="context" :adjustments="adjustments" :payments="requests.flatMap(r=>r.payments)" @changed="loadData"/>
    <details v-if="cash && $companyAccessStore.hasPermission('cost.read')">
      <summary>Xem các ghi nhận chi phí trước đây</summary>
      <p>Giá trị công việc đã ghi nhận không thay thế chứng minh thanh toán.</p>
      <NuxtLink v-for="category in cash.categories.filter(c=>c.categoryId)" :key="category.code" :to="'/costs/'+pId+'/categories/'+category.categoryId">{{ category.name }} · </NuxtLink>
    </details>
    <div class="table-wrap">
      <table class="cockpit-table">
        <thead>
          <tr><th>Mã chi phí</th><th>Số tiền</th><th>Loại tiền</th><th>Trạng thái</th><th>Thao tác</th></tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5">Đang tải...</td></tr>
          <tr v-else-if="requests.length === 0"><td colspan="5">Chưa có đề nghị chi nào.</td></tr>
          <tr v-for="r in requests" :key="r.id">
            <td>{{ r.partyName || 'Đối tác trong hồ sơ' }}</td>
            <td>{{ r.amount }}</td>
            <td>{{ r.currencyCode }}</td>
            <td><span class="cockpit-badge">{{ statusMap[r.status] || r.status }}</span></td>
            <td><NuxtLink :to="`/costs/${pId}/requests/${r.id}`">Chi tiết</NuxtLink></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { workflowUuidSchema, type CostRequestView, type WorkflowProjectContext, type WorkflowAdjustmentView } from '../../../../../shared/schemas/costs/cost-workflow'
import type { WorkflowFinance } from '../../../../../shared/schemas/costs/cost-workflow-reporting'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import CostCashAdjustmentsPanel from '../../../../components/costs/CostCashAdjustmentsPanel.vue'
import ProjectCostManagerAssignmentPanel from '../../../../components/costs/ProjectCostManagerAssignmentPanel.vue'

definePageMeta({ requiredPermission: 'cost.request.read' })

const route = useRoute()
const repo = useRepositories().costWorkflow
const $companyAccessStore = useNuxtApp().$companyAccessStore

const pId = computed(() => workflowUuidSchema.safeParse(route.params.projectId).success ? String(route.params.projectId) : '')
const companyId = computed(() => $companyAccessStore?.activeCompanyId || '')

const requests = ref<CostRequestView[]>([])
const adjustments=ref<WorkflowAdjustmentView[]>([])
const context = ref<WorkflowProjectContext | null>(null)
const cash = ref<WorkflowFinance | null>(null)
const isLegacy = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const coverageLabel = { complete:'Đã đối soát đầy đủ',partial:'Đối soát một phần',not_recorded:'Chưa có chứng minh dòng tiền' }
const statusMap: Record<string, string> = { working: 'Chưa gửi', submitted: 'Đã gửi duyệt', returned: 'Bị trả lại', approved: 'Đã duyệt' }
const canCreate = computed(() => Boolean(context.value?.canSubmit && context.value?.operationalState === 'active'))
const tracker = createAsyncRequestTracker<{ companyId: string; projectId: string; fp: string }>()

function getFingerprint() {
  const p = $companyAccessStore?.permissions ? [...$companyAccessStore.permissions].sort().join(',') : ''
  return `${companyId.value}::${pId.value}::${p}`
}

function clear() {
  tracker.invalidate(); requests.value = [];adjustments.value=[]; context.value = null; cash.value = null; isLegacy.value = false; loading.value=false; errorMessage.value = ''
}

watch([pId, companyId, () => getFingerprint()], () => { clear(); void loadData() }, { immediate:true, flush:'sync' })
onUnmounted(() => tracker.invalidate())

async function loadData() {
  clear()
  if (!pId.value || !companyId.value) { errorMessage.value = 'Mã dự án hoặc phiên không hợp lệ.'; return }
  const token = tracker.start({ companyId: companyId.value, projectId: pId.value, fp: getFingerprint() })
  loading.value = true
  try {
    const ctx = await repo.readProjectContext(pId.value)
    if (!token.isCurrent() || getFingerprint() !== token.identity.fp) return
    context.value = ctx
    if (ctx.mode === 'legacy') { isLegacy.value = true; return }

    const [reqList, cashData, adjustmentList] = await Promise.all([repo.listRequests(token.identity.projectId), repo.readCash(token.identity.projectId),repo.listAdjustments(token.identity.projectId)])
    if (!token.isCurrent() || getFingerprint() !== token.identity.fp) return
    requests.value = reqList;adjustments.value=adjustmentList
    cash.value = cashData
  } catch {
    if (token.isCurrent() && getFingerprint()===token.identity.fp) errorMessage.value = 'Không thể tải danh sách đề nghị. Kiểm tra quyền truy cập hoặc thử lại.'
  } finally {
    if (token.isCurrent() && getFingerprint()===token.identity.fp) loading.value = false
  }
}
</script>

<style scoped>
.cockpit-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.alert { padding: 8px 12px; border-radius: 4px; font-size: 13px; }
.alert.warn { background: #fef3c7; color: #92400e; }
.alert.error { background: #fee2e2; color: #991b1b; }
.grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 8px 0; }
.note { font-size: 12px; color: #64748b; margin: 0; }
.table-wrap { overflow-x: auto; background: #fff; border-radius: 6px; }
</style>