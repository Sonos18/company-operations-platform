<script setup lang="ts">
import ProjectJourneyCarousel from '../../../components/journey/ProjectJourneyCarousel.vue'

const route = useRoute()
const repositories = useRepositories()
const projectId = computed(() => String(route.params.projectId))
const { data: project, status } = await useAsyncData(
  () => `project-${projectId.value}`,
  () => repositories.projects.getById(projectId.value),
  { watch: [projectId] },
)
</script>

<template>
  <section v-if="status === 'pending'" class="journey-loading" data-testid="journey-loading" aria-label="Đang tải hành trình dự án">
    <USkeleton class="h-24 w-full" />
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3"><USkeleton v-for="index in 3" :key="index" class="h-24" /></div>
    <USkeleton class="h-[420px] w-full" />
  </section>

  <ProjectJourneyCarousel v-else-if="project?.stages.length" :project="project" />

  <UEmpty
    v-else-if="project"
    data-testid="journey-empty"
    icon="i-lucide-route-off"
    title="Dự án chưa có hành trình"
    description="Hãy cấu hình các giai đoạn trước khi theo dõi tiến độ dự án."
    :actions="[{ label: 'Quay lại danh sách dự án', to: '/projects', icon: 'i-lucide-arrow-left' }]"
  />

  <UEmpty
    v-else
    data-testid="journey-not-found"
    icon="i-lucide-folder-search"
    title="Không tìm thấy dự án"
    description="Dự án không tồn tại hoặc bạn không có quyền xem."
    :actions="[{ label: 'Quay lại danh sách dự án', to: '/projects', icon: 'i-lucide-arrow-left' }]"
  />
</template>

<style scoped>
.journey-loading { display: grid; gap: 16px; max-width: 1480px; padding: 20px; margin: 0 auto; }
</style>
