<script setup lang="ts">
import type { ProjectStage } from '../../features/journey/journey.types'

defineProps<{ stage: ProjectStage }>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button class="stage-card-neighbor" type="button" data-testid="stage-neighbor" :aria-label="`Xem giai đoạn ${stage.name}`" @click="$emit('select')">
    <img :src="stage.imageUrl" :alt="`Minh họa ${stage.name}`">
    <span class="stage-card-neighbor__scrim" />
    <span class="stage-card-neighbor__content">
      <span class="neighbor-status">{{ stage.status === 'completed' ? 'Đã hoàn thành' : stage.status === 'active' ? 'Đang thực hiện' : 'Sắp tới' }}</span>
      <strong>{{ stage.code }} · {{ stage.name }}</strong>
      <small>{{ stage.completedCount }}/{{ stage.totalCount }} bước</small>
    </span>
  </button>
</template>

<style scoped>
.stage-card-neighbor { position: relative; width: 100%; height: 54%; min-height: 0; padding: 0; overflow: hidden; border: 0; border-radius: var(--radius-md); background: var(--forest); color: white; cursor: pointer; text-align: left; }
img,.stage-card-neighbor__scrim { position: absolute; inset: 0; width: 100%; height: 100%; }
img { object-fit: cover; }.stage-card-neighbor__scrim { background: linear-gradient(180deg, rgb(8 25 17 / 16%), rgb(8 25 17 / 84%)); }
.stage-card-neighbor__content { position: absolute; z-index: 1; inset: auto 14px 15px; display: grid; gap: 5px; }
.neighbor-status { width: fit-content; padding: 4px 6px; background: var(--mint); color: var(--forest-deep); font-family: 'JetBrains Mono Variable', monospace; font-size: 0.58rem; font-weight: 750; text-transform: uppercase; }
strong { font-family: 'Space Grotesk Variable', sans-serif; font-size: clamp(0.75rem, 1.2vw, 1rem); line-height: 1.18; }
small { color: #d4ddd8; font-size: 0.66rem; }
</style>
