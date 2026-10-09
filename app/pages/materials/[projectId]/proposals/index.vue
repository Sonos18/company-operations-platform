<template>
  <div class="cockpit-page">
    <div class="page-header cockpit-card">
      <div class="header-main">
        <NuxtLink to="/materials" class="back-link">
          ← Danh sách công trình vật tư
        </NuxtLink>
        <div class="header-title-row">
          <h2>Phiếu yêu cầu vật tư · {{ currentProject?.name || currentProject?.code || 'Công trình' }}</h2>
          <span v-if="currentProject?.code" class="cockpit-badge cockpit-badge--code font-mono">
            {{ currentProject.code }}
          </span>
        </div>
        <p class="subtitle">
          Danh sách các phiếu yêu cầu vật tư đã lập và theo dõi tiến độ tách đơn mua hàng của dự án.
        </p>
      </div>
      <div class="header-actions">
        <NuxtLink
          v-if="canSubmit"
          :to="`/materials/${pId}/proposals/new`"
          class="cockpit-btn cockpit-btn--primary"
        >
          <UIcon name="i-lucide-plus" aria-hidden="true" />
          Tạo phiếu yêu cầu
        </NuxtLink>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
      {{ errorMessage }}
    </div>

    <!-- Filter Tabs Section -->
    <section class="cockpit-card proposals-section" aria-label="Danh sách phiếu yêu cầu">
      <div class="section-filter-bar">
        <div class="filter-tabs" role="tablist" aria-label="Lọc trạng thái phiếu yêu cầu">
          <button
            id="tab-all"
            role="tab"
            type="button"
            class="filter-tab"
            :class="{ active: selectedTab === 'all' }"
            :aria-selected="selectedTab === 'all'"
            :aria-controls="'proposals-tabpanel'"
            :tabindex="selectedTab === 'all' ? 0 : -1"
            @click="onSelectTab('all')"
            @keydown="onTabKeydown($event, 'all')"
          >
            Tất cả <span class="tab-count">({{ statusCounts.all }})</span>
          </button>
          <button
            id="tab-draft"
            role="tab"
            type="button"
            class="filter-tab"
            :class="{ active: selectedTab === 'draft' }"
            :aria-selected="selectedTab === 'draft'"
            :aria-controls="'proposals-tabpanel'"
            :tabindex="selectedTab === 'draft' ? 0 : -1"
            @click="onSelectTab('draft')"
            @keydown="onTabKeydown($event, 'draft')"
          >
            Bản nháp <span class="tab-count">({{ statusCounts.draft }})</span>
          </button>
          <button
            id="tab-submitted"
            role="tab"
            type="button"
            class="filter-tab"
            :class="{ active: selectedTab === 'submitted' }"
            :aria-selected="selectedTab === 'submitted'"
            :aria-controls="'proposals-tabpanel'"
            :tabindex="selectedTab === 'submitted' ? 0 : -1"
            @click="onSelectTab('submitted')"
            @keydown="onTabKeydown($event, 'submitted')"
          >
            {{ submittedTabLabel }} <span class="tab-count">({{ statusCounts.submitted }})</span>
          </button>
          <button
            id="tab-approved"
            role="tab"
            type="button"
            class="filter-tab"
            :class="{ active: selectedTab === 'approved' }"
            :aria-selected="selectedTab === 'approved'"
            :aria-controls="'proposals-tabpanel'"
            :tabindex="selectedTab === 'approved' ? 0 : -1"
            @click="onSelectTab('approved')"
            @keydown="onTabKeydown($event, 'approved')"
          >
            Đã duyệt <span class="tab-count">({{ statusCounts.approved }})</span>
          </button>
          <button
            id="tab-returned"
            role="tab"
            type="button"
            class="filter-tab"
            :class="{ active: selectedTab === 'returned' }"
            :aria-selected="selectedTab === 'returned'"
            :aria-controls="'proposals-tabpanel'"
            :tabindex="selectedTab === 'returned' ? 0 : -1"
            @click="onSelectTab('returned')"
            @keydown="onTabKeydown($event, 'returned')"
          >
            Cần sửa <span class="tab-count">({{ statusCounts.returned }})</span>
          </button>
        </div>
      </div>

      <!-- Tabpanel Container -->
      <div id="proposals-tabpanel" role="tabpanel" :aria-labelledby="'tab-' + selectedTab">
        <!-- Loading State -->
        <div v-if="isLoading" class="loading-state">
          <p>Đang tải danh sách phiếu yêu cầu...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredProposals.length === 0" class="empty-state">
          <p v-if="selectedTab === 'all'">Chưa có phiếu yêu cầu vật tư nào cho công trình này.</p>
          <p v-else>Không có phiếu nào ở trạng thái "{{ tabLabel(selectedTab) }}".</p>
          <NuxtLink
            v-if="canSubmit && selectedTab === 'all'"
            :to="`/materials/${pId}/proposals/new`"
            class="cockpit-btn cockpit-btn--primary inline-mt"
          >
            Tạo phiếu đầu tiên
          </NuxtLink>
        </div>

        <!-- Proposals Table -->
        <div v-else class="table-wrap">
          <table class="cockpit-table">
            <thead>
              <tr>
                <th scope="col">Ngày cần</th>
                <th scope="col">Nơi giao hàng</th>
                <th scope="col">Số loại vật tư</th>
                <th scope="col">Tiến độ đơn mua</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" style="text-align: right;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prop in filteredProposals" :key="prop.id">
                <td class="font-medium whitespace-nowrap">
                  <NuxtLink :to="`/materials/${pId}/proposals/${prop.id}`" class="table-link">
                    {{ prop.neededOn }}
                  </NuxtLink>
                </td>
                <td>
                  <span class="delivery-address text-sm">{{ prop.deliveryAddress }}</span>
                </td>
                <td>
                  <span class="cockpit-badge cockpit-badge--neutral">
                    {{ prop.lines.length }} dòng vật tư
                  </span>
                </td>
                <td>
                  <div class="progress-info text-sm">
                    <span>{{ prop.orderProgress.orderCount }} đơn mua</span>
                    <span v-if="prop.orderProgress.signedOrderCount > 0" class="signed-order-text">
                      ({{ prop.orderProgress.signedOrderCount }} đã ký HĐ)
                    </span>
                  </div>
                </td>
                <td>
                  <span class="cockpit-badge" :class="statusBadgeClass(prop.reviewState)">
                    {{ statusText(prop.reviewState) }}
                  </span>
                </td>
                <td style="text-align: right;">
                  <NuxtLink
                    :to="`/materials/${pId}/proposals/${prop.id}`"
                    class="cockpit-btn cockpit-btn--secondary btn-sm"
                  >
                    {{ isAuthorAndEditable(prop) ? 'Chỉnh sửa' : 'Chi tiết' }}
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type {
  MaterialProjectOption,
  MaterialProposalView,
} from '../../../../../shared/schemas/costs/material-procurement'
import { workflowUuidSchema } from '../../../../../shared/schemas/costs/cost-workflow'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'

