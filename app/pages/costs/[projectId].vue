<script setup lang="ts">
import { ClientError } from '../../errors/client-error'
import type { ProjectCostDetailsResponse } from '../../../shared/schemas/costs/project-costs'
definePageMeta({ requiredPermission: 'cost.read' })

const route = useRoute()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore

const projectId = computed(() => String(route.params.projectId ?? ''))
const detail = ref<Awaited<ReturnType<typeof repositories.projectCosts.project>> | null>(null)
const status = ref<'loading' | 'ready' | 'module' | 'permission' | 'empty' | 'not_found' | 'error'>('loading')
let request = 0

const expandedItemIds = ref<Set<string>>(new Set())
const detailsCache = ref<Map<string, ProjectCostDetailsResponse>>(new Map())
const itemDetailsState = ref<Map<string, { status: 'loading' | 'ready' | 'empty' | 'error'; error?: string }>>(new Map())

function isExpanded(itemId: string): boolean {
  return expandedItemIds.value.has(itemId)
}

function getItemDetailState(itemId: string) {
  return itemDetailsState.value.get(itemId) ?? { status: 'loading' as const }
}

function getItemDetails(itemId: string): ProjectCostDetailsResponse | undefined {
  return detailsCache.value.get(itemId)
}

async function loadItemDetails(itemId: string) {
  const currentMap = new Map(itemDetailsState.value)
  currentMap.set(itemId, { status: 'loading' })
  itemDetailsState.value = currentMap

  try {
    const result = await repositories.projectCosts.details(itemId)
    const newCache = new Map(detailsCache.value)
    newCache.set(itemId, result)
    detailsCache.value = newCache

    const newMap = new Map(itemDetailsState.value)
    newMap.set(itemId, { status: result.details.length === 0 ? 'empty' : 'ready' })
    itemDetailsState.value = newMap
  }
  catch {
    const newMap = new Map(itemDetailsState.value)
    newMap.set(itemId, { status: 'error', error: 'Không thể tải chi tiết hạng mục.' })
    itemDetailsState.value = newMap
  }
}

async function toggleExpand(itemId: string) {
  const next = new Set(expandedItemIds.value)
  if (next.has(itemId)) {
    next.delete(itemId)
    expandedItemIds.value = next
    return
  }

  next.add(itemId)
  expandedItemIds.value = next

  if (detailsCache.value.has(itemId)) {
    return
  }

  await loadItemDetails(itemId)
}

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

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  if (year && month && day) {
    return `${day}/${month}/${year}`
  }
  return value
}

function statusBadge(workStatus: string) {
  if (workStatus === 'accepted') return { label: 'Đã nghiệm thu', variant: 'cockpit-badge--success' }
  if (workStatus === 'in_progress') return { label: 'Đang thực hiện', variant: 'cockpit-badge--warning' }
  return { label: 'Chưa xác định', variant: 'cockpit-badge--neutral' }
}

async function load() {
  if (!projectId.value) return
  const current = ++request
  status.value = 'loading'
  expandedItemIds.value = new Set()
  detailsCache.value = new Map()
  itemDetailsState.value = new Map()
  try {
    const value = await repositories.projectCosts.project(projectId.value)
    if (current !== request) return
    detail.value = value
    status.value = value.items.length ? 'ready' : 'empty'
  }
  catch (error) {
    if (current !== request) return
    if (error instanceof ClientError) {
      if (error.reason === 'MODULE_DISABLED') {
        status.value = 'module'
      }
      else if (error.code === 'PERMISSION_DENIED') {
        status.value = 'permission'
      }
      else if (error.code === 'RESOURCE_NOT_FOUND') {
        status.value = 'not_found'
      }
      else {
        status.value = 'error'
      }
    }
    else {
      status.value = 'error'
    }
  }
}

watch([projectId, () => companyAccess.activeCompanyId], () => load(), { immediate: true })
</script>

