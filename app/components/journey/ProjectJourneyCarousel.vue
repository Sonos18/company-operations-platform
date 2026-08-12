<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectDetail } from '../../features/projects/project.types'
import { createJourneyState } from '../../composables/useProjectJourney'
import JourneyFooter from './JourneyFooter.vue'
import StageCardFocused from './StageCardFocused.vue'
import StageCardNeighbor from './StageCardNeighbor.vue'

const props = defineProps<{ project: ProjectDetail }>()
const journey = createJourneyState(props.project.stages.map(stage => stage.id), props.project.currentStageId)
const focusedIndex = computed(() => props.project.stages.findIndex(stage => stage.id === journey.focusedStageId.value))
const focusedStage = computed(() => props.project.stages[focusedIndex.value] ?? props.project.stages[0]!)
const previousStage = computed(() => props.project.stages[focusedIndex.value - 1] ?? null)
const nextStage = computed(() => props.project.stages[focusedIndex.value + 1] ?? null)
const actualStage = computed(() => props.project.stages.find(stage => stage.id === props.project.currentStageId)!)

function handleKeyboard(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') journey.focusPrevious()
  if (event.key === 'ArrowRight') journey.focusNext()
}
</script>

<template>
  <section class="journey-dashboard">
    <header class="journey-heading">
      <div>
        <NuxtLink to="/projects" class="back-link"><UIcon name="i-lucide-arrow-left" /> Tất cả dự án</NuxtLink>
        <p class="eyebrow">{{ project.code }} · {{ project.location }}</p>
        <h1>{{ project.name }}</h1>
      </div>
      <div class="actual-stage-context">
        <span class="actual-stage-status"><span /> ĐANG THỰC HIỆN</span>
        <strong>{{ actualStage.name }}</strong>
        <button v-if="focusedStage.id !== actualStage.id" type="button" @click="journey.returnToCurrent">Quay về giai đoạn hiện tại</button>
      </div>
    </header>

    <div
      class="journey-carousel__track"
      data-testid="desktop-journey-carousel"
      tabindex="0"
      aria-label="Hành trình các giai đoạn dự án"
      @keydown="handleKeyboard"
    >
      <StageCardNeighbor v-if="previousStage" :stage="previousStage" @select="journey.focusPrevious" />
      <div v-else />
      <button type="button" class="carousel-control" :disabled="!previousStage" aria-label="Giai đoạn trước" @click="journey.focusPrevious"><UIcon name="i-lucide-chevron-left" /></button>
      <StageCardFocused :stage="focusedStage" :project-id="project.id" :is-actual-current="focusedStage.id === actualStage.id" />
      <button type="button" class="carousel-control" :disabled="!nextStage" aria-label="Giai đoạn sau" @click="journey.focusNext"><UIcon name="i-lucide-chevron-right" /></button>
      <StageCardNeighbor v-if="nextStage" :stage="nextStage" @select="journey.focusNext" />
      <div v-else />
    </div>

    <JourneyFooter :stage="focusedStage" />
  </section>
</template>

<style scoped>
.journey-dashboard { height: calc(100dvh - var(--header-height) - 48px); min-height: 610px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: white; }
.journey-heading { display: flex; align-items: end; justify-content: space-between; height: 88px; padding: 12px 18px; border-bottom: 1px solid var(--line); background: var(--paper); }
.journey-heading h1 { margin-top: 2px; font-size: clamp(1.4rem, 2.6vw, 2.2rem); line-height: 1; }.back-link { display: flex; align-items: center; gap: 5px; margin-bottom: 7px; color: var(--forest); font-size: 0.67rem; font-weight: 700; }
.actual-stage-context { display: grid; justify-items: end; gap: 2px; }.actual-stage-context strong { color: var(--forest-deep); font-size: 0.8rem; }.actual-stage-context button { border: 0; background: transparent; color: var(--forest); cursor: pointer; font-size: 0.66rem; font-weight: 750; text-decoration: underline; }
.actual-stage-status { display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono Variable', monospace; font-size: 0.6rem; font-weight: 750; letter-spacing: 0.06em; }.actual-stage-status span { width: 7px; height: 7px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mint) 40%, transparent); }
.journey-carousel__track { display: grid; grid-template-columns: 18% 3% 58% 3% 18%; align-items: center; height: calc(100% - 88px - 220px); overflow: hidden; background: #e9ebe5; }
.carousel-control { display: grid; width: 100%; height: 54px; place-items: center; border: 0; background: var(--forest); color: white; cursor: pointer; }.carousel-control:disabled { visibility: hidden; }
@media (max-width: 900px) { .stage-card-focused :deep(.stage-stats) { display: none; } }
@media (max-width: 767px) { .journey-dashboard { height: auto; min-height: 0; overflow: visible; }.journey-heading { height: auto; align-items: start; }.actual-stage-context strong { max-width: 130px; text-align: right; }.journey-carousel__track { grid-template-columns: 1fr; height: 520px; padding: 12px; }.journey-carousel__track > *:not(.stage-card-focused) { display: none; }.journey-footer { grid-template-columns: 1fr; height: auto; }.journey-footer :deep(section) { min-height: 150px; } }
</style>
