<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Decimal from 'decimal.js'
import { ClientError } from '../../../../errors/client-error'
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
  formatDateProvenance,
  formatFinanceMoney,
} from '../../../../utils/costs/finance-display'
import { getCategoryAccentColor } from '../../../../utils/costs/category-chart'

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

// Page status
const overview = ref<FinanceOverview | null>(null)
const pageStatus = ref<'loading' | 'ready' | 'empty' | 'category_not_found' | 'project_not_found' | 'permission' | 'error'>('loading')
let request = 0

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

interface SubcontractorTableRow {
  rowKey: string
  party: {
    partyId: string
    code: string
    displayName: string
    partyKind: 'organization' | 'crew'
  }
  contractId: string | null
  contractCode: string | null
  contractNo: string | null
  contractName: string
  contractDate: string | null
  contractValue: string | null
  paidTotal: string | null
  recordedRetentionTotal: string | null
}

const subcontractorRows = computed<SubcontractorTableRow[]>(() => {
  if (!subcontractorList.value) return []
  const rows: SubcontractorTableRow[] = []
  for (const item of subcontractorList.value.parties) {
    if (item.contracts.length === 0) {
      rows.push({
        rowKey: `party-${item.party.partyId}`,
        party: item.party,
        contractId: null,
        contractCode: null,
        contractNo: null,
        contractName: '—',
        contractDate: null,
        contractValue: null,
        paidTotal: null,
        recordedRetentionTotal: null,
      })
    }
    else {
      for (const contract of item.contracts) {
        rows.push({
          rowKey: `${item.party.partyId}-${contract.id}`,
          party: item.party,
          contractId: contract.id,
          contractCode: contract.code,
          contractNo: contract.contractNo,
          contractName: contract.contractName,
          contractDate: contract.contractDate,
          contractValue: contract.contractValue,
          paidTotal: contract.paidTotal,
          recordedRetentionTotal: contract.recordedRetentionTotal,
        })
      }
    }
  }
  return rows
})

const distinctContractorCount = computed(() => {
  if (!subcontractorList.value) return 0
  return new Set(subcontractorList.value.parties.map(p => p.party.partyId)).size
})

// Selected Contractor Payments State
const contractorDetail = ref<FinanceSubcontractorDetail | FinanceSubcontractDetail | null>(null)
const contractorDetailStatus = ref<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
const paymentPage = ref(1)
const paymentPageSize = ref<25 | 50 | 100>(25)
const paymentSearch = ref('')
const paymentDateFrom = ref('')
const paymentDateTo = ref('')
const paymentRetention = ref<'all' | 'warranty' | 'no_recorded_retention'>('all')

// Helper for retention label
function formatRetentionLabel(kind: 'warranty' | 'other' | null | undefined, rateBps: number | null | undefined): string {
  const base = kind === 'warranty' ? 'Giữ lại bảo hành' : 'Khoản giữ lại'
  if (rateBps != null) {
    const ratePercent = new Decimal(rateBps).div(100).toString()
    return `${base} ${ratePercent}%`
  }
  return base
}

function getRetentionSummary(details: Array<{ retentionAmount: string | null; retentionKind: 'warranty' | 'other' | null }> | undefined) {
  if (!details || details.length === 0) return null
  const retentionDetails = details.filter(d => d.retentionAmount != null)
  if (retentionDetails.length === 0) return null
  const hasWarranty = retentionDetails.some(d => d.retentionKind === 'warranty')
  const label = hasWarranty ? 'Giữ lại bảo hành' : 'Khoản giữ lại'
  const total = retentionDetails.reduce((acc, d) => acc.add(new Decimal(d.retentionAmount!)), new Decimal(0))
  return {
    label,
    amount: total.toFixed(4),
  }
}

