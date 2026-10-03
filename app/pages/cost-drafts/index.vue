<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  ProjectCostDetailDraft,
  ProjectCostDetailOperationalDraft,
  ProjectCostDraftManagementMetadata,
} from '../../../shared/schemas/costs/project-costs'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import { formatFinanceMoney } from '../../utils/costs/finance-display'

definePageMeta({ requiredAnyPermissions: ['cost.manage', 'cost.prepare'] })

const route = useRoute()
const router = useRouter()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore

const canManage = computed(() => companyAccess.hasPermission('cost.manage'))
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))

type DraftProjectionTier = 'prepare' | 'manage' | 'none'
const projectionTier = computed<DraftProjectionTier>(() => {
  if (canPrepare.value) return 'prepare'
  if (canManage.value) return 'manage'
  return 'none'
})

const showRetiredLegacyNotice = computed(() => route.query.tab === 'legacy')

const metadata = ref<ProjectCostDraftManagementMetadata>({ projects: [], categories: [] })
const selectedProjectId = ref('')

const detailDrafts = ref<Array<ProjectCostDetailDraft | ProjectCostDetailOperationalDraft>>([])

const loading = ref(true)
const errorMessage = ref<string | null>(null)

const metadataRequests = createAsyncRequestTracker<{ companyId: string }>()
const draftRequests = createAsyncRequestTracker<{ companyId: string; projectId: string; projectionTier: DraftProjectionTier }>()

const requestedProjectId = computed(() => typeof route.query.projectId === 'string' ? route.query.projectId : '')
const selectedProject = computed(() => metadata.value.projects.find(project => project.id === selectedProjectId.value) ?? null)
const categoryNames = computed(() => new Map(metadata.value.categories.map(category => [category.categoryId, category.name])))

async function loadDrafts() {
  if (!selectedProjectId.value || projectionTier.value === 'none') {
    draftRequests.invalidate()
    detailDrafts.value = []
    loading.value = false
    return
  }

  const request = draftRequests.start({
    companyId: companyAccess.activeCompanyId ?? '',
    projectId: selectedProjectId.value,
    projectionTier: projectionTier.value,
  })

  detailDrafts.value = []
  loading.value = true
  errorMessage.value = null

  try {
    const nextDetailDrafts = request.identity.projectionTier === 'prepare'
      ? await repositories.projectCosts.listDetailDrafts(selectedProjectId.value)
      : await repositories.projectCosts.listOperationalDetailDrafts(selectedProjectId.value)
    if (!request.isCurrent()) return
    detailDrafts.value = nextDetailDrafts
  }
  catch (error: unknown) {
    if (!request.isCurrent()) return
    errorMessage.value = extractErrorMessage(error, 'Không thể tải danh sách bản nháp chi phí.')
  }
  finally {
    if (request.isCurrent()) loading.value = false
  }
}

async function load() {
  const request = metadataRequests.start({ companyId: companyAccess.activeCompanyId ?? '' })
  draftRequests.invalidate()
  loading.value = true
  errorMessage.value = null

  try {
    const nextMetadata = await repositories.projectCosts.draftManagementMetadata()
    if (!request.isCurrent()) return
    metadata.value = nextMetadata
    const requested = requestedProjectId.value
    selectedProjectId.value = metadata.value.projects.some(project => project.id === requested)
      ? requested
      : metadata.value.projects[0]?.id ?? ''

    if (requested && requested !== selectedProjectId.value) {
      await router.replace({ query: selectedProjectId.value ? { projectId: selectedProjectId.value } : {} })
      if (!request.isCurrent()) return
    }
    await loadDrafts()
  }
  catch (error: unknown) {
    if (!request.isCurrent()) return
    metadata.value = { projects: [], categories: [] }
    detailDrafts.value = []
    errorMessage.value = extractErrorMessage(error, 'Không thể tải dữ liệu quản lý bản nháp.')
    loading.value = false
  }
}

async function onProjectChange() {
  await router.replace({ query: selectedProjectId.value ? { projectId: selectedProjectId.value } : {} })
  await loadDrafts()
}

watch(() => companyAccess.activeCompanyId, () => {
  metadataRequests.invalidate()
  draftRequests.invalidate()
  metadata.value = { projects: [], categories: [] }
  selectedProjectId.value = ''
  detailDrafts.value = []
  loading.value = true
  errorMessage.value = null
  load()
}, { immediate: true, flush: 'sync' })

watch(requestedProjectId, (requested) => {
  const nextProjectId = metadata.value.projects.some(project => project.id === requested)
    ? requested
    : metadata.value.projects[0]?.id ?? ''
  if (selectedProjectId.value === nextProjectId) return
  selectedProjectId.value = nextProjectId
  loadDrafts()
})

watch(projectionTier, (tier) => {
  draftRequests.invalidate()
  detailDrafts.value = []
  errorMessage.value = null
  if (tier === 'none') {
    metadataRequests.invalidate()
    metadata.value = { projects: [], categories: [] }
    selectedProjectId.value = ''
    loading.value = false
    return
  }
  if (metadata.value.projects.length === 0) load()
  else loadDrafts()
}, { flush: 'sync' })

