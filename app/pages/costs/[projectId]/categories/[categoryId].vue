<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type {
  FinanceCategoryRow,
  FinanceItemDetails,
  FinanceOverview,
  FinanceSubcontractDetail,
  FinanceSubcontractorDetail,
  FinanceSubcontractorList,
  ItemDetailQuery,
  PaymentQuery,
} from '../../../../../shared/schemas/costs/project-finance'
import {
  categoryDisplayName,
  formatFinanceMoney,
} from '../../../../utils/costs/finance-display'
import { getCategoryAccentColor } from '../../../../utils/costs/category-chart'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import { mapCostsApiError } from '../../../../utils/costs/costs-error-mapper'
import ProjectCostSubcontractorTable, { type SubcontractorTableRow } from '../../../../components/costs/ProjectCostSubcontractorTable.vue'
import ProjectCostSubcontractLedger from '../../../../components/costs/ProjectCostSubcontractLedger.vue'
import ProjectCostOrdinaryLedger from '../../../../components/costs/ProjectCostOrdinaryLedger.vue'

definePageMeta({ requiredPermission: 'cost.read' })

const route = useRoute()
const router = useRouter()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore

const projectId = computed(() => String(route.params.projectId ?? ''))
const categoryId = computed(() => String(route.params.categoryId ?? ''))
const selectedPartyId = computed(() => (route.query.partyId ? String(route.query.partyId) : null))
const selectedContractId = computed(() => (route.query.contractId ? String(route.query.contractId) : null))
const isViewingPayments = computed(() => Boolean(selectedPartyId.value || selectedContractId.value))

// Independent async stream trackers (R02, R03)
const overviewTracker = createAsyncRequestTracker()
const ordinaryTracker = createAsyncRequestTracker()
const subcontractorsTracker = createAsyncRequestTracker()
const paymentsTracker = createAsyncRequestTracker()

// Page status
const overview = ref<FinanceOverview | null>(null)
const pageStatus = ref<'loading' | 'ready' | 'empty' | 'category_not_found' | 'project_not_found' | 'permission' | 'module' | 'error'>('loading')

// Category resolved from overview
const currentCategory = computed<FinanceCategoryRow | null>(() => {
  if (!overview.value) return null
  return overview.value.categories.find(c => c.categoryId === categoryId.value) ?? null
})

// Ordinary Category State
const ordinaryDetails = ref<FinanceItemDetails | null>(null)
const ordinaryStatus = ref<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
const ordinaryPage = ref(1)
const ordinaryPageSize = ref<25 | 50 | 100>(25)
const ordinarySearch = ref('')
const ordinaryDateFrom = ref('')
const ordinaryDateTo = ref('')
const ordinaryRetention = ref<'all' | 'warranty' | 'other' | 'no_recorded_retention'>('all')

// Subcontract Category State
const subcontractorList = ref<FinanceSubcontractorList | null>(null)
const subcontractorsStatus = ref<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')

// Selected Contractor Payments State
const contractorDetail = ref<FinanceSubcontractorDetail | FinanceSubcontractDetail | null>(null)
const contractorDetailStatus = ref<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
const paymentPage = ref(1)
const paymentPageSize = ref<25 | 50 | 100>(25)
const paymentSearch = ref('')
const paymentDateFrom = ref('')
const paymentDateTo = ref('')
const paymentRetention = ref<'all' | 'warranty' | 'no_recorded_retention'>('all')

// Load project overview to resolve category
async function loadOverview() {
  if (!projectId.value) {
    pageStatus.value = 'project_not_found'
    return
  }

  const token = overviewTracker.start({ projectId: projectId.value, categoryId: categoryId.value })
  pageStatus.value = 'loading'

  try {
    const data = await repositories.projectFinance.overview(projectId.value)
    if (!token.isCurrent()) return

    overview.value = data
    const cat = data.categories.find(c => c.categoryId === categoryId.value)
    if (!cat) {
      pageStatus.value = 'category_not_found'
      return
    }

    if (cat.code === 'subcontract_labor') {
      pageStatus.value = 'ready'
      await loadSubcontractorData()
    }
    else if (!cat.itemId) {
      pageStatus.value = 'empty'
    }
    else {
      pageStatus.value = 'ready'
      await loadOrdinaryDetails()
    }
  }
  catch (err: unknown) {
    if (!token.isCurrent()) return
    const mapped = mapCostsApiError(err, 'category')
    if (mapped === 'not_found') {
      pageStatus.value = 'project_not_found'
    }
    else if (mapped === 'module') {
      pageStatus.value = 'module'
    }
    else if (mapped === 'permission') {
      pageStatus.value = 'permission'
    }
    else if (mapped !== 'aborted') {
      pageStatus.value = 'error'
    }
  }
}

