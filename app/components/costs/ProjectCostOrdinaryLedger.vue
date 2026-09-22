<script setup lang="ts">
import { computed } from 'vue'
import type {
  FinanceItemDetails,
} from '../../../shared/schemas/costs/project-finance'
import {
  computePageRetentionBreakdown,
  formatDateProvenance,
  formatFinanceMoney,
} from '../../utils/costs/finance-display'
import type { LedgerUiStatus } from '../../composables/costs/useLedgerQueryController'

interface Props {
  details: FinanceItemDetails | null
  status: LedgerUiStatus
  currencyCode?: string
  moneyScale?: number
  itemId?: string | null

  // Controlled query props (RR01)
  search?: string
  dateFrom?: string
  dateTo?: string
  retention?: 'all' | 'warranty' | 'other' | 'no_recorded_retention'
  page?: number
  pageSize?: 25 | 50 | 100
  isPendingDispatch?: boolean
  dateValidationError?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  currencyCode: 'VND',
  moneyScale: 0,
  itemId: null,
  search: '',
  dateFrom: '',
  dateTo: '',
  retention: 'all',
  page: 1,
  pageSize: 25,
  isPendingDispatch: false,
  dateValidationError: null,
})

const emit = defineEmits<{
  'search-input': [value: string]
  'update:dateFrom': [value: string]
  'update:dateTo': [value: string]
  'update:retention': [value: 'all' | 'warranty' | 'other' | 'no_recorded_retention']
  'update:pageSize': [value: 25 | 50 | 100]
  'change-page': [newPage: number]
  'clear-filters': []
  'retry': []
}>()

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
    Boolean(props.search.trim())
    || Boolean(props.dateFrom)
    || Boolean(props.dateTo)
    || props.retention !== 'all'
    || pagination.value.filteredCount !== pagination.value.fullCount
  )
})

// Retention breakdown strictly separated (R04)
const pageRetention = computed(() => {
  if (!ordinaryData.value?.rows) return null
  return computePageRetentionBreakdown(ordinaryData.value.rows, props.currencyCode, props.moneyScale)
})

function onSearchInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('search-input', target.value)
}

function onDateFromChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:dateFrom', target.value)
}

function onDateToChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:dateTo', target.value)
}

function onRetentionChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('update:retention', target.value as 'all' | 'warranty' | 'other' | 'no_recorded_retention')
}

function onPageSizeChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('update:pageSize', Number(target.value) as 25 | 50 | 100)
}
</script>

