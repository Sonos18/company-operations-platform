<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  FinanceItemDetails,
  ItemDetailQuery,
} from '../../../shared/schemas/costs/project-finance'
import {
  computePageRetentionBreakdown,
  formatDateProvenance,
  formatFinanceMoney,
} from '../../utils/costs/finance-display'

interface Props {
  details: FinanceItemDetails | null
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  currencyCode?: string
  moneyScale?: number
  itemId?: string | null
  initialPage?: number
  initialPageSize?: 25 | 50 | 100
}

const props = withDefaults(defineProps<Props>(), {
  currencyCode: 'VND',
  moneyScale: 0,
  itemId: null,
  initialPage: 1,
  initialPageSize: 25,
})

const emit = defineEmits<{
  (e: 'change-query', query: Partial<ItemDetailQuery>): void
  (e: 'retry'): void
}>()

// Filter states
const page = ref(props.initialPage)
const pageSize = ref<25 | 50 | 100>(props.initialPageSize)
const search = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const retention = ref<'all' | 'warranty' | 'other' | 'no_recorded_retention'>('all')

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

  const query: Partial<ItemDetailQuery> = {
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
  const maxPages = pagination.value?.totalPages ?? 1
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
  () => props.details?.kind === 'ordinary' ? props.details.details.pagination.page : undefined,
  (serverPage) => {
    if (serverPage != null && serverPage !== page.value) {
      page.value = serverPage
    }
  },
)

const ordinaryData = computed(() => {
  if (props.details?.kind === 'ordinary') {
    return props.details.details
  }
  return null
})

const pagination = computed(() => ordinaryData.value?.pagination ?? null)

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

// Retention breakdown strictly separated (R04)
const pageRetention = computed(() => {
  if (!ordinaryData.value?.rows) return null
  return computePageRetentionBreakdown(ordinaryData.value.rows, props.currencyCode, props.moneyScale)
})
</script>

