<script setup lang="ts">
import ProjectJourneyCarousel from '../../../components/journey/ProjectJourneyCarousel.vue'

const route = useRoute()
const repositories = useRepositories()
const projectId = computed(() => String(route.params.projectId))
const { data: project } = await useAsyncData(
  () => `project-${projectId.value}`,
  () => repositories.projects.getById(projectId.value),
  { watch: [projectId] },
)
</script>

<template>
  <ProjectJourneyCarousel v-if="project" :project="project" />
  <section v-else class="not-found-panel">
    <p class="eyebrow">Không tìm thấy</p><h1>Dự án không tồn tại hoặc bạn không có quyền xem.</h1>
    <NuxtLink to="/projects">Quay lại danh sách dự án</NuxtLink>
  </section>
</template>

<style scoped>
.not-found-panel { display: grid; max-width: 650px; gap: 12px; padding: 40px; border: 1px solid var(--line); background: white; }.not-found-panel a { color: var(--forest); font-weight: 750; }
</style>
