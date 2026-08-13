<script setup lang="ts">
import type { ProjectMedia } from '../../features/media/media.types'
import { getStageProgress, stageStatusLabel } from '../../features/journey/journey.presenter'
import type { ProjectStage } from '../../features/journey/journey.types'
import SiteVisualComparison from '../media/SiteVisualComparison.vue'

const props = defineProps<{
  stage: ProjectStage
  projectId: string
  focused: boolean
  actualCurrent: boolean
}>()

const emit = defineEmits<{ focus: [stageId: string] }>()
const repositories = useRepositories()
const media = ref<ProjectMedia[]>([])
const mediaPending = ref(false)
const mediaError = ref('')
let mediaRequest = 0

watch(
  [() => props.focused, () => props.stage.id],
  async ([focused]) => {
    const request = ++mediaRequest
    media.value = []
    mediaError.value = ''
    if (!focused || props.stage.visualKind !== 'construction_comparison') return

    mediaPending.value = true
    try {
      const result = await repositories.media.listByStage(props.stage.id)
      if (request === mediaRequest) media.value = result
    } catch {
      if (request === mediaRequest) mediaError.value = 'Không thể tải hình ảnh của giai đoạn này.'
    } finally {
      if (request === mediaRequest) mediaPending.value = false
    }
  },
  { immediate: true },
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
.journey-stage-card { width: 100%; height: 54%; min-height: 0; overflow: hidden; border: 1px solid color-mix(in srgb, var(--forest) 30%, var(--line)); border-radius: var(--radius-md); background: white; transition: opacity .2s ease, transform .2s ease, box-shadow .2s ease; }
.journey-stage-card:not(.is-focused) { transform: scale(.94); opacity: .68; }
.journey-stage-card.is-focused { height: 84%; transform: translateY(-4px) scale(1.015); box-shadow: 0 18px 36px rgb(8 25 17 / 22%); }
.journey-stage-card :deep([data-slot='body']) { height: 100%; padding: 0; }
.journey-stage-card.is-focused :deep([data-slot='body']) { display: grid; grid-template-rows: minmax(0, 60%) minmax(0, 40%); }
.stage-visual { position: relative; min-height: 0; overflow: hidden; background: #d9ddd4; }.stage-visual > img,.stage-visual > :deep(.site-comparison),.stage-visual > :deep(.skeleton) { width: 100%; height: 100%; object-fit: cover; }.stage-visual > :deep(.alert) { height: 100%; border-radius: 0; }
.stage-card-copy { display: grid; grid-template-columns: 1fr auto; align-content: start; gap: 8px 14px; min-height: 0; padding: 13px 16px; }.stage-card-copy h2,.stage-card-copy p,.stage-card-copy > :deep(.progress),.stage-meta { grid-column: 1 / -1; }.stage-card-copy h2 { color: var(--forest-deep); font-size: clamp(1rem, 1.7vw, 1.6rem); line-height: 1.08; }.stage-card-copy p { color: var(--ink-muted); font-size: clamp(.67rem, .8vw, .78rem); line-height: 1.35; }.stage-card-topline { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--forest); font-family: 'JetBrains Mono Variable', monospace; font-size: .59rem; font-weight: 750; letter-spacing: .05em; }.stage-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--ink-muted); font-size: .6rem; }.stage-card-copy > :deep(.button) { min-height: 30px; font-size: .65rem; }
.neighbor-trigger { position: relative; display: block; width: 100%; height: 100%; min-height: 0; padding: 0; overflow: hidden; border: 0; background: var(--forest); color: white; cursor: pointer; text-align: left; }.neighbor-trigger > img,.neighbor-scrim { position: absolute; inset: 0; width: 100%; height: 100%; }.neighbor-trigger > img { object-fit: cover; }.neighbor-scrim { background: linear-gradient(180deg, rgb(8 25 17 / 16%), rgb(8 25 17 / 84%)); }.neighbor-copy { position: absolute; z-index: 1; right: 14px; bottom: 15px; left: 14px; display: grid; gap: 5px; }.neighbor-copy small { width: fit-content; padding: 4px 6px; background: var(--mint); color: var(--forest-deep); font-family: 'JetBrains Mono Variable', monospace; font-size: .58rem; font-weight: 750; text-transform: uppercase; }.neighbor-copy strong { font-family: 'Space Grotesk Variable', sans-serif; font-size: clamp(.75rem, 1.2vw, 1rem); line-height: 1.18; }.neighbor-copy > span { color: #d4ddd8; font-size: .66rem; }
</style>
