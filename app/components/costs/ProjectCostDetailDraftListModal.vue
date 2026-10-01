<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { ProjectCostDetailDraft, ProjectCostDetailOperationalDraft } from '../../../shared/schemas/costs/project-costs'
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
const financialDrafts = ref<ProjectCostDetailDraft[]>([])
const operationalDrafts = ref<ProjectCostDetailOperationalDraft[]>([])
const draftTracker = createAsyncRequestTracker<{
  companyId: string | null
  projectId: string
  canPrepare: boolean
  canManage: boolean
}>()

const categoryMap = computed(() => {
  const map = new Map<string, FinanceCategoryRow>()
  for (const c of props.categories) {
    map.set(c.categoryId, c)
  }
  return map
})

function getCategoryName(categoryId: string | null): string {
  if (!categoryId) return 'Chưa phân loại'
  const cat = categoryMap.value.get(categoryId)
  return cat ? `${cat.name} (${cat.code})` : categoryId
}

async function fetchDrafts() {
  const request = draftTracker.start({
    companyId: companyAccess.activeCompanyId,
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
      const list = await repositories.projectCosts.listDetailDrafts(request.identity.projectId)
      if (!request.isCurrent()) return
      financialDrafts.value = list
    }
    else if (request.identity.canManage) {
      const list = await repositories.projectCosts.listOperationalDetailDrafts(request.identity.projectId)
      if (!request.isCurrent()) return
      operationalDrafts.value = list
    }
  }
  catch (err: unknown) {
    if (!request.isCurrent()) return
    errorMessage.value = extractErrorMessage(err, 'Không thể tải danh sách bản nháp chi tiết.')
  }
  finally {
    if (request.isCurrent()) loading.value = false
  }
}

watch(
  [() => props.open, () => props.projectId, () => companyAccess.activeCompanyId, canPrepare, canManage],
  ([open]) => {
    if (open) {
      fetchDrafts()
    }
    else {
      draftTracker.invalidate()
      loading.value = false
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  draftTracker.invalidate()
})

function openDetailDraft(detailId: string) {
  isOpen.value = false
  router.push(`/costs/${props.projectId}/entries/${detailId}`)
}

defineExpose({
  refresh: fetchDrafts,
})
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Danh sách bản nháp chi tiết chi phí"
    description="Theo dõi và quản lý các chi tiết chi phí thông thường đang trong quá trình chuẩn bị."
  >
    <template #body>
      <div class="space-y-4" data-testid="detail-draft-list-modal">
        <div class="flex items-center justify-between text-xs text-gray-500">
          <div>
            Chế độ chiếu:
            <span v-if="canPrepare" class="font-semibold text-primary-600">Tài chính (cost.prepare)</span>
            <span v-else class="font-semibold text-amber-600">Vận hành (cost.manage)</span>
          </div>
          <UButton
            v-if="canManage"
            size="xs"
            color="primary"
            icon="i-lucide-plus"
            data-testid="modal-create-detail-btn"
            @click="() => { isOpen = false; emit('open-create'); }"
          >
            Tạo chi tiết mới
          </UButton>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          :description="errorMessage"
          data-testid="detail-draft-list-error"
        />

        <div v-if="loading" class="text-center py-8 text-xs text-gray-500">
          Đang tải danh sách bản nháp chi tiết…
        </div>

        <div
          v-else-if="(canPrepare ? financialDrafts.length : operationalDrafts.length) === 0"
          class="text-center py-8 text-xs text-gray-500"
          data-testid="detail-draft-empty"
        >
          Dự án chưa có bản nháp chi tiết chi phí nào.
        </div>

        <div v-else class="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
          <table class="w-full text-left text-xs" data-testid="detail-draft-table">
            <thead class="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th class="p-2.5">Mô tả</th>
                <th class="p-2.5">Hạng mục</th>
                <th v-if="canPrepare" class="p-2.5 text-right">Số tiền</th>
                <th v-if="canPrepare" class="p-2.5 text-center">Sẵn sàng</th>
                <th class="p-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <!-- Prepare Mode (Financial projection) -->
              <template v-if="canPrepare">
                <tr
                  v-for="draft in financialDrafts"
                  :key="draft.id"
                  :data-testid="`detail-draft-row-${draft.id}`"
                >
                  <td class="p-2.5">
                    <div class="font-semibold text-gray-900 dark:text-gray-100">{{ draft.description }}</div>
                    <div class="text-[10px] text-gray-500">v{{ draft.version }} · {{ draft.reference ?? 'Không có tham chiếu' }}</div>
                  </td>
                  <td class="p-2.5 text-gray-600 dark:text-gray-400">
                    {{ getCategoryName(draft.categoryId) }}
                  </td>
                  <td class="p-2.5 text-right font-mono font-semibold" data-testid="detail-draft-amount">
                    {{ draft.amount !== null ? formatFinanceMoney(draft.amount) : 'Chưa nhập' }}
                  </td>
                  <td class="p-2.5 text-center">
                    <span
                      class="cockpit-badge text-[10px]"
                      :class="draft.publishReadiness?.ready ? 'cockpit-badge--success' : 'cockpit-badge--warning'"
                    >
                      {{ draft.publishReadiness?.ready ? 'Sẵn sàng' : 'Chưa đủ điều kiện' }}
                    </span>
                  </td>
                  <td class="p-2.5 text-right">
                    <UButton
                      size="xs"
                      variant="outline"
                      :data-testid="`open-detail-draft-${draft.id}`"
                      @click="openDetailDraft(draft.id)"
                    >
                      Mở xử lý
                    </UButton>
                  </td>
                </tr>
              </template>

              <!-- Manage Mode (Operational projection) -->
              <template v-else>
                <tr
                  v-for="draft in operationalDrafts"
                  :key="draft.id"
                  :data-testid="`detail-draft-row-${draft.id}`"
                >
                  <td class="p-2.5">
                    <div class="font-semibold text-gray-900 dark:text-gray-100">{{ draft.description }}</div>
                    <div class="text-[10px] text-gray-500">v{{ draft.version }} · {{ draft.reference ?? 'Không có tham chiếu' }}</div>
                  </td>
                  <td class="p-2.5 text-gray-600 dark:text-gray-400">
                    {{ getCategoryName(draft.categoryId) }}
                  </td>
                  <td class="p-2.5 text-right">
                    <UButton
                      size="xs"
                      variant="outline"
                      :data-testid="`open-detail-draft-${draft.id}`"
                      @click="openDetailDraft(draft.id)"
                    >
                      Mở vận hành
                    </UButton>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </UModal>
</template>
