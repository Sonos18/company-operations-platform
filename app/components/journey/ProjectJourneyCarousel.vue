<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectDetail } from '../../features/projects/project.types'
import { createJourneyState } from '../../composables/useProjectJourney'
import JourneyFooter from './JourneyFooter.vue'
import JourneyStageRail from './JourneyStageRail.vue'
import JourneyStageCard from './JourneyStageCard.vue'

const props = defineProps<{ project: ProjectDetail }>()
const journey = createJourneyState(props.project.stages.map(stage => stage.id), props.project.currentStageId)
const focusedIndex = computed(() => props.project.stages.findIndex(stage => stage.id === journey.focusedStageId.value))
const focusedStage = computed(() => props.project.stages[focusedIndex.value] ?? props.project.stages[0]!)
const previousStage = computed(() => props.project.stages[focusedIndex.value - 1] ?? null)
const nextStage = computed(() => props.project.stages[focusedIndex.value + 1] ?? null)
const actualStage = computed(() => props.project.stages.find(stage => stage.id === props.project.currentStageId)!)
const statusLabel = {
  completed: 'Đã hoàn thành',
  active: 'Đang thực hiện',
  upcoming: 'Sắp thực hiện',
  incomplete: 'Chưa đầy đủ',
  not_applicable: 'Không áp dụng',
} as const

function handleKeyboard(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') journey.focusPrevious()
  if (event.key === 'ArrowRight') journey.focusNext()
}
</script>

<template>
  <section class="creative-momentum journey-dashboard">
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

    <JourneyStageRail
      :stages="project.stages"
      :focused-stage-id="focusedStage.id"
      :actual-current-stage-id="actualStage.id"
      @select="journey.focusStage"
    />

    <div
      class="journey-carousel__track"
      data-testid="desktop-journey-carousel"
      tabindex="0"
      aria-label="Hành trình các giai đoạn dự án"
      @keydown="handleKeyboard"
    >
      <JourneyStageCard v-if="previousStage" :stage="previousStage" :project-id="project.id" :focused="false" :actual-current="previousStage.id === actualStage.id" @focus="journey.focusStage" />
      <div v-else />
      <button type="button" class="carousel-control" :disabled="!previousStage" aria-label="Giai đoạn trước" @click="journey.focusPrevious"><UIcon name="i-lucide-chevron-left" /></button>
      <div data-testid="stage-focused">
        <JourneyStageCard :stage="focusedStage" :project-id="project.id" focused :actual-current="focusedStage.id === actualStage.id" @focus="journey.focusStage" />
      </div>
      <button type="button" class="carousel-control" :disabled="!nextStage" aria-label="Giai đoạn sau" @click="journey.focusNext"><UIcon name="i-lucide-chevron-right" /></button>
      <JourneyStageCard v-if="nextStage" :stage="nextStage" :project-id="project.id" :focused="false" :actual-current="nextStage.id === actualStage.id" @focus="journey.focusStage" />
      <div v-else />
    </div>

    <ol class="mobile-stage-list" data-testid="mobile-stage-list" aria-label="Danh sách các giai đoạn dự án">
      <li v-for="stage in project.stages" :key="stage.id" :class="{ 'is-current': stage.id === actualStage.id }">
        <NuxtLink :to="`/projects/${project.id}/stages/${stage.id}`">
          <img :src="stage.imageUrl" :alt="`Minh họa ${stage.name}`">
          <div class="mobile-stage-copy">
            <span>Giai đoạn {{ stage.code }} · {{ statusLabel[stage.status] }}</span>
            <strong>{{ stage.name }}</strong>
            <p>{{ stage.completedCount }}/{{ stage.totalCount }} bước · {{ stage.missingRecordCount }} hồ sơ còn thiếu</p>
          </div>
          <span v-if="stage.id === actualStage.id" class="mobile-current-marker">Hiện tại</span>
          <UIcon v-else name="i-lucide-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </li>
    </ol>

    <JourneyFooter :stage="focusedStage" />
  </section>
</template>

<style scoped>
.journey-dashboard { height: calc(100dvh - var(--header-height) - 48px); min-height: 610px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: white; }
.journey-heading { display: flex; align-items: end; justify-content: space-between; height: 88px; padding: 12px 18px; border-bottom: 1px solid var(--line); background: var(--paper); }
.journey-heading h1 { margin-top: 2px; font-size: clamp(1.4rem, 2.6vw, 2.2rem); line-height: 1; }.back-link { display: flex; align-items: center; gap: 5px; margin-bottom: 7px; color: var(--forest); font-size: 0.67rem; font-weight: 700; }
.actual-stage-context { display: grid; justify-items: end; gap: 2px; }.actual-stage-context strong { color: var(--forest-deep); font-size: 0.8rem; }.actual-stage-context button { border: 0; background: transparent; color: var(--forest); cursor: pointer; font-size: 0.66rem; font-weight: 750; text-decoration: underline; }
.actual-stage-status { display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono Variable', monospace; font-size: 0.6rem; font-weight: 750; letter-spacing: 0.06em; }.actual-stage-status span { width: 7px; height: 7px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mint) 40%, transparent); }
.journey-carousel__track { display: grid; grid-template-columns: 18% 3% 58% 3% 18%; align-items: center; height: calc(100% - 88px - 86px - 220px); overflow: hidden; background: #e9ebe5; }.journey-carousel__track > [data-testid='stage-focused'] { display: grid; height: 100%; place-items: center; }
.carousel-control { display: grid; width: 100%; height: 54px; place-items: center; border: 0; background: var(--forest); color: white; cursor: pointer; }.carousel-control:disabled { visibility: hidden; }
.mobile-stage-list { display: none; }
@media (max-width: 900px) { .journey-stage-card :deep(.stage-meta) { display: none; } }
@media (max-width: 767px) { .journey-dashboard { height: auto; min-height: 0; overflow: visible; border: 0; background: transparent; }.journey-heading { height: auto; align-items: start; padding: 12px 0 16px; background: transparent; }.actual-stage-context strong { max-width: 130px; text-align: right; }.journey-stage-rail,.journey-carousel__track { display: none; }.mobile-stage-list { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }.mobile-stage-list li { overflow: hidden; border: 1px solid var(--line); background: white; }.mobile-stage-list li.is-current { border: 2px solid var(--forest); }.mobile-stage-list a { display: grid; grid-template-columns: 76px minmax(0,1fr) auto; align-items: center; gap: 10px; min-height: 92px; padding: 8px 10px 8px 8px; }.mobile-stage-list img { width: 76px; height: 74px; object-fit: cover; }.mobile-stage-copy { display: grid; min-width: 0; gap: 3px; }.mobile-stage-copy > span { color: var(--ink-muted); font-family: 'JetBrains Mono Variable',monospace; font-size: .55rem; }.mobile-stage-copy strong { color: var(--forest-deep); font-size: .78rem; }.mobile-stage-copy p { color: var(--ink-muted); font-size: .61rem; }.mobile-current-marker { padding: 4px 5px; background: var(--mint); color: var(--forest-deep); font-size: .55rem; font-weight: 800; }.journey-footer { display: none; } }
</style>
