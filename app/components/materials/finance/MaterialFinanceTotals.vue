<template>
  <section class="cockpit-card totals-block" :aria-labelledby="headingId" data-testid="material-finance-totals">
    <div class="totals-header">
      <h3 :id="headingId" class="totals-title">Vật tư</h3>
      <span class="totals-hint">Số liệu hợp đồng và thanh toán vật tư, tách riêng khỏi chi phí dự án.</span>
    </div>
    <dl class="totals-grid">
      <div
        v-for="metric in metrics"
        :key="metric.key"
        class="metric"
        :class="{ 'metric--danger': metric.danger }"
        :data-testid="`material-total-${metric.key}`"
      >
        <dt class="metric-label">{{ metric.label }}</dt>
        <dd class="metric-value">
          <span class="metric-amount">{{ metric.value }}</span>
          <span v-if="currencyCode" class="metric-currency">{{ currencyCode }}</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MaterialFinanceTotals } from '../../../../shared/utils/material-finance-summary'
import { formatFinanceMoney, isDecimalGreaterThan } from '../../../utils/costs/finance-display'

const props = defineProps<{
  totals: MaterialFinanceTotals
  currencyCode?: string
}>()

const headingId = useId()

// Display formatting only: the server computes every figure, nothing is recalculated here.
const metrics = computed(() => [
  { key: 'committed', label: 'Cam kết', value: money(props.totals.committed), danger: false },
  { key: 'paid', label: 'Đã chi', value: money(props.totals.paid), danger: false },
  { key: 'pending', label: 'Đang chờ chi', value: money(props.totals.pending), danger: false },
  { key: 'remaining', label: 'Còn phải trả', value: money(props.totals.remaining), danger: false },
  { key: 'overdue', label: 'Quá hạn', value: money(props.totals.overdue), danger: isDecimalGreaterThan(props.totals.overdue, '0') },
  { key: 'invoiced', label: 'Đã nhận hóa đơn', value: money(props.totals.invoiced), danger: false },
  { key: 'paidWithoutInvoice', label: 'Đã chi chưa có hóa đơn', value: money(props.totals.paidWithoutInvoice), danger: false },
])

function money(value: string): string {
  return formatFinanceMoney(value) ?? '0'
}
</script>

<style scoped>
.totals-block {
  padding: 16px 20px;
}
.totals-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.totals-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--ink, #0f172a);
  margin: 0;
}
.totals-hint {
  font-size: 0.8rem;
  color: var(--ink-muted, #64748b);
}
.totals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
  margin: 0;
}
.metric {
  border: 1px solid var(--line, #e2e8f0);
  border-radius: 8px;
  padding: 10px 12px;
  background: #ffffff;
}
.metric--danger {
  border-color: #fecaca;
  background: #fef2f2;
}
.metric-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-muted, #64748b);
}
.metric-value {
  margin: 4px 0 0 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.metric-amount {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--ink, #0f172a);
  font-variant-numeric: tabular-nums;
}
.metric--danger .metric-amount {
  color: #b91c1c;
}
.metric-currency {
  font-size: 0.75rem;
  color: var(--ink-muted, #64748b);
}
</style>
