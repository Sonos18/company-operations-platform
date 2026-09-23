<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ProjectCostDraft, ProjectCostDraftManagementMetadata, ProjectCostOperationalDraft } from '../../../shared/schemas/costs/project-costs'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import ProjectCostDraftCreateModal from '../../components/costs/ProjectCostDraftCreateModal.vue'

definePageMeta({ requiredAnyPermissions: ['cost.manage', 'cost.prepare'] })

const route = useRoute()
const router = useRouter()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const canManage = computed(() => companyAccess.hasPermission('cost.manage'))
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))
const metadata = ref<ProjectCostDraftManagementMetadata>({ projects: [], categories: [] })
const selectedProjectId = ref('')
const drafts = ref<Array<ProjectCostDraft | ProjectCostOperationalDraft>>([])
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const createOpen = ref(false)
const metadataRequests = createAsyncRequestTracker<{ companyId: string }>()
const draftRequests = createAsyncRequestTracker<{ companyId: string; projectId: string }>()

const requestedProjectId = computed(() => typeof route.query.projectId === 'string' ? route.query.projectId : '')
const selectedProject = computed(() => metadata.value.projects.find(project => project.id === selectedProjectId.value) ?? null)
const categoryNames = computed(() => new Map(metadata.value.categories.map(category => [category.categoryId, category.name])))

async function loadDrafts() {
  if (!selectedProjectId.value) {
    draftRequests.invalidate()
    drafts.value = []
    loading.value = false
    return
  }
  const request = draftRequests.start({ companyId: companyAccess.activeCompanyId ?? '', projectId: selectedProjectId.value })
  drafts.value = []
  loading.value = true
  errorMessage.value = null
  try {
    const nextDrafts = canPrepare.value
      ? await repositories.projectCosts.listDrafts(selectedProjectId.value)
      : await repositories.projectCosts.listOperationalDrafts(selectedProjectId.value)
    if (!request.isCurrent()) return
    drafts.value = nextDrafts
  }
  catch (error: unknown) {
    if (!request.isCurrent()) return
    drafts.value = []
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
    await loadDrafts()
  }
  catch (error: unknown) {
    if (!request.isCurrent()) return
    metadata.value = { projects: [], categories: [] }
    drafts.value = []
    errorMessage.value = extractErrorMessage(error, 'Không thể tải dữ liệu quản lý bản nháp.')
    loading.value = false
  }
}

async function onProjectChange() {
  await router.replace({ query: selectedProjectId.value ? { projectId: selectedProjectId.value } : {} })
  await loadDrafts()
}

function onCreated(result: { id: string }) {
  router.push(`/costs/${selectedProjectId.value}/drafts/${result.id}`)
}

watch(() => companyAccess.activeCompanyId, load, { immediate: true })
watch(requestedProjectId, (requested) => {
  const nextProjectId = metadata.value.projects.some(project => project.id === requested)
    ? requested
    : metadata.value.projects[0]?.id ?? ''
  if (selectedProjectId.value === nextProjectId) return
  selectedProjectId.value = nextProjectId
  loadDrafts()
})
onUnmounted(() => {
  metadataRequests.invalidate()
  draftRequests.invalidate()
})
</script>

<template>
  <section class="max-w-7xl mx-auto space-y-6 pb-12" data-testid="draft-management-page">
    <header class="cockpit-card p-5 rounded-lg flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <p class="eyebrow">Kế toán · Dữ liệu chưa phát hành</p>
        <h1 class="text-2xl font-bold mt-1">Bản nháp chi phí</h1>
        <p class="text-sm text-gray-500 mt-1">Chuẩn bị dữ liệu chi phí mà không làm thay đổi báo cáo tài chính chính thức.</p>
      </div>
      <UButton v-if="canManage && selectedProjectId" color="primary" icon="i-lucide-plus" data-testid="draft-management-create" @click="() => { createOpen = true }">
        Tạo bản nháp
      </UButton>
    </header>

    <div class="cockpit-card p-4 rounded-lg space-y-2">
      <label for="draft-project" class="block text-xs font-semibold">Dự án</label>
      <select id="draft-project" v-model="selectedProjectId" class="cockpit-select w-full md:max-w-xl" data-testid="draft-project-select" @change="onProjectChange">
        <option v-for="project in metadata.projects" :key="project.id" :value="project.id">{{ project.code }} · {{ project.name }}</option>
      </select>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="subtle" title="Không thể tải bản nháp" :description="errorMessage" />
    <div v-else-if="loading" class="cockpit-card p-8 text-center text-sm text-gray-500" aria-live="polite">Đang tải bản nháp…</div>
    <div v-else-if="!selectedProject" class="cockpit-card p-8 text-center text-sm text-gray-500">Không có dự án khả dụng cho quản lý bản nháp.</div>
    <div v-else-if="drafts.length === 0" class="cockpit-card p-8 text-center text-sm text-gray-500">Dự án chưa có bản nháp chi phí.</div>
    <div v-else class="cockpit-card overflow-x-auto rounded-lg">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-gray-200 dark:border-gray-800"><tr><th class="p-3">Bản nháp</th><th class="p-3">Danh mục</th><th v-if="canPrepare" class="p-3 text-right">Số tiền chuẩn bị</th><th class="p-3 text-right">Thao tác</th></tr></thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
          <tr v-for="draft in drafts" :key="draft.id" :data-testid="`draft-management-row-${draft.id}`">
            <td class="p-3"><div class="font-semibold">{{ draft.description }}</div><div class="text-xs text-gray-500">v{{ draft.version }} · {{ draft.workStatus }}</div></td>
            <td class="p-3">{{ categoryNames.get(draft.costCategoryId) ?? draft.costCategoryId }}</td>
            <td v-if="canPrepare" class="p-3 text-right font-mono" data-testid="draft-management-amount">{{ 'amount' in draft ? (draft.amount ?? 'Chưa chuẩn bị') : 'Chưa chuẩn bị' }}</td>
            <td class="p-3 text-right"><UButton :to="`/costs/${selectedProjectId}/drafts/${draft.id}`" size="sm" variant="outline" :data-testid="`draft-management-open-${draft.id}`">{{ canPrepare ? 'Mở chuẩn bị' : 'Mở vận hành' }}</UButton></td>
          </tr>
        </tbody>
      </table>
    </div>

    <ProjectCostDraftCreateModal v-if="selectedProjectId" v-model:open="createOpen" :project-id="selectedProjectId" :categories="metadata.categories" @created="onCreated" />
  </section>
</template>