<template>
  <section class="project-cost-detail" data-testid="project-cost-detail">
    <nav v-if="status !== 'not_found'" class="back-nav" aria-label="Quay lại">
      <NuxtLink to="/costs" class="back-link">
        <UIcon name="i-lucide-arrow-left" aria-hidden="true" />
        <span>Quay lại danh sách chi phí dự án</span>
      </NuxtLink>
    </nav>

    <div v-if="status === 'loading'" class="state-panel cockpit-card" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
      <p>Đang tải dữ liệu chi tiết chi phí dự án…</p>
    </div>

    <div v-else-if="status === 'not_found'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-search-x" aria-hidden="true" />
      <h2>Không tìm thấy dữ liệu chi phí dự án</h2>
      <p>Dự án này không tồn tại hoặc chưa có dữ liệu chi phí được ghi nhận.</p>
      <NuxtLink to="/costs" class="cockpit-btn cockpit-btn--secondary">Quay lại danh sách chi phí dự án</NuxtLink>
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

    <div v-else-if="status === 'error'" class="state-panel cockpit-card">
      <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
      <h2>Không thể tải dữ liệu</h2>
      <p>Đã xảy ra lỗi khi tải chi tiết chi phí dự án.</p>
      <button type="button" class="cockpit-btn cockpit-btn--primary" @click="load">Thử lại</button>
    </div>

    <template v-else-if="detail">
      <header class="detail-header cockpit-card">
        <div class="header-main">
          <span class="project-code">{{ detail.projectCode }}</span>
          <h1 class="project-title">{{ detail.projectName }}</h1>
          <p class="subtitle">Chi tiết các hạng mục chi phí công việc đang theo dõi.</p>
        </div>

        <div class="summary-cards">
          <div class="summary-card">
            <span class="summary-label">Tổng đang theo dõi</span>
            <span class="summary-number" data-testid="detail-total-tracked">
              {{ formatMoney(detail.summary.totalTrackedWorkValue) }}
              <small>{{ detail.summary.currencyCode }}</small>
            </span>
          </div>

          <div class="summary-card">
            <div class="summary-tag">
              <span class="cockpit-badge cockpit-badge--success">Đã nghiệm thu</span>
              <span class="count">({{ detail.summary.acceptedCount }})</span>
            </div>
            <span class="summary-number" data-testid="detail-accepted">
              {{ formatMoney(detail.summary.acceptedValue) }}
            </span>
          </div>

          <div class="summary-card">
            <div class="summary-tag">
              <span class="cockpit-badge cockpit-badge--warning">Đang thực hiện</span>
              <span class="count">({{ detail.summary.inProgressCount }})</span>
            </div>
            <span class="summary-number" data-testid="detail-in-progress">
              {{ formatMoney(detail.summary.inProgressValue) }}
            </span>
          </div>

          <div class="summary-card summary-card--secondary">
            <div class="summary-tag">
              <span class="cockpit-badge cockpit-badge--neutral">Chưa xác định</span>
              <span class="count">({{ detail.summary.unknownCount }})</span>
            </div>
            <span class="summary-number" data-testid="detail-unknown">
              {{ formatMoney(detail.summary.unknownStatusValue) }}
            </span>
          </div>
        </div>
      </header>

      <section class="breakdown-section" aria-label="Danh sách hạng mục chi phí">
        <div class="section-title-bar">
          <h2>Danh sách hạng mục công việc</h2>
          <span class="item-count">{{ detail.items.length }} hạng mục</span>
        </div>

        <div v-if="status === 'empty'" class="state-panel cockpit-card">
          <UIcon name="i-lucide-inbox" aria-hidden="true" />
          <h2>Chưa có hạng mục chi phí</h2>
          <p>Không có hạng mục công việc nào được ghi nhận cho dự án này.</p>
        </div>

        <div v-else class="table-container cockpit-card" tabindex="0" aria-label="Bảng các hạng mục chi phí">
          <table class="cost-table">
            <thead>
              <tr>
                <th scope="col" class="col-status">Trạng thái</th>
                <th scope="col" class="col-desc">Nội dung công việc</th>
                <th scope="col" class="col-ref">Mã tham chiếu</th>
                <th scope="col" class="col-date">Ngày ghi nhận</th>
                <th scope="col" class="col-amount text-right">Giá trị công việc</th>
                <th scope="col" class="col-action text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="item in detail.items" :key="item.id">
                <tr
                  class="item-row"
                  :class="{ 'item-row--expanded': isExpanded(item.id) }"
                  :data-testid="`cost-item-row-${item.id}`"
                  @click="toggleExpand(item.id)"
                >
                  <td class="col-status">
                    <span class="cockpit-badge" :class="statusBadge(item.workStatus).variant">
                      {{ statusBadge(item.workStatus).label }}
                    </span>
                  </td>
                  <td class="col-desc">
                    <span class="item-description">{{ item.description }}</span>
                  </td>
                  <td class="col-ref">
                    <span v-if="item.businessReference" class="business-ref">{{ item.businessReference }}</span>
                    <span v-else class="empty-cell">—</span>
                  </td>
                  <td class="col-date">
                    <span v-if="item.relevantDate" class="relevant-date">{{ formatDate(item.relevantDate) }}</span>
                    <span v-else class="empty-cell">—</span>
                  </td>
                  <td class="col-amount text-right">
                    <span class="amount-value font-mono">
                      {{ formatMoney(item.amount) }} {{ item.currencyCode }}
                    </span>
                  </td>
                  <td class="col-action text-right">
                    <button
                      type="button"
                      class="expand-btn cockpit-btn cockpit-btn--ghost"
                      :aria-expanded="isExpanded(item.id)"
                      :aria-controls="`details-${item.id}`"
                      :data-testid="`toggle-details-${item.id}`"
                      @click.stop="toggleExpand(item.id)"
                    >
                      <span>{{ isExpanded(item.id) ? 'Thu gọn' : 'Xem chi tiết' }}</span>
                      <UIcon :name="isExpanded(item.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" aria-hidden="true" />
                    </button>
                  </td>
                </tr>

                <tr
                  v-if="isExpanded(item.id)"
                  :id="`details-${item.id}`"
                  class="nested-row"
                  :data-testid="`details-row-${item.id}`"
                >
                  <td colspan="6" class="nested-cell">
                    <div class="nested-detail-area">
                      <div v-if="getItemDetailState(item.id).status === 'loading'" class="nested-status-box" aria-live="polite">
                        <UIcon name="i-lucide-loader-2" class="spin" aria-hidden="true" />
                        <span>Đang tải chi tiết hạng mục…</span>
                      </div>

                      <div v-else-if="getItemDetailState(item.id).status === 'error'" class="nested-status-box nested-status-box--error" role="alert">
                        <UIcon name="i-lucide-circle-alert" aria-hidden="true" />
                        <span>Không thể tải chi tiết hạng mục.</span>
                        <button
                          type="button"
                          class="cockpit-btn cockpit-btn--secondary retry-btn"
                          :data-testid="`retry-details-${item.id}`"
                          @click.stop="loadItemDetails(item.id)"
                        >
                          <UIcon name="i-lucide-refresh-cw" aria-hidden="true" />
                          <span>Thử lại</span>
                        </button>
                      </div>

                      <div v-else-if="getItemDetailState(item.id).status === 'empty' || (getItemDetails(item.id)?.details.length === 0)" class="nested-status-box">
                        <UIcon name="i-lucide-inbox" aria-hidden="true" />
                        <span>Chưa có chi tiết cho hạng mục này.</span>
                      </div>

                      <div v-else-if="getItemDetails(item.id)" class="nested-content">
                        <!-- Desktop Nested Table -->
                        <div class="nested-table-container">
                          <table class="nested-table">
                            <thead>
                              <tr>
                                <th scope="col" class="nested-col-desc">Nội dung</th>
                                <th scope="col" class="nested-col-qty text-right">Số lượng</th>
                                <th scope="col" class="nested-col-unit">ĐVT</th>
                                <th scope="col" class="nested-col-price text-right">Đơn giá</th>
                                <th scope="col" class="nested-col-amount text-right">Thành tiền</th>
                                <th scope="col" class="nested-col-date">Ngày</th>
                                <th scope="col" class="nested-col-ref">Tham chiếu / Ghi chú</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr v-for="d in getItemDetails(item.id)!.details" :key="d.id" class="nested-item-row">
                                <td class="nested-col-desc">
                                  <div class="desc-wrapper">
                                    <span
                                      v-if="d.detailKind === 'opening_balance'"
                                      class="cockpit-badge cockpit-badge--neutral opening-badge"
                                    >
                                      Số liệu ban đầu
                                    </span>
                                    <span class="detail-description">{{ d.description }}</span>
                                  </div>
                                </td>
                                <td class="nested-col-qty text-right font-mono">
                                  <span v-if="d.quantity">{{ formatMoney(d.quantity) }}</span>
                                  <span v-else class="empty-cell">—</span>
                                </td>
                                <td class="nested-col-unit">
                                  <span v-if="d.unitCode">{{ d.unitCode }}</span>
                                  <span v-else class="empty-cell">—</span>
                                </td>
                                <td class="nested-col-price text-right font-mono">
                                  <span v-if="d.unitPrice">{{ formatMoney(d.unitPrice) }}</span>
                                  <span v-else class="empty-cell">—</span>
                                </td>
                                <td class="nested-col-amount text-right font-mono font-bold">
                                  {{ formatMoney(d.amount) }} {{ getItemDetails(item.id)!.currencyCode }}
                                </td>
                                <td class="nested-col-date font-mono">
                                  <span v-if="d.relevantDate">{{ formatDate(d.relevantDate) }}</span>
                                  <span v-else class="empty-cell">—</span>
                                </td>
                                <td class="nested-col-ref">
                                  <div class="ref-note-wrapper">
                                    <span v-if="d.reference" class="business-ref">{{ d.reference }}</span>
                                    <span v-if="d.note" class="detail-note">{{ d.note }}</span>
                                    <span v-if="!d.reference && !d.note" class="empty-cell">—</span>
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <!-- Mobile Compact Stacked Cards -->
                        <div class="nested-mobile-cards">
                          <div
                            v-for="d in getItemDetails(item.id)!.details"
                            :key="d.id"
                            class="detail-card"
                          >
                            <div class="detail-card-top">
                              <div class="detail-card-title">
                                <span
                                  v-if="d.detailKind === 'opening_balance'"
                                  class="cockpit-badge cockpit-badge--neutral opening-badge"
                                >
                                  Số liệu ban đầu
                                </span>
                                <span class="card-desc">{{ d.description }}</span>
                              </div>
                              <span class="card-amount font-mono">
                                {{ formatMoney(d.amount) }} {{ getItemDetails(item.id)!.currencyCode }}
                              </span>
                            </div>

                            <div class="detail-card-grid">
                              <div class="card-field">
                                <span class="field-label">Số lượng & Đơn giá</span>
                                <span class="field-value font-mono">
                                  <template v-if="d.quantity">
                                    {{ formatMoney(d.quantity) }} {{ d.unitCode || '' }}
                                    <template v-if="d.unitPrice"> × {{ formatMoney(d.unitPrice) }}</template>
                                  </template>
                                  <template v-else>—</template>
                                </span>
                              </div>

                              <div v-if="d.relevantDate" class="card-field">
                                <span class="field-label">Ngày</span>
                                <span class="field-value font-mono">{{ formatDate(d.relevantDate) }}</span>
                              </div>

                              <div v-if="d.reference || d.note" class="card-field full-width">
                                <span class="field-label">Tham chiếu / Ghi chú</span>
                                <div class="field-value ref-note-wrapper">
                                  <span v-if="d.reference" class="business-ref">{{ d.reference }}</span>
                                  <span v-if="d.note" class="detail-note">{{ d.note }}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.project-cost-detail {
  max-width: 1260px;
  margin: 0 auto;
  padding-bottom: 32px;
}

