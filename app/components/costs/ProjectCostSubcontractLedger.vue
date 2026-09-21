<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  FinanceSubcontractDetail,
  FinanceSubcontractorDetail,
  PaymentQuery,
} from '../../../shared/schemas/costs/project-finance'
import {
  formatDateProvenance,
  formatFinanceMoney,
} from '../../utils/costs/finance-display'

interface Props {
  detail: FinanceSubcontractorDetail | FinanceSubcontractDetail | null
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  currencyCode?: string
  moneyScale?: number
  initialPage?: number
  initialPageSize?: 25 | 50 | 100
}

const props = withDefaults(defineProps<Props>(), {
  currencyCode: 'VND',
  moneyScale: 0,
  initialPage: 1,
  initialPageSize: 25,
})

const emit = defineEmits<{
  (e: 'back' | 'retry'): void
  (e: 'change-query', query: Partial<PaymentQuery>): void
}>()

// Filter states
const page = ref(props.initialPage)
const pageSize = ref<25 | 50 | 100>(props.initialPageSize)
const search = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const retention = ref<'all' | 'warranty' | 'no_recorded_retention'>('all')

// Local validation for date range (R01)
const dateValidationError = computed<string | null>(() => {
  if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
    return 'Ngày kết thúc không được trước ngày bắt đầu'
  }
  return null
})

// Debounce timer for search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

function emitQuery(resetPage = false) {
  if (dateValidationError.value) {
    // Inverted date range: do not submit invalid request (R01)
    return
  }

  if (resetPage) {
    page.value = 1
  }

  const query: Partial<PaymentQuery> = {
    page: page.value,
    pageSize: pageSize.value,
    sort: 'newest',
    retention: retention.value,
  }

  if (search.value.trim()) query.q = search.value.trim()
  if (dateFrom.value) query.dateFrom = dateFrom.value
  if (dateTo.value) query.dateTo = dateTo.value

  emit('change-query', query)
}

function onSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    emitQuery(true)
  }, 300)
}

function onFilterChange() {
  emitQuery(true)
}

function onPageSizeChange() {
  emitQuery(true)
}

function goToPage(newPage: number) {
  const maxPages = props.detail?.payments.pagination.totalPages ?? 1
  const clamped = Math.max(1, Math.min(newPage, maxPages))
  if (clamped !== page.value) {
    page.value = clamped
    emitQuery(false)
  }
}

function resetFilters() {
  search.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  retention.value = 'all'
  page.value = 1
  emitQuery(true)
}

// Sync page if updated by parent response envelope
watch(
  () => props.detail?.payments.pagination.page,
  (serverPage) => {
    if (serverPage != null && serverPage !== page.value) {
      page.value = serverPage
    }
  },
)

const pagination = computed(() => props.detail?.payments.pagination ?? null)
const isFiltered = computed(() => {
  if (!pagination.value) return false
  return (
    Boolean(search.value.trim())
    || Boolean(dateFrom.value)
    || Boolean(dateTo.value)
    || retention.value !== 'all'
    || pagination.value.filteredCount !== pagination.value.fullCount
  )
})
</script>

