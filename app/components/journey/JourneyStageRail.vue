<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { stageStatusLabel } from '../../features/journey/journey.presenter'
import type { ProjectStage } from '../../features/journey/journey.types'

const props = defineProps<{
  stages: ProjectStage[]
  focusedStageId: string
  actualCurrentStageId: string
}>()

const emit = defineEmits<{ select: [stageId: string] }>()
const rail = ref<HTMLOListElement | null>(null)

watch(
  () => props.focusedStageId,
  async (stageId) => {
    await nextTick()
    rail.value?.querySelector<HTMLElement>(`[data-stage-id="${stageId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  },
  { immediate: true },
)
</script>

<template>
  <ol ref="rail" class="journey-stage-rail" data-testid="journey-stage-rail" aria-label="Các giai đoạn của dự án">
    <li v-for="stage in stages" :key="stage.id" :class="`is-${stage.status}`">
      <UButton
        :data-stage-id="stage.id"
        :aria-current="stage.id === focusedStageId ? 'step' : undefined"
        :aria-label="`Xem giai đoạn ${stage.code}: ${stage.name}`"
        color="neutral"
        variant="ghost"
        @click="emit('select', stage.id)"
      >
        <span class="rail-node" aria-hidden="true">
          <UIcon :name="stage.status === 'completed' ? 'i-lucide-check' : 'i-lucide-circle'" />
        </span>
        <span class="rail-copy">
          <small>Giai đoạn {{ stage.code }}</small>
          <strong>{{ stage.name }}</strong>
          <em>{{ stage.id === actualCurrentStageId ? 'Hiện tại' : stageStatusLabel[stage.status] }}</em>
        </span>
      </UButton>
    </li>
  </ol>
</template>

<style scoped>
.journey-stage-rail { display: flex; padding: 0 4px 10px; margin: 0; overflow-x: auto; list-style: none; scroll-snap-type: x proximity; }
.journey-stage-rail li { position: relative; flex: 1 0 132px; scroll-snap-align: center; }
.journey-stage-rail li::after { position: absolute; z-index: 0; top: 21px; left: 50%; width: 100%; height: 2px; background: var(--journey-border); content: ''; }
.journey-stage-rail li:last-child::after { display: none; }
.journey-stage-rail button { position: relative; z-index: 1; display: grid; justify-items: center; width: 100%; min-height: 76px; gap: 6px; color: var(--journey-muted); text-align: center; }
.rail-node { display: grid; width: 34px; height: 34px; place-items: center; border: 3px solid var(--journey-canvas); border-radius: 50%; background: var(--journey-surface); box-shadow: 0 0 0 1px var(--journey-border); }
.rail-copy { display: grid; max-width: 140px; gap: 2px; }
.rail-copy small,.rail-copy em { font-family: var(--font-journey-mono); font-size: .58rem; font-style: normal; }
.rail-copy strong { overflow: hidden; font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }
.journey-stage-rail button[aria-current='step'] { color: var(--journey-primary); }
.journey-stage-rail button[aria-current='step'] .rail-node { background: var(--journey-mint); box-shadow: 0 0 0 1px var(--journey-primary); }
.journey-stage-rail .is-completed::after { background: var(--journey-mint); }
@media (prefers-reduced-motion: reduce) { .journey-stage-rail { scroll-behavior: auto; transition-duration: .01ms; animation-duration: .01ms; } }
</style>
