<template>
  <div class="cockpit-page">
    <div class="page-header cockpit-card">
      <div class="header-main">
        <NuxtLink to="/materials/finance" class="back-link">
          ← Tài chính vật tư
        </NuxtLink>
        <div class="header-title-row">
          <h2>Số liệu vật tư · {{ currentProject?.name || currentProject?.code || 'Công trình' }}</h2>
          <span v-if="currentProject?.code" class="cockpit-badge cockpit-badge--code font-mono">
            {{ currentProject.code }}
          </span>
        </div>
        <p class="subtitle">
          Cam kết, thanh toán và công nợ theo hợp đồng vật tư của dự án.
        </p>
      </div>
      <div class="header-actions">
        <button type="button" class="cockpit-btn cockpit-btn--secondary" :disabled="isLoading" @click="loadData">
          <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
          Làm mới
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="isLoading && !summary" class="cockpit-card state-card" role="status">
      <p>Đang tải số liệu vật tư...</p>
    </div>

    <template v-else-if="summary">
      <MaterialFinanceTotals :totals="summary.totals" :currency-code="summary.currencyCode" />

      <section class="cockpit-card contracts-section" aria-labelledby="contracts-heading">
        <h3 id="contracts-heading" class="section-title">Hợp đồng vật tư</h3>
        <div v-if="summary.contracts.length === 0" class="state-card">
          <p>Dự án chưa có hợp đồng vật tư nào.</p>
        </div>
        <div v-else class="table-wrap">
          <table class="cockpit-table" data-testid="project-contracts-table">
            <caption class="sr-only">Hợp đồng vật tư của dự án</caption>
            <thead>
              <tr>
                <th scope="col">Nhà cung cấp</th>
                <th scope="col">Số hợp đồng</th>
                <th scope="col" class="num">Cam kết</th>
                <th scope="col" class="num">Đã chi</th>
                <th scope="col" class="num">Còn phải trả</th>
                <th scope="col" class="num">Quá hạn</th>
                <th scope="col">Đơn mua</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="contract in summary.contracts" :key="contract.contractId">
                <th scope="row" class="supplier-cell">{{ contract.supplierName }}</th>
                <td class="font-mono">{{ contract.contractNo }}</td>
                <td class="num">{{ formatVnNumber(contract.totals.committed) }}</td>
                <td class="num">{{ formatVnNumber(contract.totals.paid) }}</td>
                <td class="num">{{ formatVnNumber(contract.totals.remaining) }}</td>
                <td class="num" :class="{ 'is-overdue': isOverdue(contract.totals.overdue) }">
                  {{ formatVnNumber(contract.totals.overdue) }}
                </td>
                <td>
                  <NuxtLink :to="`/materials/${contract.projectId}/orders/${contract.orderId}`" class="table-link">
                    Xem đơn
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { MaterialProjectOption } from '../../../../shared/schemas/costs/material-procurement'
import type { ProjectMaterialFinanceSummary } from '../../../../shared/schemas/costs/material-finance'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { createAsyncRequestTracker } from '../../../utils/costs/async-request-tracker'
import { isDecimalGreaterThan } from '../../../utils/costs/finance-display'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import MaterialFinanceTotals from '../../../components/materials/finance/MaterialFinanceTotals.vue'

definePageMeta({ requiredPermission: 'material.finance.read' })

const route = useRoute()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore

const projectId = computed(() => {
  const raw = route.params.projectId
  const value = Array.isArray(raw) ? (raw[0] ?? '') : String(raw || '')
  return workflowUuidSchema.safeParse(value).success ? value : ''
})

const summary = ref<ProjectMaterialFinanceSummary | null>(null)
const currentProject = ref<MaterialProjectOption | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

const tracker = createAsyncRequestTracker<{ companyId: string, projectId: string }>()

function isOverdue(value: string): boolean {
  return isDecimalGreaterThan(value, '0')
}

async function loadData() {
  const companyId = companyAccess?.activeCompanyId
  if (!companyId || !projectId.value) {
    summary.value = null
    currentProject.value = null
    isLoading.value = false
    return
  }

  const token = tracker.start({ companyId, projectId: projectId.value })
  isLoading.value = true
  errorMessage.value = ''

  // The project name is cosmetic: a failing project list must not hide the finance figures.
  const [summaryResult, projectsResult] = await Promise.allSettled([
    repositories.materialFinance.projectSummary(projectId.value),
    repositories.materialProcurement.listProjects(),
  ])
  if (!token.isCurrent()) return

  if (summaryResult.status === 'fulfilled') {
    summary.value = summaryResult.value
  }
  else {
    summary.value = null
    errorMessage.value = summaryResult.reason instanceof Error
      ? summaryResult.reason.message
      : 'Không thể tải số liệu vật tư của dự án.'
  }
  currentProject.value = projectsResult.status === 'fulfilled'
    ? projectsResult.value.find(project => project.projectId === projectId.value) ?? null
    : null
  isLoading.value = false
}

watch([() => companyAccess?.activeCompanyId, projectId], () => {
  tracker.invalidate()
  summary.value = null
  currentProject.value = null
  errorMessage.value = ''
  void loadData()
}, { flush: 'sync' })

onMounted(() => {
  void loadData()
})

onUnmounted(() => {
  tracker.invalidate()
})
</script>

<style scoped>
.cockpit-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1280px;
  margin: 0 auto;
}
.page-header {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.back-link {
  display: inline-block;
  font-size: 0.82rem;
  color: #0284c7;
  text-decoration: none;
  font-weight: 600;
  margin-bottom: 8px;
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
.page-header h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink, #0f172a);
  margin: 0;
}
.subtitle {
  font-size: 0.88rem;
  color: var(--ink-muted, #64748b);
  margin: 6px 0 0 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cockpit-alert--danger {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
}
.state-card {
  padding: 32px 20px;
  text-align: center;
  color: var(--ink-muted, #64748b);
  font-size: 0.95rem;
}
.contracts-section {
  padding: 16px 20px;
}
.section-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--ink, #0f172a);
  margin: 0 0 12px 0;
}
.table-wrap {
  overflow-x: auto;
}
.cockpit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.cockpit-table th {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 2px solid var(--line, #e2e8f0);
  color: var(--forest, #334155);
  font-weight: 600;
}
.cockpit-table td {
  padding: 12px;
  border-bottom: 1px solid var(--line, #f1f5f9);
  vertical-align: middle;
}
.cockpit-table th.supplier-cell {
  border-bottom: 1px solid var(--line, #f1f5f9);
  padding: 12px;
  color: var(--ink, #0f172a);
}
.cockpit-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.is-overdue {
  color: #b91c1c;
  font-weight: 700;
}
.table-link {
  color: #0284c7;
  text-decoration: none;
  font-weight: 600;
}
.table-link:hover {
  text-decoration: underline;
}
.cockpit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.cockpit-btn--secondary {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}
.cockpit-btn--secondary:hover:not(:disabled) {
  background: #e2e8f0;
}
.cockpit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.cockpit-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.cockpit-badge--code {
  background: #e0f2fe;
  color: #0369a1;
}
.font-mono {
  font-family: monospace;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
