<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ClientError } from '../../../errors/client-error'
import type { FinanceOverview } from '../../../../shared/schemas/costs/project-finance'
import {
  formatCostDisplay,
  formatOperationalState,
  formatProvisionalProfitDisplay,
  formatReferenceDisplay,
  formatWarrantyRetentionDisplay,
} from '../../../utils/costs/finance-display'
import ProjectCostCategoryChart from '../../../components/costs/ProjectCostCategoryChart.client.vue'

definePageMeta({ requiredPermission: 'cost.read' })

const route = useRoute()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore

const projectId = computed(() => String(route.params.projectId ?? ''))
const overview = ref<FinanceOverview | null>(null)
const status = ref<'loading' | 'ready' | 'module' | 'permission' | 'empty' | 'not_found' | 'error'>('loading')
let request = 0

// Info tooltip popover state
const isPinned = ref(false)
const isHovered = ref(false)
const isFocused = ref(false)
const isDismissed = ref(false)

const isInfoOpen = computed(() => {
  if (isDismissed.value) return false
  return isPinned.value || isHovered.value || isFocused.value
})

function toggleInfo() {
  if (isPinned.value) {
    isPinned.value = false
    isHovered.value = false
    isFocused.value = false
  }
  else {
    isDismissed.value = false
    isPinned.value = true
  }
}

function dismissInfo() {
  isDismissed.value = true
  isPinned.value = false
  isHovered.value = false
  isFocused.value = false
}

function onInfoHover() {
  isDismissed.value = false
  isHovered.value = true
}

function onInfoLeave() {
  isHovered.value = false
}

function onInfoFocus() {
  isDismissed.value = false
  isFocused.value = true
}

function onInfoBlur() {
  isFocused.value = false
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    dismissInfo()
  }
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target?.closest('.info-disclosure-anchor')) {
    dismissInfo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('click', handleOutsideClick)
})

function onSelectCategory(categoryId: string) {
  navigateTo(`/costs/${projectId.value}/categories/${categoryId}`)
}

async function loadOverview() {
  if (!projectId.value) {
    status.value = 'not_found'
    return
  }

  const currentRequest = ++request
  status.value = 'loading'
  dismissInfo()

  try {
    const data = await repositories.projectFinance.overview(projectId.value)
    if (currentRequest !== request) return

    overview.value = data
    status.value = data.categories.length === 0 ? 'empty' : 'ready'
  }
  catch (err: unknown) {
    if (currentRequest !== request) return

    if (err instanceof ClientError) {
      if (err.code === 'RESOURCE_NOT_FOUND') {
        status.value = 'not_found'
        return
      }
      if (err.code === 'PERMISSION_DENIED') {
        status.value = 'permission'
        return
      }
      if (err.reason === 'MODULE_DISABLED') {
        status.value = 'module'
        return
      }
    }
    status.value = 'error'
  }
}

watch(
  [projectId, () => companyAccess.activeCompanyId],
  () => {
    loadOverview()
  },
  { immediate: true },
)
</script>

