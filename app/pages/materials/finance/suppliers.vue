<template>
  <div class="cockpit-page">
    <div class="page-header cockpit-card">
      <div class="header-main">
        <NuxtLink to="/materials/finance" class="back-link">
          ← Tài chính vật tư
        </NuxtLink>
        <div class="header-title-row">
          <h2>Công nợ nhà cung cấp</h2>
          <span class="cockpit-badge cockpit-badge--neutral">Vật tư</span>
        </div>
        <p class="subtitle">
          Cam kết, đã chi và còn phải trả theo từng nhà cung cấp. Mở rộng để xem các hợp đồng.
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

    <div v-if="isLoading && suppliers.length === 0" class="cockpit-card state-card" role="status">
      <p>Đang tải công nợ nhà cung cấp...</p>
    </div>

    <div v-else-if="!errorMessage && suppliers.length === 0" class="cockpit-card state-card">
      <p>Chưa có nhà cung cấp nào có hợp đồng vật tư.</p>
    </div>

    <section v-else-if="suppliers.length > 0" class="cockpit-card suppliers-section" aria-label="Danh sách công nợ nhà cung cấp">
      <div class="table-wrap">
        <table class="cockpit-table" data-testid="supplier-balances-table">
          <caption class="sr-only">Công nợ vật tư theo nhà cung cấp</caption>
          <thead>
            <tr>
              <th scope="col">Nhà cung cấp</th>
              <th scope="col" class="num">Cam kết</th>
              <th scope="col" class="num">Đã chi</th>
              <th scope="col" class="num">Còn phải trả</th>
              <th scope="col" class="num">Quá hạn</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="supplier in suppliers" :key="supplier.supplierId">
              <tr class="supplier-row" data-testid="supplier-row">
                <th scope="row" class="supplier-cell">
                  <button
                    type="button"
                    class="expand-btn"
                    :aria-expanded="isExpanded(supplier.supplierId)"
                    :aria-controls="contractsPanelId(supplier.supplierId)"
                    @click="toggle(supplier.supplierId)"
                  >
                    <UIcon
                      :name="isExpanded(supplier.supplierId) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                      aria-hidden="true"
                    />
                    <span>{{ supplier.supplierName }}</span>
                    <span class="contract-count">({{ supplier.contracts.length }} hợp đồng)</span>
                  </button>
                </th>
                <td class="num">{{ formatVnNumber(supplier.totals.committed) }} <span class="currency">{{ supplier.currencyCode }}</span></td>
                <td class="num">{{ formatVnNumber(supplier.totals.paid) }}</td>
                <td class="num">{{ formatVnNumber(supplier.totals.remaining) }}</td>
                <td class="num" :class="{ 'is-overdue': isOverdue(supplier.totals.overdue) }">
                  {{ formatVnNumber(supplier.totals.overdue) }}
                </td>
              </tr>
              <tr v-if="isExpanded(supplier.supplierId)" class="contracts-row">
                <td colspan="5">
                  <div :id="contractsPanelId(supplier.supplierId)" class="contracts-panel" role="region" :aria-label="`Hợp đồng của ${supplier.supplierName}`">
                    <p v-if="supplier.contracts.length === 0" class="empty-inline">Nhà cung cấp chưa có hợp đồng.</p>
                    <table v-else class="cockpit-table nested-table">
                      <thead>
                        <tr>
                          <th scope="col">Dự án</th>
                          <th scope="col">Số hợp đồng</th>
                          <th scope="col" class="num">Cam kết</th>
                          <th scope="col" class="num">Đã chi</th>
                          <th scope="col" class="num">Còn phải trả</th>
                          <th scope="col" class="num">Quá hạn</th>
                          <th scope="col">Liên kết</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="contract in supplier.contracts" :key="contract.contractId">
                          <td>
                            <NuxtLink :to="`/materials/${contract.projectId}/finance`" class="table-link">
                              {{ projectLabel(contract.projectId) }}
                            </NuxtLink>
                          </td>
                          <td class="font-mono">{{ materialContractLabel(contract) }}</td>
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
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { SupplierMaterialFinance } from '../../../../shared/schemas/costs/material-finance'
import { createAsyncRequestTracker } from '../../../utils/costs/async-request-tracker'
import { isDecimalGreaterThan } from '../../../utils/costs/finance-display'
import { formatVnNumber } from '../../../utils/materials/vn-number'
import { materialContractLabel } from '../../../utils/materials/contract-label'

