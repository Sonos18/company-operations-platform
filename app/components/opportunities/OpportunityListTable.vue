<script setup lang="ts">
import type { OpportunitySummary } from '../../features/opportunities/opportunity.types'

defineProps<{
  opportunities: OpportunitySummary[]
}>()

const validityLabels: Record<OpportunitySummary['validityState'], string> = {
  valid: 'Đang hiệu lực',
  invalid: 'Không còn hiệu lực',
}
</script>

<template>
  <div class="opportunity-list" data-testid="opportunity-list">
    <div class="opportunity-list__table">
      <table>
        <caption class="sr-only">Danh sách cơ hội</caption>
        <thead><tr><th scope="col">Khách hàng</th><th scope="col">Nhu cầu</th><th scope="col">Trạng thái</th><th scope="col">Cập nhật</th></tr></thead>
        <tbody>
          <tr v-for="opportunity in opportunities" :key="opportunity.id">
            <td><strong>{{ opportunity.primaryCustomerName ?? 'Chưa xác định khách hàng' }}</strong></td>
            <td>{{ opportunity.needDescription ?? 'Chưa ghi nhận nhu cầu' }}</td>
            <td><span class="opportunity-state" :class="`opportunity-state--${opportunity.validityState}`">{{ validityLabels[opportunity.validityState] }}</span></td>
            <td>{{ new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(opportunity.updatedAt)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="opportunity-list__cards">
      <article v-for="opportunity in opportunities" :key="opportunity.id" class="opportunity-card">
        <div><p class="eyebrow">{{ validityLabels[opportunity.validityState] }}</p><h2>{{ opportunity.primaryCustomerName ?? 'Chưa xác định khách hàng' }}</h2></div>
        <p>{{ opportunity.needDescription ?? 'Chưa ghi nhận nhu cầu' }}</p>
        <small>Cập nhật {{ new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(opportunity.updatedAt)) }}</small>
      </article>
    </div>
  </div>
</template>

<style scoped>
.opportunity-list__table { overflow-x: auto; border: 1px solid var(--line); background: var(--paper-raised); }.opportunity-list table { width: 100%; min-width: 680px; border-collapse: collapse; }.opportunity-list th,.opportunity-list td { padding: 14px 16px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }.opportunity-list th { color: var(--ink-muted); font-size: .66rem; letter-spacing: .04em; text-transform: uppercase; }.opportunity-list td { color: var(--ink-muted); font-size: .82rem; }.opportunity-list td strong { color: var(--forest-deep); }.opportunity-list tbody tr:last-child td { border-bottom: 0; }.opportunity-state { display: inline-flex; padding: 4px 7px; border-radius: 999px; font-size: .68rem; font-weight: 750; }.opportunity-state--valid { background: color-mix(in srgb, var(--mint) 50%, white); color: var(--forest-deep); }.opportunity-state--invalid { background: color-mix(in srgb, var(--coral) 45%, white); color: #8b3927; }.opportunity-list__cards { display: none; }
@media (max-width: 767px) { .opportunity-list__table { display: none; }.opportunity-list__cards { display: grid; gap: 12px; }.opportunity-card { display: grid; gap: 8px; padding: 15px; border: 1px solid var(--line); background: var(--paper-raised); }.opportunity-card h2 { margin: 3px 0 0; color: var(--forest-deep); font-size: 1rem; }.opportunity-card p:not(.eyebrow),.opportunity-card small { color: var(--ink-muted); font-size: .78rem; }.opportunity-card small { padding-top: 9px; border-top: 1px solid var(--line); } }
</style>