<template>
  <div class="project-cost-detail-page" data-testid="project-cost-detail">
    <div class="page-top-nav">
      <NuxtLink to="/costs" class="back-link">
        <UIcon name="i-lucide-arrow-left" aria-hidden="true" />
        <span>Quay lại danh sách chi phí dự án</span>
      </NuxtLink>
    </div>

    <!-- Loading State -->
    <div v-if="status === 'loading'" class="state-panel cockpit-card" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
      <p>Đang tải chi tiết chi phí dự án…</p>
    </div>

    <!-- Error State -->
    <div v-else-if="status === 'error'" class="state-panel cockpit-card state-panel--error" role="alert">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      <h2>Không thể tải chi tiết chi phí dự án</h2>
      <p>Đã xảy ra lỗi khi tải dữ liệu từ máy chủ. Vui lòng thử lại sau.</p>
      <button type="button" class="cockpit-btn cockpit-btn--secondary" @click="loadOverview">
        <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
        <span>Thử lại</span>
      </button>
    </div>

    <!-- Not Found State -->
    <div v-else-if="status === 'not_found'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-file-question" aria-hidden="true" />
      <h2>Không tìm thấy dữ liệu chi phí dự án</h2>
      <p>Dự án này không tồn tại hoặc bạn không có quyền truy cập thông tin tài chính.</p>
      <NuxtLink to="/costs" class="cockpit-btn cockpit-btn--secondary">
        Quay lại danh sách chi phí
      </NuxtLink>
    </div>

    <!-- Permission State -->
    <div v-else-if="status === 'permission'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-shield-alert" aria-hidden="true" />
      <h2>Không có quyền truy cập</h2>
      <p>Bạn không có quyền xem chi phí dự án của công ty này.</p>
      <NuxtLink to="/costs" class="cockpit-btn cockpit-btn--secondary">
        Quay lại danh sách chi phí
      </NuxtLink>
    </div>

    <!-- Module Disabled State -->
    <div v-else-if="status === 'module'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-lock" aria-hidden="true" />
      <h2>Tính năng chưa kích hoạt</h2>
      <p>Mô-đun quản lý chi phí dự án chưa được kích hoạt cho công ty này.</p>
      <NuxtLink to="/costs" class="cockpit-btn cockpit-btn--secondary">
        Quay lại danh sách chi phí
      </NuxtLink>
    </div>

    <!-- Ready / Empty Content -->
    <div v-else-if="overview" class="project-content">
      <header class="project-header cockpit-card">
        <div class="header-main">
          <div class="meta-row">
            <span class="project-code font-mono">{{ overview.project.projectCode }}</span>
            <span
              class="cockpit-badge"
              :class="formatOperationalState(overview.project.operationalState).badgeVariant"
              data-testid="detail-operational-state"
            >
              {{ formatOperationalState(overview.project.operationalState).label }}
            </span>
          </div>
          <h1 class="project-title">
            {{ overview.project.projectName }}
          </h1>
          <p class="subtitle">
            Chi tiết các hạng mục chi phí công việc đang theo dõi.
          </p>
        </div>

        <div class="summary-cards" data-testid="detail-summary-cards">
          <!-- Position 1: Lợi nhuận tạm tính -->
          <div
            class="summary-card"
            :class="`headline-theme--${formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).colorScheme}`"
            data-testid="detail-provisional-profit-card"
          >
            <div class="summary-tag">
              <span class="summary-label">
                {{ formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).label }}
              </span>
              <span
                v-if="formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).caption"
                class="headline-caption"
                data-testid="detail-headline-caption"
              >
                {{ formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).caption }}
              </span>
            </div>
            <div class="summary-value-row">
              <span
                class="summary-number"
                :class="{
                  'is-negative-value': formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).isNegative,
                  'is-unavailable-value': !formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).isAvailable
                }"
                data-testid="detail-total-tracked"
                data-testid-alt="detail-expected-profit"
              >
                {{ formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).value }}
              </span>
              <span
                v-if="!formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).isAvailable"
                class="unavailable-info-icon"
                role="img"
                :title="formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).reasons ?? 'Chưa đủ dữ liệu tài chính để tính lợi nhuận'"
                aria-label="Thông tin thiếu dữ liệu"
              >
                <UIcon name="i-lucide-info" class="compact-info-icon" aria-hidden="true" />
              </span>
            </div>
            <span
              v-if="formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).reasons"
              class="summary-subtext"
              data-testid="detail-margin-reasons"
            >
              {{ formatProvisionalProfitDisplay(overview.summary.management?.result, overview.project.currencyCode, overview.project.moneyScale).reasons }}
            </span>
          </div>

          <!-- Position 2: Thu từ chủ đầu tư -->
          <div
            class="summary-card"
            data-testid="detail-receipts-card"
          >
            <div class="summary-tag">
              <span
                class="cockpit-badge"
                :class="formatReferenceDisplay(overview.summary.management?.reference ?? overview.summary.reference, overview.project.currencyCode, overview.project.moneyScale).badgeVariant"
              >
                {{ formatReferenceDisplay(overview.summary.management?.reference ?? overview.summary.reference, overview.project.currencyCode, overview.project.moneyScale).label }}
              </span>

              <!-- Info disclosure for receipt references -->
              <div
                v-if="formatReferenceDisplay(overview.summary.management?.reference ?? overview.summary.reference, overview.project.currencyCode, overview.project.moneyScale).isOwnerReceipts"
                class="info-disclosure-anchor"
              >
                <button
                  type="button"
                  class="info-trigger-btn"
                  :aria-expanded="isInfoOpen ? 'true' : 'false'"
                  aria-label="Thông tin nguồn thu từ chủ đầu tư"
                  aria-describedby="detail-info-popover"
                  data-testid="detail-info-disclosure-btn"
                  @click.stop="toggleInfo"
                  @mouseenter="onInfoHover"
                  @mouseleave="onInfoLeave"
                  @focus="onInfoFocus"
                  @blur="onInfoBlur"
                >
                  <UIcon name="i-lucide-info" class="info-icon" aria-hidden="true" />
                </button>
                <div
                  v-show="isInfoOpen"
                  id="detail-info-popover"
                  role="tooltip"
                  class="info-tooltip-popover cockpit-card"
                  data-testid="detail-info-tooltip-popover"
                  @click.stop
                >
                  <p class="info-tooltip-text">
                    {{ formatReferenceDisplay(overview.summary.management?.reference ?? overview.summary.reference, overview.project.currencyCode, overview.project.moneyScale).tooltipText }}
                  </p>
                </div>
              </div>
            </div>

            <span class="summary-number" data-testid="detail-accepted" data-testid-alt="detail-reference">
              {{ formatReferenceDisplay(overview.summary.management?.reference ?? overview.summary.reference, overview.project.currencyCode, overview.project.moneyScale).value }}
            </span>
          </div>

          <!-- Position 3: Chi phí (recorded / not_recorded / needs_reconciliation) -->
          <div class="summary-card" data-testid="detail-cost-card">
            <div class="summary-tag">
              <span class="cockpit-badge metric-badge--cost">
                Chi phí
              </span>
              <span
                v-if="formatCostDisplay(overview.summary.cost).stateLabel"
                class="cockpit-badge cockpit-badge--warning"
                data-testid="detail-cost-reconciliation-badge"
              >
                {{ formatCostDisplay(overview.summary.cost).stateLabel }}
              </span>
            </div>
            <span class="summary-number" data-testid="detail-in-progress" data-testid-alt="detail-cost">
              {{ formatCostDisplay(overview.summary.cost, overview.project.currencyCode, overview.project.moneyScale).value }}
            </span>
            <!-- Render knownSubtotal ONLY if it differs from value to avoid duplicate amount display -->
            <span
              v-if="formatCostDisplay(overview.summary.cost, overview.project.currencyCode, overview.project.moneyScale).knownSubtotal
                && formatCostDisplay(overview.summary.cost).state !== 'recorded'
                && formatCostDisplay(overview.summary.cost, overview.project.currencyCode, overview.project.moneyScale).knownSubtotal !== formatCostDisplay(overview.summary.cost, overview.project.currencyCode, overview.project.moneyScale).value"
              class="summary-subline"
              data-testid="detail-known-subtotal"
            >
              {{ formatCostDisplay(overview.summary.cost, overview.project.currencyCode, overview.project.moneyScale).knownSubtotal }}
            </span>
          </div>

          <!-- Position 4: Bảo hành đã ghi nhận -->
          <div class="summary-card summary-card--secondary" data-testid="detail-warranty-card">
            <div class="summary-tag">
              <span class="cockpit-badge metric-badge--warranty">Bảo hành đã ghi nhận</span>
              <span class="count" data-testid="detail-warranty-count">
                {{ formatWarrantyRetentionDisplay(overview.summary.warrantyRetention).countText }}
              </span>
            </div>
            <span class="summary-number" data-testid="detail-unknown" data-testid-alt="detail-warranty-retention">
              {{ formatWarrantyRetentionDisplay(overview.summary.warrantyRetention, overview.project.currencyCode, overview.project.moneyScale).value }}
            </span>
          </div>
        </div>
      </header>

      <!-- Category Chart & Accessible Table Section (Replaces Accordion) -->
      <section class="breakdown-section" aria-label="Biểu đồ và danh sách danh mục chi phí">
        <div v-if="overview.categories.length === 0" class="state-panel cockpit-card">
          <UIcon name="i-lucide-inbox" aria-hidden="true" />
          <h2>Chưa có hạng mục chi phí</h2>
          <p>Không có hạng mục công việc nào được ghi nhận cho dự án này.</p>
        </div>

        <ProjectCostCategoryChart
          v-else
          :project-id="projectId"
          :categories="overview.categories"
          :currency-code="overview.project.currencyCode"
          :money-scale="overview.project.moneyScale"
          @select-category="onSelectCategory"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.project-cost-detail-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1360px;
  margin: 0 auto;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.page-top-nav {
  display: flex;
  align-items: center;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.back-link:hover {
  background: var(--color-bg-secondary);
}

.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  gap: 12px;
}