definePageMeta({ requiredPermission: 'material.finance.read' })

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const panelPrefix = useId()

const suppliers = ref<SupplierMaterialFinance>([])
const projectNames = ref<Map<string, string>>(new Map())
const expanded = ref<Set<string>>(new Set())
const isLoading = ref(false)
const errorMessage = ref('')

const tracker = createAsyncRequestTracker<{ companyId: string }>()

function isOverdue(value: string): boolean {
  return isDecimalGreaterThan(value, '0')
}

function isExpanded(supplierId: string): boolean {
  return expanded.value.has(supplierId)
}

function contractsPanelId(supplierId: string): string {
  return `${panelPrefix}-contracts-${supplierId}`
}

function toggle(supplierId: string) {
  const next = new Set(expanded.value)
  if (!next.delete(supplierId)) next.add(supplierId)
  expanded.value = next
}

function projectLabel(projectId: string): string {
  return projectNames.value.get(projectId) ?? 'Số liệu dự án'
}

async function loadData() {
  const companyId = companyAccess?.activeCompanyId
  if (!companyId) {
    suppliers.value = []
    isLoading.value = false
    return
  }

  const token = tracker.start({ companyId })
  isLoading.value = true
  errorMessage.value = ''

  // Project names are cosmetic: a failing project list must not hide supplier balances.
  const [suppliersResult, projectsResult] = await Promise.allSettled([
    repositories.materialFinance.suppliers(),
    repositories.materialProcurement.listProjects(),
  ])
  if (!token.isCurrent()) return

  if (suppliersResult.status === 'fulfilled') {
    suppliers.value = suppliersResult.value
  }
  else {
    suppliers.value = []
    errorMessage.value = suppliersResult.reason instanceof Error
      ? suppliersResult.reason.message
      : 'Không thể tải công nợ nhà cung cấp.'
  }
  projectNames.value = projectsResult.status === 'fulfilled'
    ? new Map(projectsResult.value.map(project => [project.projectId, project.name || project.code]))
    : new Map()
  isLoading.value = false
}

watch(() => companyAccess?.activeCompanyId, () => {
  tracker.invalidate()
  suppliers.value = []
  projectNames.value = new Map()
  expanded.value = new Set()
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
  padding: 40px 20px;
  text-align: center;
  color: var(--ink-muted, #64748b);
  font-size: 0.95rem;
}
.suppliers-section {
  padding: 16px 20px;
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
  padding: 6px 12px;
}
.cockpit-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 6px 4px;
  font: inherit;
  font-weight: 700;
  color: var(--ink, #0f172a);
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
}
.expand-btn:hover {
  background: #f1f5f9;
}
.expand-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
.contract-count {
  font-weight: 500;
  font-size: 0.78rem;
  color: var(--ink-muted, #64748b);
}
.currency {
  font-size: 0.75rem;
  color: var(--ink-muted, #64748b);
}
.contracts-row > td {
  background: #f8fafc;
  padding: 8px 12px 16px 36px;
}
.nested-table th {
  font-size: 0.8rem;
}
.empty-inline {
  margin: 0;
  color: var(--ink-muted, #64748b);
  font-size: 0.85rem;
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
.cockpit-badge--neutral {
  background: #f1f5f9;
  color: #475569;
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
  .contracts-row > td {
    padding-left: 12px;
  }
}
</style>
