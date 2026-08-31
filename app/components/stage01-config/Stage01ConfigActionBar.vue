<script setup lang="ts">
const props = defineProps<{
  hasDraft: boolean
  dirty: boolean
  pending: boolean
  canUpdate: boolean
  canPublish: boolean
}>()

const emit = defineEmits<{
  save: []
  reset: []
  discard: []
  publish: []
}>()
</script>

<template>
  <aside v-if="props.hasDraft" class="config-action-bar" aria-label="Thao tác bản nháp">
    <p class="config-action-bar__state" role="status">
      <UIcon :name="props.dirty ? 'i-lucide-circle-dot-dashed' : 'i-lucide-circle-check'" aria-hidden="true" />
      {{ props.dirty ? 'Có thay đổi chưa lưu' : 'Bản nháp đã đồng bộ' }}
    </p>
    <div class="config-action-bar__actions">
      <UButton v-if="props.canUpdate" :disabled="props.pending || !props.dirty" icon="i-lucide-save" @click="emit('save')">Lưu bản nháp</UButton>
      <UButton v-if="props.canUpdate && props.dirty" :disabled="props.pending" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="emit('reset')">Hủy thay đổi chưa lưu</UButton>
      <UButton v-if="props.canUpdate" :disabled="props.pending" color="error" variant="outline" icon="i-lucide-trash-2" @click="emit('discard')">Hủy bản nháp</UButton>
      <UButton v-if="props.canPublish" :disabled="props.pending || props.dirty" color="success" icon="i-lucide-send" @click="emit('publish')">Xuất bản</UButton>
    </div>
  </aside>
</template>

<style scoped>
.config-action-bar { position: sticky; bottom: 14px; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px; border: 1px solid color-mix(in srgb, var(--forest) 24%, var(--line)); border-radius: var(--radius-md); background: color-mix(in srgb, var(--paper) 94%, white); box-shadow: 0 10px 28px color-mix(in srgb, var(--forest-deep) 12%, transparent); }.config-action-bar__state { display: inline-flex; align-items: center; gap: 7px; margin: 0; color: var(--forest-deep); font-size: .78rem; font-weight: 750; }.config-action-bar__state :deep(svg) { width: 17px; height: 17px; }.config-action-bar__actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 7px; }
@media (max-width: 760px) { .config-action-bar { position: static; display: grid; }.config-action-bar__actions { justify-content: start; } }
</style>
