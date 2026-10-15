<template>
  <div class="order-page">
    <header class="cockpit-card page-header">
      <NuxtLink v-if="order" :to="`/materials/${pId}/proposals/${order.proposalId}`" class="back-link">
        ← Quay lại phiếu yêu cầu
      </NuxtLink>
      <NuxtLink v-else :to="`/materials/${pId}/proposals`" class="back-link">
        ← Quay lại danh sách phiếu yêu cầu
      </NuxtLink>
      <div class="title-row">
        <h2>Đơn mua vật tư</h2>
        <span v-if="order" class="cockpit-badge" :class="orderStateBadge(order.orderState).badge">
          {{ orderStateBadge(order.orderState).label }}
        </span>
        <span
          v-if="order && order.contract"
          class="cockpit-badge cockpit-badge--success"
          data-testid="contract-status-badge"
        >
          Đã có hợp đồng
        </span>
        <span v-else-if="order" class="cockpit-badge cockpit-badge--warning" data-testid="contract-status-badge">
          Chưa có hợp đồng
        </span>
      </div>
      <p class="subtitle">
        Mã đơn: <span class="font-mono">{{ oId }}</span>
      </p>
    </header>

    <div v-if="loadError" class="alert alert--danger" role="alert">
      {{ loadError }}
      <button type="button" class="link-btn" :disabled="isLoading" @click="reload">Tải lại</button>
    </div>

    <div v-if="isLoading && !order" class="cockpit-card loading-card">Đang tải thông tin đơn mua...</div>

    <template v-if="order">
      <section class="cockpit-card info-card" aria-label="Thông tin đơn mua">
        <h3 class="section-title">Thông tin đơn</h3>
        <dl class="info-grid">
          <div>
            <dt>Nhà cung cấp</dt>
            <dd>{{ order.supplierName }}</dd>
          </div>
          <div>
            <dt>Tiền tệ</dt>
            <dd class="font-mono">{{ order.currencyCode }}</dd>
          </div>
          <div>
            <dt>Tổng đơn (chưa VAT)</dt>
            <dd class="font-mono" data-testid="order-total">{{ money(orderSubtotal) }}</dd>
          </div>
        </dl>

        <div class="table-scroll">
          <table class="lines" aria-label="Các dòng của đơn mua">
            <thead>
              <tr>
                <th scope="col">STT</th>
                <th scope="col">Vật tư</th>
                <th scope="col">Quy cách</th>
                <th scope="col">Đơn vị</th>
                <th scope="col" class="num">Số lượng</th>
                <th scope="col" class="num">Đơn giá</th>
                <th scope="col" class="num">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, index) in order.allocations" :key="line.orderLineId">
                <td>{{ index + 1 }}</td>
                <td class="strong">{{ line.materialName }}</td>
                <td>{{ line.specification }}</td>
                <td>{{ line.unit }}</td>
                <td class="num">{{ formatMaterialQuantity(line.quantity) }}</td>
                <td class="num">{{ formatMaterialQuantity(line.unitPrice) }}</td>
                <td class="num">{{ lineTotal(line.quantity, line.unitPrice) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Finance hidden: the user cannot read finance data, only the contract status is shown. -->
      <section
        v-if="order.contract && financeHidden"
        class="cockpit-card info-card"
        aria-label="Trạng thái hợp đồng"
        data-testid="contract-status-only"
      >
        <p class="status-line">
          Đã có hợp đồng <strong>{{ order.contract.contractNo }}</strong> ngày {{ formatDate(order.contract.signedOn) }}.
        </p>
      </section>

      <section v-else-if="!order.contract && !canRecordContract" class="cockpit-card info-card" aria-label="Trạng thái hợp đồng">
        <p class="status-line">Đơn này chưa có hợp đồng. Kế toán sẽ ghi nhận hợp đồng sau khi ký với nhà cung cấp.</p>
      </section>

      <p v-if="!order.contract && order.orderState !== 'active' && canRecordContract" class="alert alert--info" role="status">
        Đơn không còn ở trạng thái hoạt động nên không thể ghi hợp đồng.
      </p>

      <MaterialContractRecordPanel
        v-if="showRecordPanel"
        :key="order.id"
        :company-id="companyId"
        :project-id="pId"
        :order="order"
        @refresh="reload"
      />

      <template v-if="contract && !financeHidden">
        <MaterialContractSummary :project-id="pId" :contract="contract" />
        <MaterialInstallmentTable :installments="contract.installments" :currency-code="contract.currencyCode" />

        <MaterialContractAmendPanel
          v-if="canRecordContract && order.orderState !== 'cancelled'"
          :key="`${contract.id}:${contract.version}`"
          :company-id="companyId"
          :project-id="pId"
          :contract="contract"
          @refresh="reload"
        />

        <slot name="invoices" />
        <slot name="payment-requests" />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Decimal from 'decimal.js'
import type { MaterialOrderState, MaterialOrderView } from '../../../../../shared/schemas/costs/material-procurement'
import type { MaterialContractView } from '../../../../../shared/schemas/costs/material-finance'
import { workflowUuidSchema } from '../../../../../shared/schemas/costs/cost-workflow'
import { ClientError } from '../../../../errors/client-error'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import { formatMaterialQuantity } from '../../../../utils/materials/quantity-display'
import MaterialContractRecordPanel from '../../../../components/materials/finance/MaterialContractRecordPanel.vue'
import MaterialContractSummary from '../../../../components/materials/finance/MaterialContractSummary.vue'
import MaterialInstallmentTable from '../../../../components/materials/finance/MaterialInstallmentTable.vue'
import MaterialContractAmendPanel from '../../../../components/materials/finance/MaterialContractAmendPanel.vue'

definePageMeta({ requiredPermission: 'material.read' })

const route = useRoute()
const repositories = useRepositories()
const procurementRepo = repositories.materialProcurement
const financeRepo = repositories.materialFinance
const companyAccess = useNuxtApp().$companyAccessStore

function routeUuid(value: string | string[] | undefined) {
  const text = Array.isArray(value) ? (value[0] ?? '') : String(value ?? '')
  return workflowUuidSchema.safeParse(text).success ? text : ''
}

const pId = computed(() => routeUuid(route.params.projectId))
const oId = computed(() => routeUuid(route.params.orderId))
const companyId = computed(() => companyAccess?.activeCompanyId ?? '')

const order = ref<MaterialOrderView | null>(null)
const contract = ref<MaterialContractView | null>(null)
const financeHidden = ref(false)
const isLoading = ref(false)
const loadError = ref('')

const tracker = createAsyncRequestTracker<{ companyId: string, projectId: string, orderId: string }>()
onBeforeUnmount(() => tracker.invalidate())

const canRecordContract = computed(() => Boolean(companyAccess?.hasPermission('material.contract.record')))
const showRecordPanel = computed(() => Boolean(
  order.value && order.value.contract === null && order.value.orderState === 'active'
  && canRecordContract.value && companyId.value,
))

const orderSubtotal = computed(() => (order.value?.allocations ?? [])
  .reduce((acc, line) => acc.plus(new Decimal(line.quantity).times(line.unitPrice)), new Decimal(0))
  .toDecimalPlaces(4, Decimal.ROUND_HALF_UP))

function money(value: Decimal) {
  return `${formatMaterialQuantity(value.toFixed(4))} ${order.value?.currencyCode ?? ''}`.trim()
}

function lineTotal(quantity: string, unitPrice: string) {
  return formatMaterialQuantity(new Decimal(quantity).times(unitPrice).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4))
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function orderStateBadge(state: MaterialOrderState) {
  switch (state) {
    case 'active': return { label: 'Đang hoạt động', badge: 'cockpit-badge--success' }
    case 'suspended': return { label: 'Tạm dừng', badge: 'cockpit-badge--warning' }
    default: return { label: 'Đã hủy', badge: 'cockpit-badge--danger' }
  }
}

function isFinanceDenied(err: unknown) {
  return err instanceof ClientError && (err.kind === 'authorization' || err.code === 'PERMISSION_DENIED')
}

async function reload() {
  if (!pId.value || !oId.value || !companyId.value) return
  const token = tracker.start({ companyId: companyId.value, projectId: pId.value, orderId: oId.value })
  isLoading.value = true
  loadError.value = ''
  try {
    const loadedOrder = await procurementRepo.readOrder(pId.value, oId.value)
    if (!token.isCurrent()) return
    let loadedContract: MaterialContractView | null = null
    let hidden = false
    if (loadedOrder.contract) {
      try {
        loadedContract = await financeRepo.readContract(pId.value, oId.value)
      }
      catch (err: unknown) {
        if (!isFinanceDenied(err)) throw err
        hidden = true
      }
      if (!token.isCurrent()) return
      if (loadedContract === null) hidden = true
    }
    order.value = loadedOrder
    contract.value = loadedContract
    financeHidden.value = hidden
  }
  catch (err: unknown) {
    if (!token.isCurrent()) return
    loadError.value = err instanceof Error && err.message
      ? err.message
      : 'Không tải được thông tin đơn mua.'
  }
  finally {
    if (token.isCurrent()) isLoading.value = false
  }
}

watch([pId, oId, companyId], () => {
  order.value = null
  contract.value = null
  financeHidden.value = false
  void reload()
}, { immediate: true })
</script>

<style scoped>
.order-page { padding: 16px; display: flex; flex-direction: column; gap: 16px; max-width: 1280px; margin: 0 auto; }
.page-header { padding: 20px; }
.back-link { display: inline-block; margin-bottom: 8px; font-size: 0.82rem; font-weight: 600; color: #0284c7; text-decoration: none; }
.back-link:hover { text-decoration: underline; }
.title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.title-row h2 { margin: 0; font-size: 1.25rem; font-weight: 700; color: #0f172a; }
.subtitle { margin: 6px 0 0; font-size: 0.84rem; color: #64748b; }
.alert { padding: 12px 16px; border-radius: 8px; font-size: 0.88rem; }
.alert--danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.alert--info { background: #f0f9ff; color: #0369a1; border: 1px solid #bae6fd; }
.link-btn { margin-left: 8px; background: none; border: 0; padding: 0; color: #0369a1; font-weight: 600; cursor: pointer; text-decoration: underline; }
.loading-card { padding: 32px 20px; text-align: center; color: #64748b; }
.info-card { padding: 20px; }
.section-title { margin: 0 0 14px; font-size: 1.05rem; font-weight: 700; color: #0f172a; }
.info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 0 0 16px; }
.info-grid dt { font-size: 0.76rem; font-weight: 600; color: #64748b; }
.info-grid dd { margin: 2px 0 0; font-weight: 600; color: #0f172a; }
.table-scroll { overflow-x: auto; }
.lines { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.lines th, .lines td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
.lines thead th { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
.lines .num { text-align: right; font-family: var(--font-mono, ui-monospace, monospace); white-space: nowrap; }
.lines .strong { font-weight: 600; color: #0f172a; }
.status-line { margin: 0; font-size: 0.92rem; color: #0f172a; }
</style>
