<script setup lang="ts">
import { ClientError } from '../../errors/client-error'
definePageMeta({ requiredPermission: 'cost.read' })

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const summaries = ref<Awaited<ReturnType<typeof repositories.projectCosts.summaries>>>([])
const status = ref<'loading' | 'ready' | 'module' | 'permission' | 'empty' | 'error'>('loading')
let request = 0

function formatMoney(value: string | null | undefined): string {
  if (!value) return '0'
  const parts = value.split('.')
  const integerPart = parts[0] ?? '0'
  const decimalPart = parts[1]
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (decimalPart && Number(decimalPart) > 0) {
    const trimmedDecimal = decimalPart.replace(/0+$/, '')
    return `${formattedInteger}.${trimmedDecimal}`
  }
  return formattedInteger
}

async function load() {
  const current = ++request
  status.value = 'loading'
  try {
    const value = await repositories.projectCosts.summaries()
    if (current !== request) return
    summaries.value = value
    status.value = value.length ? 'ready' : 'empty'
  }
  catch (error) {
    if (current !== request) return
    status.value = error instanceof ClientError && error.reason === 'MODULE_DISABLED' ? 'module'
      : error instanceof ClientError && error.code === 'PERMISSION_DENIED' ? 'permission' : 'error'
  }
}

watch(() => companyAccess.activeCompanyId, load, { immediate: true })
</script>

<template>
  <section class="project-costs-page" data-testid="project-costs-overview">
    <header class="page-heading cockpit-card">
      <div class="heading-copy">
        <p class="eyebrow">Quản trị chi phí · Director View</p>
        <h1>Chi phí dự án</h1>
        <p class="subtitle">Theo dõi giá trị công việc theo từng dự án.</p>
      </div>
      <div class="heading-badge">
        <span class="cockpit-badge cockpit-badge--primary">
          <UIcon name="i-lucide-receipt" aria-hidden="true" />
          {{ summaries.length }} dự án
        </span>
      </div>
    </header>

    <div v-if="status === 'loading'" class="state-panel cockpit-card" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
      <p>Đang tải dữ liệu chi phí dự án…</p>
    </div>

    <div v-else-if="status === 'module'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-toggle-left" aria-hidden="true" />
      <h2>Chưa bật tính năng</h2>
      <p>Module chi phí dự án chưa được bật cho công ty này.</p>
    </div>

    <div v-else-if="status === 'permission'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-lock-keyhole" aria-hidden="true" />
      <h2>Không có quyền truy cập</h2>
      <p>Bạn cần quyền đọc chi phí dự án để xem dữ liệu này.</p>
    </div>

    <div v-else-if="status === 'empty'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-inbox" aria-hidden="true" />
      <h2>Chưa có chi phí dự án</h2>
      <p>Dữ liệu chi phí dự án sẽ xuất hiện tại đây khi có ghi nhận công việc cho công ty.</p>
    </div>

    <div v-else-if="status === 'error'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      <h2>Không thể tải dữ liệu</h2>
      <p>Đã xảy ra lỗi khi lấy danh sách chi phí dự án.</p>
      <button type="button" class="cockpit-btn cockpit-btn--primary" @click="load">Thử lại</button>
    </div>

    <div v-else-if="status === 'ready'" class="project-grid" aria-label="Danh sách dự án theo dõi chi phí">
      <NuxtLink
        v-for="entry in summaries"
        :key="entry.projectId"
        :to="`/costs/${entry.projectId}`"
        class="cockpit-card cockpit-card--interactive project-card"
        :data-testid="`project-cost-card-${entry.projectId}`"
        :aria-label="`Chi tiết chi phí dự án ${entry.projectName} mã ${entry.projectCode}`"
      >
        <header class="project-header">
          <div class="project-identity">
            <span class="project-code">{{ entry.projectCode }}</span>
            <h2 class="project-name">{{ entry.projectName }}</h2>
          </div>
          <UIcon name="i-lucide-chevron-right" class="card-arrow" aria-hidden="true" />
        </header>

        <div class="tracked-total-box">
          <span class="total-label">Tổng đang theo dõi</span>
          <span class="total-value" data-testid="total-tracked-value">
            {{ formatMoney(entry.summary.totalTrackedWorkValue) }}
            <span class="currency">VND</span>
          </span>
        </div>

        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-top">
              <span class="cockpit-badge cockpit-badge--success">Đã nghiệm thu</span>
              <span class="metric-count" data-testid="accepted-count">({{ entry.summary.acceptedCount }})</span>
            </div>
            <span class="metric-value" data-testid="accepted-value">{{ formatMoney(entry.summary.acceptedValue) }}</span>
          </div>

          <div class="metric-item">
            <div class="metric-top">
              <span class="cockpit-badge cockpit-badge--warning">Đang thực hiện</span>
              <span class="metric-count" data-testid="in-progress-count">({{ entry.summary.inProgressCount }})</span>
            </div>
            <span class="metric-value" data-testid="in-progress-value">{{ formatMoney(entry.summary.inProgressValue) }}</span>
          </div>
        </div>

        <footer class="project-footer">
          <div class="unknown-metric">
            <span class="cockpit-badge cockpit-badge--neutral">Chưa xác định</span>
            <span class="unknown-numbers">
              <span class="unknown-value" data-testid="unknown-value">{{ formatMoney(entry.summary.unknownStatusValue) }}</span>
              <span class="unknown-count" data-testid="unknown-count">({{ entry.summary.unknownCount }} mục)</span>
            </span>
          </div>
        </footer>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.project-costs-page {
  max-width: 1260px;
  margin: 0 auto;
  padding-bottom: 32px;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: clamp(20px, 3.5vw, 32px);
  margin-bottom: 24px;
}

.heading-copy h1 {
  margin: 6px 0 8px;
  color: var(--color-text-primary);
  font-size: clamp(1.8rem, 3.5vw, 2.5rem);
  font-weight: 750;
  letter-spacing: -0.02em;
}

.heading-copy .subtitle {
  color: var(--color-text-secondary);
  font-size: 0.95rem;
  line-height: 1.5;
}

.heading-badge {
  padding-top: 4px;
}

.state-panel {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 32px;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.state-panel h2 {
  font-size: 1.15rem;
  font-weight: 700;
}

.state-panel p {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.state-panel :deep(svg) {
  width: 32px;
  height: 32px;
  color: var(--color-primary);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.project-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px;
  text-decoration: none;
  min-height: 240px;
}

.project-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.project-identity {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-code {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.project-name {
  color: var(--color-text-primary);
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.35;
}

.card-arrow {
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
  flex-shrink: 0;
  margin-top: 4px;
  transition: transform 150ms ease, color 150ms ease;
}

.project-card:hover .card-arrow {
  color: var(--color-primary);
  transform: translateX(3px);
}

.tracked-total-box {
  margin: 18px 0;
  padding: 14px 16px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.total-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.total-value {
  font-family: var(--font-mono);
  font-size: 1.45rem;
  font-weight: 750;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.currency {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-left: 4px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border-light);
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.metric-count {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.project-footer {
  margin-top: 14px;
}

.unknown-metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.unknown-numbers {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.unknown-value {
  font-family: var(--font-mono);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.unknown-count {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}

@media (max-width: 768px) {
  .project-grid {
    grid-template-columns: 1fr;
  }

  .page-heading {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 600px) {
  .page-heading {
    padding: 16px;
  }

  .project-card {
    padding: 16px;
  }

  .metrics-grid {
    gap: 10px;
  }

  .unknown-metric {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
  .project-card:hover .card-arrow {
    transform: none;
  }
}
</style>