<template>
  <div class="contractor-ledger-area" data-testid="contractor-ledger-area">
    <div class="ledger-header-nav">
      <button
        type="button"
        class="back-to-contractors-btn"
        data-testid="back-to-contractors-btn"
        @click="emit('back')"
      >
        <UIcon name="i-lucide-arrow-left" aria-hidden="true" />
        <span>Quay lại danh sách nhà thầu</span>
      </button>
    </div>

    <!-- Contractor Summary Banner (only when detail is available and not in error) -->
    <div v-if="detail && status !== 'error'" class="contractor-summary-card cockpit-card">
      <div class="contractor-title-row">
        <div>
          <h2 class="contractor-name" data-testid="contractor-name-header">
            {{ detail.party.displayName }}
          </h2>
          <span class="font-mono text-sm text-secondary">{{ detail.party.code }}</span>
          <div
            v-if="'contract' in detail && detail.contract.contractName"
            class="contractor-dossier-name text-sm font-medium"
            data-testid="contractor-dossier-name"
          >
            {{ detail.contract.contractName }}
          </div>
        </div>
        <div class="contractor-total-badge">
          <span class="label">Tổng chi/ứng đã ghi nhận:</span>
          <span class="value font-mono font-bold" data-testid="ledger-full-total">
            {{ formatFinanceMoney(pagination?.fullAmount ?? detail.payments.recordedTotal, currencyCode, moneyScale) }}
          </span>
        </div>
      </div>

      <!-- Reconciliation alert banner -->
      <div class="reconciliation-alert-box" data-testid="subcontract-reconciliation-banner">
        <UIcon name="i-lucide-alert-triangle" aria-hidden="true" />
        <span>Chưa đối soát đầy đủ: Dữ liệu thanh toán từ sổ chi ứng khoán, chưa đối soát với hợp đồng và chứng từ kế toán.</span>
      </div>
    </div>

    <!-- Filter Toolbar -->
    <div class="filter-toolbar cockpit-card">
      <div class="filter-inputs">
        <div class="search-box">
          <input
            id="payment-search-input"
            v-model="search"
            type="search"
            class="cockpit-input search-input"
            placeholder="Tìm nội dung, tham chiếu..."
            data-testid="payment-search-input"
            aria-label="Tìm nội dung, tham chiếu"
            @input="onSearchInput"
          >
        </div>

        <div class="date-range-box">
          <label class="filter-label" for="payment-date-from">Từ:</label>
          <input
            id="payment-date-from"
            v-model="dateFrom"
            type="date"
            class="cockpit-input date-input"
            data-testid="payment-date-from"
            aria-label="Từ ngày"
            @change="onFilterChange"
          >
          <label class="filter-label" for="payment-date-to">Đến:</label>
          <input
            id="payment-date-to"
            v-model="dateTo"
            type="date"
            class="cockpit-input date-input"
            data-testid="payment-date-to"
            aria-label="Đến ngày"
            @change="onFilterChange"
          >
        </div>

        <select
          v-model="retention"
          class="cockpit-select"
          aria-label="Lọc theo bảo hành"
          data-testid="payment-retention-select"
          @change="onFilterChange"
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

        <button
          v-if="isFiltered"
          type="button"
          class="cockpit-btn cockpit-btn--ghost btn-sm"
          data-testid="clear-payment-filters-btn"
          @click="resetFilters"
        >
          <span>Xóa lọc</span>
        </button>
      </div>

      <div v-if="dateValidationError" class="validation-error-text" role="alert" data-testid="payment-date-error">
        {{ dateValidationError }}
      </div>

      <!-- Scope & Totals Display (R01) -->
      <div v-if="pagination && status === 'ready'" class="totals-status-bar" data-testid="payment-totals-bar">
        <div class="full-total-info">
          <span>Toàn bộ: <strong>{{ pagination.fullCount }} khoản</strong> ({{ formatFinanceMoney(pagination.fullAmount, currencyCode, moneyScale) ?? '0 VND' }})</span>
        </div>
        <div v-if="isFiltered" class="filtered-total-info" data-testid="payment-filtered-totals">
          <span class="cockpit-badge cockpit-badge--primary">
            Kết quả lọc: <strong>{{ pagination.filteredCount }} khoản</strong> ({{ formatFinanceMoney(pagination.filteredAmount, currencyCode, moneyScale) ?? '0 VND' }})
          </span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="status === 'loading'" class="state-panel cockpit-card" aria-live="polite" data-testid="payment-ledger-loading">
      <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
      <p>Đang tải danh sách đợt thanh toán…</p>
    </div>

    <!-- Error State with Retry (R03) -->
    <div v-else-if="status === 'error'" class="state-panel cockpit-card state-panel--error" role="alert" data-testid="payment-ledger-error">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      <h2>Không thể tải đợt thanh toán</h2>
      <p>Đã xảy ra lỗi khi lấy danh sách thanh toán cho nhà thầu này.</p>
      <button
        type="button"
        class="cockpit-btn cockpit-btn--secondary"
        data-testid="retry-payments-btn"
        @click="emit('retry')"
      >
        <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
        <span>Thử lại</span>
      </button>
    </div>

    <!-- Empty State -->
    <div v-else-if="status === 'empty'" class="state-panel cockpit-card" data-testid="payment-ledger-empty">
      <UIcon name="i-lucide-inbox" aria-hidden="true" />
      <p>Chưa có chứng từ thanh toán nào phù hợp với điều kiện tìm kiếm.</p>
      <button
        v-if="isFiltered"
        type="button"
        class="cockpit-btn cockpit-btn--secondary btn-sm"
        data-testid="empty-clear-filters-btn"
        @click="resetFilters"
      >
        Xóa bộ lọc
      </button>
    </div>

    <!-- Ready State: Payments Table + Pagination Controls -->
    <template v-else-if="detail && status === 'ready'">
      <div class="table-container cockpit-card" tabindex="0" aria-label="Bảng các đợt chi ứng nhà thầu">
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
              v-for="p in detail.payments.rows"
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
                {{ formatFinanceMoney(p.paidAmount, currencyCode, moneyScale) }}
              </td>
              <td class="col-retention text-right font-mono">
                <template v-if="p.warrantyRetentionAmount">
                  <div class="retention-sub">
                    <span>{{ formatFinanceMoney(p.warrantyRetentionAmount, currencyCode, moneyScale) }}</span>
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

      <!-- Pagination Controls (R01) -->
      <div v-if="pagination && pagination.totalPages > 0" class="pagination-bar cockpit-card" data-testid="payment-pagination-bar">
        <div class="page-size-selector">
          <label for="payment-page-size" class="text-xs text-secondary">Hiển thị:</label>
          <select
            id="payment-page-size"
            v-model="pageSize"
            class="cockpit-select page-size-select"
            data-testid="payment-page-size-select"
            @change="onPageSizeChange"
          >
            <option :value="25">
              25
            </option>
            <option :value="50">
              50
            </option>
            <option :value="100">
              100
            </option>
          </select>
          <span class="text-xs text-secondary">dòng/trang</span>
        </div>

        <div class="page-nav-controls">
          <span class="page-indicator" data-testid="payment-page-indicator">
            Trang {{ pagination.page }} / {{ Math.max(1, pagination.totalPages) }}
          </span>

          <div class="nav-buttons">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="pagination.page <= 1"
              data-testid="payment-prev-page-btn"
              @click="goToPage(pagination.page - 1)"
            >
              <UIcon name="i-lucide-chevron-left" aria-hidden="true" />
              <span>Trước</span>
            </button>

            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="pagination.page >= pagination.totalPages"
              data-testid="payment-next-page-btn"
              @click="goToPage(pagination.page + 1)"
            >
              <span>Sau</span>
              <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.contractor-ledger-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ledger-header-nav {
  display: flex;
  align-items: center;
}

