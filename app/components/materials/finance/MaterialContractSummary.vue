<template>
  <section class="cockpit-card summary-card" role="region" aria-label="Hợp đồng và cam kết" data-testid="contract-summary">
    <header class="summary-head">
      <div>
        <h3 class="summary-title">Hợp đồng {{ contract.contractNo }}</h3>
        <p class="summary-sub">
          Ký ngày {{ formatDate(contract.signedOn) }} · Phiên bản hiện hành v{{ contract.currentVersionNo }}
        </p>
      </div>
      <span class="cockpit-badge cockpit-badge--primary font-mono">v{{ contract.currentVersionNo }}</span>
    </header>

    <dl class="totals">
      <div v-for="metric in metrics" :key="metric.testId" class="metric" :class="metric.tone">
        <dt>{{ metric.label }}</dt>
        <dd :data-testid="metric.testId">{{ metric.value }}</dd>
      </div>
    </dl>

    <h4 class="versions-title">Lịch sử phiên bản</h4>
    <ol class="versions" role="list">
      <li v-for="version in versionsDescending" :key="version.versionNo" class="version" :data-testid="`contract-version-${version.versionNo}`">
        <div class="version-main">
          <span class="cockpit-badge" :class="version.kind === 'original' ? 'cockpit-badge--neutral' : 'cockpit-badge--accent'">
            {{ version.kind === 'original' ? 'Hợp đồng gốc' : 'Phụ lục' }} v{{ version.versionNo }}
          </span>
          <strong class="font-mono">{{ money(version.total) }}</strong>
          <span class="version-meta">
            (trước VAT {{ money(version.subtotal) }}, VAT {{ money(version.vatAmount) }}) · {{ formatDateTime(version.recordedAt) }}
          </span>
        </div>
        <p v-if="version.reason" class="version-note">Lý do: {{ version.reason }}</p>
        <p v-if="version.varianceReason" class="version-note">Chênh lệch so với tổng đơn: {{ version.varianceReason }}</p>
        <div class="version-files">
          <button type="button" class="cockpit-btn cockpit-btn--ghost cockpit-btn--xs" :disabled="openingFile !== null" @click="openFile(version.contractFileId)">
            <UIcon name="i-lucide-file-text" aria-hidden="true" />
            {{ version.kind === 'original' ? 'Xem hợp đồng' : 'Xem phụ lục' }}
          </button>
          <button
            v-if="version.signedQuotationFileId"
            type="button"
            class="cockpit-btn cockpit-btn--ghost cockpit-btn--xs"
            :disabled="openingFile !== null"
            @click="openFile(version.signedQuotationFileId)"
          >
            <UIcon name="i-lucide-file-check" aria-hidden="true" />
            Xem báo giá đã ký
          </button>
        </div>
      </li>
    </ol>
    <p v-if="fileError" class="file-error" role="alert">{{ fileError }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import Decimal from 'decimal.js'
import type { MaterialContractView } from '../../../../shared/schemas/costs/material-finance'
import { formatMaterialQuantity } from '../../../utils/materials/quantity-display'

interface Props {
  projectId: string
  contract: MaterialContractView
}

const props = defineProps<Props>()
const repo = useRepositories().materialProcurement

let disposed = false
onBeforeUnmount(() => { disposed = true })

const openingFile = ref<string | null>(null)
const fileError = ref('')

function money(value: string) {
  return `${formatMaterialQuantity(value)} ${props.contract.currencyCode}`
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })
}

const metrics = computed(() => {
  const totals = props.contract.totals
  return [
    { testId: 'total-committed', label: 'Cam kết', value: money(totals.committed), tone: '' },
    { testId: 'total-paid', label: 'Đã chi', value: money(totals.paid), tone: '' },
    { testId: 'total-pending', label: 'Đang chờ chi', value: money(totals.pending), tone: '' },
    { testId: 'total-remaining', label: 'Còn phải trả', value: money(totals.remaining), tone: '' },
    { testId: 'total-overdue', label: 'Quá hạn', value: money(totals.overdue), tone: new Decimal(totals.overdue).greaterThan(0) ? 'metric--danger' : '' },
    { testId: 'total-invoiced', label: 'Đã nhận hóa đơn', value: money(totals.invoiced), tone: '' },
    { testId: 'total-paid-no-invoice', label: 'Đã chi chưa có hóa đơn', value: money(totals.paidWithoutInvoice), tone: '' },
  ]
})

const versionsDescending = computed(() => [...props.contract.versions].sort((a, b) => b.versionNo - a.versionNo))

async function openFile(fileId: string) {
  if (openingFile.value !== null) return
  openingFile.value = fileId
  fileError.value = ''
  try {
    const result = await repo.readEvidenceUrl(props.projectId, fileId, { disposition: 'inline' })
    if (!disposed) window.open(result.url, '_blank', 'noopener')
  }
  catch {
    if (!disposed) fileError.value = 'Không mở được tệp. Vui lòng thử lại.'
  }
  finally {
    if (!disposed) openingFile.value = null
  }
}
</script>

<style scoped>
.summary-card { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.summary-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.summary-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #0f172a; }
.summary-sub { margin: 2px 0 0; font-size: 0.82rem; color: #64748b; }
.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 0; }
.metric { padding: 10px 12px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; }
.metric dt { font-size: 0.74rem; font-weight: 600; color: #64748b; }
.metric dd { margin: 2px 0 0; font-weight: 700; font-family: var(--font-mono, ui-monospace, monospace); color: #0f172a; }
.metric--danger { background: #fef2f2; border-color: #fecaca; }
.metric--danger dd { color: #991b1b; }
.versions-title { margin: 4px 0 0; font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.versions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.version { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; }
.version-main { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.version-meta { font-size: 0.78rem; color: #64748b; }
.version-note { margin: 6px 0 0; font-size: 0.82rem; color: #334155; }
.version-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.file-error { margin: 0; font-size: 0.82rem; color: #991b1b; }
</style>
