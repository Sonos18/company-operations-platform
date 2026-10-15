<template>
  <div class="materials-finance-inbox-page p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
    <!-- Page Header -->
    <div class="cockpit-card bg-white p-5 border border-slate-200 rounded-xl shadow-xs">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="p-2.5 rounded-xl bg-sky-100 text-sky-700">
            <UIcon name="i-lucide-inbox" class="text-2xl" aria-hidden="true" />
          </div>
          <div>
            <h1 class="text-xl font-bold text-slate-900 m-0">Hộp việc tài chính vật tư</h1>
            <p class="text-xs text-slate-500 m-0 mt-0.5">
              Theo dõi và xử lý các đơn mua chờ hợp đồng, đợt thanh toán đến hạn và phê duyệt chi tiền.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <!-- Project Filter -->
          <div class="flex items-center gap-2">
            <label for="project-filter-select" class="text-xs text-slate-500 font-medium whitespace-nowrap">
              Dự án:
            </label>
            <select
              id="project-filter-select"
              v-model="selectedProjectId"
              class="cockpit-input text-xs py-1.5 px-3 min-w-[200px]"
              @change="onProjectChange"
            >
              <option value="">Tất cả dự án</option>
              <option
                v-for="proj in projects"
                :key="proj.projectId"
                :value="proj.projectId"
              >
                {{ proj.name }} ({{ proj.code }})
              </option>
            </select>
          </div>

          <!-- Reload Button -->
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm flex items-center gap-1.5"
            :disabled="isLoading"
            @click="loadInbox"
          >
            <UIcon v-if="isLoading" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
            <span>Làm mới dữ liệu</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Error Banner -->
    <div v-if="loadError" class="cockpit-alert cockpit-alert--danger" role="alert">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
          <p class="text-xs font-semibold text-rose-900 m-0">{{ loadError }}</p>
        </div>
        <button
          type="button"
          class="text-rose-600 hover:text-rose-800 text-xs p-1"
          aria-label="Đóng thông báo"
          @click="loadError = ''"
        >
          <UIcon name="i-lucide-x" class="text-sm" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Permission Notice if no tabs visible -->
    <div
      v-if="availableTabs.length === 0"
      class="cockpit-card p-8 text-center bg-slate-50 border border-slate-200 rounded-xl"
    >
      <UIcon name="i-lucide-shield-alert" class="text-amber-500 text-3xl mx-auto mb-2" aria-hidden="true" />
      <h3 class="text-sm font-bold text-slate-800 m-0">Không có quyền truy cập hộp việc</h3>
      <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
        Tài khoản của bạn cần có quyền kế toán (material.payment.request) hoặc thủ quỹ (material.payment.approve / material.payment.execute) để xem các tác vụ hộp việc.
      </p>
    </div>

    <!-- Main Content Card with Tabs -->
    <div v-else class="cockpit-card bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <!-- Tabs Header Navigation -->
      <div class="border-b border-slate-200 bg-slate-50/70 px-4 pt-3 flex items-center gap-2 overflow-x-auto" role="tablist" aria-label="Nhóm công việc tài chính vật tư">
        <button
          v-for="tab in availableTabs"
          :id="'finance-tab-' + tab.key"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          aria-controls="finance-tab-panel"
          class="pb-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer -mb-px"
          :class="activeTab === tab.key
            ? 'border-sky-600 text-sky-700 bg-white rounded-t-lg'
            : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'"
          @click="activeTab = tab.key"
        >
          <span>{{ tab.label }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
            :class="activeTab === tab.key ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-600'"
          >
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div
        id="finance-tab-panel"
        class="p-4 sm:p-5"
        role="tabpanel"
        :aria-labelledby="'finance-tab-' + activeTab"
        :aria-busy="isLoading"
      >
        <div v-if="isLoading && !inboxData" class="py-12 text-center text-slate-400 text-xs">
          <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl mx-auto mb-2 text-sky-600" aria-hidden="true" />
          <p class="m-0">Đang tải dữ liệu hộp việc...</p>
        </div>

        <template v-else>
          <!-- TAB 1: Đơn chờ hợp đồng (awaitingContract) -->
          <div v-if="activeTab === 'awaitingContract'">
            <div
              v-if="!inboxData?.awaitingContract || inboxData.awaitingContract.length === 0"
              class="py-10 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200"
            >
              <UIcon name="i-lucide-file-check-2" class="text-slate-400 text-3xl mx-auto mb-2" aria-hidden="true" />
              <p class="font-medium text-xs m-0">Không có đơn mua nào đang chờ ký hợp đồng.</p>
              <p class="text-[11px] text-slate-400 m-0 mt-0.5">Tất cả các đơn mua hiện tại đã được ghi nhận hợp đồng hoặc chưa phát sinh.</p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="cockpit-table w-full text-left text-xs border border-slate-200 rounded-lg">
                <caption class="sr-only">{{ activeTabLabel }}</caption>
                <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" class="p-2.5">Mã đơn mua</th>
                    <th scope="col" class="p-2.5">Dự án</th>
                    <th scope="col" class="p-2.5">Nhà cung cấp</th>
                    <th scope="col" class="p-2.5 text-right">Tổng tiền đơn mua</th>
                    <th scope="col" class="p-2.5">Ngày tạo đơn</th>
                    <th scope="col" class="p-2.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr v-for="row in inboxData.awaitingContract" :key="row.orderId" class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-mono text-slate-800">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="text-sky-600 hover:text-sky-800 hover:underline font-semibold"
                      >
                        {{ row.orderId.slice(0, 8) }}...
                      </NuxtLink>
                    </td>
                    <td class="p-2.5 font-medium text-slate-800">
                      {{ row.projectName }}
                    </td>
                    <td class="p-2.5 text-slate-700">
                      {{ row.supplierName }}
                    </td>
                    <td class="p-2.5 font-mono font-bold text-right text-slate-900">
                      {{ formatMoney(row.orderSubtotal) }}
                    </td>
                    <td class="p-2.5 text-slate-600">
                      {{ formatDateTime(row.createdAt) }}
                    </td>
                    <td class="p-2.5 text-center">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="cockpit-btn cockpit-btn--secondary btn-sm text-[11px] inline-flex items-center gap-1 py-1 px-2.5"
                      >
                        <span>Mở đơn hàng</span>
                        <UIcon name="i-lucide-arrow-right" class="text-xs" aria-hidden="true" />
                      </NuxtLink>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 2: Đợt sắp/quá hạn (dueInstallments) -->
          <div v-else-if="activeTab === 'dueInstallments'">
            <div
              v-if="!inboxData?.dueInstallments || inboxData.dueInstallments.length === 0"
              class="py-10 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200"
            >
              <UIcon name="i-lucide-calendar-check" class="text-slate-400 text-3xl mx-auto mb-2" aria-hidden="true" />
              <p class="font-medium text-xs m-0">Không có đợt thanh toán nào sắp hoặc quá hạn.</p>
              <p class="text-[11px] text-slate-400 m-0 mt-0.5">Tất cả các đợt thanh toán đều đã được chi đúng hạn hoặc chưa đến kỳ hạn.</p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="cockpit-table w-full text-left text-xs border border-slate-200 rounded-lg">
                <caption class="sr-only">{{ activeTabLabel }}</caption>
                <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" class="p-2.5">Đợt thanh toán</th>
                    <th scope="col" class="p-2.5">Dự án</th>
                    <th scope="col" class="p-2.5">Nhà cung cấp</th>
                    <th scope="col" class="p-2.5">Hạn thanh toán</th>
                    <th scope="col" class="p-2.5 text-right">Số tiền còn lại</th>
                    <th scope="col" class="p-2.5 text-center">Tình trạng hạn</th>
                    <th scope="col" class="p-2.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr v-for="row in inboxData.dueInstallments" :key="row.installmentKey" class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-semibold text-slate-900">
                      {{ row.name }}
                      <div class="text-[10px] text-slate-400 font-mono">
                        Đơn: {{ row.orderId.slice(0, 8) }}...
                      </div>
                    </td>
                    <td class="p-2.5 font-medium text-slate-800">
                      {{ row.projectName }}
                    </td>
                    <td class="p-2.5 text-slate-700">
                      {{ row.supplierName }}
                    </td>
                    <td class="p-2.5 font-mono text-slate-700">
                      {{ formatDate(row.dueOn) }}
                    </td>
                    <td class="p-2.5 font-mono font-bold text-right text-slate-900">
                      {{ formatMoney(row.remaining) }}
                    </td>
                    <td class="p-2.5 text-center">
                      <span
                        class="cockpit-badge text-[11px] font-semibold"
                        :class="row.dueStatus === 'overdue' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'"
                      >
                        {{ row.dueStatus === 'overdue' ? 'Quá hạn' : 'Sắp đến hạn' }}
                      </span>
                    </td>
                    <td class="p-2.5 text-center">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="cockpit-btn cockpit-btn--secondary btn-sm text-[11px] inline-flex items-center gap-1 py-1 px-2.5"
                      >
                        <span>Mở đơn hàng</span>
                        <UIcon name="i-lucide-arrow-right" class="text-xs" aria-hidden="true" />
                      </NuxtLink>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 3: Đề nghị bị trả lại (returnedRequests) -->
          <div v-else-if="activeTab === 'returnedRequests'">
            <div
              v-if="!inboxData?.returnedRequests || inboxData.returnedRequests.length === 0"
              class="py-10 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200"
            >
              <UIcon name="i-lucide-check-circle-2" class="text-slate-400 text-3xl mx-auto mb-2" aria-hidden="true" />
              <p class="font-medium text-xs m-0">Không có đề nghị chi nào bị trả lại.</p>
              <p class="text-[11px] text-slate-400 m-0 mt-0.5">Các đề nghị thanh toán gửi đi đều đang chờ duyệt hoặc đã được phê duyệt.</p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="cockpit-table w-full text-left text-xs border border-slate-200 rounded-lg">
                <caption class="sr-only">{{ activeTabLabel }}</caption>
                <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" class="p-2.5">Mã đề nghị</th>
                    <th scope="col" class="p-2.5">Dự án</th>
                    <th scope="col" class="p-2.5">Nhà cung cấp</th>
                    <th scope="col" class="p-2.5 text-right">Số tiền đề nghị</th>
                    <th scope="col" class="p-2.5">Lý do trả lại của thủ quỹ</th>
                    <th scope="col" class="p-2.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr v-for="row in inboxData.returnedRequests" :key="row.requestId" class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-mono text-slate-800">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="text-sky-600 hover:text-sky-800 hover:underline font-semibold"
                      >
                        {{ row.requestId.slice(0, 8) }}...
                      </NuxtLink>
                    </td>
                    <td class="p-2.5 font-medium text-slate-800">
                      {{ row.projectName }}
                    </td>
                    <td class="p-2.5 text-slate-700">
                      {{ row.supplierName }}
                    </td>
                    <td class="p-2.5 font-mono font-bold text-right text-slate-900">
                      {{ formatMoney(row.amount) }}
                    </td>
                    <td class="p-2.5 text-rose-700 italic">
                      "{{ row.reason }}"
                    </td>
                    <td class="p-2.5 text-center">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="cockpit-btn cockpit-btn--secondary btn-sm text-[11px] inline-flex items-center gap-1 py-1 px-2.5"
                      >
                        <span>Sửa & gửi lại</span>
                        <UIcon name="i-lucide-arrow-right" class="text-xs" aria-hidden="true" />
                      </NuxtLink>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 4: Chờ duyệt (pendingApproval) -->
          <div v-else-if="activeTab === 'pendingApproval'">
            <div
              v-if="!inboxData?.pendingApproval || inboxData.pendingApproval.length === 0"
              class="py-10 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200"
            >
              <UIcon name="i-lucide-clock-check" class="text-slate-400 text-3xl mx-auto mb-2" aria-hidden="true" />
              <p class="font-medium text-xs m-0">Không có đề nghị chi nào đang chờ thủ quỹ duyệt.</p>
              <p class="text-[11px] text-slate-400 m-0 mt-0.5">Tất cả đề nghị chi gửi đến đều đã được duyệt hoặc xử lý xong.</p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="cockpit-table w-full text-left text-xs border border-slate-200 rounded-lg">
                <caption class="sr-only">{{ activeTabLabel }}</caption>
                <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" class="p-2.5">Mã đề nghị</th>
                    <th scope="col" class="p-2.5">Dự án</th>
                    <th scope="col" class="p-2.5">Nhà cung cấp</th>
                    <th scope="col" class="p-2.5 text-right">Số tiền đề nghị</th>
                    <th scope="col" class="p-2.5">Người gửi</th>
                    <th scope="col" class="p-2.5">Thời gian gửi</th>
                    <th scope="col" class="p-2.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr v-for="row in inboxData.pendingApproval" :key="row.requestId" class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-mono text-slate-800">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="text-sky-600 hover:text-sky-800 hover:underline font-semibold"
                      >
                        {{ row.requestId.slice(0, 8) }}...
                      </NuxtLink>
                    </td>
                    <td class="p-2.5 font-medium text-slate-800">
                      {{ row.projectName }}
                    </td>
                    <td class="p-2.5 text-slate-700">
                      {{ row.supplierName }}
                    </td>
                    <td class="p-2.5 font-mono font-bold text-right text-slate-900">
                      {{ formatMoney(row.amount) }}
                    </td>
                    <td class="p-2.5 font-mono text-[11px] text-slate-600">
                      {{ row.submittedBy.slice(0, 8) }}...
                    </td>
                    <td class="p-2.5 text-slate-600">
                      {{ formatDateTime(row.submittedAt) }}
                    </td>
                    <td class="p-2.5 text-center">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="cockpit-btn cockpit-btn--primary btn-sm text-[11px] inline-flex items-center gap-1 py-1 px-2.5"
                      >
                        <span>Xét duyệt</span>
                        <UIcon name="i-lucide-arrow-right" class="text-xs" aria-hidden="true" />
                      </NuxtLink>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 5: Đã duyệt – chờ chi (approvedAwaitingPayment) -->
          <div v-else-if="activeTab === 'approvedAwaitingPayment'">
            <div
              v-if="!inboxData?.approvedAwaitingPayment || inboxData.approvedAwaitingPayment.length === 0"
              class="py-10 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200"
            >
              <UIcon name="i-lucide-check-check" class="text-slate-400 text-3xl mx-auto mb-2" aria-hidden="true" />
              <p class="font-medium text-xs m-0">Không có đề nghị chi nào đã duyệt đang chờ chi tiền.</p>
              <p class="text-[11px] text-slate-400 m-0 mt-0.5">Tất cả đề nghị chi được duyệt đều đã hoàn tất chuyển khoản và có ủy nhiệm chi.</p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="cockpit-table w-full text-left text-xs border border-slate-200 rounded-lg">
                <caption class="sr-only">{{ activeTabLabel }}</caption>
                <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" class="p-2.5">Mã đề nghị</th>
                    <th scope="col" class="p-2.5">Dự án</th>
                    <th scope="col" class="p-2.5">Nhà cung cấp</th>
                    <th scope="col" class="p-2.5 text-right">Số tiền cần chi</th>
                    <th scope="col" class="p-2.5">Thời gian duyệt</th>
                    <th scope="col" class="p-2.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr v-for="row in inboxData.approvedAwaitingPayment" :key="row.requestId" class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-mono text-slate-800">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="text-sky-600 hover:text-sky-800 hover:underline font-semibold"
                      >
                        {{ row.requestId.slice(0, 8) }}...
                      </NuxtLink>
                    </td>
                    <td class="p-2.5 font-medium text-slate-800">
                      {{ row.projectName }}
                    </td>
                    <td class="p-2.5 text-slate-700">
                      {{ row.supplierName }}
                    </td>
                    <td class="p-2.5 font-mono font-bold text-right text-emerald-800">
                      {{ formatMoney(row.amount) }}
                    </td>
                    <td class="p-2.5 text-slate-600">
                      {{ formatDateTime(row.approvedAt) }}
                    </td>
                    <td class="p-2.5 text-center">
                      <NuxtLink
                        :to="`/materials/${row.projectId}/orders/${row.orderId}`"
                        class="cockpit-btn bg-emerald-600 hover:bg-emerald-700 text-white btn-sm text-[11px] inline-flex items-center gap-1 py-1 px-2.5"
                      >
                        <span>Ghi nhận chi</span>
                        <UIcon name="i-lucide-arrow-right" class="text-xs" aria-hidden="true" />
                      </NuxtLink>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type {
  MaterialFinanceInbox,
} from '../../../../shared/schemas/costs/material-finance'
import type {
  MaterialProjectOption,
} from '../../../../shared/schemas/costs/material-procurement'
import {
  financeErrorMessage,
  formatDate,
  formatDateTime,
  formatMoney,
} from '../../../utils/materials/finance-ui'

definePageMeta({
  requiredPermission: 'material.read',
})

const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const repositories = useRepositories()
const financeRepo = repositories.materialFinance
const procurementRepo = repositories.materialProcurement

const projects = ref<MaterialProjectOption[]>([])
const selectedProjectId = ref<string>('')
const inboxData = ref<MaterialFinanceInbox | null>(null)
const isLoading = ref(false)
const loadError = ref('')
const activeTab = ref<string>('')

const canAccounting = computed(() => {
  return Boolean(companyAccess?.hasPermission('material.payment.request'))
})

const canTreasurer = computed(() => {
  return Boolean(
    companyAccess?.hasPermission('material.payment.approve') ||
    companyAccess?.hasPermission('material.payment.execute')
  )
})

interface TabItem {
  key: string
  label: string
  count: number
}

const availableTabs = computed<TabItem[]>(() => {
  const tabs: TabItem[] = []
  if (canAccounting.value) {
    tabs.push(
      {
        key: 'awaitingContract',
        label: 'Đơn chờ hợp đồng',
        count: inboxData.value?.awaitingContract?.length ?? 0,
      },
      {
        key: 'dueInstallments',
        label: 'Đợt sắp/quá hạn',
        count: inboxData.value?.dueInstallments?.length ?? 0,
      },
      {
        key: 'returnedRequests',
        label: 'Đề nghị bị trả lại',
        count: inboxData.value?.returnedRequests?.length ?? 0,
      }
    )
  }
  if (canTreasurer.value) {
    tabs.push(
      {
        key: 'pendingApproval',
        label: 'Chờ duyệt',
        count: inboxData.value?.pendingApproval?.length ?? 0,
      },
      {
        key: 'approvedAwaitingPayment',
        label: 'Đã duyệt – chờ chi',
        count: inboxData.value?.approvedAwaitingPayment?.length ?? 0,
      }
    )
  }
  return tabs
})

const activeTabLabel = computed(() => availableTabs.value.find(t => t.key === activeTab.value)?.label ?? '')

// Auto-select first available tab if current activeTab is not valid
watch(
  availableTabs,
  newTabs => {
    if (newTabs.length > 0 && (!activeTab.value || !newTabs.some(t => t.key === activeTab.value))) {
      activeTab.value = newTabs[0]!.key
    }
  },
  { immediate: true }
)

async function loadProjects() {
  try {
    projects.value = await procurementRepo.listProjects()
  }
  catch {
    projects.value = []
  }
}

// Only the newest request may update the page, so a slow response for a previously
// selected project cannot overwrite the current one.
let latestLoad = 0

async function loadInbox() {
  const loadId = ++latestLoad
  isLoading.value = true
  loadError.value = ''
  try {
    const projId = selectedProjectId.value || undefined
    const result = await financeRepo.inbox(projId)
    if (loadId !== latestLoad) return
    inboxData.value = result
  }
  catch (err: unknown) {
    if (loadId !== latestLoad) return
    loadError.value = financeErrorMessage(err, 'Chưa tải được dữ liệu hộp việc tài chính vật tư.')
  }
  finally {
    if (loadId === latestLoad) isLoading.value = false
  }
}

function onProjectChange() {
  inboxData.value = null
  void loadInbox()
}

onMounted(() => {
  void loadProjects()
  void loadInbox()
})
</script>