<template>
  <div class="ordinary-ledger-area" data-testid="ordinary-ledger-area">
    <!-- Filter Toolbar -->
    <div class="filter-toolbar cockpit-card">
      <div class="filter-inputs">
        <div class="search-box">
          <input
            id="ordinary-search-input"
            :value="search"
            type="search"
            class="cockpit-input search-input"
            placeholder="Tìm theo nội dung, tham chiếu..."
            data-testid="ordinary-search-input"
            aria-label="Tìm theo nội dung, tham chiếu"
            @input="onSearchInput"
          >
          <span v-if="isPendingDispatch" class="search-pending-indicator" aria-live="polite">
            Đang tìm kiếm…
          </span>
        </div>

        <div class="date-range-box">
          <label class="filter-label" for="ordinary-date-from">Từ:</label>
          <input
            id="ordinary-date-from"
            :value="dateFrom"
            type="date"
            class="cockpit-input date-input"
            data-testid="ordinary-date-from"
            aria-label="Từ ngày"
            @input="onDateFromChange"
            @change="onDateFromChange"
          >
          <label class="filter-label" for="ordinary-date-to">Đến:</label>
          <input
            id="ordinary-date-to"
            :value="dateTo"
            type="date"
            class="cockpit-input date-input"
            data-testid="ordinary-date-to"
            aria-label="Đến ngày"
            @input="onDateToChange"
            @change="onDateToChange"
          >
        </div>

        <select
          :value="retention"
          class="cockpit-select"
          aria-label="Lọc theo khoản giữ lại"
          data-testid="ordinary-retention-select"
          @change="onRetentionChange"
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
          @click="emit('clear-filters')"
        >
          <span>Xóa lọc</span>
        </button>
      </div>

      <div v-if="dateValidationError" class="validation-error-text" role="alert" data-testid="ordinary-date-error">
        {{ dateValidationError }}
      </div>

      <!-- Scope & Totals Display (RR01) -->
      <div v-if="pagination && (status === 'ready' || status === 'empty')" class="totals-status-bar" data-testid="ordinary-totals-bar">
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

    <!-- Module Disabled State (RR04) -->
    <div v-else-if="status === 'module'" class="state-panel cockpit-card" data-testid="ordinary-ledger-module-disabled">
      <UIcon name="i-lucide-toggle-left" aria-hidden="true" />
      <h2>Tính năng chưa kích hoạt</h2>
      <p>Mô-đun quản lý chi phí chưa được kích hoạt cho công ty này.</p>
    </div>

    <!-- Permission Denied State (RR04) -->
    <div v-else-if="status === 'permission'" class="state-panel cockpit-card" data-testid="ordinary-ledger-permission-denied">
      <UIcon name="i-lucide-shield-alert" aria-hidden="true" />
      <h2>Không có quyền truy cập</h2>
      <p>Bạn không có quyền xem chi tiết chi phí này.</p>
    </div>

    <!-- Not Found State (RR04) -->
    <div v-else-if="status === 'not_found'" class="state-panel cockpit-card" data-testid="ordinary-ledger-not-found">
      <UIcon name="i-lucide-file-question" aria-hidden="true" />
      <h2>Không tìm thấy hạng mục</h2>
      <p>Hạng mục chi phí này không tồn tại hoặc đã bị xóa.</p>
    </div>

    <!-- Validation Error State (RR04) -->
    <div v-else-if="status === 'validation_error'" class="state-panel cockpit-card state-panel--warning" data-testid="ordinary-ledger-validation-error">
      <UIcon name="i-lucide-alert-triangle" aria-hidden="true" />
      <h2>Điều kiện lọc không hợp lệ</h2>
      <p>{{ dateValidationError ?? 'Vui lòng kiểm tra lại điều kiện lọc trước khi tải dữ liệu.' }}</p>
      <button
        type="button"
        class="cockpit-btn cockpit-btn--secondary btn-sm"
        @click="emit('clear-filters')"
      >
        Đặt lại bộ lọc
      </button>
    </div>

    <!-- Error State with Retry (RR04) -->
    <div v-else-if="status === 'error'" class="state-panel cockpit-card state-panel--error" role="alert" data-testid="ordinary-ledger-error">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      <h2>Không thể tải chi tiết hạng mục</h2>
      <p>Đã xảy ra lỗi khi lấy chi tiết hạng mục từ máy chủ.</p>
      <button
        type="button"
        class="cockpit-btn cockpit-btn--secondary"
        :data-testid="itemId ? `retry-details-${itemId}` : 'retry-details'"
        @click="emit('retry')"
      >
        <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
        <span>Thử lại</span>
      </button>
    </div>

    <!-- Empty State -->
    <div v-else-if="status === 'empty'" class="state-panel cockpit-card" data-testid="ordinary-ledger-empty">
      <UIcon name="i-lucide-inbox" aria-hidden="true" />
      <p>Chưa có chi tiết cho hạng mục này phù hợp với điều kiện tìm kiếm.</p>
      <button
        v-if="isFiltered"
        type="button"
        class="cockpit-btn cockpit-btn--secondary btn-sm"
        data-testid="ordinary-empty-clear-filters-btn"
        @click="emit('clear-filters')"
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

      <!-- Items Table: Desktop & Tablet with all restored fields (RR03) -->
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
              <th scope="col" class="col-qty text-right">
                Khối lượng / Đơn giá
              </th>
              <th scope="col" class="col-amount text-right">
                Số tiền
              </th>
              <th scope="col" class="col-retention text-right">
                Khoản giữ lại
              </th>
              <th scope="col" class="col-ref">
                Tham chiếu & Ghi chú
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
              <!-- Date & Date provenance badge -->
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

              <!-- Description & Opening Balance badge -->
              <td class="col-desc font-medium">
                <div class="desc-cell">
                  <span
                    v-if="row.detailKind === 'opening_balance'"
                    class="cockpit-badge cockpit-badge--neutral opening-badge"
                  >
                    Số liệu ban đầu
                  </span>
                  <span class="desc-text">{{ row.description }}</span>
                </div>
              </td>

              <!-- Quantity, UnitCode, UnitPrice (RR03 restored) -->
              <td class="col-qty text-right">
                <div v-if="row.quantity != null || row.unitPrice != null" class="qty-unit-cell font-mono text-xs">
                  <span v-if="row.quantity != null" class="qty-val"><span data-testid="row-qty">{{ row.quantity }}</span><span v-if="row.unitCode" data-testid="row-unit"> {{ row.unitCode }}</span></span>
                  <span v-if="row.quantity != null && row.unitPrice != null" class="qty-separator">×</span>
                  <span v-if="row.unitPrice != null" class="unit-price-val" data-testid="row-unit-price">{{ formatFinanceMoney(row.unitPrice, currencyCode, moneyScale) }}</span>
                </div>
                <span v-else class="text-muted">—</span>
              </td>

              <!-- Amount -->
              <td class="col-amount text-right font-mono font-bold">
                {{ formatFinanceMoney(row.amount, currencyCode, moneyScale) }}
              </td>

              <!-- Retention -->
              <td class="col-retention text-right font-mono">
                <template v-if="row.retentionAmount != null && row.retentionAmount !== ''">
                  <div class="retention-sub">
                    <span>{{ formatFinanceMoney(row.retentionAmount, currencyCode, moneyScale) }}</span>
                    <span v-if="Number(row.retentionAmount) > 0" class="text-xs text-muted">
                      ({{ row.retentionKind === 'warranty' ? 'Bảo hành' : 'Khác' }}{{ row.retentionRateBps != null ? ` ${(row.retentionRateBps / 100)}%` : '' }})
                    </span>
                  </div>
                </template>
                <span v-else class="text-muted">—</span>
              </td>

              <!-- Reference AND full Note when both exist (RR03 restored) -->
              <td class="col-ref">
                <div class="ref-note-cell">
                  <span v-if="row.reference" class="font-mono text-xs ref-badge" data-testid="row-reference">{{ row.reference }}</span>
                  <p v-if="row.note" class="row-note text-xs text-muted" data-testid="row-note">{{ row.note }}</p>
                  <span v-if="!row.reference && !row.note" class="text-muted">—</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls (RR01) -->
      <div v-if="pagination && pagination.totalPages > 0" class="pagination-bar cockpit-card" data-testid="ordinary-pagination-bar">
        <div class="page-size-selector">
          <label for="ordinary-page-size" class="text-xs text-secondary">Hiển thị:</label>
          <select
            id="ordinary-page-size"
            :value="pageSize"
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
              :disabled="page <= 1"
              data-testid="ordinary-prev-page-btn"
              @click="emit('change-page', page - 1)"
            >
              <UIcon name="i-lucide-chevron-left" aria-hidden="true" />
              <span>Trước</span>
            </button>

            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="page >= pagination.totalPages"
              data-testid="ordinary-next-page-btn"
              @click="emit('change-page', page + 1)"
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
  width: 100%;
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
  position: relative;
}

