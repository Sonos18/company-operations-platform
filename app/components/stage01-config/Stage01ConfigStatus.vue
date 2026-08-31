<script setup lang="ts">
import type { Stage01ConfigDraft, Stage01PublishedConfig } from '../../../shared/schemas/stage01-config'

const props = defineProps<{
  description: string
  published: Stage01PublishedConfig
  draft: Stage01ConfigDraft | null
}>()

const publishedAt = computed(() => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(props.published.publishedAt)))
</script>

<template>
  <header class="config-status">
    <div class="config-status__intro">
      <p class="eyebrow">Thiết lập quản trị</p>
      <h1>Cấu hình Stage 01</h1>
      <p>{{ props.description }}</p>
    </div>
    <dl class="config-status__metadata" aria-label="Trạng thái cấu hình">
      <div>
        <dt>Phiên bản đang xuất bản</dt>
        <dd>Mẫu v{{ props.published.templateVersion }}</dd>
      </div>
      <div>
        <dt>Xuất bản lúc</dt>
        <dd>{{ publishedAt }}</dd>
      </div>
      <div>
        <dt>Trạng thái bản nháp</dt>
        <dd>
          <UBadge :color="props.draft ? 'warning' : 'neutral'" variant="subtle">
            {{ props.draft ? 'Có bản nháp chưa xuất bản' : 'Không có bản nháp' }}
          </UBadge>
        </dd>
      </div>
      <div v-if="props.draft">
        <dt>Phiên bản bản nháp</dt>
        <dd>v{{ props.draft.version }}</dd>
      </div>
    </dl>
  </header>
</template>

<style scoped>
.config-status { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, .6fr); gap: 22px; align-items: end; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
.config-status__intro { display: grid; gap: 7px; }.config-status h1 { margin: 0; color: var(--forest-deep); font-size: clamp(2rem, 4vw, 3.4rem); line-height: .95; }.config-status__intro > p:last-child { max-width: 720px; margin: 0; color: var(--ink-muted); line-height: 1.55; }
.config-status__metadata { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; }.config-status__metadata > div { display: grid; gap: 4px; min-width: 0; padding: 11px 12px; border: 1px solid var(--line); background: var(--paper-raised); }.config-status dt { color: var(--ink-muted); font-size: .64rem; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }.config-status dd { margin: 0; color: var(--forest-deep); font-size: .8rem; font-weight: 700; overflow-wrap: anywhere; }
@media (max-width: 760px) { .config-status { grid-template-columns: 1fr; }.config-status__metadata { grid-template-columns: 1fr; } }
</style>
