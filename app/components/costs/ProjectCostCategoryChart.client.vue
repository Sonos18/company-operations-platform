<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import type { FinanceCategoryRow } from '../../../shared/schemas/costs/project-finance'
import {
  escapeHtml,
  formatCategoryAxisLabel,
  getDonutChartOption,
  getYAxisConfig,
  prepareCategoryChartData,
} from '../../utils/costs/category-chart'
import { formatFinanceMoney } from '../../utils/costs/finance-display'

use([
  SVGRenderer,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
])

interface Props {
  projectId: string
  categories: FinanceCategoryRow[]
  currencyCode?: string
  moneyScale?: number
}

const props = withDefaults(defineProps<Props>(), {
  currencyCode: 'VND',
  moneyScale: 0,
})

const emit = defineEmits<{
  (e: 'select-category', categoryId: string): void
}>()

const chartData = computed(() => prepareCategoryChartData(props.categories))

interface ChartItemPayload {
  value: number
  categoryId: string
  name: string
  rawAmount: string | null
  quality: string
  stateText: string
}

interface ChartFormatterParams {
  data?: ChartItemPayload
}

const chartOption = computed(() => {
  const { visibleItems } = chartData.value
  const categoryNames = visibleItems.map(item => item.displayName)
  const maxAmount = visibleItems.length > 0
    ? Math.max(...visibleItems.map(item => item.decimalAmount.toNumber()))
    : 0

  const yAxisInfo = getYAxisConfig(props.currencyCode, maxAmount)

  return {
    animation: false,
    aria: {
      enabled: true,
      decal: { show: true },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: {
        color: '#0f172a',
      },
      formatter: (params: ChartFormatterParams | unknown) => {
        const p = params as ChartFormatterParams | undefined
        const data = p?.data
        if (!data) return ''
        const safeName = escapeHtml(data.name)
        const safeAmount = escapeHtml(
          formatFinanceMoney(data.rawAmount, props.currencyCode, props.moneyScale) ?? '0',
        )
        const safeState = escapeHtml(data.stateText)
        return `<div style="font-family: var(--font-sans, system-ui); font-size: 13px; line-height: 1.5;">
          <div style="font-weight: 600; color: #334155; margin-bottom: 2px;">${safeName}</div>
          <div style="font-family: var(--font-mono, monospace); font-weight: 700; font-size: 14px; color: #0f172a;">${safeAmount}</div>
          <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 4px;">${safeState}</div>
        </div>`
      },
    },
    grid: {
      left: 16,
      right: 16,
      top: 36,
      bottom: 44,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: categoryNames,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: {
        fontFamily: 'var(--font-sans, system-ui)',
        fontSize: 11,
        fontWeight: 500,
        color: '#334155',
        interval: 0,
        lineHeight: 15,
        formatter: (val: string) => formatCategoryAxisLabel(val),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      name: yAxisInfo.name ? `(${yAxisInfo.name})` : undefined,
      nameTextStyle: {
        fontFamily: 'var(--font-sans, system-ui)',
        fontSize: 11,
        fontWeight: 600,
        color: '#64748b',
        align: 'left',
        padding: [0, 0, 6, 0],
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11,
        color: '#64748b',
        formatter: yAxisInfo.formatter,
      },
      splitLine: {
        lineStyle: {
          color: '#f1f5f9',
          type: 'dashed',
        },
      },
    },
    series: [
      {
        name: 'Số tiền theo danh mục',
        type: 'bar',
        barMaxWidth: 44,
        barMinHeight: 4,
        data: visibleItems.map((item) => {
          const isHatched = item.quality === 'unreconciled_disbursement'
          return {
            value: item.decimalAmount.toNumber(),
            categoryId: item.categoryId,
            name: item.displayName,
            rawAmount: item.rawAmount,
            quality: item.quality,
            stateText: item.stateText,
            itemStyle: {
              color: isHatched ? 'rgba(124, 58, 237, 0.25)' : item.color,
              borderColor: item.color,
              borderWidth: isHatched ? 2 : 1,
              borderType: isHatched ? 'dashed' : 'solid',
              borderRadius: [4, 4, 0, 0],
            },
          }
        }),
      },
    ],
  }
})

const donutOption = computed(() => {
  return getDonutChartOption(chartData.value.visibleItems, props.currencyCode, props.moneyScale)
})

interface ChartClickParams {
  componentType?: string
  seriesType?: string
  data?: { categoryId?: string }
  dataIndex?: number
}

function handleChartClick(params: unknown) {
  const p = params as ChartClickParams | undefined
  // Authoritative series datum event check: legend, background, or axes clicks must NOT navigate
  if (p?.componentType !== 'series') return

  const categoryId = p.data?.categoryId
    || (p.dataIndex != null ? chartData.value.visibleItems[p.dataIndex]?.categoryId : undefined)
  if (categoryId) {
    emit('select-category', categoryId)
  }
}
</script>

<template>
  <div class="cost-analysis-section" data-testid="category-chart-wrapper">
    <div class="analysis-section-header">
      <div class="analysis-title-area">
        <h2 class="analysis-title" data-testid="category-chart-title">
          Chi phí & Chi/ứng theo danh mục
        </h2>
        <p class="analysis-subtitle">
          So sánh các khoản chi phí và chi/ứng đã ghi nhận. Nhấp vào cột hoặc lát bánh để xem chi tiết hạng mục.
        </p>
      </div>
      <div v-if="chartData.visibleItems.length > 0" class="analysis-badges-area">
        <span
          class="chart-badge cockpit-badge cockpit-badge--neutral"
          data-testid="category-chart-count-badge"
        >
          {{ chartData.visibleItems.length }} danh mục có số liệu
        </span>
      </div>
    </div>

    <!-- 1. If all categories are recorded zero -->
    <div
      v-if="chartData.allAreExactZero"
      class="chart-empty-state cockpit-card"
      data-testid="chart-all-zero-state"
    >
      <UIcon name="i-lucide-circle-slash" class="empty-icon" aria-hidden="true" />
      <p>Chưa có danh mục chi phí khác 0.</p>
    </div>

    <!-- 2. Dual-chart visualization: Vertical column + Donut chart -->
    <template v-else-if="chartData.visibleItems.length > 0">
      <div
        class="charts-grid"
        data-testid="dual-chart-grid"
      >
        <div class="chart-card cockpit-card vertical-chart-card" data-testid="category-chart-canvas">
          <div class="chart-card-header">
            <h3 class="chart-panel-title">
              Số tiền theo danh mục
            </h3>
          </div>
          <div class="chart-canvas-wrapper">
            <VChart
              :option="chartOption"
              autoresize
              class="echarts-wrapper"
              @click="handleChartClick"
            />
          </div>
        </div>

        <div class="chart-card cockpit-card donut-chart-card" data-testid="category-donut-canvas">
          <div class="chart-card-header donut-title-row">
            <h3 class="chart-panel-title">
              Tỷ trọng số liệu hiển thị
            </h3>
            <span
              v-if="chartData.hasUnreconciledData"
              class="cockpit-badge cockpit-badge--warning donut-unreconciled-badge"
            >
              Chưa đối soát
            </span>
          </div>
          <div class="chart-canvas-wrapper">
            <VChart
              :option="donutOption"
              autoresize
              class="echarts-wrapper"
              @click="handleChartClick"
            />
          </div>
        </div>
      </div>

      <!-- 3. Category Summary Card (Real Cockpit Card) -->
      <div class="category-summary-card cockpit-card">
        <div class="category-card-header">
          <h3 class="category-card-title">
            Hạng mục chi phí
          </h3>
        </div>

        <div class="category-table-responsive" tabindex="0" aria-label="Danh sách danh mục chi phí dự án">
          <table class="category-list-table">
            <colgroup>
              <col class="col-cat">
              <col class="col-amount">
              <col class="col-status">
              <col class="col-action">
            </colgroup>
            <thead>
              <tr>
                <th scope="col" class="th-cat">
                  Danh mục
                </th>
                <th scope="col" class="th-amount text-right">
                  Số tiền ghi nhận
                </th>
                <th scope="col" class="th-status">
                  Trạng thái
                </th>
                <th scope="col" class="th-action text-right">
                  Chi tiết
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in chartData.visibleItems"
                :key="item.categoryId"
                class="category-row"
                :data-testid="`category-list-row-${item.categoryId}`"
              >
                <td class="td-cat">
                  <div class="cat-cell-content">
                    <span
                      class="color-dot"
                      :style="{ backgroundColor: item.color }"
                      aria-hidden="true"
                    />
                    <NuxtLink
                      :to="`/costs/${projectId}/categories/${item.categoryId}`"
                      class="cat-link font-medium"
                      :data-testid="`category-link-${item.categoryId}`"
                    >
                      {{ item.displayName }}
                    </NuxtLink>
                  </div>
                </td>
                <td class="font-mono">
                  <span v-if="item.hasAmount" class="amount-value font-bold">
                    {{ formatFinanceMoney(item.rawAmount, currencyCode, moneyScale) }}
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="td-status">
                  <span
                    v-if="item.isUnreconciledSubcontract"
                    class="cockpit-badge cockpit-badge--warning status-badge"
                  >
                    Chưa đối soát
                  </span>
                  <span
                    v-else-if="item.hasAmount"
                    class="cockpit-badge cockpit-badge--success status-badge"
                  >
                    Đã ghi nhận
                  </span>
                  <span
                    v-else
                    class="cockpit-badge cockpit-badge--neutral status-badge"
                  >
                    Chưa ghi nhận
                  </span>
                </td>
                <td class="td-action">
                  <NuxtLink
                    :to="`/costs/${projectId}/categories/${item.categoryId}`"
                    class="action-link"
                    :aria-label="`Xem chi tiết danh mục ${item.displayName}`"
                  >
                    <span>Xem</span>
                    <UIcon name="i-lucide-arrow-right" class="arrow-icon" aria-hidden="true" />
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 4. If no plotted items (all unavailable) -->
    <div
      v-else
      class="chart-empty-state cockpit-card"
      data-testid="chart-no-data-state"
    >
      <UIcon name="i-lucide-bar-chart-2" class="empty-icon" aria-hidden="true" />
      <p>Chưa có danh mục nào phát sinh chi phí được ghi nhận.</p>
    </div>
  </div>
</template>

<style scoped>
.cost-analysis-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.analysis-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  min-width: 0;
}