.back-to-contractors-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--color-primary);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 0;
}

.back-to-contractors-btn:hover {
  text-decoration: underline;
}

.contractor-summary-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-radius: var(--radius-lg, 12px);
}

.contractor-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.contractor-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.contractor-dossier-name {
  color: var(--color-primary);
  margin-top: 4px;
}

.contractor-total-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background: var(--color-surface-subtle, #f8fafc);
  padding: 10px 16px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border);
}

.contractor-total-badge .label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.contractor-total-badge .value {
  font-size: 1.15rem;
  color: var(--color-text-primary);
}

.reconciliation-alert-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #b45309;
  font-size: 0.85rem;
  padding: 10px 14px;
  border-radius: var(--radius-md, 8px);
  line-height: 1.4;
}

.filter-toolbar {
  padding: 14px 18px;
  border-radius: var(--radius-md, 8px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 200px;
}

.search-input {
  width: 100%;
}

.date-range-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.date-input {
  width: 135px;
  font-size: 0.825rem;
  padding: 6px 8px;
}

.validation-error-text {
  color: var(--color-danger, #ef4444);
  font-size: 0.8rem;
  font-weight: 600;
}

.totals-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
  font-size: 0.85rem;
  flex-wrap: wrap;
}

.full-total-info {
  color: var(--color-text-secondary);
}

.full-total-info strong {
  color: var(--color-text-primary);
}

.table-container {
  overflow-x: auto;
  border-radius: var(--radius-lg, 12px);
}

.payment-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.payment-table th {
  padding: 12px 14px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-subtle, #f8fafc);
  white-space: nowrap;
}

.payment-table td {
  padding: 14px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.payment-row:hover {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.015));
}

.col-date { width: 140px; }
.col-paid { width: 160px; }
.col-retention { width: 170px; }
.col-ref { width: 180px; }

.date-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-badge {
  width: fit-content;
}

.retention-sub {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.rate-hint {
  color: var(--color-text-secondary);
  opacity: 0.75;
}

.text-muted {
  color: var(--color-text-secondary);
  opacity: 0.6;
}

.pagination-bar {
  padding: 12px 18px;
  border-radius: var(--radius-md, 8px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page-size-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-size-select {
  padding: 4px 8px;
  font-size: 0.85rem;
}

.page-nav-controls {
  display: flex;
  align-items: center;
  gap: 14px;
}

.page-indicator {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.nav-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-secondary);
}

.state-panel--error {
  border-color: var(--color-danger, #ef4444);
  background: var(--color-danger-subtle, rgba(239, 68, 68, 0.04));
}

.state-panel--error h2 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-danger, #ef4444);
  margin: 8px 0 4px 0;
}
</style>