// Load ordinary item details
async function loadOrdinaryDetails(queryOverride?: Partial<ItemDetailQuery>) {
  const cat = currentCategory.value
  if (!projectId.value || !cat?.itemId) return

  if (queryOverride) {
    if (queryOverride.page !== undefined) ordinaryPage.value = queryOverride.page
    if (queryOverride.pageSize !== undefined) ordinaryPageSize.value = queryOverride.pageSize as 25 | 50 | 100
    if (queryOverride.q !== undefined) ordinarySearch.value = queryOverride.q
    if (queryOverride.dateFrom !== undefined) ordinaryDateFrom.value = queryOverride.dateFrom
    if (queryOverride.dateTo !== undefined) ordinaryDateTo.value = queryOverride.dateTo
    if (queryOverride.retention !== undefined) ordinaryRetention.value = queryOverride.retention
  }

  const query: Partial<ItemDetailQuery> = {
    page: ordinaryPage.value,
    pageSize: ordinaryPageSize.value,
    sort: 'newest',
    retention: ordinaryRetention.value,
  }
  if (ordinarySearch.value.trim()) query.q = ordinarySearch.value.trim()
  if (ordinaryDateFrom.value) query.dateFrom = ordinaryDateFrom.value
  if (ordinaryDateTo.value) query.dateTo = ordinaryDateTo.value

  const token = ordinaryTracker.start({ projectId: projectId.value, itemId: cat.itemId, ...query })
  ordinaryStatus.value = 'loading'

  try {
    const result = await repositories.projectFinance.itemDetails(projectId.value, cat.itemId, query)
    if (!token.isCurrent()) return

    ordinaryDetails.value = result
    if (result.kind === 'ordinary') {
      ordinaryStatus.value = result.details.rows.length === 0 ? 'empty' : 'ready'
    }
    else {
      ordinaryStatus.value = 'ready'
    }
  }
  catch (err: unknown) {
    if (!token.isCurrent()) return
    const mapped = mapCostsApiError(err, 'ledger')
    if (mapped !== 'aborted') {
      ordinaryStatus.value = 'error'
    }
  }
}

// Load subcontractors list
async function loadSubcontractorData() {
  if (!projectId.value) return

  const token = subcontractorsTracker.start({ projectId: projectId.value })
  subcontractorsStatus.value = 'loading'

  try {
    const result = await repositories.projectFinance.subcontractors(projectId.value)
    if (!token.isCurrent()) return

    subcontractorList.value = result
    subcontractorsStatus.value = result.parties.length === 0 ? 'empty' : 'ready'

    if (selectedContractId.value || selectedPartyId.value) {
      await loadContractorPayments()
    }
  }
  catch (err: unknown) {
    if (!token.isCurrent()) return
    const mapped = mapCostsApiError(err, 'ledger')
    if (mapped !== 'aborted') {
      subcontractorsStatus.value = 'error'
    }
  }
}

// Load specific contractor/contract payments
async function loadContractorPayments(queryOverride?: Partial<PaymentQuery>) {
  if (!projectId.value || (!selectedPartyId.value && !selectedContractId.value)) return

  if (queryOverride) {
    if (queryOverride.page !== undefined) paymentPage.value = queryOverride.page
    if (queryOverride.pageSize !== undefined) paymentPageSize.value = queryOverride.pageSize as 25 | 50 | 100
    if (queryOverride.q !== undefined) paymentSearch.value = queryOverride.q
    if (queryOverride.dateFrom !== undefined) paymentDateFrom.value = queryOverride.dateFrom
    if (queryOverride.dateTo !== undefined) paymentDateTo.value = queryOverride.dateTo
    if (queryOverride.retention !== undefined) paymentRetention.value = queryOverride.retention
  }

  const query: Partial<PaymentQuery> = {
    page: paymentPage.value,
    pageSize: paymentPageSize.value,
    sort: 'newest',
    retention: paymentRetention.value,
  }
  if (paymentSearch.value.trim()) query.q = paymentSearch.value.trim()
  if (paymentDateFrom.value) query.dateFrom = paymentDateFrom.value
  if (paymentDateTo.value) query.dateTo = paymentDateTo.value

  const identity = {
    projectId: projectId.value,
    partyId: selectedPartyId.value,
    contractId: selectedContractId.value,
    ...query,
  }

  const token = paymentsTracker.start(identity)
  contractorDetailStatus.value = 'loading'

  try {
    let result: FinanceSubcontractorDetail | FinanceSubcontractDetail
    if (selectedContractId.value) {
      result = await repositories.projectFinance.subcontract(projectId.value, selectedContractId.value, query)
    }
    else {
      result = await repositories.projectFinance.subcontractor(projectId.value, selectedPartyId.value!, query)
    }
    if (!token.isCurrent()) return

    contractorDetail.value = result
    contractorDetailStatus.value = result.payments.rows.length === 0 ? 'empty' : 'ready'
  }
  catch (err: unknown) {
    if (!token.isCurrent()) return
    const mapped = mapCostsApiError(err, 'ledger')
    if (mapped !== 'aborted') {
      // Clear failed contractor data so old money is not shown as current (R03)
      contractorDetail.value = null
      contractorDetailStatus.value = 'error'
    }
  }
}