.analysis-title-area {
  flex: 1;
  min-width: 0;
}

.analysis-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.analysis-subtitle {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.45;
}

.analysis-badges-area {
  flex-shrink: 0;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  width: 100%;
  min-width: 0;
}

.chart-card {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.chart-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  min-width: 0;
  flex-shrink: 0;
}

.chart-panel-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.donut-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.donut-unreconciled-badge {
  font-size: 0.75rem;
  flex-shrink: 0;
}

.chart-canvas-wrapper {
  width: 100%;
  height: 320px;
  min-height: 320px;
  position: relative;
  min-width: 0;
}

.echarts-wrapper {
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.chart-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
}

.chart-empty-state .empty-icon {
  font-size: 2rem;
  margin-bottom: 8px;
  opacity: 0.4;
}

/* Category Summary Card */
.category-summary-card {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 0;
  overflow: hidden;
  width: 100%;
  min-width: 0;
}

.category-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface, #ffffff);
}

.category-card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.category-table-responsive {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.category-list-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 0.875rem;
}

.category-list-table th {
  padding: 12px 20px;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  background: var(--color-surface-subtle, #f8fafc);
  border-bottom: 1px solid var(--color-border);
}

.category-list-table td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
  vertical-align: middle;
  height: 56px;
  box-sizing: border-box;
}