type MaterialReviewState = MaterialProposalView['reviewState']

definePageMeta({ requiredPermission: 'material.read' })

const route = useRoute()
const repositories = useRepositories()
const repo = repositories.materialProcurement
const companyAccess = useNuxtApp().$companyAccessStore
const authStore = useNuxtApp().$authStore

const pId = computed(() => {
  const p = route.params.projectId
  const str = Array.isArray(p) ? (p[0] ?? '') : String(p || '')
  return workflowUuidSchema.safeParse(str).success ? str : ''
})

const canSubmit = computed(() => Boolean(companyAccess?.hasPermission('material.proposal.submit')))
const canDecide = computed(() => Boolean(companyAccess?.hasPermission('material.proposal.decide')))

const submittedTabLabel = computed(() => {
  return canDecide.value ? 'Chờ duyệt' : 'Đã gửi'
})

function getDefaultTab(): 'all' | MaterialReviewState {
  return canDecide.value ? 'submitted' : 'all'
}

const currentProject = ref<MaterialProjectOption | null>(null)
const proposals = ref<MaterialProposalView[]>([])
const hasUserSelectedTab = ref(false)
const selectedTab = ref<'all' | MaterialReviewState>(getDefaultTab())
const isLoading = ref(false)
const errorMessage = ref('')

const tracker = createAsyncRequestTracker<{ companyId: string; projectId: string }>()

const tabOrder: Array<'all' | MaterialReviewState> = ['all', 'draft', 'submitted', 'approved', 'returned']

function onSelectTab(tab: 'all' | MaterialReviewState) {
  hasUserSelectedTab.value = true
  selectedTab.value = tab
}

function onTabKeydown(e: KeyboardEvent, current: 'all' | MaterialReviewState) {
  const currentIndex = tabOrder.indexOf(current)
  let nextIndex = currentIndex

  if (e.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % tabOrder.length
  } else if (e.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length
  } else if (e.key === 'Home') {
    nextIndex = 0
  } else if (e.key === 'End') {
    nextIndex = tabOrder.length - 1
  } else {
    return
  }

  e.preventDefault()
  const nextTab = tabOrder[nextIndex]
  if (nextTab) {
    onSelectTab(nextTab)
    const el = document.getElementById(`tab-${nextTab}`)
    el?.focus()
  }
}

watch(canDecide, (can) => {
  if (!hasUserSelectedTab.value) {
    selectedTab.value = can ? 'submitted' : 'all'
  }
})