.back-nav {
  margin-bottom: 16px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  color: var(--color-primary);
  font-family: var(--font-sans);
  font-size: 0.88rem;
  font-weight: 650;
  text-decoration: none;
  transition: color 150ms ease;
}

.back-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.detail-header {
  padding: clamp(20px, 3.5vw, 32px);
  margin-bottom: 24px;
}

.header-main .project-code {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.header-main .project-title {
  margin: 0 0 6px;
  color: var(--color-text-primary);
  font-size: clamp(1.8rem, 3.5vw, 2.4rem);
  font-weight: 750;
  letter-spacing: -0.02em;
}

.header-main .subtitle {
  color: var(--color-text-secondary);
  font-size: 0.95rem;
  margin: 0 0 24px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border-light);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.summary-card--secondary {
  opacity: 0.92;
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

.cockpit-badge--success {
  color: #166534;
}

.cockpit-badge--warning {
  color: #92400e;
}

.summary-tag .count {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.summary-number {
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 750;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.summary-number small {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-left: 3px;
}

.breakdown-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.section-title-bar h2 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.item-count {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.table-container {
  overflow-x: auto;
  background: var(--color-bg-secondary);
}

.cost-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.cost-table th,
.cost-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-light);
  font-size: 0.86rem;
  vertical-align: middle;
}

.cost-table th {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.item-row {
  cursor: pointer;
  transition: background 150ms ease;
}

.item-row:hover {
  background: var(--color-hover);
}

.item-row--expanded {
  background: var(--color-bg-tertiary);
}

.col-status {
  width: 150px;
  white-space: nowrap;
}

.col-desc {
  min-width: 240px;
}

.item-description {
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.4;
}

.col-ref {
  width: 140px;
  white-space: nowrap;
}

.business-ref {
  display: inline-block;
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.col-date {
  width: 120px;
  white-space: nowrap;
}

.relevant-date {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.empty-cell {
  color: var(--color-text-muted);
}

.col-amount {
  width: 180px;
  white-space: nowrap;
}

.col-action {
  width: 140px;
  white-space: nowrap;
}

.text-right {
  text-align: right;
}

.amount-value {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.expand-btn {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-height: 44px;
  min-width: 44px;
  padding: 0 10px;
  color: var(--color-primary);
  font-size: 0.82rem;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}

.expand-btn:hover {
  color: var(--color-primary-hover);
  background: var(--color-hover);
}

.nested-row {
  background: var(--color-bg-tertiary);
}

.nested-cell {
  padding: 0 !important;
  border-bottom: 2px solid var(--color-border-light);
}

.nested-detail-area {
  padding: 16px 20px;
  background: var(--color-bg-secondary);
  border-left: 3px solid var(--color-primary);
}

.nested-status-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  font-size: 0.88rem;
  color: var(--color-text-secondary);
}

.nested-status-box :deep(svg) {
  width: 20px;
  height: 20px;
  color: var(--color-primary);
}

.nested-status-box--error {
  color: #dc2626;
}

.nested-status-box--error :deep(svg) {
  color: #dc2626;
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 16px;
  margin-left: auto;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.nested-table-container {
  overflow-x: auto;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
}

.nested-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.nested-table th,
.nested-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border-light);
  font-size: 0.82rem;
  vertical-align: middle;
}

.nested-table th {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.nested-col-desc {
  min-width: 200px;
}

.desc-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.opening-badge {
  font-size: 0.68rem;
  padding: 2px 6px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.detail-description {
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.35;
}

.nested-col-qty {
  width: 100px;
  white-space: nowrap;
}

.nested-col-unit {
  width: 70px;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.nested-col-price {
  width: 120px;
  white-space: nowrap;
}

.nested-col-amount {
  width: 140px;
  white-space: nowrap;
}

.font-bold {
  font-weight: 700;
  color: var(--color-text-primary);
}

.nested-col-date {
  width: 110px;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.nested-col-ref {
  min-width: 140px;
}

.ref-note-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-note {
  font-size: 0.76rem;
  color: var(--color-text-secondary);
  font-style: italic;
}

.nested-mobile-cards {
  display: none;
}

@media (max-width: 767px) {
  .nested-table-container {
    display: none;
  }

  .nested-mobile-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
  }

  .detail-card {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
  }

  .detail-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .detail-card-title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .card-desc {
    font-size: 0.86rem;
    font-weight: 650;
    color: var(--color-text-primary);
    line-height: 1.35;
  }

  .card-amount {
    font-size: 0.88rem;
    font-weight: 750;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .detail-card-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px dashed var(--color-border-light);
  }

  .card-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-field.full-width {
    grid-column: 1 / -1;
  }

  .field-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    letter-spacing: 0.02em;
  }

  .field-value {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }
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

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}

@media (max-width: 900px) {
  .summary-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .detail-header {
    padding: 16px;
  }

  .summary-cards {
    grid-template-columns: 1fr;
  }

  .table-card {
    padding: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
