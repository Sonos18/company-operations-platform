<script setup lang="ts">
import type { ProjectMedia } from '../../features/media/media.types'

const props = defineProps<{
  media: ProjectMedia[]
  compact?: boolean
}>()

const target = computed(() => props.media.find(item => item.kind === 'design_target') ?? null)
const current = computed(() => props.media.filter(item => item.kind === 'progress').sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))[0] ?? null)

function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <div class="site-comparison" :class="{ 'is-compact': compact }">
    <article data-testid="design-target">
      <img v-if="target" :src="target.url" :alt="target.description">
      <div class="comparison-label"><span>Mục tiêu đã chốt</span><strong v-if="target">{{ target.workArea }}</strong><small v-if="target">Từ phương án thiết kế được duyệt</small></div>
    </article>
    <article data-testid="site-current">
      <img v-if="current" :src="current.url" :alt="current.description">
      <div class="comparison-label"><span>Hiện trạng mới nhất</span><strong v-if="current">{{ current.photographerName }} · {{ current.workArea }}</strong><small v-if="current">{{ formatTime(current.capturedAt) }}</small></div>
    </article>
  </div>
</template>

<style scoped>
.site-comparison { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); width: 100%; height: 100%; gap: 2px; background: var(--paper); }.site-comparison article { position: relative; min-width: 0; overflow: hidden; background: #d8ddd6; }.site-comparison article::after { position: absolute; inset: 0; background: linear-gradient(180deg,rgb(8 25 17 / 4%) 30%,rgb(8 25 17 / 78%)); content: ''; }.site-comparison img { width: 100%; height: 100%; object-fit: cover; }.comparison-label { position: absolute; z-index: 1; right: 13px; bottom: 12px; left: 13px; display: grid; color: white; }.comparison-label span { width: fit-content; margin-bottom: 5px; padding: 4px 6px; background: var(--mint); color: var(--forest-deep); font-size: .61rem; font-weight: 800; }.comparison-label strong { overflow: hidden; font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }.comparison-label small { color: rgb(255 255 255 / 78%); font-size: .6rem; }
.site-comparison:not(.is-compact) { min-height: 320px; }.site-comparison:not(.is-compact) .comparison-label { right: 18px; bottom: 17px; left: 18px; }.site-comparison:not(.is-compact) .comparison-label strong { font-size: 1rem; }
@media (max-width: 560px) { .site-comparison:not(.is-compact) { grid-template-columns: 1fr; min-height: 520px; } }
</style>