const statusCounts = computed(() => {
  const counts: Record<'all' | MaterialReviewState, number> = {
    all: proposals.value.length,
    draft: 0,
    submitted: 0,
    approved: 0,
    returned: 0,
  }
  for (const p of proposals.value) {
    if (p.reviewState in counts) {
      counts[p.reviewState]++
    }
  }
  return counts
})

const filteredProposals = computed(() => {
  if (selectedTab.value === 'all') return proposals.value
  return proposals.value.filter((p: MaterialProposalView) => p.reviewState === selectedTab.value)
})

function isAuthorAndEditable(prop: MaterialProposalView): boolean {
  if (!canSubmit.value) return false
  if (authStore?.user?.id !== prop.createdBy) return false
  return prop.reviewState === 'draft' || prop.reviewState === 'returned'
}

function statusText(state: MaterialReviewState): string {
  switch (state) {
    case 'draft': return 'Bản nháp'
    case 'submitted': return submittedTabLabel.value
    case 'approved': return 'Đã duyệt'
    case 'returned': return 'Cần sửa'
    default: return state
  }
}

function statusBadgeClass(state: MaterialReviewState): string {
  switch (state) {
    case 'draft': return 'cockpit-badge--neutral'
    case 'submitted': return 'cockpit-badge--info'
    case 'approved': return 'cockpit-badge--success'
    case 'returned': return 'cockpit-badge--danger'
    default: return 'cockpit-badge--neutral'
  }
}

function tabLabel(tab: string): string {
  switch (tab) {
    case 'draft': return 'Bản nháp'
    case 'submitted': return submittedTabLabel.value
    case 'approved': return 'Đã duyệt'
    case 'returned': return 'Cần sửa'
    default: return tab
  }
}

async function loadData() {
  const activeCompanyId = companyAccess?.activeCompanyId
  if (!activeCompanyId || !pId.value) {
    proposals.value = []
    currentProject.value = null
    isLoading.value = false
    return
  }

  const token = tracker.start({ companyId: activeCompanyId, projectId: pId.value })
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [projectList, propList] = await Promise.all([
      repo.listProjects(),
      repo.listProposals(pId.value),
    ])
    if (!token.isCurrent()) return
    currentProject.value = projectList.find(p => p.projectId === pId.value) || null
    proposals.value = propList
  } catch (err: unknown) {
    if (!token.isCurrent()) return
    errorMessage.value = err instanceof Error ? err.message : 'Không thể tải danh sách phiếu yêu cầu.'
  } finally {
    if (token.isCurrent()) {
      isLoading.value = false
    }
  }
}

watch([() => companyAccess?.activeCompanyId, pId], () => {
  tracker.invalidate()
  proposals.value = []
  currentProject.value = null
  errorMessage.value = ''
  hasUserSelectedTab.value = false
  selectedTab.value = getDefaultTab()
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
.proposals-section {
  padding: 16px 20px;
}
.section-filter-bar {
  margin-bottom: 16px;
  overflow-x: auto;
}
.filter-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--line, #e2e8f0);
  padding-bottom: 8px;
}
.filter-tab {
  background: none;
  border: none;
  padding: 8px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink-muted, #64748b);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.filter-tab:hover {
  background: #f1f5f9;
  color: var(--ink, #0f172a);
}
.filter-tab.active {
  background: #e0f2fe;
  color: #0369a1;
}
.tab-count {
  font-size: 0.78rem;
  opacity: 0.8;
}
.loading-state,
.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--ink-muted, #64748b);
  font-size: 0.95rem;
}
.inline-mt {
  margin-top: 14px;
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
.table-link {
  color: #0284c7;
  text-decoration: none;
  font-weight: 600;
}
.table-link:hover {
  text-decoration: underline;
}
.delivery-address {
  max-width: 320px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.signed-order-text {
  color: #166534;
  font-weight: 500;
  margin-left: 4px;
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
  transition: background 0.15s ease;
}
.cockpit-btn--primary {
  background: #0284c7;
  color: #ffffff;
  border: none;
}
.cockpit-btn--primary:hover {
  background: #0369a1;
}
.cockpit-btn--secondary {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}
.cockpit-btn--secondary:hover {
  background: #e2e8f0;
}
.btn-sm {
  padding: 5px 10px;
  font-size: 0.8rem;
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
.cockpit-badge--info {
  background: #e0f2fe;
  color: #0369a1;
}
.cockpit-badge--success {
  background: #dcfce7;
  color: #166534;
}
.cockpit-badge--danger {
  background: #fee2e2;
  color: #991b1b;
}
.cockpit-badge--code {
  background: #e0f2fe;
  color: #0369a1;
}
.font-mono {
  font-family: monospace;
}
.font-medium {
  font-weight: 500;
}
.whitespace-nowrap {
  white-space: nowrap;
}
@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
