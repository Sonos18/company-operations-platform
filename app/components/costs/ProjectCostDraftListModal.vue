<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { ProjectCostDraft, ProjectCostOperationalDraft } from '../../../shared/schemas/costs/project-costs'
import type { FinanceCategoryRow } from '../../../shared/schemas/costs/project-finance'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import { formatFinanceMoney } from '../../utils/costs/finance-display'

const props = withDefaults(defineProps<{
  open: boolean
  projectId: string
  categories?: FinanceCategoryRow[]
}>(), {
  categories: () => [],
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'open-create': []
}>()

const router = useRouter()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore

const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))
const canManage = computed(() => companyAccess.hasPermission('cost.manage'))

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val),
})

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const financialDrafts = ref<ProjectCostDraft[]>([])
const operationalDrafts = ref<ProjectCostOperationalDraft[]>([])
const draftRequests = createAsyncRequestTracker<{
  companyId: string
  projectId: string
  canPrepare: boolean
  canManage: boolean
}>()

watch(() => companyAccess.activeCompanyId, () => {
  draftRequests.invalidate()
  financialDrafts.value = []
  operationalDrafts.value = []
  loading.value = false
  errorMessage.value = null
  isOpen.value = false
}, { flush: 'sync' })

const categoryMap = computed(() => {
  const map = new Map<string, FinanceCategoryRow>()
  for (const c of props.categories) {
    map.set(c.categoryId, c)
  }
  return map
})

async function fetchDrafts() {
  const request = draftRequests.start({
    companyId: companyAccess.activeCompanyId ?? '',
    projectId: props.projectId,
    canPrepare: canPrepare.value,
    canManage: canManage.value,
  })

  financialDrafts.value = []
  operationalDrafts.value = []
  errorMessage.value = null
  if (!request.identity.projectId || (!request.identity.canPrepare && !request.identity.canManage)) {
    loading.value = false
    return
  }

  loading.value = true

  try {
    if (request.identity.canPrepare) {
      const nextDrafts = await repositories.projectCosts.listDrafts(request.identity.projectId)
      if (!request.isCurrent()) return
      financialDrafts.value = nextDrafts
    }
    else if (request.identity.canManage) {
      const nextDrafts = await repositories.projectCosts.listOperationalDrafts(request.identity.projectId)
      if (!request.isCurrent()) return
      operationalDrafts.value = nextDrafts
    }
  }
  catch (err: unknown) {
    if (!request.isCurrent()) return
    errorMessage.value = extractErrorMessage(err, 'Không thể tải danh sách bản nháp.')
  }
  finally {
    if (request.isCurrent()) loading.value = false
  }
}

watch([
  () => props.open,
  () => props.projectId,
  () => canPrepare.value,
  () => canManage.value,
], ([open]) => {
  if (open) {
    fetchDrafts()
  }
  else {
    draftRequests.invalidate()
    loading.value = false
  }
})

onUnmounted(() => draftRequests.invalidate())

function getCategoryName(categoryId: string | null): string {
  if (!categoryId) return 'Chưa phân loại'
  const cat = categoryMap.value.get(categoryId)
  return cat ? `${cat.name} (${cat.code})` : categoryId
}

function openDraft(draftId: string) {
  isOpen.value = false
  router.push(`/costs/${props.projectId}/drafts/${draftId}`)
}