<template>
  <div class="ordinary-ledger-area" data-testid="ordinary-ledger-area">
    <!-- Filter Toolbar -->
    <div class="filter-toolbar cockpit-card">
      <div class="filter-inputs">
        <div class="search-box">
          <input
            id="ordinary-search-input"
            v-model="search"
            type="search"
            class="cockpit-input search-input"
            placeholder="Tìm theo nội dung, tham chiếu..."
            data-testid="ordinary-search-input"
            aria-label="Tìm theo nội dung, tham chiếu"
            @input="onSearchInput"
          >
        </div>

        <div class="date-range-box">
          <label class="filter-label" for="ordinary-date-from">Từ:</label>
          <input
            id="ordinary-date-from"
            v-model="dateFrom"
            type="date"
            class="cockpit-input date-input"
            data-testid="ordinary-date-from"
            aria-label="Từ ngày"
            @change="onFilterChange"
          >
          <label class="filter-label" for="ordinary-date-to">Đến:</label>
          <input
            id="ordinary-date-to"
            v-model="dateTo"
            type="date"
            class="cockpit-input date-input"
            data-testid="ordinary-date-to"
            aria-label="Đến ngày"
            @change="onFilterChange"
          >
        </div>

        <select
          v-model="retention"
          class="cockpit-select"
          aria-label="Lọc theo khoản giữ lại"
          data-testid="ordinary-retention-select"
          @change="onFilterChange"
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

        <button
          v-if="isFiltered"
          type="button"
          class="cockpit-btn cockpit-btn--ghost btn-sm"
          data-testid="clear-ordinary-filters-btn"
          @click="resetFilters"
        >
          <span>Xóa lọc</span>
        </button>
      </div>

      <div v-if="dateValidationError" class="validation-error-text" role="alert" data-testid="ordinary-date-error">
        {{ dateValidationError }}
      </div>

      <!-- Scope & Totals Display (R01) -->
      <div v-if="pagination && status === 'ready'" class="totals-status-bar" data-testid="ordinary-totals-bar">
        <div class="full-total-info">
          <span>Toàn bộ: <strong>{{ pagination.fullCount }} khoản</strong> ({{ formatFinanceMoney(pagination.fullAmount, currencyCode, moneyScale) ?? '0 VND' }})</span>
        </div>
        <div v-if="isFiltered" class="filtered-total-info" data-testid="ordinary-filtered-totals">
          <span class="cockpit-badge cockpit-badge--primary">
            Kết quả lọc: <strong>{{ pagination.filteredCount }} khoản</strong> ({{ formatFinanceMoney(pagination.filteredAmount, currencyCode, moneyScale) ?? '0 VND' }})
          </span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="status === 'loading'" class="state-panel cockpit-card" aria-live="polite" data-testid="ordinary-ledger-loading">
      <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
      <p>Đang tải chi tiết hạng mục…</p>
    </div>

    <!-- Error State with Retry (R03) -->
    <div v-else-if="status === 'error'" class="state-panel cockpit-card state-panel--error" role="alert" data-testid="ordinary-ledger-error">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      <h2>Không thể tải chi tiết hạng mục</h2>
      <button
        type="button"
        class="cockpit-btn cockpit-btn--secondary"
        :data-testid="`retry-details-${itemId}`"
        @click="emit('retry')"
      >
        <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
        <span>Thử lại</span>
      </button>
    </div>

    <!-- Empty State -->
    <div v-else-if="status === 'empty'" class="state-panel cockpit-card" data-testid="ordinary-ledger-empty">
      <UIcon name="i-lucide-inbox" aria-hidden="true" />
      <p>Chưa có chi tiết cho hạng mục này.</p>
      <button
        v-if="isFiltered"
        type="button"
        class="cockpit-btn cockpit-btn--secondary btn-sm"
        data-testid="ordinary-empty-clear-filters-btn"
        @click="resetFilters"
      >
        Xóa bộ lọc
      </button>
    </div>

    <!-- Ready State: Retention Page-level Summary + Table + Pagination -->
    <template v-else-if="ordinaryData && status === 'ready'">
      <!-- Separate Page-Only Retention Breakdown (R04) -->
      <div
        v-if="pageRetention?.warranty || pageRetention?.other"
        class="retention-summary-banner"
        data-testid="retention-summary-banner"
      >
        <div class="retention-summary-content">
          <UIcon name="i-lucide-shield-check" class="retention-icon" aria-hidden="true" />
          <div class="retention-items-list">
            <span v-if="pageRetention.warranty" class="retention-item" data-testid="page-warranty-retention">
              <span class="retention-label">{{ pageRetention.warranty.label }}:</span>
              <strong class="font-mono">{{ pageRetention.warranty.amount }}</strong>
              <span class="text-xs text-muted">({{ pageRetention.warranty.count }} khoản)</span>
            </span>
            <span v-if="pageRetention.other" class="retention-item" data-testid="page-other-retention">
              <span class="retention-label">{{ pageRetention.other.label }}:</span>
              <strong class="font-mono">{{ pageRetention.other.amount }}</strong>
              <span class="text-xs text-muted">({{ pageRetention.other.count }} khoản)</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <div class="table-container cockpit-card" tabindex="0" aria-label="Bảng chi tiết hạng mục">
        <table class="detail-table" data-testid="ordinary-detail-table">
          <thead>
            <tr>
              <th scope="col" class="col-date">
                Ngày
              </th>
              <th scope="col" class="col-desc">
                Nội dung chi phí
              </th>
              <th scope="col" class="col-amount text-right">
                Số tiền
              </th>
              <th scope="col" class="col-retention text-right">
                Khoản giữ lại
              </th>
              <th scope="col" class="col-ref">
                Tham chiếu
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in ordinaryData.rows"
              :key="row.id"
              class="detail-row"
              :data-testid="`detail-row-${row.id}`"
            >
              <td class="col-date font-mono">
                <div class="date-cell">
                  <span>{{ formatDateProvenance(row.effectiveDate, row.dateSource).dateText }}</span>
                  <span
                    v-if="formatDateProvenance(row.effectiveDate, row.dateSource).badgeLabel"
                    class="cockpit-badge cockpit-badge--neutral date-badge text-xs"
                  >
                    {{ formatDateProvenance(row.effectiveDate, row.dateSource).badgeLabel }}
                  </span>
                </div>
              </td>
              <td class="col-desc font-medium">
                <div class="desc-cell">
                  <span
                    v-if="row.detailKind === 'opening_balance'"
                    class="cockpit-badge cockpit-badge--neutral opening-badge"
                  >
                    Số liệu ban đầu
                  </span>
                  <span>{{ row.description }}</span>
                </div>
              </td>
              <td class="col-amount text-right font-mono font-bold">
                {{ formatFinanceMoney(row.amount, currencyCode, moneyScale) }}
              </td>
              <td class="col-retention text-right font-mono">
                <template v-if="row.retentionAmount">
                  <div class="retention-sub">
                    <span>{{ formatFinanceMoney(row.retentionAmount, currencyCode, moneyScale) }}</span>
                    <span class="text-xs text-muted">
                      ({{ row.retentionKind === 'warranty' ? 'Bảo hành' : 'Khác' }}{{ row.retentionRateBps != null ? ` ${(row.retentionRateBps / 100)}%` : '' }})
                    </span>
                  </div>
                </template>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="col-ref">
                <span v-if="row.reference" class="font-mono text-xs">{{ row.reference }}</span>
                <span v-else-if="row.note" class="text-xs text-muted">{{ row.note }}</span>
                <span v-else class="text-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls (R01) -->
      <div v-if="pagination && pagination.totalPages > 0" class="pagination-bar cockpit-card" data-testid="ordinary-pagination-bar">
        <div class="page-size-selector">
          <label for="ordinary-page-size" class="text-xs text-secondary">Hiển thị:</label>
          <select
            id="ordinary-page-size"
            v-model="pageSize"
            class="cockpit-select page-size-select"
            data-testid="ordinary-page-size-select"
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
          <span class="page-indicator" data-testid="ordinary-page-indicator">
            Trang {{ pagination.page }} / {{ Math.max(1, pagination.totalPages) }}
          </span>

          <div class="nav-buttons">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="pagination.page <= 1"
              data-testid="ordinary-prev-page-btn"
              @click="goToPage(pagination.page - 1)"
            >
              <UIcon name="i-lucide-chevron-left" aria-hidden="true" />
              <span>Trước</span>
            </button>

            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="pagination.page >= pagination.totalPages"
              data-testid="ordinary-next-page-btn"
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
.ordinary-ledger-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.retention-summary-banner {
  background: var(--color-surface-subtle, #f8fafc);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  padding: 12px 16px;
}

.retention-summary-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.retention-icon {
  font-size: 1.25rem;
  color: var(--color-primary);
  flex-shrink: 0;
}

.retention-items-list {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 0.875rem;
}

.retention-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.retention-label {
  color: var(--color-text-secondary);
}

.table-container {
  overflow-x: auto;
  border-radius: var(--radius-lg, 12px);
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.detail-table th {
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

.detail-table td {
  padding: 14px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.detail-row:hover {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.015));
}

.col-date { width: 140px; }
.col-amount { width: 160px; }
.col-retention { width: 180px; }
.col-ref { width: 180px; }

.date-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.desc-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.opening-badge {
  flex-shrink: 0;
  font-size: 0.75rem;
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