function viewPayments(row: SubcontractorTableRow) {
  paymentPage.value = 1
  paymentSearch.value = ''
  paymentDateFrom.value = ''
  paymentDateTo.value = ''
  paymentRetention.value = 'all'

  if (row.contractId) {
    router.push({
      query: {
        ...route.query,
        contractId: row.contractId,
        partyId: row.party.partyId,
      },
    })
  }
  else {
    router.push({
      query: {
        ...route.query,
        partyId: row.party.partyId,
      },
    })
  }
}

function clearSelectedParty() {
  const query = { ...route.query }
  delete query.partyId
  delete query.contractId
  router.push({ query })
}

watch(
  [projectId, categoryId, () => companyAccess.activeCompanyId],
  () => {
    loadOverview()
  },
  { immediate: true },
)

watch(
  [selectedPartyId, selectedContractId],
  ([newPartyId, newContractId]) => {
    // Invalidate inflight requests immediately when selection changes (R02, R03)
    paymentsTracker.invalidate()
    contractorDetail.value = null

    if ((newPartyId || newContractId) && currentCategory.value?.code === 'subcontract_labor') {
      paymentPage.value = 1
      loadContractorPayments()
    }
    else {
      contractorDetailStatus.value = 'idle'
    }
  },
)

onUnmounted(() => {
  overviewTracker.invalidate()
  ordinaryTracker.invalidate()
  subcontractorsTracker.invalidate()
  paymentsTracker.invalidate()
})
</script>

