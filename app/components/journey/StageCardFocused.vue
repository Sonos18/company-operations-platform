<script setup lang="ts">
import type { ProjectStage } from '../../features/journey/journey.types'
import type { ProjectMedia } from '../../features/media/media.types'
import SiteVisualComparison from '../media/SiteVisualComparison.vue'

const props = defineProps<{
  stage: ProjectStage
  isActualCurrent: boolean
  projectId: string
}>()

const repositories = useRepositories()
const media = ref<ProjectMedia[]>([])

watch(
  () => props.stage.id,
  async (stageId) => {
    media.value = props.stage.visualKind === 'construction_comparison'
      ? await repositories.media.listByStage(stageId)
      : []
  },
  { immediate: true },
)
</script>

<template>
  <article class="stage-card-focused" data-testid="stage-focused">
    <div class="stage-card-focused__visual">
      <SiteVisualComparison v-if="stage.visualKind === 'construction_comparison'" :media="media" compact />
      <img v-else :src="stage.imageUrl" :alt="`Minh họa giai đoạn ${stage.name}`">
      <div class="visual-topline">
        <span class="stage-number">GIAI ĐOẠN {{ stage.code }}</span>
        <span v-if="isActualCurrent" class="current-chip">ĐANG THỰC HIỆN</span>
        <span v-else class="browse-chip">ĐANG XEM LẠI</span>
      </div>
      <div class="visual-caption">
        <p>{{ stage.ownerDepartment }}</p>
        <h2>{{ stage.name }}</h2>
      </div>
    </div>
    <div class="stage-card-focused__info">
      <p>{{ stage.purpose }}</p>
      <div class="stage-stats">
        <span><strong>{{ stage.completedCount }}/{{ stage.totalCount }}</strong><small>bước hoàn thành</small></span>
        <span><strong>{{ stage.missingRecordCount }}</strong><small>hồ sơ còn thiếu</small></span>
        <span><strong>{{ stage.activities.length }}</strong><small>hoạt động gần đây</small></span>
      </div>
      <NuxtLink :to="`/projects/${projectId}/stages/${stage.id}`" class="stage-open-link">
        Mở không gian giai đoạn <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
      </NuxtLink>
    </div>
  </article>
</template>

<style scoped>
.stage-card-focused { display: grid; grid-template-rows: 65% 35%; width: 100%; height: 84%; min-height: 0; overflow: hidden; border: 1px solid color-mix(in srgb, var(--forest) 30%, var(--line)); border-radius: var(--radius-md); background: white; }
.stage-card-focused__visual { position: relative; min-height: 0; overflow: hidden; background: #d9ddd4; }
.stage-card-focused__visual::after { position: absolute; inset: 0; background: linear-gradient(180deg, rgb(8 25 17 / 28%), rgb(8 25 17 / 12%) 45%, rgb(8 25 17 / 78%)); content: ''; }
.stage-card-focused__visual img { width: 100%; height: 100%; object-fit: cover; }
.visual-topline,.visual-caption { position: absolute; z-index: 1; left: 18px; right: 18px; display: flex; }
.visual-topline { top: 16px; align-items: center; justify-content: space-between; }.visual-caption { bottom: 17px; flex-direction: column; }
.stage-number,.current-chip,.browse-chip { padding: 5px 7px; font-family: 'JetBrains Mono Variable', monospace; font-size: 0.61rem; font-weight: 750; letter-spacing: 0.07em; }
.stage-number { background: var(--paper); color: var(--forest); }.current-chip { background: var(--mint); color: var(--forest-deep); }.browse-chip { background: var(--gold); color: var(--forest-deep); }
.visual-caption p { color: var(--mint); font-size: 0.72rem; font-weight: 700; }.visual-caption h2 { color: white; font-size: clamp(1.4rem, 2.5vw, 2.45rem); line-height: 1.05; }
.stage-card-focused__info { display: grid; grid-template-columns: 1fr auto; grid-template-rows: 1fr auto; gap: 12px 18px; min-height: 0; padding: 16px 18px; }
.stage-card-focused__info > p { align-self: start; max-width: 540px; color: var(--ink-muted); font-size: clamp(0.72rem, 1vw, 0.84rem); line-height: 1.4; }
.stage-stats { grid-column: 2; grid-row: 1 / 3; display: grid; grid-template-columns: repeat(3, minmax(64px, 1fr)); gap: 1px; background: var(--line); }
.stage-stats span { display: grid; align-content: center; min-width: 76px; padding: 7px 10px; background: var(--paper); }.stage-stats strong { color: var(--forest); font-family: 'Space Grotesk Variable', sans-serif; font-size: 1.15rem; }.stage-stats small { color: var(--ink-muted); font-size: 0.6rem; }
.stage-open-link { display: flex; align-items: center; gap: 8px; width: fit-content; min-height: 36px; color: var(--forest); font-size: 0.75rem; font-weight: 750; }
</style>
