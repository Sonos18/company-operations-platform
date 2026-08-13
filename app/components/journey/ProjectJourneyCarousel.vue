<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProjectDetail } from '../../features/projects/project.types'
import { summarizeProjectJourney } from '../../features/journey/journey.presenter'
import { createJourneyState } from '../../composables/useProjectJourney'
import JourneyFooter from './JourneyFooter.vue'
import JourneyStageRail from './JourneyStageRail.vue'
import JourneyStageCard from './JourneyStageCard.vue'

interface JourneyCarouselRef {
  emblaApi?: {
    selectedScrollSnap: () => number
    scrollTo: (index: number) => void
  }
}

const props = defineProps<{ project: ProjectDetail }>()
const journey = createJourneyState(props.project.stages.map(stage => stage.id), props.project.currentStageId)
const carousel = ref<JourneyCarouselRef | null>(null)
const reducedMotion = ref(false)
let reducedMotionQuery: MediaQueryList | null = null

const focusedIndex = computed(() => props.project.stages.findIndex(stage => stage.id === journey.focusedStageId.value))
const focusedStage = computed(() => props.project.stages[focusedIndex.value] ?? props.project.stages[0]!)
const actualStage = computed(() => props.project.stages.find(stage => stage.id === props.project.currentStageId)!)
const actualStageIndex = computed(() => props.project.stages.findIndex(stage => stage.id === props.project.currentStageId))
const summary = computed(() => summarizeProjectJourney(props.project))

function syncReducedMotion() {
  reducedMotion.value = reducedMotionQuery?.matches ?? false
}

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncReducedMotion()
  reducedMotionQuery.addEventListener('change', syncReducedMotion)
})

onBeforeUnmount(() => {
  reducedMotionQuery?.removeEventListener('change', syncReducedMotion)
})

function selectStage(stageId: string) {
  journey.focusStage(stageId)
}

function handleCarouselSelect(index: number) {
  const stage = props.project.stages[index]
  if (stage && stage.id !== journey.focusedStageId.value) journey.focusStage(stage.id)
}

watch(focusedIndex, (index) => {
  if (index >= 0 && carousel.value?.emblaApi?.selectedScrollSnap() !== index) {
    carousel.value?.emblaApi?.scrollTo(index)
  }
})
</script>

<template>
  <section class="creative-momentum project-journey" data-testid="project-journey">
    <header class="journey-header">
      <UBreadcrumb :items="[{ label: 'Dự án', to: '/projects' }, { label: project.name }]" />
      <div class="journey-heading">
        <div>
          <p class="journey-code">{{ project.code }} · {{ project.location }}</p>
          <h1>{{ project.name }}</h1>
        </div>
        <div class="actual-stage-context">
          <UBadge color="success" variant="subtle">Giai đoạn hiện tại: {{ actualStage.name }}</UBadge>
          <UButton v-if="focusedStage.id !== actualStage.id" color="neutral" variant="ghost" @click="journey.returnToCurrent">
            Quay về giai đoạn hiện tại
          </UButton>
        </div>
      </div>
    </header>

    <div class="journey-summary" data-testid="journey-summary">
      <UCard><strong>{{ summary.completedStages }}/{{ summary.totalStages }}</strong><span>giai đoạn hoàn tất</span><UProgress :model-value="summary.completedStages" :max="summary.totalStages" /></UCard>
      <UCard><strong>{{ summary.openSteps }}</strong><span>bước đang mở</span></UCard>
      <UCard><strong>{{ summary.missingRecords }}</strong><span>hồ sơ còn thiếu</span></UCard>
    </div>

    <JourneyStageRail
      :stages="project.stages"
      :focused-stage-id="focusedStage.id"
      :actual-current-stage-id="actualStage.id"
      @select="selectStage"
    />

    <div class="carousel-shell">
      <UButton icon="i-lucide-chevron-left" aria-label="Giai đoạn trước" :disabled="focusedIndex === 0" @click="journey.focusPrevious" />
      <UCarousel
        ref="carousel"
        data-testid="journey-carousel"
        :items="project.stages"
        :start-index="actualStageIndex"
        :loop="false"
        :duration="reducedMotion ? 0 : 28"
        align="center"
        :ui="{
          container: 'items-stretch -ms-3',
          item: 'ps-3 basis-[92%] md:basis-[74%] xl:basis-[58%]',
        }"
        aria-label="Hành trình các giai đoạn dự án"
        @select="handleCarouselSelect"
      >
        <template #default="{ item: stage }">
          <JourneyStageCard
            :stage="stage"
            :project-id="project.id"
            :focused="stage.id === focusedStage.id"
            :actual-current="stage.id === actualStage.id"
            @focus="selectStage"
          />
        </template>
      </UCarousel>
      <UButton icon="i-lucide-chevron-right" aria-label="Giai đoạn sau" :disabled="focusedIndex === project.stages.length - 1" @click="journey.focusNext" />
    </div>

    <p class="sr-only" aria-live="polite">
      Đang xem giai đoạn {{ focusedStage.code }}: {{ focusedStage.name }}{{ focusedStage.id === actualStage.id ? ', đây là giai đoạn hiện tại' : '' }}.
    </p>

    <JourneyFooter :stage="focusedStage" />
  </section>
</template>

<style scoped>
.project-journey { display: grid; gap: 20px; max-width: 1480px; padding: 20px; margin: 0 auto; border-radius: var(--journey-radius); background: var(--journey-canvas); }
.journey-header { display: grid; gap: 16px; }
.journey-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; }
.journey-code { color: var(--journey-muted); font-family: var(--font-journey-mono); font-size: .7rem; font-weight: 750; letter-spacing: .05em; }
.journey-heading h1 { margin-top: 4px; font-size: clamp(1.5rem, 2.6vw, 2.3rem); line-height: 1.1; }
.actual-stage-context { display: grid; justify-items: end; gap: 6px; }
.journey-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.journey-summary :deep([data-slot='root']) { display: grid; gap: 5px; border-color: var(--journey-border); background: var(--journey-surface); }
.journey-summary strong { color: var(--journey-primary); font-family: var(--font-journey-display); font-size: 1.4rem; }
.journey-summary span { color: var(--journey-muted); font-size: .7rem; }
.carousel-shell { display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; align-items: center; gap: 10px; min-width: 0; }
.carousel-shell > :deep(.button) { height: 48px; }
.carousel-shell :deep([data-slot='root']) { min-width: 0; }

@media (max-width: 639px) {
  .project-journey { gap: 16px; padding: 14px; border-radius: 0; }
  .journey-heading { align-items: start; flex-direction: column; }
  .actual-stage-context { justify-items: start; }
  .journey-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .journey-summary > :first-child { grid-column: 1 / -1; }
  .carousel-shell { grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 4px; }
}
</style>
