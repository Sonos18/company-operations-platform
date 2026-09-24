<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FinanceProjectList } from '../../../shared/schemas/costs/project-finance'
import {
  computeProjectKpiCards,
  formatOperationalState,
} from '../../utils/costs/finance-display'
import { mapCostsApiError } from '../../utils/costs/costs-error-mapper'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import ProjectCostInfoDisclosure from '../../components/costs/ProjectCostInfoDisclosure.vue'

definePageMeta({ requiredPermission: 'cost.read' })

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const projects = ref<FinanceProjectList['projects']>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)
const status = ref<'loading' | 'ready' | 'module' | 'permission' | 'empty' | 'error'>('loading')
const requestTracker = createAsyncRequestTracker()

// Single typed 4-KPI view model computed once per project card (Maintainability B)
const projectCards = computed(() => {
  return projects.value.map(entry => ({
    ...entry,
    kpis: computeProjectKpiCards(entry.summary, entry.project),
  }))
})

function onCardClick(projectId: string, event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.info-disclosure-anchor')) return
  navigateTo(`/costs/${projectId}`)
}

async function load() {
  const token = requestTracker.start({ companyId: companyAccess.activeCompanyId })
  status.value = 'loading'
  projects.value = []
  nextCursor.value = null

  try {
    const value = await repositories.projectFinance.listProjects()
    if (!token.isCurrent()) return
    projects.value = value.projects
    nextCursor.value = value.nextCursor
    status.value = value.projects.length ? 'ready' : 'empty'
  }
  catch (error) {
    if (!token.isCurrent()) return
    const mapped = mapCostsApiError(error, 'directory')
    status.value = mapped === 'module' ? 'module'
      : mapped === 'permission' ? 'permission' : 'error'
  }
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  const currentGen = requestTracker.generation
  loadingMore.value = true

  try {
    const value = await repositories.projectFinance.listProjects({ afterId: nextCursor.value })
    if (requestTracker.generation !== currentGen) return
    projects.value = [...projects.value, ...value.projects]
    nextCursor.value = value.nextCursor
  }
  catch {
    // Keep already loaded cards visible
  }
  finally {
    if (requestTracker.generation === currentGen) {
      loadingMore.value = false
    }
  }
}

watch(() => companyAccess.activeCompanyId, () => {
  requestTracker.invalidate()
  projects.value = []
  nextCursor.value = null
  loadingMore.value = false
  load()
}, { immediate: true, flush: 'sync' })