.search-input {
  width: 100%;
}

.search-pending-indicator {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  color: var(--color-primary);
  font-weight: 500;
  pointer-events: none;
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
  width: 100%;
  box-sizing: border-box;
}

.detail-table {
  width: 100%;
  min-width: 760px;
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

.col-date { width: 130px; }
.col-qty { width: 160px; }
.col-amount { width: 150px; }
.col-retention { width: 160px; }
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

.qty-unit-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.qty-separator {
  margin: 0 2px;
  opacity: 0.6;
}

.ref-note-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ref-badge {
  background: var(--color-surface-subtle, #f1f5f9);
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
  font-size: 0.75rem;
}

.row-note {
  margin: 0;
  line-height: 1.35;
  word-break: break-word;
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
  gap: 8px;
}

.state-panel h2 {
  font-size: 1rem;
  font-weight: 700;
  margin: 4px 0;
  color: var(--color-text-primary);
}

.state-panel--warning {
  border-color: var(--color-warning, #f59e0b);
  background: var(--color-warning-subtle, rgba(245, 158, 11, 0.04));
}

.state-panel--warning h2 {
  color: var(--color-warning, #f59e0b);
}

.state-panel--error {
  border-color: var(--color-danger, #ef4444);
  background: var(--color-danger-subtle, rgba(239, 68, 68, 0.04));
}

.state-panel--error h2 {
  color: var(--color-danger, #ef4444);
}
</style>