<template>
  <div class="category-detail-page" data-testid="category-detail-page">
    <!-- Breadcrumb -->
    <nav class="breadcrumb-nav" aria-label="Đường dẫn điều hướng">
      <NuxtLink to="/costs" class="breadcrumb-link">
        Chi phí
      </NuxtLink>
      <span class="breadcrumb-sep" aria-hidden="true">/</span>
      <NuxtLink
        v-if="overview"
        :to="`/costs/${projectId}`"
        class="breadcrumb-link"
        data-testid="breadcrumb-project-link"
      >
        {{ overview.project.projectName }}
      </NuxtLink>
      <span class="breadcrumb-sep" aria-hidden="true">/</span>
      <span
        v-if="currentCategory"
        class="breadcrumb-current"
        data-testid="breadcrumb-category-current"
      >
        {{ categoryDisplayName(currentCategory.code, currentCategory.name) }}
      </span>
    </nav>

    <div class="page-top-nav">
      <NuxtLink
        :to="`/costs/${projectId}`"
        class="back-link"
        data-testid="back-to-project-link"
      >
        <UIcon name="i-lucide-arrow-left" aria-hidden="true" />
        <span>Quay lại dự án {{ overview?.project.projectName ?? '' }}</span>
      </NuxtLink>
    </div>

    <!-- Loading State -->
    <div v-if="pageStatus === 'loading'" class="state-panel cockpit-card" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
      <p>Đang tải thông tin danh mục chi phí…</p>
    </div>

    <!-- Project Not Found State -->
    <div v-else-if="pageStatus === 'project_not_found'" class="state-panel cockpit-card" data-testid="category-project-not-found">
      <UIcon name="i-lucide-file-question" aria-hidden="true" />
      <h2>Không tìm thấy dự án</h2>
      <p>Dự án này không tồn tại hoặc bạn không có quyền truy cập.</p>
      <NuxtLink to="/costs" class="cockpit-btn cockpit-btn--secondary">
        Quay lại danh sách chi phí
      </NuxtLink>
    </div>

    <!-- Category Not Found State -->
    <div v-else-if="pageStatus === 'category_not_found'" class="state-panel cockpit-card" data-testid="category-not-found">
      <UIcon name="i-lucide-file-question" aria-hidden="true" />
      <h2>Không tìm thấy danh mục chi phí</h2>
      <p>Danh mục này không thuộc dự án hoặc mã danh mục không hợp lệ.</p>
      <NuxtLink :to="`/costs/${projectId}`" class="cockpit-btn cockpit-btn--secondary">
        Quay lại dự án
      </NuxtLink>
    </div>

    <!-- Module Disabled State (R05) -->
    <div v-else-if="pageStatus === 'module'" class="state-panel cockpit-card" data-testid="category-module-disabled">
      <UIcon name="i-lucide-toggle-left" aria-hidden="true" />
      <h2>Tính năng chưa kích hoạt</h2>
      <p>Mô-đun quản trị chi phí chưa được kích hoạt cho công ty này.</p>
      <NuxtLink to="/costs" class="cockpit-btn cockpit-btn--secondary">
        Quay lại danh sách chi phí
      </NuxtLink>
    </div>

    <!-- Permission Denied State (R05) -->
    <div v-else-if="pageStatus === 'permission'" class="state-panel cockpit-card" data-testid="category-permission-denied">
      <UIcon name="i-lucide-shield-alert" aria-hidden="true" />
      <h2>Không có quyền truy cập</h2>
      <p>Bạn không có quyền xem chi phí danh mục này.</p>
      <NuxtLink :to="`/costs/${projectId}`" class="cockpit-btn cockpit-btn--secondary">
        Quay lại dự án
      </NuxtLink>
    </div>

    <!-- Error State -->
    <div v-else-if="pageStatus === 'error'" class="state-panel cockpit-card state-panel--error" role="alert" data-testid="category-error-panel">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      <h2>Không thể tải dữ liệu danh mục</h2>
      <p>Đã xảy ra lỗi khi tải dữ liệu từ máy chủ.</p>
      <button type="button" class="cockpit-btn cockpit-btn--secondary" @click="loadOverview">
        <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
        <span>Thử lại</span>
      </button>
    </div>

    <!-- Empty Category State (itemId === null) -->
    <div v-else-if="pageStatus === 'empty' && currentCategory" class="category-main-content">
      <header class="category-header cockpit-card">
        <div class="category-title-bar">
          <div class="category-badge-group">
            <span
              class="cockpit-badge"
              :style="{
                backgroundColor: getCategoryAccentColor(currentCategory.code) + '22',
                color: getCategoryAccentColor(currentCategory.code),
                borderColor: getCategoryAccentColor(currentCategory.code),
              }"
            >
              {{ currentCategory.code }}
            </span>
            <span class="cockpit-badge cockpit-badge--neutral">Chưa ghi nhận</span>
          </div>
          <h1 class="category-heading" data-testid="category-heading">
            {{ categoryDisplayName(currentCategory.code, currentCategory.name) }}
          </h1>
        </div>
      </header>

      <div class="state-panel cockpit-card" data-testid="category-empty-panel">
        <UIcon name="i-lucide-inbox" aria-hidden="true" />
        <h2>Chưa có hạng mục chi phí</h2>
        <p>Danh mục này chưa được tạo hạng mục công việc hoặc chưa ghi nhận chi phí.</p>
      </div>
    </div>

    <!-- Content Ready -->
    <div v-else-if="currentCategory && overview" class="category-main-content">
      <!-- Category Header & Subtotals -->
      <header class="category-header cockpit-card">
        <div class="category-header-layout">
          <div class="category-title-bar">
            <div class="category-badge-group">
              <span
                class="cockpit-badge"
                :style="{
                  backgroundColor: getCategoryAccentColor(currentCategory.code) + '22',
                  color: getCategoryAccentColor(currentCategory.code),
                  borderColor: getCategoryAccentColor(currentCategory.code),
                }"
              >
                {{ currentCategory.code }}
              </span>
              <span
                v-if="currentCategory.cost.state === 'recorded'"
                class="cockpit-badge cockpit-badge--success"
              >
                Đã ghi nhận
              </span>
              <span
                v-else-if="currentCategory.cost.state === 'needs_reconciliation'"
                class="cockpit-badge cockpit-badge--warning"
              >
                Chưa đối soát
              </span>
              <span
                v-else
                class="cockpit-badge cockpit-badge--neutral"
              >
                Chưa ghi nhận
              </span>
            </div>
            <h1 class="category-heading" data-testid="category-heading">
              {{ categoryDisplayName(currentCategory.code, currentCategory.name) }}
            </h1>
            <p v-if="currentCategory.description" class="category-desc">
              {{ currentCategory.description }}
            </p>
          </div>

          <!-- Category Key Metrics -->
          <div class="category-metrics-cards">
            <div class="cat-metric-card">
              <span class="cat-metric-label">
                {{ currentCategory.code === 'subcontract_labor' && currentCategory.cost.state === 'needs_reconciliation' ? 'Chi/ứng đã ghi nhận' : 'Chi phí danh mục' }}
              </span>
              <span class="cat-metric-value font-mono font-bold" data-testid="category-subtotal-value">
                <template v-if="currentCategory.cost.state === 'recorded' && currentCategory.cost.amount != null">
                  {{ formatFinanceMoney(currentCategory.cost.amount, overview.project.currencyCode, overview.project.moneyScale) }}
                </template>
                <template v-else-if="currentCategory.code === 'subcontract_labor' && currentCategory.recordedPaymentsTotal != null">
                  {{ formatFinanceMoney(currentCategory.recordedPaymentsTotal, overview.project.currencyCode, overview.project.moneyScale) }}
                </template>
                <template v-else>
                  Chưa ghi nhận
                </template>
              </span>
            </div>

            <div v-if="currentCategory.warrantyRetention.amount != null" class="cat-metric-card">
              <span class="cat-metric-label">Bảo hành giữ lại</span>
              <span class="cat-metric-value font-mono" data-testid="category-warranty-value">
                {{ formatFinanceMoney(currentCategory.warrantyRetention.amount, overview.project.currencyCode, overview.project.moneyScale) }}
              </span>
            </div>
          </div>
        </div>
      </header>

      <!-- MODE 1: Subcontract Labor Category -->
      <section v-if="currentCategory.code === 'subcontract_labor'" class="subcontract-section">
        <!-- Subcontractor List Table (When no contractor/dossier selected) -->
        <ProjectCostSubcontractorTable
          v-if="!isViewingPayments"
          :parties="subcontractorList?.parties ?? []"
          :status="subcontractorsStatus"
          :currency-code="overview.project.currencyCode"
          :money-scale="overview.project.moneyScale"
          @view-payments="viewPayments"
          @retry="loadSubcontractorData"
        />

        <!-- Selected Contractor Payment Ledger View -->
        <ProjectCostSubcontractLedger
          v-else
          :detail="contractorDetail"
          :status="contractorDetailStatus"
          :currency-code="overview.project.currencyCode"
          :money-scale="overview.project.moneyScale"
          :initial-page="paymentPage"
          :initial-page-size="paymentPageSize"
          @back="clearSelectedParty"
          @change-query="loadContractorPayments"
          @retry="() => loadContractorPayments()"
        />
      </section>

      <!-- MODE 2: Ordinary Category Details -->
      <section v-else class="ordinary-category-section">
        <ProjectCostOrdinaryLedger
          :details="ordinaryDetails"
          :status="ordinaryStatus"
          :currency-code="overview.project.currencyCode"
          :money-scale="overview.project.moneyScale"
          :item-id="currentCategory.itemId"
          :initial-page="ordinaryPage"
          :initial-page-size="ordinaryPageSize"
          @change-query="loadOrdinaryDetails"
          @retry="() => loadOrdinaryDetails()"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.category-detail-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.breadcrumb-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.breadcrumb-link {
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: color 0.15s ease;
}

