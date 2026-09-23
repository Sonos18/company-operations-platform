<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ProjectCostDraft, ProjectCostOperationalDraft } from '../../../../../shared/schemas/costs/project-costs'
import type { FinanceOverview } from '../../../../../shared/schemas/costs/project-finance'
import { extractErrorMessage } from '../../../../utils/costs/accounting-error-mapper'
import { mapCostsApiError } from '../../../../utils/costs/costs-error-mapper'
import ProjectCostDraftOperationsForm from '../../../../components/costs/ProjectCostDraftOperationsForm.vue'
import ProjectCostFinancialDetailEditor from '../../../../components/costs/ProjectCostFinancialDetailEditor.vue'
import ProjectCostPublishReadinessPanel from '../../../../components/costs/ProjectCostPublishReadinessPanel.vue'
import ProjectCostEvidencePanel from '../../../../components/costs/ProjectCostEvidencePanel.vue'
import ProjectCostPublishModal from '../../../../components/costs/ProjectCostPublishModal.vue'

definePageMeta({ requiredAnyPermissions: ['cost.manage', 'cost.prepare'] })

const route = useRoute()
const router = useRouter()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore

const projectId = computed(() => String(route.params.projectId ?? ''))
const draftId = computed(() => String(route.params.draftId ?? ''))

const canManage = computed(() => companyAccess.hasPermission('cost.manage'))
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))
const canPublish = computed(() => companyAccess.hasPermission('cost.publish_import'))

const loading = ref(true)
const status = ref<'loading' | 'ready' | 'not_found' | 'permission' | 'error'>('loading')
const errorMessage = ref<string | null>(null)

const overview = ref<FinanceOverview | null>(null)
const financialDraft = ref<ProjectCostDraft | null>(null)
const operationalDraft = ref<ProjectCostOperationalDraft | null>(null)

const isPublishModalOpen = ref(false)

const currentDraftData = computed(() => {
  if (canPrepare.value && financialDraft.value) {
    return {
      id: financialDraft.value.id,
      version: financialDraft.value.version,
      description: financialDraft.value.description,
      costCategoryId: financialDraft.value.costCategoryId,
      businessReference: financialDraft.value.businessReference,
      partyId: financialDraft.value.partyId,
      engagementId: financialDraft.value.engagementId,
      componentId: financialDraft.value.componentId,
      relevantDate: financialDraft.value.relevantDate,
      workStatus: financialDraft.value.workStatus,
      publicationState: financialDraft.value.publicationState,
    }
  }
  if (operationalDraft.value) {
    return {
      id: operationalDraft.value.id,
      version: operationalDraft.value.version,
      description: operationalDraft.value.description,
      costCategoryId: operationalDraft.value.costCategoryId,
      businessReference: operationalDraft.value.businessReference,
      partyId: operationalDraft.value.partyId,
      engagementId: operationalDraft.value.engagementId,
      componentId: operationalDraft.value.componentId,
      relevantDate: operationalDraft.value.relevantDate,
      workStatus: operationalDraft.value.workStatus,
      publicationState: operationalDraft.value.publicationState,
    }
  }
  return null
})

async function loadData() {
  if (!projectId.value || !draftId.value) {
    status.value = 'not_found'
    return
  }

  if (!canManage.value && !canPrepare.value) {
    status.value = 'permission'
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    // 1. Fetch draft depending on capability first
    if (canPrepare.value) {
      financialDraft.value = await repositories.projectCosts.draft(draftId.value)
      operationalDraft.value = null
    }
    else if (canManage.value) {
      operationalDraft.value = await repositories.projectCosts.operationalDraft(draftId.value)
      financialDraft.value = null
    }

    // 2. Fetch overview for category enrichment only if actor has cost.read, gracefully falling back
    if (companyAccess.hasPermission('cost.read')) {
      try {
        overview.value = await repositories.projectFinance.overview(projectId.value)
      }
      catch {
        overview.value = null
      }
    }
    else {
      overview.value = null
    }

    status.value = 'ready'
  }
  catch (err: unknown) {
    const mapped = mapCostsApiError(err)
    if (mapped === 'not_found') {
      status.value = 'not_found'
    }
    else if (mapped === 'permission') {
      status.value = 'permission'
    }
    else {
      status.value = 'error'
      errorMessage.value = extractErrorMessage(err)
    }
  }
  finally {
    loading.value = false
  }
}

function onOperationalSaved(res: { version: number }) {
  if (financialDraft.value) {
    financialDraft.value.version = res.version
  }
  if (operationalDraft.value) {
    operationalDraft.value.version = res.version
  }
  loadData()
}

function onFinancialSaved(res: { version: number }) {
  if (financialDraft.value) {
    financialDraft.value.version = res.version
  }
  loadData()
}

function onPublished() {
  router.push(`/costs/${projectId.value}`)
}

watch(
  [projectId, draftId, () => companyAccess.activeCompanyId],
  () => {
    loadData()
  },
  { immediate: true },
)
</script>

