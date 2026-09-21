<script setup lang="ts">
import { computed } from 'vue'
import type { FinanceSubcontractorList } from '../../../shared/schemas/costs/project-finance'
import { formatFinanceMoney } from '../../utils/costs/finance-display'

export interface SubcontractorTableRow {
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

interface Props {
  parties: FinanceSubcontractorList['parties']
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  currencyCode?: string
  moneyScale?: number
}

const props = withDefaults(defineProps<Props>(), {
  currencyCode: 'VND',
  moneyScale: 0,
})

const emit = defineEmits<{
  (e: 'view-payments', row: SubcontractorTableRow): void
  (e: 'retry'): void
}>()

const subcontractorRows = computed<SubcontractorTableRow[]>(() => {
  if (!props.parties) return []
  const rows: SubcontractorTableRow[] = []
  for (const item of props.parties) {
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
  if (!props.parties) return 0
  return new Set(props.parties.map(p => p.party.partyId)).size
})
</script>

<template>
  <div class="subcontractors-list-area">
    <div class="section-title-bar">
      <h2>Danh sách nhà thầu phụ</h2>
      <span v-if="status === 'ready'" class="item-count" data-testid="distinct-contractor-count">
        {{ distinctContractorCount }} nhà thầu
      </span>
    </div>

    <!-- Loading State -->
    <div v-if="status === 'loading'" class="state-panel cockpit-card" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
      <p>Đang tải danh sách nhà thầu…</p>
    </div>

    <!-- Error State with Retry (R03) -->
    <div v-else-if="status === 'error'" class="state-panel cockpit-card state-panel--error" role="alert" data-testid="subcontractor-list-error">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      <h2>Không thể tải danh sách nhà thầu</h2>
      <p>Đã xảy ra lỗi khi lấy danh sách nhà thầu phụ.</p>
      <button
        type="button"
        class="cockpit-btn cockpit-btn--secondary"
        data-testid="retry-subcontractors-btn"
        @click="emit('retry')"
      >
        <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
        <span>Thử lại</span>
      </button>
    </div>

    <!-- Empty State -->
    <div v-else-if="status === 'empty'" class="state-panel cockpit-card" data-testid="subcontractor-list-empty">
      <UIcon name="i-lucide-inbox" aria-hidden="true" />
      <p>Chưa có nhà thầu hoặc đợt chi ứng nào được ghi nhận cho dự án này.</p>
    </div>

    <!-- Ready State: Desktop Table + Mobile Cards -->
    <template v-else-if="status === 'ready'">
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
                    ({{ formatFinanceMoney(row.contractValue, currencyCode, moneyScale) }})
                  </span>
                  <span v-else class="contract-val text-muted"> (—)</span>
                </div>
              </td>
              <td class="td-paid text-right font-mono font-bold">
                <div class="paid-cell">
                  <span v-if="row.paidTotal != null">{{ formatFinanceMoney(row.paidTotal, currencyCode, moneyScale) }}</span>
                  <span v-else class="text-muted">—</span>
                </div>
              </td>
              <td class="td-retention text-right font-mono">
                <div class="retention-cell">
                  <span v-if="row.recordedRetentionTotal != null">{{ formatFinanceMoney(row.recordedRetentionTotal, currencyCode, moneyScale) }}</span>
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
                    @click="emit('view-payments', row)"
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
              @click="emit('view-payments', row)"
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
                  ({{ formatFinanceMoney(row.contractValue, currencyCode, moneyScale) }})
                </span>
                <span v-else class="contract-val text-muted"> (—)</span>
              </span>
            </div>

            <div class="card-amounts-row">
              <div class="card-amount-item">
                <span class="card-field-label">Chi/ứng:</span>
                <span class="card-field-value font-mono font-bold">
                  <template v-if="row.paidTotal != null">
                    {{ formatFinanceMoney(row.paidTotal, currencyCode, moneyScale) }}
                  </template>
                  <span v-else class="text-muted">—</span>
                </span>
              </div>

              <div class="card-amount-item">
                <span class="card-field-label">Bảo hành:</span>
                <span class="card-field-value font-mono">
                  <template v-if="row.recordedRetentionTotal != null">
                    {{ formatFinanceMoney(row.recordedRetentionTotal, currencyCode, moneyScale) }}
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
</template>

<style scoped>
.subcontractors-list-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title-bar h2 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.item-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-surface-subtle, #f1f5f9);
  padding: 4px 10px;
  border-radius: var(--radius-full, 9999px);
}

.subcontractor-desktop-table {
  overflow-x: auto;
  border-radius: var(--radius-lg, 12px);
}

.subcontract-table {
  width: 100%;
  min-width: 1060px;
  border-collapse: collapse;
  font-size: 0.875rem;
  table-layout: fixed;
}

.col-party { width: 18%; }
.col-content { width: 21%; }
.col-contract { width: 17%; }
.col-paid { width: 17%; }
.col-retention { width: 13%; }
.col-action { width: 14%; }

.subcontract-table th {
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

.subcontract-table td {
  padding: 14px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.party-row:hover {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.015));
}

.party-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.party-name {
  color: var(--color-text-primary);
  word-break: break-word;
}

.content-cell {
  line-height: 1.4;
  word-break: break-word;
}

.content-text {
  color: var(--color-text-primary);
}

.contract-brief {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
  word-break: break-word;
}

.paid-cell {
  display: flex;
  justify-content: flex-end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.retention-cell {
  display: flex;
  justify-content: flex-end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.action-cell {
  display: flex;
  justify-content: center;
}

.subcontractor-mobile-cards {
  display: none;
  flex-direction: column;
  gap: 12px;
}

.subcontract-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.85rem;
}

.card-field {
  display: flex;
  gap: 8px;
  line-height: 1.4;
}

.card-field-label {
  color: var(--color-text-secondary);
  font-weight: 500;
  min-width: 68px;
  flex-shrink: 0;
}

.card-field-value {
  color: var(--color-text-primary);
  word-break: break-word;
}

.card-amounts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border);
}

.card-amount-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-amount-item .card-field-label {
  font-size: 0.75rem;
}

.text-muted {
  color: var(--color-text-secondary);
  opacity: 0.6;
}

.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 20px;
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

@media (max-width: 768px) {
  .subcontractor-desktop-table {
    display: none;
  }
  .subcontractor-mobile-cards {
    display: flex;
  }
}
</style>