defineExpose({
  refresh: fetchDrafts,
})
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Danh sách bản nháp chi phí"
    description="Quản lý và theo dõi các bản nháp chi phí dự án đang được chuẩn bị."
  >
    <template #body>
      <div class="space-y-4" data-testid="draft-list-modal">
        <!-- Header Actions -->
        <div class="flex items-center justify-between">
          <div class="text-xs text-gray-500">
            Chế độ xem:
            <span v-if="canPrepare" class="font-semibold text-primary-600">Tài chính (cost.prepare)</span>
            <span v-else-if="canManage" class="font-semibold text-amber-600">Vận hành (cost.manage)</span>
          </div>

          <div class="flex gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :loading="loading"
              @click="fetchDrafts"
            >
              Làm mới
            </UButton>
            <UButton
              v-if="canManage"
              size="xs"
              color="primary"
              icon="i-lucide-plus"
              data-testid="open-create-draft-btn"
              @click="emit('open-create')"
            >
              Tạo bản nháp
            </UButton>
          </div>
        </div>

        <!-- Error State -->
        <UAlert
          v-if="errorMessage"
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Không thể tải danh sách bản nháp"
          :description="errorMessage"
          data-testid="draft-list-error"
        >
          <template #actions>
            <UButton color="error" variant="outline" size="xs" @click="fetchDrafts">
              Thử lại
            </UButton>
          </template>
        </UAlert>

        <!-- Loading State -->
        <div v-else-if="loading" class="py-8 text-center" aria-live="polite">
          <UIcon name="i-lucide-loader-2" class="spin text-2xl text-primary mx-auto" />
          <p class="text-xs text-gray-500 mt-2">Đang tải danh sách bản nháp…</p>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="(canPrepare && financialDrafts.length === 0) || (!canPrepare && operationalDrafts.length === 0)"
          class="py-8 text-center bg-gray-50 dark:bg-gray-900 rounded-lg"
          data-testid="draft-list-empty"
        >
          <UIcon name="i-lucide-file-text" class="text-3xl text-gray-400 mx-auto" />
          <h3 class="text-sm font-semibold mt-2">Chưa có bản nháp nào</h3>
          <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Hiện tại chưa có bản nháp chi phí nào được tạo cho dự án này.
          </p>
          <UButton
            v-if="canManage"
            class="mt-3"
            size="xs"
            color="primary"
            icon="i-lucide-plus"
            @click="emit('open-create')"
          >
            Tạo bản nháp đầu tiên
          </UButton>
        </div>

        <!-- Financial Drafts Table (cost.prepare) -->
        <div v-else-if="canPrepare" class="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
          <table class="w-full text-left text-xs" data-testid="financial-drafts-table">
            <thead class="bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th class="p-2.5">Mô tả / Tham chiếu</th>
                <th class="p-2.5">Danh mục</th>
                <th class="p-2.5 text-right">Tổng tiền</th>
                <th class="p-2.5 text-center">Sẵn sàng</th>
                <th class="p-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr
                v-for="d in financialDrafts"
                :key="d.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer transition-colors"
                data-testid="draft-row"
                @click="openDraft(d.id)"
              >
                <td class="p-2.5">
                  <div class="font-medium text-gray-900 dark:text-gray-100">{{ d.description }}</div>
                  <div class="text-[11px] text-gray-400 font-mono">
                    {{ d.businessReference || 'Không có số tham chiếu' }} · v{{ d.version }}
                  </div>
                </td>
                <td class="p-2.5 text-gray-600 dark:text-gray-300">
                  {{ getCategoryName(d.costCategoryId) }}
                </td>
                <td class="p-2.5 text-right font-mono font-medium">
                  {{ d.amount != null ? formatFinanceMoney(d.amount, d.currencyCode) : 'Chưa nhập' }}
                </td>
                <td class="p-2.5 text-center">
                  <span
                    v-if="d.publishReadiness.ready"
                    class="cockpit-badge cockpit-badge--success text-[11px]"
                  >
                    Sẵn sàng
                  </span>
                  <span
                    v-else
                    class="cockpit-badge cockpit-badge--warning text-[11px]"
                    :title="`${d.publishReadiness.blockingCodes.length} lý do chặn`"
                  >
                    Chưa sẵn sàng ({{ d.publishReadiness.blockingCodes.length }})
                  </span>
                </td>
                <td class="p-2.5 text-right">
                  <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-arrow-right">
                    Mở
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Operational Drafts Table (cost.manage only) -->
        <div v-else-if="canManage" class="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
          <table class="w-full text-left text-xs" data-testid="operational-drafts-table">
            <thead class="bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th class="p-2.5">Mô tả / Tham chiếu</th>
                <th class="p-2.5">Danh mục</th>
                <th class="p-2.5">Trạng thái công việc</th>
                <th class="p-2.5 text-right">Phiên bản</th>
                <th class="p-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr
                v-for="d in operationalDrafts"
                :key="d.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer transition-colors"
                data-testid="operational-draft-row"
                @click="openDraft(d.id)"
              >
                <td class="p-2.5">
                  <div class="font-medium text-gray-900 dark:text-gray-100">{{ d.description }}</div>
                  <div class="text-[11px] text-gray-400 font-mono">
                    {{ d.businessReference || 'Không có số tham chiếu' }}
                  </div>
                </td>
                <td class="p-2.5 text-gray-600 dark:text-gray-300">
                  {{ getCategoryName(d.costCategoryId) }}
                </td>
                <td class="p-2.5">
                  <span class="cockpit-badge cockpit-badge--neutral text-[11px]">
                    {{ d.workStatus }}
                  </span>
                </td>
                <td class="p-2.5 text-right font-mono text-gray-500">
                  v{{ d.version }}
                </td>
                <td class="p-2.5 text-right">
                  <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-arrow-right">
                    Mở
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </UModal>
</template>