.breadcrumb-link:hover {
  color: var(--color-primary);
  text-decoration: underline;
}

.breadcrumb-sep {
  opacity: 0.5;
}

.breadcrumb-current {
  font-weight: 600;
  color: var(--color-text-primary);
}

.page-top-nav {
  display: flex;
  align-items: center;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  transition: color 0.15s ease;
}

.back-link:hover {
  color: var(--color-primary);
}

.category-main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.category-header {
  padding: 24px;
  border-radius: var(--radius-lg, 12px);
}

.category-header-layout {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  flex-wrap: wrap;
}

.category-title-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 650px;
}

.category-badge-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-heading {
  font-size: 1.5rem;
  font-weight: 750;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.3;
}

.category-desc {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.45;
}

.category-metrics-cards {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.cat-metric-card {
  background: var(--color-surface-subtle, #f8fafc);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
}

.cat-metric-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cat-metric-value {
  font-size: 1.25rem;
  color: var(--color-text-primary);
}

.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-secondary);
  border-radius: var(--radius-lg, 12px);
  gap: 12px;
}

.state-panel h2 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.state-panel p {
  margin: 0;
  font-size: 0.9rem;
  max-width: 480px;
  line-height: 1.5;
}

.state-panel--error {
  border-color: var(--color-danger, #ef4444);
  background: var(--color-danger-subtle, rgba(239, 68, 68, 0.04));
}

.state-panel--error h2 {
  color: var(--color-danger, #ef4444);
}

@media (max-width: 768px) {
  .category-detail-page {
    padding: 16px;
  }
  .category-header-layout {
    flex-direction: column;
  }
}
</style>
