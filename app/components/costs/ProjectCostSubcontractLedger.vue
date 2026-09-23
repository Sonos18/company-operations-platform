<script setup lang="ts">
import { computed } from 'vue'
import type {
  FinanceSubcontractDetail,
  FinanceSubcontractorDetail,
} from '../../../shared/schemas/costs/project-finance'
import {
  formatDateProvenance,
  formatFinanceMoney,
} from '../../utils/costs/finance-display'
import type { LedgerUiStatus } from '../../composables/costs/useLedgerQueryController'

interface Props {
  detail: FinanceSubcontractorDetail | FinanceSubcontractDetail | null
  status: LedgerUiStatus
  currencyCode?: string
  moneyScale?: number

  // Controlled query props (RR01)
  search?: string
  dateFrom?: string
  dateTo?: string
  retention?: 'all' | 'warranty' | 'no_recorded_retention'
  page?: number
  pageSize?: 25 | 50 | 100
  isPendingDispatch?: boolean
  dateValidationError?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  currencyCode: 'VND',
  moneyScale: 0,
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
  'back': []
  'retry': []
  'search-input': [value: string]
  'update:dateFrom': [value: string]
  'update:dateTo': [value: string]
  'update:retention': [value: 'all' | 'warranty' | 'no_recorded_retention']
  'update:pageSize': [value: 25 | 50 | 100]
  'change-page': [newPage: number]
  'clear-filters': []
  'payment-mutated': []
}>()

import SubcontractPaymentRecordModal from './SubcontractPaymentRecordModal.vue'
import SubcontractPaymentVoidModal from './SubcontractPaymentVoidModal.vue'

const companyAccess = useNuxtApp().$companyAccessStore
const canRecordCash = computed(() => companyAccess.hasPermission('cost.record_cash'))

const isRecordModalOpen = ref(false)
const isVoidModalOpen = ref(false)
const selectedPaymentToVoid = ref<{ id: string; version: number; description: string; paidAmount: string; currencyCode?: string } | null>(null)
const replacesPaymentId = ref<string | null>(null)

const activeContract = computed(() => {
  if (!props.detail) return null
  if ('contract' in props.detail) return props.detail.contract
  return props.detail.contracts?.[0] ?? null
})

const projectId = computed(() => props.detail?.project.projectId ?? '')

function openRecordPaymentModal() {
  replacesPaymentId.value = null
  isRecordModalOpen.value = true
}

function openVoidModal(payment: { id: string; version: number; description: string; paidAmount: string }) {
  selectedPaymentToVoid.value = { ...payment, currencyCode: props.currencyCode }
  isVoidModalOpen.value = true
}

function openReplacementModal(paymentId: string) {
  replacesPaymentId.value = paymentId
  isRecordModalOpen.value = true
}

function onPaymentMutated() {
  emit('payment-mutated')
}

const pagination = computed(() => props.detail?.payments.pagination ?? null)

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
  emit('update:retention', target.value as 'all' | 'warranty' | 'no_recorded_retention')
}

function onPageSizeChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('update:pageSize', Number(target.value) as 25 | 50 | 100)
}
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
    <div v-if="detail && status !== 'error' && status !== 'permission' && status !== 'not_found' && status !== 'module'" class="contractor-summary-card cockpit-card">
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
        <div class="flex items-center gap-2">
          <div class="contractor-total-badge">
            <span class="label">Tổng chi/ứng đã ghi nhận:</span>
            <span class="value font-mono font-bold" data-testid="ledger-full-total">
              {{ formatFinanceMoney(pagination?.fullAmount ?? detail.payments.recordedTotal, currencyCode, moneyScale) }}
            </span>
          </div>

          <UButton
            v-if="canRecordCash && activeContract"
            size="sm"
            color="primary"
            icon="i-lucide-plus"
            data-testid="open-record-payment-btn"
            @click="openRecordPaymentModal"
          >
            Ghi nhận thanh toán
          </UButton>
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
            :value="search"
            type="search"
            class="cockpit-input search-input"
            placeholder="Tìm nội dung, tham chiếu..."
            data-testid="payment-search-input"
            aria-label="Tìm nội dung, tham chiếu"
            @input="onSearchInput"
          >
          <span v-if="isPendingDispatch" class="search-pending-indicator" aria-live="polite">
            Đang tìm kiếm…
          </span>
        </div>

        <div class="date-range-box">
          <label class="filter-label" for="payment-date-from">Từ:</label>
          <input
            id="payment-date-from"
            :value="dateFrom"
            type="date"
            class="cockpit-input date-input"
            data-testid="payment-date-from"
            aria-label="Từ ngày"
            @input="onDateFromChange"
            @change="onDateFromChange"
          >
          <label class="filter-label" for="payment-date-to">Đến:</label>
          <input
            id="payment-date-to"
            :value="dateTo"
            type="date"
            class="cockpit-input date-input"
            data-testid="payment-date-to"
            aria-label="Đến ngày"
            @input="onDateToChange"
            @change="onDateToChange"
          >
        </div>

        <select
          :value="retention"
          class="cockpit-select"
          aria-label="Lọc theo bảo hành"
          data-testid="payment-retention-select"
          @change="onRetentionChange"
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
          @click="emit('clear-filters')"
        >
          <span>Xóa lọc</span>
        </button>
      </div>

      <div v-if="dateValidationError" class="validation-error-text" role="alert" data-testid="payment-date-error">
        {{ dateValidationError }}
      </div>

      <!-- Scope & Totals Display (RR01) -->
      <div v-if="pagination && (status === 'ready' || status === 'empty')" class="totals-status-bar" data-testid="payment-totals-bar">
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

    <!-- Module Disabled State (RR04) -->
    <div v-else-if="status === 'module'" class="state-panel cockpit-card" data-testid="payment-ledger-module-disabled">
      <UIcon name="i-lucide-toggle-left" aria-hidden="true" />
      <h2>Tính năng chưa kích hoạt</h2>
      <p>Mô-đun quản lý chi phí chưa được kích hoạt cho công ty này.</p>
    </div>

    <!-- Permission Denied State (RR04) -->
    <div v-else-if="status === 'permission'" class="state-panel cockpit-card" data-testid="payment-ledger-permission-denied">
      <UIcon name="i-lucide-shield-alert" aria-hidden="true" />
      <h2>Không có quyền truy cập</h2>
      <p>Bạn không có quyền xem đợt thanh toán của nhà thầu này.</p>
    </div>

    <!-- Not Found State (RR04) -->
    <div v-else-if="status === 'not_found'" class="state-panel cockpit-card" data-testid="payment-ledger-not-found">
      <UIcon name="i-lucide-file-question" aria-hidden="true" />
      <h2>Không tìm thấy nhà thầu hoặc hợp đồng</h2>
      <p>Dữ liệu thanh toán của nhà thầu không tồn tại hoặc đã bị xóa.</p>
    </div>

    <!-- Validation Error State (RR04) -->
    <div v-else-if="status === 'validation_error'" class="state-panel cockpit-card state-panel--warning" data-testid="payment-ledger-validation-error">
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
        @click="emit('clear-filters')"
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
                Tham chiếu & Ghi chú
              </th>
              <th scope="col" class="col-actions text-center">
                Trạng thái & Thao tác
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
                <template v-if="p.warrantyRetentionAmount != null && p.warrantyRetentionAmount !== ''">
                  <div class="retention-sub">
                    <span>{{ formatFinanceMoney(p.warrantyRetentionAmount, currencyCode, moneyScale) }}</span>
                    <span v-if="p.retentionRateBps != null && Number(p.warrantyRetentionAmount) > 0" class="rate-hint text-xs">({{ (p.retentionRateBps / 100) }}%)</span>
                  </div>
                </template>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="col-ref">
                <div class="ref-note-cell">
                  <span v-if="p.reference" class="font-mono text-xs ref-badge">{{ p.reference }}</span>
                  <p v-if="p.note" class="row-note text-xs text-muted">{{ p.note }}</p>
                  <span v-if="!p.reference && !p.note" class="text-muted">—</span>
                </div>
              </td>
              <td class="col-actions text-center">
                <div class="flex items-center justify-center gap-1.5 flex-wrap">
                  <span
                    class="cockpit-badge text-[11px]"
                    :class="p.recordStatus === 'voided' ? 'cockpit-badge--error' : 'cockpit-badge--success'"
                    :data-testid="`payment-status-${p.id}`"
                  >
                    {{ p.recordStatus === 'voided' ? 'Đã hủy' : 'Đã ghi nhận' }}
                  </span>

                  <UButton
                    v-if="p.recordStatus === 'recorded' && canRecordCash"
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-ban"
                    :data-testid="`void-payment-btn-${p.id}`"
                    @click="openVoidModal(p)"
                  >
                    Hủy
                  </UButton>

                  <UButton
                    v-if="p.recordStatus === 'voided' && canRecordCash"
                    size="xs"
                    color="primary"
                    variant="outline"
                    icon="i-lucide-replace"
                    :data-testid="`replace-payment-btn-${p.id}`"
                    @click="openReplacementModal(p.id)"
                  >
                    Thay thế
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls (RR01) -->
      <div v-if="pagination && pagination.totalPages > 0" class="pagination-bar cockpit-card" data-testid="payment-pagination-bar">
        <div class="page-size-selector">
          <label for="payment-page-size" class="text-xs text-secondary">Hiển thị:</label>
          <select
            id="payment-page-size"
            :value="pageSize"
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
              :disabled="page <= 1"
              data-testid="payment-prev-page-btn"
              @click="emit('change-page', page - 1)"
            >
              <UIcon name="i-lucide-chevron-left" aria-hidden="true" />
              <span>Trước</span>
            </button>

            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="page >= pagination.totalPages"
              data-testid="payment-next-page-btn"
              @click="emit('change-page', page + 1)"
            >
              <span>Sau</span>
              <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Subcontract Payment Modals -->
    <SubcontractPaymentRecordModal
      v-if="activeContract"
      v-model:open="isRecordModalOpen"
      :project-id="projectId"
      :subcontract-id="activeContract.id"
      :expected-subcontract-version="activeContract.version"
      :currency-code="currencyCode"
      :replaces-payment-id="replacesPaymentId"
      @recorded="onPaymentMutated"
    />

    <SubcontractPaymentVoidModal
      v-if="activeContract && selectedPaymentToVoid"
      v-model:open="isVoidModalOpen"
      :project-id="projectId"
      :subcontract-id="activeContract.id"
      :payment="selectedPaymentToVoid"
      @voided="onPaymentMutated"
      @start-replacement="openReplacementModal"
    />
  </div>
</template>

<style scoped>
.contractor-ledger-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.ledger-header-nav {
  margin-bottom: 4px;
}

.back-to-contractors-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.back-to-contractors-btn:hover {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.04));
}

.contractor-summary-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  margin: 0 0 4px 0;
  color: var(--color-text-primary);
}

.contractor-dossier-name {
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.contractor-total-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.contractor-total-badge .label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.contractor-total-badge .value {
  font-size: 1.25rem;
  color: var(--color-text-primary);
}

.reconciliation-alert-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-warning-subtle, rgba(245, 158, 11, 0.08));
  border: 1px solid var(--color-warning-border, rgba(245, 158, 11, 0.25));
  color: var(--color-warning-text, #92400e);
  font-size: 0.825rem;
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

.table-container {
  overflow-x: auto;
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  box-sizing: border-box;
}

.payment-table {
  width: 100%;
  min-width: 760px;
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
.col-retention { width: 160px; }
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
  opacity: 0.7;
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
