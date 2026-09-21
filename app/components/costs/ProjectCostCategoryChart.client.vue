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
        fontSize: 12,
        fontWeight: 500,
        color: '#334155',
        interval: 0,
        lineHeight: 16,
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
        padding: [0, 0, 8, 0],
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
  <div class="category-chart-container cockpit-card" data-testid="category-chart-wrapper">
    <div class="chart-header">
      <div class="chart-title-area">
        <h2 class="chart-title" data-testid="category-chart-title">
          Chi phí & Chi/ứng theo danh mục
        </h2>
        <p class="chart-subtitle">
          So sánh các khoản chi phí và chi/ứng đã ghi nhận. Nhấp vào cột hoặc lát bánh để xem chi tiết hạng mục.
        </p>
      </div>
      <div class="chart-badges-area">
        <span
          v-if="chartData.visibleItems.length > 0"
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
      class="chart-empty-state"
      data-testid="chart-all-zero-state"
    >
      <UIcon name="i-lucide-circle-slash" class="empty-icon" aria-hidden="true" />
      <p>Chưa có danh mục chi phí khác 0.</p>
    </div>

    <!-- 2. Dual-chart visualization: Vertical column + Donut chart -->
    <div
      v-else-if="chartData.visibleItems.length > 0"
      class="dual-chart-grid"
      data-testid="dual-chart-grid"
    >
      <div class="chart-col vertical-chart-col" data-testid="category-chart-canvas">
        <h3 class="chart-panel-title">
          Số tiền theo danh mục
        </h3>
        <div class="chart-canvas-wrapper">
          <VChart
            :option="chartOption"
            autoresize
            class="echarts-wrapper"
            @click="handleChartClick"
          />
        </div>
      </div>

      <div class="chart-col donut-chart-col" data-testid="category-donut-canvas">
        <div class="donut-title-row">
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

    <!-- 3. If no plotted items (all unavailable) -->
    <div
      v-else
      class="chart-empty-state"
      data-testid="chart-no-data-state"
    >
      <UIcon name="i-lucide-bar-chart-2" class="empty-icon" aria-hidden="true" />
      <p>Chưa có danh mục nào phát sinh chi phí được ghi nhận.</p>
    </div>

    <!-- Accessible summary table and keyboard navigation -->
    <div
      v-if="!chartData.allAreExactZero && chartData.visibleItems.length > 0"
      class="accessible-category-section"
    >
      <h3 class="accessible-table-title sr-only">
        Bảng chi tiết các danh mục chi phí
      </h3>
      <div class="category-table-responsive" tabindex="0" aria-label="Danh sách danh mục chi phí dự án">
        <table class="category-list-table">
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
              <td class="td-amount text-right font-mono">
                <span v-if="item.hasAmount" class="font-bold">
                  {{ formatFinanceMoney(item.rawAmount, currencyCode, moneyScale) }}
                </span>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="td-status">
                <span
                  v-if="item.isUnreconciledSubcontract"
                  class="cockpit-badge cockpit-badge--warning"
                >
                  Chưa đối soát
                </span>
                <span
                  v-else-if="item.hasAmount"
                  class="cockpit-badge cockpit-badge--success"
                >
                  Đã ghi nhận
                </span>
                <span
                  v-else
                  class="cockpit-badge cockpit-badge--neutral"
                >
                  Chưa ghi nhận
                </span>
              </td>
              <td class="td-action text-right">
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
  </div>
</template>

<style scoped>
.category-chart-container {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 24px;
  margin-top: 24px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  min-width: 0;
}

.chart-title-area {
  flex: 1;
  min-width: 0;
}

.chart-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.chart-subtitle {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.45;
}

.dual-chart-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 20px;
  margin-bottom: 24px;
  min-width: 0;
}

.chart-col {
  background: var(--color-surface-subtle, #f8fafc);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.chart-panel-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.donut-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  min-width: 0;
}

.donut-title-row .chart-panel-title {
  margin-bottom: 0;
}

.donut-unreconciled-badge {
  font-size: 0.75rem;
  flex-shrink: 0;
}

.chart-canvas-wrapper {
  width: 100%;
  height: 320px;
  position: relative;
  min-width: 0;
  overflow: hidden;
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
  background: var(--color-surface-subtle, #f8fafc);
  border-radius: var(--radius-md, 8px);
  margin-bottom: 24px;
}

.chart-empty-state .empty-icon {
  font-size: 2rem;
  margin-bottom: 8px;
  opacity: 0.4;
}

.accessible-category-section {
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}

.category-table-responsive {
  width: 100%;
  overflow-x: auto;
}

.category-list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.category-list-table th {
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

.category-list-table td {
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.category-row:hover {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.02));
}

.cat-cell-content {
  display: flex;
  align-items: center;
  gap: 10px;
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
}

.cat-link:hover {
  color: var(--color-primary);
  text-decoration: underline;
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

@media (max-width: 900px) {
  .dual-chart-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .chart-canvas-wrapper {
    height: 280px;
  }
}

@media (max-width: 640px) {
  .category-chart-container {
    padding: 16px;
  }
}
</style>
