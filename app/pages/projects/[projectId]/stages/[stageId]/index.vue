<script setup lang="ts">
import StageWorkspace from '../../../../../components/stages/StageWorkspace.vue'

const route = useRoute()
const repositories = useRepositories()
const projectId = computed(() => String(route.params.projectId))
const stageId = computed(() => String(route.params.stageId))
const { data: project } = await useAsyncData(
  () => `project-stage-${projectId.value}-${stageId.value}`,
  () => repositories.projects.getById(projectId.value),
  { watch: [projectId, stageId] },
)
const stage = computed(() => project.value?.stages.find(item => item.id === stageId.value) ?? null)
</script>

<template>
  <StageWorkspace v-if="project && stage" :project="project" :stage="stage" />
  <section v-else class="not-found-panel">
    <p class="eyebrow">Không tìm thấy</p>
    <h1>Giai đoạn không tồn tại hoặc bạn không có quyền xem.</h1>
    <NuxtLink :to="project ? `/projects/${project.id}` : '/projects'">Quay lại dự án</NuxtLink>
  </section>
</template>

<style scoped>
.not-found-panel { display: grid; max-width: 650px; gap: 12px; padding: 40px; border: 1px solid var(--line); background: white; }.not-found-panel a { color: var(--forest); font-weight: 750; }
</style>
