<script setup lang="ts">
import { getStageProgress, stageStatusLabel } from '../../features/journey/journey.presenter'
import type { ProjectStage } from '../../features/journey/journey.types'
import { useStageMedia } from '../../composables/useStageMedia'
import SiteVisualComparison from '../media/SiteVisualComparison.vue'

const props = defineProps<{
  stage: ProjectStage
  projectId: string
  focused: boolean
  actualCurrent: boolean
}>()

const emit = defineEmits<{ focus: [stageId: string] }>()
const repositories = useRepositories()
const { media, pending: mediaPending, error: mediaError } = useStageMedia(
  toRef(props, 'stage'),
  toRef(props, 'focused'),
  repositories.media,
)
</script>

<template>
  <UCard class="journey-stage-card" :class="{ 'is-focused': focused }" data-testid="journey-stage-card" :data-focused="String(focused)">
    <template v-if="focused">
      <div class="stage-visual">
        <USkeleton v-if="mediaPending" class="size-full rounded-none" />
        <UAlert v-else-if="mediaError" color="error" variant="subtle" icon="i-lucide-image-off" :description="mediaError" />
        <SiteVisualComparison v-else-if="stage.visualKind === 'construction_comparison'" :media="media" compact />
        <img v-else :src="stage.imageUrl" :alt="`Minh họa giai đoạn ${stage.name}`">
      </div>

      <div class="stage-card-copy">
        <div class="stage-card-topline">
          <span>Giai đoạn {{ stage.code }}</span>
          <UBadge :color="actualCurrent ? 'success' : 'secondary'" variant="subtle">
            {{ actualCurrent ? 'Hiện tại' : 'Đang xem lại' }}
          </UBadge>
        </div>
        <h2>{{ stage.name }}</h2>
        <p>{{ stage.purpose }}</p>
        <UProgress :model-value="getStageProgress(stage)" size="sm" color="success" />
        <div class="stage-meta">
          <span>{{ stage.completedCount }}/{{ stage.totalCount }} bước</span>
          <span>{{ stage.missingRecordCount }} hồ sơ còn thiếu</span>
          <span>{{ stage.ownerDepartment }}</span>
        </div>
        <UButton :to="`/projects/${projectId}/stages/${stage.id}`" trailing-icon="i-lucide-arrow-right">
          Mở không gian giai đoạn
        </UButton>
      </div>
    </template>

    <button v-else type="button" class="neighbor-trigger" :aria-label="`Xem giai đoạn ${stage.code}: ${stage.name}`" @click="emit('focus', stage.id)">
      <img :src="stage.imageUrl" alt="">
      <span class="neighbor-scrim" />
      <span class="neighbor-copy">
        <small>{{ stageStatusLabel[stage.status] }}</small>
        <strong>{{ stage.code }} · {{ stage.name }}</strong>
        <span>{{ stage.completedCount }}/{{ stage.totalCount }} bước</span>
      </span>
    </button>
  </UCard>
</template>

<style scoped>
.journey-stage-card { width: 100%; min-height: 440px; overflow: hidden; border: 1px solid var(--journey-border); border-radius: var(--journey-radius); background: var(--journey-surface); color: var(--journey-foreground); transition: transform var(--journey-motion), opacity 200ms ease, box-shadow var(--journey-motion); }
.journey-stage-card:not(.is-focused) { transform: scale(.94); opacity: .68; }
.journey-stage-card.is-focused { transform: translateY(-4px) scale(1.015); opacity: 1; box-shadow: 0 18px 36px color-mix(in srgb, var(--journey-primary) 22%, transparent); }
.journey-stage-card :deep([data-slot='body']) { height: 100%; padding: 0; }
.journey-stage-card.is-focused :deep([data-slot='body']) { display: grid; grid-template-rows: minmax(0, 60%) minmax(0, 40%); }
.stage-visual { position: relative; min-height: 0; overflow: hidden; background: var(--journey-border); }.stage-visual > img,.stage-visual > :deep(.site-comparison),.stage-visual > :deep(.skeleton) { width: 100%; height: 100%; object-fit: cover; }.stage-visual > :deep(.alert) { height: 100%; border-radius: 0; }
.stage-card-copy { display: grid; grid-template-columns: 1fr auto; align-content: start; gap: 8px 14px; min-height: 0; padding: 13px 16px; }.stage-card-copy h2,.stage-card-copy p,.stage-card-copy > :deep(.progress),.stage-meta { grid-column: 1 / -1; }.stage-card-copy h2 { color: var(--journey-foreground); font-family: var(--font-journey-display); font-size: clamp(1rem, 1.7vw, 1.6rem); line-height: 1.08; }.stage-card-copy p { color: var(--journey-muted); font-size: clamp(.67rem, .8vw, .78rem); line-height: 1.35; }.stage-card-topline { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--journey-primary); font-family: var(--font-journey-mono); font-size: .59rem; font-weight: 750; letter-spacing: .05em; }.stage-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--journey-muted); font-size: .6rem; }.stage-card-copy > :deep(.button) { min-height: 30px; font-size: .65rem; }
.neighbor-trigger { position: relative; display: block; width: 100%; height: 100%; min-height: 0; padding: 0; overflow: hidden; border: 0; background: var(--journey-primary); color: var(--journey-surface); cursor: pointer; text-align: left; }.neighbor-trigger > img,.neighbor-scrim { position: absolute; inset: 0; width: 100%; height: 100%; }.neighbor-trigger > img { object-fit: cover; }.neighbor-scrim { background: linear-gradient(180deg, color-mix(in srgb, var(--journey-primary) 16%, transparent), color-mix(in srgb, var(--journey-primary) 84%, transparent)); }.neighbor-copy { position: absolute; z-index: 1; right: 14px; bottom: 15px; left: 14px; display: grid; gap: 5px; }.neighbor-copy small { width: fit-content; padding: 4px 6px; background: var(--journey-mint); color: var(--journey-foreground); font-family: var(--font-journey-mono); font-size: .58rem; font-weight: 750; text-transform: uppercase; }.neighbor-copy strong { font-family: var(--font-journey-display); font-size: clamp(.75rem, 1.2vw, 1rem); line-height: 1.18; }.neighbor-copy > span { color: color-mix(in srgb, var(--journey-surface) 78%, transparent); font-size: .66rem; }
@media (prefers-reduced-motion: reduce) { .journey-stage-card,.neighbor-trigger { transform: none !important; transition-duration: .01ms; animation-duration: .01ms; } }
</style>