.state-panel--error {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.project-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  width: 100%;
}

.project-header {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 24px;
  min-width: 0;
  box-sizing: border-box;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.project-code {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-bg-secondary);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.project-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--color-text-primary);
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}

.subtitle {
  color: var(--color-text-secondary);
  font-size: 0.95rem;
  margin: 0;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border-light);
  min-width: 0;
}

.summary-cards.summary-cards--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  min-width: 0;
  overflow: hidden;
}

.summary-card--secondary {
  opacity: 0.92;
}

.headline-theme--receipts {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.22);
}

.headline-theme--profit {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.headline-theme--profit .summary-label {
  color: #059669;
}

.headline-theme--negative {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.headline-theme--negative .summary-label {
  color: #dc2626;
}

.headline-theme--receipts {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.22);
}

.headline-theme--receipts .summary-label {
  color: #15803d;
}

.headline-theme--provisional {
  background: rgba(14, 165, 165, 0.08);
  border: 1px solid rgba(14, 165, 165, 0.25);
}

.headline-theme--provisional .summary-label {
  color: #0d8282;
}

.headline-theme--budget {
  background: rgba(29, 78, 216, 0.08);
  border: 1px solid rgba(29, 78, 216, 0.22);
}

.headline-theme--budget .summary-label {
  color: #1d4ed8;
}

.headline-theme--unavailable {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-light);
}

.is-negative-value {
  color: var(--color-danger) !important;
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

.summary-label {
  font-size: 0.76rem;
  font-weight: 650;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.summary-tag {
  display: flex;
  align-items: center;
  gap: 6px;
}

.summary-tag .count {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.summary-value-row {
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
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.summary-number {
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 750;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.summary-subtext {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  line-height: 1.35;
  margin-top: 2px;
}

.summary-subline {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  margin-top: 2px;
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
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  transition: color 0.15s ease;
}

.info-trigger-btn:hover,
.info-trigger-btn:focus-visible {
  color: var(--color-text-primary);
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.info-icon {
  font-size: 0.875rem;
}

.info-tooltip-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  width: 280px;
  padding: 10px 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
  border-radius: var(--radius-md);
}

.info-tooltip-text {
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-text-secondary);
  margin: 0;
}

.breakdown-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 1024px) {
  .summary-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .project-header {
    padding: 16px;
  }
  .summary-cards {
    grid-template-columns: minmax(0, 1fr);
  }
  .project-title {
    font-size: 1.4rem;
  }
}
</style>