// Load project overview to resolve category
async function loadOverview() {
  if (!projectId.value) {
    pageStatus.value = 'project_not_found'
    return
  }

  const currentRequest = ++request
  pageStatus.value = 'loading'

  try {
    const data = await repositories.projectFinance.overview(projectId.value)
    if (currentRequest !== request) return

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
    if (currentRequest !== request) return
    if (err instanceof ClientError) {
      if (err.code === 'RESOURCE_NOT_FOUND') {
        pageStatus.value = 'project_not_found'
        return
      }
      if (err.code === 'PERMISSION_DENIED') {
        pageStatus.value = 'permission'
        return
      }
      if (err.reason === 'MODULE_DISABLED') {
        pageStatus.value = 'permission'
        return
      }
    }
    pageStatus.value = 'error'
  }
}

// Load ordinary item details
async function loadOrdinaryDetails() {
  const cat = currentCategory.value
  if (!projectId.value || !cat?.itemId) return

  const currentRequest = request
  ordinaryStatus.value = 'loading'

  const query: Partial<ItemDetailQuery> = {
    page: ordinaryPage.value,
    pageSize: ordinaryPageSize.value,
    sort: 'newest',
    retention: ordinaryRetention.value,
  }
  if (ordinarySearch.value.trim()) query.q = ordinarySearch.value.trim()
  if (ordinaryDateFrom.value) query.dateFrom = ordinaryDateFrom.value
  if (ordinaryDateTo.value) query.dateTo = ordinaryDateTo.value

  try {
    const result = await repositories.projectFinance.itemDetails(projectId.value, cat.itemId, query)
    if (currentRequest !== request) return

    ordinaryDetails.value = result
    if (result.kind === 'ordinary') {
      ordinaryStatus.value = result.details.rows.length === 0 ? 'empty' : 'ready'
    }
    else {
      ordinaryStatus.value = 'ready'
    }
  }
  catch {
    if (currentRequest !== request) return
    ordinaryStatus.value = 'error'
  }
}

// Load subcontractors list
async function loadSubcontractorData() {
  if (!projectId.value) return
  const currentRequest = request
  subcontractorsStatus.value = 'loading'

  try {
    const result = await repositories.projectFinance.subcontractors(projectId.value)
    if (currentRequest !== request) return

    subcontractorList.value = result
    subcontractorsStatus.value = result.parties.length === 0 ? 'empty' : 'ready'

    if (selectedContractId.value || selectedPartyId.value) {
      await loadContractorPayments()
    }
  }
  catch {
    if (currentRequest !== request) return
    subcontractorsStatus.value = 'error'
  }
}

// Load specific contractor/contract payments
async function loadContractorPayments() {
  if (!projectId.value || (!selectedPartyId.value && !selectedContractId.value)) return
  const currentRequest = request
  contractorDetailStatus.value = 'loading'

  const query: Partial<PaymentQuery> = {
    page: paymentPage.value,
    pageSize: paymentPageSize.value,
    sort: 'newest',
    retention: paymentRetention.value,
  }
  if (paymentSearch.value.trim()) query.q = paymentSearch.value.trim()
  if (paymentDateFrom.value) query.dateFrom = paymentDateFrom.value
  if (paymentDateTo.value) query.dateTo = paymentDateTo.value

  try {
    let result: FinanceSubcontractorDetail | FinanceSubcontractDetail
    if (selectedContractId.value) {
      result = await repositories.projectFinance.subcontract(projectId.value, selectedContractId.value, query)
    }
    else {
      result = await repositories.projectFinance.subcontractor(projectId.value, selectedPartyId.value!, query)
    }
    if (currentRequest !== request) return

    contractorDetail.value = result
    contractorDetailStatus.value = result.payments.rows.length === 0 ? 'empty' : 'ready'
  }
  catch {
    if (currentRequest !== request) return
    contractorDetailStatus.value = 'error'
  }
}