onUnmounted(() => {
  requestTracker.invalidate()
})
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
          {{ projects.length }} dự án
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

    <div v-else-if="status === 'ready'" class="project-directory-wrapper">
      <div class="project-grid" aria-label="Danh sách dự án theo dõi chi phí">
        <article
          v-for="entry in projectCards"
          :key="entry.project.projectId"
          class="cockpit-card cockpit-card--interactive project-card"
          :data-testid="`project-cost-card-${entry.project.projectId}`"
          :aria-label="`Chi tiết chi phí dự án ${entry.project.projectName} mã ${entry.project.projectCode}`"
          tabindex="0"
          role="region"
          @click="onCardClick(entry.project.projectId, $event)"
          @keydown.enter.self="navigateTo(`/costs/${entry.project.projectId}`)"
        >
          <header class="project-header">
            <div class="project-identity">
              <span class="project-code">{{ entry.project.projectCode }}</span>
              <NuxtLink
                :to="`/costs/${entry.project.projectId}`"
                class="project-name-link"
                @click.stop
              >
                <h2 class="project-name">{{ entry.project.projectName }}</h2>
              </NuxtLink>
            </div>
            <div class="project-header-right">
              <span
                class="cockpit-badge project-status-badge"
                :class="formatOperationalState(entry.project.operationalState).badgeVariant"
                data-testid="project-operational-state"
              >
                {{ formatOperationalState(entry.project.operationalState).label }}
              </span>
              <UIcon name="i-lucide-chevron-right" class="card-arrow" aria-hidden="true" />
            </div>
          </header>

          <!-- Position 1: Lợi nhuận tạm tính -->
          <div
            class="tracked-total-box"
            :class="`headline-theme--${entry.kpis.provisionalProfit.colorScheme}`"
            data-testid="provisional-profit-box"
          >
            <div class="total-header">
              <span class="total-label">
                {{ entry.kpis.provisionalProfit.label }}
              </span>
              <span
                v-if="entry.kpis.provisionalProfit.caption"
                class="headline-caption"
                data-testid="headline-caption"
              >
                {{ entry.kpis.provisionalProfit.caption }}
              </span>
            </div>
            <div class="total-value-row">
              <span
                class="total-value"
                :class="{
                  'is-negative-value': entry.kpis.provisionalProfit.isNegative,
                  'is-unavailable-value': !entry.kpis.provisionalProfit.isAvailable
                }"
                data-testid="total-tracked-value"
                data-testid-alt="expected-profit-value"
              >
                {{ entry.kpis.provisionalProfit.value }}
              </span>
              <span
                v-if="!entry.kpis.provisionalProfit.isAvailable"
                class="unavailable-info-icon"
                role="img"
                :title="entry.kpis.provisionalProfit.reasons ?? 'Chưa đủ dữ liệu tài chính để tính lợi nhuận'"
                aria-label="Thông tin thiếu dữ liệu"
              >
                <UIcon name="i-lucide-info" class="compact-info-icon" aria-hidden="true" />
              </span>
            </div>
            <span
              v-if="entry.kpis.provisionalProfit.reasons"
              class="total-subtext"
              data-testid="margin-reasons"
            >
              {{ entry.kpis.provisionalProfit.reasons }}
            </span>
          </div>

          <div class="metrics-grid">
            <!-- Position 2: Thu từ chủ đầu tư (R06) -->
            <div class="metric-item" data-testid="receipts-metric-item">
              <div class="metric-top">
                <span
                  class="cockpit-badge"
                  :class="entry.kpis.receipts.badgeVariant"
                >
                  {{ entry.kpis.receipts.label }}
                </span>

                <!-- Info disclosure for receipt references / budget (Maintainability D) -->
                <ProjectCostInfoDisclosure
                  v-if="entry.kpis.receipts.hasDisclosure"
                  :id="entry.project.projectId"
                  :tooltip-text="entry.kpis.receipts.tooltipText!"
                  button-test-id="info-disclosure-btn"
                  popover-test-id="info-tooltip-popover"
                />
              </div>

              <span class="metric-value" data-testid="accepted-value" data-testid-alt="reference-value">
                {{ entry.kpis.receipts.value }}
              </span>
              <span
                v-if="entry.kpis.receipts.budgetSecondaryText"
                class="metric-subline"
                data-testid="budget-secondary-subline"
              >
                {{ entry.kpis.receipts.budgetSecondaryText }}
              </span>
            </div>

            <!-- Position 3: Chi phí (recorded / not_recorded / needs_reconciliation) -->
            <div class="metric-item">
              <div class="metric-top">
                <span class="cockpit-badge metric-badge--cost">
                  Chi phí
                </span>
                <span
                  v-if="entry.kpis.cost.stateLabel"
                  class="cockpit-badge cockpit-badge--warning"
                  data-testid="cost-state-badge"
                >
                  {{ entry.kpis.cost.stateLabel }}
                </span>
              </div>
              <span class="metric-value" data-testid="in-progress-value" data-testid-alt="cost-value">
                {{ entry.kpis.cost.value }}
              </span>
              <span
                v-if="entry.kpis.cost.knownSubtotal && entry.kpis.cost.knownSubtotal !== entry.kpis.cost.value && entry.kpis.cost.state !== 'recorded'"
                class="metric-subline"
                data-testid="known-subtotal-subline"
              >
                {{ entry.kpis.cost.knownSubtotal }}
              </span>
            </div>
          </div>

          <!-- Position 4: Bảo hành đã ghi nhận -->
          <footer class="project-footer">
            <div class="unknown-metric">
              <span class="cockpit-badge metric-badge--warranty">Bảo hành đã ghi nhận</span>
              <span class="unknown-numbers">
                <span class="unknown-value" data-testid="unknown-value" data-testid-alt="warranty-retention-value">
                  {{ entry.kpis.warranty.value }}
                </span>
                <span class="unknown-count" data-testid="unknown-count" data-testid-alt="warranty-retention-count">
                  {{ entry.kpis.warranty.countText }}
                </span>
              </span>
            </div>
          </footer>
        </article>
      </div>

      <!-- Pagination / Load more -->
      <div v-if="nextCursor" class="pagination-footer">
        <button
          type="button"
          class="cockpit-btn cockpit-btn--secondary"
          :disabled="loadingMore"
          data-testid="load-more-projects"
          @click="loadMore"
        >
          <UIcon v-if="loadingMore" name="i-lucide-loader-2" class="spin" aria-hidden="true" />
          <span>{{ loadingMore ? 'Đang tải…' : 'Tải thêm dự án' }}</span>
        </button>
      </div>
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