.category-row:last-child td {
  border-bottom: none;
}

.category-row:hover td {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.015));
}

/* Proportions: ~34% / ~30% / ~20% / ~16% */
.col-cat { width: 34%; }
.col-amount { width: 30%; }
.col-status { width: 20%; }
.col-action { width: 16%; }

.th-cat, .td-cat {
  text-align: left;
}

.th-amount, .td-amount {
  text-align: right;
}

.th-status, .td-status {
  text-align: left;
}

.td-amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.amount-value {
  color: var(--color-text-primary);
}

.cat-cell-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cat-link {
  color: var(--color-text-primary);
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cat-link:hover {
  color: var(--color-primary);
  text-decoration: underline;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.action-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.825rem;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  transition: background 0.15s ease;
}

.action-link:hover {
  background: var(--color-primary-subtle, rgba(37, 99, 235, 0.08));
}

.arrow-icon {
  font-size: 0.875rem;
}

.text-muted {
  color: var(--color-text-secondary);
  opacity: 0.6;
}

@media (max-width: 960px) {
  .charts-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .chart-canvas-wrapper {
    height: 300px;
    min-height: 300px;
  }
}

@media (max-width: 640px) {
  .cost-analysis-section {
    gap: 16px;
  }
  .chart-card {
    padding: 16px;
  }
  .chart-canvas-wrapper {
    height: 280px;
    min-height: 280px;
  }

  .category-card-header {
    padding: 14px 16px;
  }

  .category-list-table,
  .category-list-table tbody {
    display: block;
    width: 100%;
  }

  .category-list-table thead {
    display: none;
  }

  .category-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "cat status"
      "amount action";
    align-items: center;
    gap: 8px 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
    height: auto;
  }

  .category-row:last-child {
    border-bottom: none;
  }

  .category-row:hover td {
    background: transparent;
  }

  .td-cat {
    grid-area: cat;
    width: 100% !important;
    padding: 0 !important;
    border: none !important;
    height: auto !important;
  }

  .td-status {
    grid-area: status;
    width: auto !important;
    padding: 0 !important;
    border: none !important;
    height: auto !important;
    text-align: right;
  }

  .td-amount {
    grid-area: amount;
    width: auto !important;
    padding: 0 !important;
    border: none !important;
    height: auto !important;
    text-align: left !important;
    font-size: 0.95rem;
  }

  .td-action {
    grid-area: action;
    width: auto !important;
    padding: 0 !important;
    border: none !important;
    height: auto !important;
    text-align: right !important;
  }
}
</style>