</script>

<template>
  <section class="max-w-7xl mx-auto space-y-6 pb-12" data-testid="draft-management-page">
    <header class="cockpit-card p-5 rounded-lg flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <p class="eyebrow">Kế toán · Dữ liệu chưa phát hành</p>
        <h1 class="text-2xl font-bold mt-1">Bản nháp chi phí</h1>
        <p class="text-sm text-gray-500 mt-1">
          Chuẩn bị dữ liệu chi phí mà không làm thay đổi báo cáo tài chính chính thức.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <!-- New Ordinary Entry Button -->
        <UButton
          v-if="canManage && selectedProjectId && selectedProject?.operationalState !== 'completed'"
          :to="`/costs/${selectedProjectId}/entries/new`"
          color="primary"
          icon="i-lucide-plus"
          data-testid="draft-management-create-detail"
        >
          Ghi nhận chi phí mới
        </UButton>

      </div>
    </header>

    <!-- Project selector for ordinary detail drafts -->
    <div class="cockpit-card p-4 rounded-lg space-y-4">
      <div class="space-y-1">
        <label for="draft-project" class="block text-xs font-semibold">Dự án</label>
        <select
          id="draft-project"
          v-model="selectedProjectId"
          class="cockpit-select w-full md:max-w-xl"
          data-testid="draft-project-select"
          @change="onProjectChange"
        >
          <option v-for="project in metadata.projects" :key="project.id" :value="project.id">
            {{ project.code }} · {{ project.name }}
          </option>
        </select>
      </div>
    </div>

    <UAlert
      v-if="showRetiredLegacyNotice"
      color="info"
      variant="subtle"
      title="Bản nháp tổng hợp đã ngừng sử dụng"
      description="Danh sách bên dưới chỉ gồm bản nháp chi tiết chi phí. Mã bản nháp tổng hợp cũ không được dùng làm mã chi tiết."
      data-testid="legacy-tab-retired-notice"
    />
    <UAlert v-if="errorMessage" color="error" variant="subtle" title="Không thể tải bản nháp" :description="errorMessage" />
    <div v-else-if="loading" class="cockpit-card p-8 text-center text-sm text-gray-500" aria-live="polite">
      Đang tải bản nháp…
    </div>
    <div v-else-if="!selectedProject" class="cockpit-card p-8 text-center text-sm text-gray-500">
      Không có dự án khả dụng cho quản lý bản nháp.
    </div>

    <!-- Ordinary detail drafts -->
    <div v-else>
      <div v-if="detailDrafts.length === 0" class="cockpit-card p-8 text-center text-sm text-gray-500" data-testid="detail-drafts-empty">
        Dự án chưa có bản nháp chi tiết chi phí nào.
      </div>
      <div v-else class="cockpit-card overflow-x-auto rounded-lg">
        <table class="w-full text-left text-sm" data-testid="detail-drafts-table">
          <thead class="border-b border-gray-200 dark:border-gray-800">
            <tr>
              <th class="p-3">Chi tiết chi phí</th>
              <th class="p-3">Hạng mục</th>
              <th v-if="canPrepare" class="p-3 text-right">Số tiền</th>
              <th v-if="canPrepare" class="p-3 text-center">Sẵn sàng</th>
              <th class="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-for="draft in detailDrafts" :key="draft.id" :data-testid="`detail-draft-row-${draft.id}`">
              <td class="p-3">
                <div class="font-semibold">{{ draft.description }}</div>
                <div class="text-xs text-gray-500">v{{ draft.version }} · {{ draft.reference ?? 'Không có tham chiếu' }}</div>
              </td>
              <td class="p-3">{{ categoryNames.get(draft.categoryId) ?? draft.categoryId }}</td>
              <td v-if="canPrepare" class="p-3 text-right font-mono font-semibold" data-testid="detail-draft-amount">
                {{ 'amount' in draft && draft.amount !== null ? formatFinanceMoney(draft.amount) : 'Chưa chuẩn bị' }}
              </td>
              <td v-if="canPrepare" class="p-3 text-center">
                <span
                  class="cockpit-badge text-[10px]"
                  :class="('publishReadiness' in draft && draft.publishReadiness?.ready) ? 'cockpit-badge--success' : 'cockpit-badge--warning'"
                >
                  {{ ('publishReadiness' in draft && draft.publishReadiness?.ready) ? 'Sẵn sàng' : 'Chưa đủ điều kiện' }}
                </span>
              </td>
              <td class="p-3 text-right">
                <UButton
                  :to="`/costs/${selectedProjectId}/entries/${draft.id}`"
                  size="sm"
                  variant="outline"
                  :data-testid="`detail-draft-open-${draft.id}`"
                >
                  {{ canPrepare ? 'Mở chuẩn bị' : 'Mở vận hành' }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