function viewPayments(row: SubcontractorTableRow) {
  paymentPage.value = 1
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

// Ordinary filter handlers
function onOrdinaryFilterChange() {
  ordinaryPage.value = 1
  loadOrdinaryDetails()
}

// Payment filter handlers
function onPaymentFilterChange() {
  paymentPage.value = 1
  loadContractorPayments()
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
    if ((newPartyId || newContractId) && currentCategory.value?.code === 'subcontract_labor') {
      paymentPage.value = 1
      loadContractorPayments()
    }
    else {
      contractorDetail.value = null
      contractorDetailStatus.value = 'idle'
    }
  },
)
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
    <div v-else-if="pageStatus === 'project_not_found'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-file-question" aria-hidden="true" />
      <h2>Không tìm thấy dự án</h2>
      <p>Dự án này không tồn tại hoặc bạn không có quyền truy cập.</p>
      <NuxtLink to="/costs" class="cockpit-btn cockpit-btn--secondary">
        Quay lại danh sách chi phí
      </NuxtLink>
    </div>

    <!-- Category Not Found State -->
    <div v-else-if="pageStatus === 'category_not_found'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-file-question" aria-hidden="true" />
      <h2>Không tìm thấy danh mục chi phí</h2>
      <p>Danh mục này không thuộc dự án hoặc mã danh mục không hợp lệ.</p>
      <NuxtLink :to="`/costs/${projectId}`" class="cockpit-btn cockpit-btn--secondary">
        Quay lại dự án
      </NuxtLink>
    </div>

    <!-- Permission State -->
    <div v-else-if="pageStatus === 'permission'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-shield-alert" aria-hidden="true" />
      <h2>Không có quyền truy cập</h2>
      <p>Bạn không có quyền xem chi phí danh mục này.</p>
      <NuxtLink :to="`/costs/${projectId}`" class="cockpit-btn cockpit-btn--secondary">
        Quay lại dự án
      </NuxtLink>
    </div>

    <!-- Error State -->
    <div v-else-if="pageStatus === 'error'" class="state-panel cockpit-card state-panel--error" role="alert">
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
        <div v-if="!isViewingPayments" class="subcontractors-list-area">
          <div class="section-title-bar">
            <h2>Danh sách nhà thầu phụ</h2>
            <span v-if="subcontractorList" class="item-count">
              {{ distinctContractorCount }} nhà thầu
            </span>
          </div>

          <div v-if="subcontractorsStatus === 'loading'" class="state-panel cockpit-card" aria-live="polite">
            <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
            <p>Đang tải danh sách nhà thầu…</p>
          </div>

          <div v-else-if="subcontractorsStatus === 'empty'" class="state-panel cockpit-card">
            <UIcon name="i-lucide-inbox" aria-hidden="true" />
            <p>Chưa có nhà thầu hoặc đợt chi ứng nào được ghi nhận cho dự án này.</p>
          </div>

          <template v-else-if="subcontractorList">
            <!-- Desktop Table (6 columns) -->
            <div class="subcontractor-desktop-table table-container cockpit-card" tabindex="0" aria-label="Bảng các nhà thầu phụ">
              <table class="subcontract-table" data-testid="subcontractor-table">
                <colgroup>
                  <col class="col-party">
                  <col class="col-content">
                  <col class="col-contract">
                  <col class="col-paid">
                  <col class="col-retention">
                  <col class="col-action">
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" class="th-party text-left">
                      Thầu
                    </th>
                    <th scope="col" class="th-content text-left">
                      Nội dung
                    </th>
                    <th scope="col" class="th-contract text-left">
                      Hợp đồng
                    </th>
                    <th scope="col" class="th-paid text-right">
                      Chi/ứng đã ghi nhận
                    </th>
                    <th scope="col" class="th-retention text-right">
                      Bảo hành
                    </th>
                    <th scope="col" class="th-action text-center">
                      Xem chi tiết
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in subcontractorRows"
                    :key="row.rowKey"
                    class="party-row"
                    :data-testid="`contractor-row-${row.contractId ?? row.party.partyId}`"
                    :data-party-id="row.party.partyId"
                    :data-contract-id="row.contractId"
                  >
                    <td class="td-party text-left">
                      <div class="party-info">
                        <span class="party-name font-bold">{{ row.party.displayName }}</span>
                        <span class="party-code font-mono text-xs">{{ row.party.code }}</span>
                      </div>
                    </td>
                    <td class="td-content text-left">
                      <div class="content-cell">
                        <span v-if="row.contractName && row.contractName !== '—'" class="content-text">{{ row.contractName }}</span>
                        <span v-else class="text-muted">—</span>
                      </div>
                    </td>
                    <td class="td-contract text-left">
                      <div class="contract-brief">
                        <span v-if="row.contractNo" class="contract-no font-mono">{{ row.contractNo }}</span>
                        <span v-else class="contract-no text-muted">Chưa nhập hợp đồng</span>
                        <span v-if="row.contractValue != null" class="contract-val font-mono">
                          ({{ formatFinanceMoney(row.contractValue, overview.project.currencyCode) }})
                        </span>
                        <span v-else class="contract-val text-muted"> (—)</span>
                      </div>
                    </td>
                    <td class="td-paid text-right font-mono font-bold">
                      <div class="paid-cell">
                        <span v-if="row.paidTotal != null">{{ formatFinanceMoney(row.paidTotal, overview.project.currencyCode) }}</span>
                        <span v-else class="text-muted">—</span>
                      </div>
                    </td>
                    <td class="td-retention text-right font-mono">
                      <div class="retention-cell">
                        <span v-if="row.recordedRetentionTotal != null">{{ formatFinanceMoney(row.recordedRetentionTotal, overview.project.currencyCode) }}</span>
                        <span v-else class="text-muted">—</span>
                      </div>
                    </td>
                    <td class="td-action text-center">
                      <div class="action-cell">
                        <button
                          type="button"
                          class="cockpit-btn cockpit-btn--secondary btn-sm"
                          :data-testid="`view-contractor-btn-${row.contractId ?? row.party.partyId}`"
                          :data-party-id="row.party.partyId"
                          :data-contract-id="row.contractId"
                          @click="viewPayments(row)"
                        >
                          <span>Xem đợt thanh toán</span>
                          <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Mobile Cards Presentation (< 768px) -->
            <div class="subcontractor-mobile-cards" data-testid="subcontractor-mobile-cards" aria-label="Danh sách nhà thầu phụ">
              <article
                v-for="row in subcontractorRows"
                :key="`card-${row.rowKey}`"
                class="subcontract-card cockpit-card"
                :data-testid="`contractor-card-${row.contractId ?? row.party.partyId}`"
              >
                <div class="card-header">
                  <div class="party-info">
                    <span class="party-name font-bold">{{ row.party.displayName }}</span>
                    <span class="party-code font-mono text-xs">{{ row.party.code }}</span>
                  </div>
                  <button
                    type="button"
                    class="cockpit-btn cockpit-btn--secondary btn-sm"
                    :data-testid="`view-contractor-btn-mobile-${row.contractId ?? row.party.partyId}`"
                    @click="viewPayments(row)"
                  >
                    <span>Xem chi tiết</span>
                    <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
                  </button>
                </div>

                <div class="card-body">
                  <div class="card-field">
                    <span class="card-field-label">Nội dung:</span>
                    <span class="card-field-value font-medium">{{ row.contractName }}</span>
                  </div>

                  <div class="card-field">
                    <span class="card-field-label">Hợp đồng:</span>
                    <span class="card-field-value">
                      <span v-if="row.contractNo" class="contract-no font-mono">{{ row.contractNo }}</span>
                      <span v-else class="contract-no text-muted">Chưa nhập hợp đồng</span>
                      <span v-if="row.contractValue != null" class="contract-val font-mono">
                        ({{ formatFinanceMoney(row.contractValue, overview.project.currencyCode) }})
                      </span>
                      <span v-else class="contract-val text-muted"> (—)</span>
                    </span>
                  </div>

                  <div class="card-amounts-row">
                    <div class="card-amount-item">
                      <span class="card-field-label">Chi/ứng:</span>
                      <span class="card-field-value font-mono font-bold">
                        <template v-if="row.paidTotal != null">
                          {{ formatFinanceMoney(row.paidTotal, overview.project.currencyCode) }}
                        </template>
                        <span v-else class="text-muted">—</span>
                      </span>
                    </div>

                    <div class="card-amount-item">
                      <span class="card-field-label">Bảo hành:</span>
                      <span class="card-field-value font-mono">
                        <template v-if="row.recordedRetentionTotal != null">
                          {{ formatFinanceMoney(row.recordedRetentionTotal, overview.project.currencyCode) }}
                        </template>
                        <span v-else class="text-muted">—</span>
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </template>
        </div>

        <!-- Selected Contractor Payment Ledger View -->
        <div v-else class="contractor-ledger-area">
          <div class="ledger-header-nav">
            <button
              type="button"
              class="back-to-contractors-btn"
              data-testid="back-to-contractors-btn"
              @click="clearSelectedParty"
            >
              <UIcon name="i-lucide-arrow-left" aria-hidden="true" />
              <span>Quay lại danh sách nhà thầu</span>
            </button>
          </div>

          <!-- Contractor Summary Banner -->
          <div v-if="contractorDetail" class="contractor-summary-card cockpit-card">
            <div class="contractor-title-row">
              <div>
                <h2 class="contractor-name">
                  {{ contractorDetail.party.displayName }}
                </h2>
                <span class="font-mono text-sm text-secondary">{{ contractorDetail.party.code }}</span>
                <div v-if="'contract' in contractorDetail && contractorDetail.contract.contractName" class="contractor-dossier-name text-sm font-medium">
                  {{ contractorDetail.contract.contractName }}
                </div>
              </div>
              <div class="contractor-total-badge">
                <span class="label">Tổng chi/ứng đã ghi nhận:</span>
                <span class="value font-mono font-bold">
                  {{ formatFinanceMoney(contractorDetail.payments.recordedTotal, overview.project.currencyCode) }}
                </span>
              </div>
            </div>

            <!-- Reconciliation alert banner -->
            <div class="reconciliation-alert-box" data-testid="subcontract-reconciliation-banner">
              <UIcon name="i-lucide-alert-triangle" aria-hidden="true" />
              <span>Chưa đối soát đầy đủ: Dữ liệu thanh toán từ sổ chi ứng khoán, chưa đối soát với hợp đồng và chứng từ kế toán.</span>
            </div>
          </div>

          <!-- Filter Toolbar for Payments -->
          <div class="filter-toolbar cockpit-card">
            <div class="filter-inputs">
              <input
                v-model="paymentSearch"
                type="search"
                class="cockpit-input search-input"
                placeholder="Tìm nội dung, tham chiếu..."
                @input="onPaymentFilterChange"
              >
              <select
                v-model="paymentRetention"
                class="cockpit-select"
                aria-label="Lọc theo bảo hành"
                @change="onPaymentFilterChange"
              >
                <option value="all">
                  Tất cả khoản
                </option>
                <option value="warranty">
                  Có bảo hành
                </option>
                <option value="no_recorded_retention">
                  Không có bảo hành
                </option>
              </select>
            </div>
          </div>

          <!-- Payments Table -->
          <div v-if="contractorDetailStatus === 'loading'" class="state-panel cockpit-card" aria-live="polite">
            <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
            <p>Đang tải danh sách đợt thanh toán…</p>
          </div>

          <div v-else-if="contractorDetailStatus === 'empty'" class="state-panel cockpit-card">
            <UIcon name="i-lucide-inbox" aria-hidden="true" />
            <p>Chưa có chứng từ thanh toán nào phù hợp với điều kiện tìm kiếm.</p>
          </div>

          <div v-else-if="contractorDetail" class="table-container cockpit-card" tabindex="0" aria-label="Bảng các đợt chi ứng nhà thầu">
            <table class="payment-table" data-testid="payments-table">
              <thead>
                <tr>
                  <th scope="col" class="col-date">
                    Ngày
                  </th>
                  <th scope="col" class="col-desc">
                    Nội dung thanh toán
                  </th>
                  <th scope="col" class="col-paid text-right">
                    Số tiền chi/ứng
                  </th>
                  <th scope="col" class="col-retention text-right">
                    Giữ lại bảo hành
                  </th>
                  <th scope="col" class="col-ref">
                    Tham chiếu / Ghi chú
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in contractorDetail.payments.rows"
                  :key="p.id"
                  class="payment-row"
                  :data-testid="`payment-row-${p.id}`"
                >
                  <td class="col-date font-mono">
                    <div class="date-cell">
                      <span>{{ formatDateProvenance(p.effectiveDate, p.dateSource).dateText }}</span>
                      <span
                        v-if="formatDateProvenance(p.effectiveDate, p.dateSource).badgeLabel"
                        class="cockpit-badge cockpit-badge--neutral date-badge text-xs"
                      >
                        {{ formatDateProvenance(p.effectiveDate, p.dateSource).badgeLabel }}
                      </span>
                    </div>
                  </td>
                  <td class="col-desc font-medium">
                    {{ p.description }}
                  </td>
                  <td class="col-paid text-right font-mono font-bold">
                    {{ formatFinanceMoney(p.paidAmount, overview.project.currencyCode) }}
                  </td>
                  <td class="col-retention text-right font-mono">
                    <template v-if="p.warrantyRetentionAmount">
                      <div class="retention-sub">
                        <span>{{ formatFinanceMoney(p.warrantyRetentionAmount, overview.project.currencyCode) }}</span>
                        <span v-if="p.retentionRateBps != null" class="rate-hint text-xs">({{ (p.retentionRateBps / 100) }}%)</span>
                      </div>
                    </template>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td class="col-ref">
                    <span v-if="p.reference" class="font-mono text-xs">{{ p.reference }}</span>
                    <span v-else-if="p.note" class="text-xs text-muted">{{ p.note }}</span>
                    <span v-else class="text-muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- MODE 2: Ordinary Category Details -->
      <section v-else class="ordinary-category-section">
        <!-- Filter Toolbar -->
        <div class="filter-toolbar cockpit-card">
          <div class="filter-inputs">
            <input
              v-model="ordinarySearch"
              type="search"
              class="cockpit-input search-input"
              placeholder="Tìm theo nội dung, tham chiếu..."
              @input="onOrdinaryFilterChange"
            >
            <select
              v-model="ordinaryRetention"
              class="cockpit-select"
              aria-label="Lọc theo khoản giữ lại"
              @change="onOrdinaryFilterChange"
            >
              <option value="all">
                Tất cả khoản
              </option>
              <option value="warranty">
                Giữ lại bảo hành
              </option>
              <option value="other">
                Khoản giữ lại khác
              </option>
              <option value="no_recorded_retention">
                Không có giữ lại
              </option>
            </select>
          </div>
        </div>

        <div v-if="ordinaryStatus === 'loading'" class="state-panel cockpit-card" aria-live="polite">
          <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
          <p>Đang tải chi tiết hạng mục…</p>
        </div>

        <div v-else-if="ordinaryStatus === 'error'" class="state-panel cockpit-card state-panel--error" role="alert">
          <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
          <h2>Không thể tải chi tiết hạng mục</h2>
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary"
            :data-testid="`retry-details-${currentCategory.itemId}`"
            @click="loadOrdinaryDetails"
          >
            <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
            <span>Thử lại</span>
          </button>
        </div>

        <div v-else-if="ordinaryStatus === 'empty'" class="state-panel cockpit-card">
          <UIcon name="i-lucide-inbox" aria-hidden="true" />
          <p>Chưa có chi tiết cho hạng mục này.</p>
        </div>

        <template v-else-if="ordinaryDetails?.kind === 'ordinary'">
          <!-- Retention Summary Banner if present -->
          <div
            v-if="getRetentionSummary(ordinaryDetails.details.rows)"
            class="retention-summary-banner"
            data-testid="retention-summary-banner"
          >
            <div class="retention-summary-content">
              <UIcon name="i-lucide-shield-check" class="retention-summary-icon" aria-hidden="true" />
              <span class="retention-summary-label">{{ getRetentionSummary(ordinaryDetails.details.rows)!.label }}:</span>
              <span class="retention-summary-amount font-mono font-bold">
                {{ formatFinanceMoney(getRetentionSummary(ordinaryDetails.details.rows)!.amount, overview.project.currencyCode, overview.project.moneyScale) }}
              </span>
            </div>
          </div>

          <!-- Desktop Nested Table -->
          <div class="table-container cockpit-card" tabindex="0" aria-label="Bảng chi tiết các dòng chi phí">
            <table class="nested-table" data-testid="ordinary-detail-table">
              <thead>
                <tr>
                  <th scope="col" class="nested-col-desc">
                    Nội dung
                  </th>
                  <th scope="col" class="nested-col-qty text-right">
                    Số lượng
                  </th>
                  <th scope="col" class="nested-col-unit">
                    ĐVT
                  </th>
                  <th scope="col" class="nested-col-price text-right">
                    Đơn giá
                  </th>
                  <th scope="col" class="nested-col-amount text-right">
                    Thành tiền
                  </th>
                  <th scope="col" class="nested-col-date">
                    Ngày
                  </th>
                  <th scope="col" class="nested-col-ref">
                    Tham chiếu / Ghi chú
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="d in ordinaryDetails.details.rows"
                  :key="d.id"
                  class="nested-item-row"
                  :data-testid="`detail-row-${d.id}`"
                >
                  <td class="nested-col-desc">
                    <div class="desc-wrapper">
                      <span
                        v-if="d.detailKind === 'opening_balance'"
                        class="cockpit-badge cockpit-badge--neutral opening-badge"
                      >
                        Số liệu ban đầu
                      </span>
                      <span class="detail-description">{{ d.description }}</span>
                    </div>
                  </td>
                  <td class="nested-col-qty text-right font-mono">
                    <span v-if="d.quantity">{{ formatFinanceMoney(d.quantity) }}</span>
                    <span v-else class="empty-cell">—</span>
                  </td>
                  <td class="nested-col-unit">
                    <span v-if="d.unitCode">{{ d.unitCode }}</span>
                    <span v-else class="empty-cell">—</span>
                  </td>
                  <td class="nested-col-price text-right font-mono">
                    <span v-if="d.unitPrice">{{ formatFinanceMoney(d.unitPrice) }}</span>
                    <span v-else class="empty-cell">—</span>
                  </td>
                  <td class="nested-col-amount text-right font-mono">
                    <div class="amount-primary font-bold">
                      {{ formatFinanceMoney(d.amount, overview.project.currencyCode, overview.project.moneyScale) }}
                    </div>
                    <div v-if="d.retentionAmount" class="retention-subline" data-testid="detail-retention-subline">
                      <span class="retention-label">{{ formatRetentionLabel(d.retentionKind, d.retentionRateBps) }}: </span>
                      <span class="retention-amount">{{ formatFinanceMoney(d.retentionAmount, overview.project.currencyCode, overview.project.moneyScale) }}</span>
                    </div>
                  </td>
                  <td class="nested-col-date font-mono">
                    <div class="date-provenance-cell">
                      <span>{{ formatDateProvenance(d.effectiveDate, d.dateSource).dateText }}</span>
                      <span
                        v-if="formatDateProvenance(d.effectiveDate, d.dateSource).badgeLabel"
                        class="cockpit-badge cockpit-badge--neutral date-badge text-xs"
                      >
                        {{ formatDateProvenance(d.effectiveDate, d.dateSource).badgeLabel }}
                      </span>
                    </div>
                  </td>
                  <td class="nested-col-ref">
                    <div class="ref-notes-cell">
                      <span v-if="d.reference" class="reference-code font-mono">{{ d.reference }}</span>
                      <span v-if="d.note" class="note-preview text-xs text-muted">{{ d.note }}</span>
                      <span v-if="!d.reference && !d.note" class="empty-cell">—</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.category-detail-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1400px;
  margin: 0 auto;
}

