<template>
  <section class="cockpit-card table-card" role="region" aria-label="Các đợt thanh toán" data-testid="installment-table">
    <h3 class="table-title">Các đợt thanh toán <span class="table-currency">({{ currencyCode }})</span></h3>
    <div class="table-scroll">
      <table class="installments">
        <thead>
          <tr>
            <th scope="col">Đợt</th>
            <th scope="col" class="num">Số tiền</th>
            <th scope="col">Hạn</th>
            <th scope="col" class="num">Đã đề nghị</th>
            <th scope="col" class="num">Đã chi</th>
            <th scope="col" class="num">Còn lại</th>
            <th scope="col">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in sortedInstallments" :key="item.installmentKey" :data-testid="`installment-${item.seq}`">
            <th scope="row">
              <div class="name-cell">
                <span>{{ item.name }}</span>
                <span v-if="item.isAdvance" class="cockpit-badge cockpit-badge--accent">Tạm ứng</span>
              </div>
            </th>
            <td class="num">{{ money(item.amount) }}</td>
            <td>{{ formatDate(item.dueOn) }}</td>
            <td class="num">{{ money(item.pending) }}</td>
            <td class="num">{{ money(item.paid) }}</td>
            <td class="num">{{ money(item.remaining) }}</td>
            <td>
              <span class="cockpit-badge" :class="statusOf(item.dueStatus).badge">{{ statusOf(item.dueStatus).label }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MaterialInstallmentView } from '../../../../shared/schemas/costs/material-finance'
import { formatMaterialQuantity } from '../../../utils/materials/quantity-display'

interface Props {
  installments: MaterialInstallmentView[]
  currencyCode: string
}

const props = defineProps<Props>()

const sortedInstallments = computed(() => [...props.installments].sort((a, b) => a.seq - b.seq))

function money(value: string) {
  return formatMaterialQuantity(value)
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function statusOf(status: MaterialInstallmentView['dueStatus']) {
  switch (status) {
    case 'overdue': return { label: 'Quá hạn', badge: 'cockpit-badge--danger' }
    case 'due_soon': return { label: 'Sắp đến hạn', badge: 'cockpit-badge--warning' }
    case 'settled': return { label: 'Đã chi đủ', badge: 'cockpit-badge--success' }
    default: return { label: 'Chưa đến hạn', badge: 'cockpit-badge--neutral' }
  }
}
</script>

<style scoped>
.table-card { padding: 20px; }
.table-title { margin: 0 0 12px; font-size: 1.05rem; font-weight: 700; color: #0f172a; }
.table-scroll { overflow-x: auto; }
.installments { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.installments th, .installments td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; white-space: nowrap; }
.installments thead th { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
.installments .num { text-align: right; font-family: var(--font-mono, ui-monospace, monospace); }
.name-cell { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #0f172a; }
.table-currency { font-size: 0.8rem; font-weight: 500; color: #64748b; }
</style>
