<script setup lang="ts">
import DrawingHistory from '../../../../../components/drawings/DrawingHistory.vue'
import DrawingUploadForm from '../../../../../components/drawings/DrawingUploadForm.vue'
import type { AddDrawingVersionInput } from '../../../../../features/drawings/drawing.types'

definePageMeta({ requiredPermission: 'project.read', requiredAnyPermissions: ['drawing.read'] })

const route = useRoute()
const repositories = useRepositories()
const projectId = computed(() => String(route.params.projectId))
const stageId = computed(() => String(route.params.stageId))
const busyFileId = ref<string | null>(null)
const submitting = ref(false)
const announcement = ref('')

const { data: project } = await useAsyncData(
  () => `drawing-project-${projectId.value}`,
  () => repositories.projects.getById(projectId.value),
)
const { data: drawings, refresh } = await useAsyncData(
  () => `drawings-${stageId.value}`,
  () => repositories.drawings.listByStage(stageId.value),
)

const stage = computed(() => project.value?.stages.find(item => item.id === stageId.value) ?? null)
const files = computed(() => drawings.value ?? [])
const current = computed(() => files.value.find(file => file.isCurrent) ?? null)
const approved = computed(() => files.value.find(file => file.customerApproved) ?? null)

async function mutate(fileId: string, action: () => Promise<void>, success: string) {
  busyFileId.value = fileId
  announcement.value = ''
  try {
    await action()
    await refresh()
    announcement.value = success
  } catch (error) {
    announcement.value = error instanceof Error ? error.message : 'Không thể cập nhật bản vẽ.'
  } finally {
    busyFileId.value = null
  }
}

function setCurrent(fileId: string) {
  const file = files.value.find(item => item.id === fileId)
  return mutate(fileId, () => repositories.drawings.setCurrent(fileId), `Đã đặt v${file?.versionNumber} làm bản lưu hành.`)
}

function setApproved(fileId: string, value: boolean) {
  return mutate(fileId, () => repositories.drawings.setCustomerApproved(fileId, value), value ? 'Đã lưu mốc khách hàng chốt.' : 'Đã bỏ mốc khách hàng chốt.')
}

async function addVersion(input: AddDrawingVersionInput) {
  submitting.value = true
  announcement.value = ''
  try {
    await repositories.drawings.addVersion(input)
    await refresh()
    announcement.value = 'Đã thêm phiên bản thử nghiệm'
  } catch (error) {
    announcement.value = error instanceof Error ? error.message : 'Không thể thêm phiên bản.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="project && stage" class="drawing-page">
    <nav class="breadcrumbs" aria-label="Điều hướng phân cấp"><NuxtLink :to="`/projects/${project.id}`">{{ project.name }}</NuxtLink><UIcon name="i-lucide-chevron-right" aria-hidden="true" /><NuxtLink :to="`/projects/${project.id}/stages/${stage.id}`">{{ stage.name }}</NuxtLink><UIcon name="i-lucide-chevron-right" aria-hidden="true" /><span>Bản vẽ</span></nav>
    <header><div><p class="eyebrow">{{ stage.code }} · Kho thiết kế</p><h1>Bản vẽ và lịch sử phát hành</h1><p>Lưu mọi phiên bản để truy xuất, đồng thời tách riêng bản lưu hành và phương án khách đã xác nhận.</p></div></header>
    <section class="drawing-summary">
      <article class="primary-preview" data-testid="circulating-version">
        <img v-if="current" :src="current.url" :alt="`Bản vẽ đang lưu hành v${current.versionNumber}`">
        <div><p class="eyebrow">Bản vẽ đang lưu hành</p><h2 v-if="current">{{ current.code }} · v{{ current.versionNumber }}</h2><p v-if="current">{{ current.originalFilename }}</p><strong v-else>Chưa chọn bản lưu hành</strong></div>
      </article>
      <article class="approved-baseline">
        <p class="approved-title">Mốc khách hàng đã chốt · {{ approved ? `v${approved.versionNumber}` : 'chưa có' }}</p>
        <img v-if="approved" :src="approved.url" :alt="`Bản khách hàng đã chốt v${approved.versionNumber}`">
        <div v-if="approved"><strong>{{ approved.code }} · {{ approved.originalFilename }}</strong><span>Được giữ độc lập với trạng thái lưu hành</span></div>
      </article>
    </section>
    <div class="content-grid">
      <DrawingHistory :files="files" :busy-file-id="busyFileId" @set-current="setCurrent" @set-approved="setApproved" />
      <DrawingUploadForm :files="files" :submitting="submitting" @submit="addVersion" />
    </div>
    <p class="announcement" aria-live="polite">{{ announcement }}</p>
  </div>
  <section v-else class="not-found-panel"><p class="eyebrow">Không tìm thấy</p><h1>Không có kho bản vẽ cho giai đoạn này.</h1><NuxtLink to="/projects">Quay lại dự án</NuxtLink></section>
</template>

<style scoped>
.drawing-page { display: grid; gap: 18px; max-width: 1500px; margin: 0 auto; }.breadcrumbs { display: flex; align-items: center; gap: 6px; color: var(--ink-muted); font-size: .72rem; }.drawing-page > header h1 { margin: 4px 0 7px; font-size: clamp(2rem,4vw,3.8rem); line-height: 1; }.drawing-page > header p:last-child { max-width: 720px; color: var(--ink-muted); }
.drawing-summary { display: grid; grid-template-columns: 1.35fr .65fr; gap: 16px; }.drawing-summary article { min-height: 250px; border: 1px solid var(--line); background: white; }.primary-preview { position: relative; overflow: hidden; }.primary-preview::after { position: absolute; inset: 0; background: linear-gradient(90deg,rgb(11 29 20 / 78%),rgb(11 29 20 / 10%)); content: ''; }.primary-preview img { width: 100%; height: 100%; object-fit: cover; }.primary-preview > div { position: absolute; z-index: 1; left: 20px; bottom: 18px; color: white; }.primary-preview .eyebrow { color: var(--mint); }.primary-preview h2 { margin: 4px 0; color: white; font-size: 2rem; }.primary-preview p:last-child { font-size: .75rem; }
.approved-baseline { display: grid; grid-template-rows: auto 1fr auto; padding: 15px; }.approved-title { color: var(--forest); font-weight: 800; }.approved-baseline img { width: 100%; height: 130px; margin: 12px 0; object-fit: cover; }.approved-baseline > div { display: grid; gap: 3px; }.approved-baseline span { color: var(--ink-muted); font-size: .68rem; }
.content-grid { display: grid; grid-template-columns: minmax(0,1fr) 290px; align-items: start; gap: 16px; }.announcement { min-height: 20px; color: var(--forest); font-size: .75rem; font-weight: 750; }.not-found-panel { display: grid; gap: 12px; padding: 40px; border: 1px solid var(--line); background: white; }
@media (max-width: 900px) { .drawing-summary,.content-grid { grid-template-columns: 1fr; } }
</style>