.project-directory-wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
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
  cursor: pointer;
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

.project-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.project-name-link {
  color: inherit;
  text-decoration: none;
  outline-offset: 3px;
}

.project-name-link:hover .project-name,
.project-card:hover .project-name {
  color: var(--color-primary);
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
  transition: color 150ms ease;
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

.total-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.headline-caption {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.total-value-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.unavailable-info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.compact-info-icon {
  width: 16px;
  height: 16px;
}

.is-unavailable-value {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.info-disclosure-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.info-trigger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition: color 150ms ease, background-color 150ms ease;
}

.info-trigger-btn:hover,
.info-trigger-btn:focus-visible {
  color: var(--color-primary);
  background-color: var(--color-bg-tertiary);
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.info-icon {
  width: 13px;
  height: 13px;
}

.info-tooltip-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: min(300px, calc(100vw - 48px));
  max-width: calc(100vw - 48px);
  padding: 10px 12px;
  background: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-tooltip-text {
  font-size: 0.74rem;
  line-height: 1.45;
  color: var(--color-text-primary);
  margin: 0;
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

.total-subtext {
  font-size: 0.76rem;
  color: var(--color-text-secondary);
  margin-top: 2px;
  line-height: 1.35;
  font-weight: 500;
}

.headline-theme--profit {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.headline-theme--profit .total-label {
  color: #059669;
}

.headline-theme--negative {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.headline-theme--negative .total-label {
  color: #dc2626;
}

.headline-theme--receipts {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.22);
}

.headline-theme--receipts .total-label {
  color: #15803d;
}

.headline-theme--provisional {
  background: rgba(14, 165, 165, 0.08);
  border: 1px solid rgba(14, 165, 165, 0.25);
}

.headline-theme--provisional .total-label {
  color: #0d8282;
}

.headline-theme--budget {
  background: rgba(29, 78, 216, 0.08);
  border: 1px solid rgba(29, 78, 216, 0.22);
}

.headline-theme--budget .total-label {
  color: #1d4ed8;
}

.headline-theme--unavailable {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-light);
}

.is-negative-value {
  color: var(--color-danger) !important;
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

.metric-badge--cost {
  background: rgba(249, 115, 22, 0.12);
  color: #9a3412;
  font-weight: 700;
}

.metric-badge--warranty {
  background: rgba(139, 92, 246, 0.12);
  color: #6d28d9;
  font-weight: 700;
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.metric-subline {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  margin-top: 2px;
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

.pagination-footer {
  display: flex;
  justify-content: center;
  padding: 8px 0;
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