.breadcrumb-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.825rem;
  color: var(--color-text-secondary);
}

.breadcrumb-link {
  color: var(--color-primary);
  text-decoration: none;
}

.breadcrumb-link:hover {
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
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.back-link:hover {
  background: var(--color-bg-secondary);
}

.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  gap: 12px;
}

.category-main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.category-header {
  padding: 24px;
}

.category-header-layout {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}

.category-title-bar {
  flex: 1;
  min-width: 280px;
}

.category-badge-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.category-heading {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--color-text-primary);
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}

.category-desc {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.category-metrics-cards {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.cat-metric-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 18px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.cat-metric-label {
  font-size: 0.72rem;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
}

.cat-metric-value {
  font-size: 1.2rem;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.filter-toolbar {
  padding: 14px 18px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

.filter-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  min-width: 240px;
  flex: 1;
}

.table-container {
  overflow-x: auto;
}

.subcontract-table,
.payment-table,
.nested-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.subcontract-table {
  width: 100%;
  min-width: 1060px;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.col-party {
  width: 18%;
}

.col-content {
  width: 21%;
}

.col-contract {
  width: 17%;
}

.col-paid {
  width: 17%;
}

.col-retention {
  width: 13%;
}

.col-action {
  width: 14%;
}

.subcontract-table th,
.payment-table th,
.nested-table th {
  padding: 12px 14px;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
  box-sizing: border-box;
}

.subcontract-table td,
.payment-table td,
.nested-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
  box-sizing: border-box;
}

/* Root alignment enforcement for subcontract table */
.subcontract-table th.th-party,
.subcontract-table td.td-party,
.subcontract-table th.th-content,
.subcontract-table td.td-content,
.subcontract-table th.th-contract,
.subcontract-table td.td-contract {
  text-align: left;
}

.subcontract-table th.th-paid,
.subcontract-table td.td-paid,
.subcontract-table th.th-retention,
.subcontract-table td.td-retention {
  text-align: right;
}

.subcontract-table th.th-action,
.subcontract-table td.td-action {
  text-align: center;
}

.subcontract-table th.text-left,
.subcontract-table td.text-left {
  text-align: left;
}

.subcontract-table th.text-right,
.subcontract-table td.text-right {
  text-align: right;
}

.subcontract-table th.text-center,
.subcontract-table td.text-center {
  text-align: center;
}

.content-cell {
  text-align: left;
  line-height: 1.4;
  word-break: break-word;
}

.content-text {
  color: var(--color-text-primary);
}

.paid-cell {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  text-align: right;
  white-space: nowrap;
}

.retention-cell {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  text-align: right;
  white-space: nowrap;
}

.action-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.td-paid,
.td-retention {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.party-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  word-break: break-word;
}

.party-name {
  line-height: 1.35;
}

.party-code {
  color: var(--color-text-secondary);
}

.contract-brief {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 0.825rem;
  text-align: left;
}

.contractor-dossier-name {
  color: var(--color-text-primary);
  margin-top: 4px;
}

/* Responsive desktop table vs mobile cards */
.subcontractor-desktop-table {
  display: block;
}

.subcontractor-mobile-cards {
  display: none;
}

.subcontract-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.875rem;
}

.card-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-field-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.card-field-value {
  color: var(--color-text-primary);
  line-height: 1.4;
  word-break: break-word;
}

.card-amounts-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-top: 6px;
  border-top: 1px dashed var(--color-border);
}

.card-amount-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.retention-summary-banner {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.25);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 14px;
}

.retention-summary-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #166534;
}

.reconciliation-alert-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  color: #b45309;
  font-size: 0.85rem;
  margin-top: 12px;
}

.contractor-summary-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

.contractor-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.contractor-name {
  font-size: 1.3rem;
  font-weight: 750;
  margin: 0;
}

.back-to-contractors-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 0;
}

.back-to-contractors-btn:hover {
  text-decoration: underline;
}

.text-muted {
  color: var(--color-text-secondary);
  opacity: 0.6;
}

.text-xs {
  font-size: 0.75rem;
}

.empty-cell {
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.btn-sm {
  padding: 6px 10px;
  font-size: 0.8rem;
}

@media (max-width: 768px) {
  .subcontractor-desktop-table {
    display: none;
  }
  .subcontractor-mobile-cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .category-header-layout {
    flex-direction: column;
  }
}
</style>