<template>
  <div class="draft-workbench-page max-w-7xl mx-auto space-y-6 pb-12" data-testid="draft-workbench-page">
    <!-- Breadcrumb Nav -->
    <nav class="breadcrumb-nav flex items-center gap-2 text-xs text-gray-500" aria-label="Đường dẫn">
      <NuxtLink to="/costs" class="hover:text-primary">Chi phí</NuxtLink>
      <span>/</span>
      <NuxtLink :to="`/costs/${projectId}`" class="hover:text-primary">
        {{ overview?.project.projectName || 'Dự án' }}
      </NuxtLink>
      <span>/</span>
      <span class="text-gray-900 dark:text-gray-100 font-semibold">Bản nháp chi phí</span>
    </nav>

    <!-- Loading State -->
    <div v-if="status === 'loading'" class="py-16 text-center" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="spin text-3xl text-primary mx-auto" />
      <p class="text-sm text-gray-500 mt-2">Đang tải dữ liệu bản nháp…</p>
    </div>

    <!-- Error State -->
    <div v-else-if="status === 'error'" class="state-panel cockpit-card p-8 text-center space-y-3" role="alert" data-testid="draft-generic-error">
      <UIcon name="i-lucide-circle-alert" class="text-3xl text-red-500 mx-auto" />
      <h2 class="text-base font-semibold">Không thể tải bản nháp chi phí</h2>
      <p class="text-xs text-gray-500 max-w-md mx-auto">{{ errorMessage || 'Đã xảy ra lỗi khi tải từ máy chủ.' }}</p>
      <UButton color="primary" variant="outline" size="sm" @click="loadData">
        Thử lại
      </UButton>
    </div>

    <!-- Not Found State -->
    <div v-else-if="status === 'not_found'" class="state-panel cockpit-card p-8 text-center space-y-3" data-testid="draft-not-found">
      <UIcon name="i-lucide-file-question" class="text-3xl text-amber-500 mx-auto" />
      <h2 class="text-base font-semibold">Bản nháp không tồn tại</h2>
      <p class="text-xs text-gray-500 max-w-md mx-auto">
        Bản nháp này không tồn tại hoặc đã được phát hành chính thức thành chi phí dự án.
      </p>
      <NuxtLink :to="`/costs/${projectId}`" class="inline-block">
        <UButton color="neutral" variant="outline" size="sm">
          Quay lại dự án
        </UButton>
      </NuxtLink>
    </div>

    <!-- Permission State -->
    <div v-else-if="status === 'permission'" class="state-panel cockpit-card p-8 text-center space-y-3" data-testid="draft-permission-denied">
      <UIcon name="i-lucide-shield-alert" class="text-3xl text-red-500 mx-auto" />
      <h2 class="text-base font-semibold">Không có quyền truy cập bản nháp</h2>
      <p class="text-xs text-gray-500 max-w-md mx-auto">
        Bạn cần quyền cost.manage hoặc cost.prepare để xem và xử lý bản nháp chi phí này.
      </p>
      <NuxtLink :to="`/costs/${projectId}`" class="inline-block">
        <UButton color="neutral" variant="outline" size="sm">
          Quay lại dự án
        </UButton>
      </NuxtLink>
    </div>

    <!-- Content Ready -->
    <div v-else-if="currentDraftData" class="space-y-6">
      <!-- Workbench Header -->
      <header class="cockpit-card p-5 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="cockpit-badge cockpit-badge--neutral">Bản nháp</span>
            <span class="text-xs font-mono text-gray-400">v{{ currentDraftData.version }}</span>
          </div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100" data-testid="draft-title">
            {{ currentDraftData.description }}
          </h1>
          <p class="text-xs text-gray-500">
            <template v-if="overview">
              Mã dự án: <span class="font-mono">{{ overview.project.projectCode }}</span> ·
              {{ overview.project.projectName }}
            </template>
            <template v-else>
              Dự án: <span class="font-mono">{{ projectId }}</span>
            </template>
          </p>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-arrow-left"
            @click="() => { router.push(`/costs/${projectId}`) }"
          >
            Quay lại dự án
          </UButton>

          <UButton
            v-if="canPublish && financialDraft"
            color="primary"
            size="sm"
            icon="i-lucide-send"
            :disabled="!financialDraft.publishReadiness.ready"
            data-testid="open-publish-modal-btn"
            @click="() => { isPublishModalOpen = true }"
          >
            Phát hành chi phí
          </UButton>
        </div>
      </header>

      <!-- Section 1: Operational Information (cost.manage) -->
      <section aria-labelledby="section-operations-title">
        <ProjectCostDraftOperationsForm
          :draft="currentDraftData"
          :categories="overview?.categories || []"
          @saved="onOperationalSaved"
          @refresh-requested="loadData"
        />
      </section>

      <!-- Section 2: Financial Detail Lines Editor (cost.prepare only) -->
      <section v-if="canPrepare && financialDraft" aria-labelledby="section-financials-title">
        <ProjectCostFinancialDetailEditor
          :project-cost-item-id="draftId"
          :initial-details="financialDraft.details"
          :current-version="financialDraft.version"
          :currency-code="financialDraft.currencyCode"
          :derived-amount="financialDraft.amount"
          :source-figure-ids="financialDraft.sourceFigureIds"
          @saved="onFinancialSaved"
          @refresh-requested="loadData"
        />
      </section>

      <!-- Section 3: Evidence Panel (cost.prepare / cost.source.read) -->
      <section v-if="canPrepare && financialDraft" aria-labelledby="section-evidence-title">
        <ProjectCostEvidencePanel
          :project-id="projectId"
          :project-cost-item-id="draftId"
        />
      </section>

      <!-- Section 4: Publish Readiness Panel (cost.prepare) -->
      <section v-if="canPrepare && financialDraft" aria-labelledby="section-readiness-title">
        <ProjectCostPublishReadinessPanel
          :readiness="financialDraft.publishReadiness"
          :can-publish="canPublish"
          @open-publish="isPublishModalOpen = true"
        />
      </section>

      <!-- Publish Modal -->
      <ProjectCostPublishModal
        v-if="financialDraft"
        v-model:open="isPublishModalOpen"
        :project-cost-item-id="draftId"
        :version="financialDraft.version"
        :description="financialDraft.description"
        :amount="financialDraft.amount"
        :currency-code="financialDraft.currencyCode"
        @published="onPublished"
      />
    </div>
  </div>
</template>
