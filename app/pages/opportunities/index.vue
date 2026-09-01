<script setup lang="ts">
import type { CreateOpportunityInput, OpportunitySummary } from '../../features/opportunities/opportunity.types'
import type { OpportunityCreateOptions } from '../../../shared/schemas/opportunity-create-options'

definePageMeta({ requiredPermission: 'opportunity.read' })

const repositories = useRepositories()
const companyAccessStore = useNuxtApp().$companyAccessStore
const createOpen = ref(false)
const createOptions = ref<OpportunityCreateOptions | null>(null)
const createConfigError = ref<unknown | null>(null)
const createConfigLoading = ref(false)
const submitting = ref(false)
const createError = ref<unknown | null>(null)
const { data: opportunities, pending, error, refresh } = await useAsyncData(
  'opportunity-list',
  () => repositories.opportunities.list(),
  { default: (): OpportunitySummary[] => [] },
)

if (import.meta.client) onMounted(() => refresh())

const canCreate = computed(() => companyAccessStore.hasPermission('opportunity.create'))
const visibleOpportunities = computed(() => opportunities.value ?? [])

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function loadCreateOptions(): Promise<void> {
  createConfigLoading.value = true
  createConfigError.value = null
  try {
    createOptions.value = await repositories.opportunities.getCreateOptions()
  }
  catch (caught) {
    createConfigError.value = caught
  }
  finally {
    createConfigLoading.value = false
  }
}

async function openCreate(): Promise<void> {
  if (!canCreate.value) return
  createOpen.value = true
  createError.value = null
  await loadCreateOptions()
}

async function createOpportunity(input: CreateOpportunityInput): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  createError.value = null
  try {
    const result = await repositories.opportunities.create(input)
    await navigateTo(`/opportunities/${result.opportunityId}/stage-01`)
  }
  catch (caught) {
    createError.value = caught
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="opportunities-page" aria-labelledby="opportunities-heading">
    <header class="page-heading">
      <div><p class="eyebrow">Phát triển kinh doanh</p><h1 id="opportunities-heading">Cơ hội</h1><p>Ghi nhận và theo dõi các cơ hội trước khi bắt đầu đánh giá Stage 01.</p></div>
      <UButton v-if="canCreate" icon="i-lucide-plus" @click="openCreate">Tạo cơ hội mới</UButton>
    </header>

    <div v-if="pending" class="opportunities-loading" aria-label="Đang tải danh sách cơ hội"><USkeleton v-for="index in 4" :key="index" class="h-16 w-full" /></div>
    <UAlert v-else-if="error" role="alert" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Không thể tải danh sách cơ hội" description="Vui lòng thử lại sau."><template #actions><UButton color="error" variant="outline" @click="() => refresh()">Thử lại</UButton></template></UAlert>
    <OpportunitiesOpportunityListTable v-else-if="visibleOpportunities.length" :opportunities="visibleOpportunities" />
    <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-target" title="Chưa có cơ hội" description="Tạo cơ hội mới để bắt đầu quy trình Stage 01." />
    <UAlert v-if="createError" role="alert" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Không thể tạo cơ hội" :description="errorMessage(createError, 'Vui lòng thử lại.')" />

    <OpportunitiesOpportunityCreateDialog v-model:open="createOpen" :options="createOptions" :loading="createConfigLoading" :error="createConfigError" :submitting="submitting" @retry="loadCreateOptions" @submit="createOpportunity" />
  </section>
</template>

<style scoped>
.opportunities-page { display: grid; gap: 18px; max-width: 1260px; margin: 0 auto; }.page-heading { display: flex; align-items: end; justify-content: space-between; gap: 22px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }.page-heading h1 { margin: 4px 0 7px; font-size: clamp(2.3rem, 5vw, 4rem); line-height: .95; }.page-heading p:not(.eyebrow) { max-width: 620px; color: var(--ink-muted); line-height: 1.5; }.opportunities-loading { display: grid; gap: 10px; }
@media (max-width: 767px) { .opportunities-page { gap: 15px; }.page-heading { align-items: start; flex-direction: column; }.page-heading :deep(button) { width: 100%; justify-content: center; min-height: 44px; } }
</style>
