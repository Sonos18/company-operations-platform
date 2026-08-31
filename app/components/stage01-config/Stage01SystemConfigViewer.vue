<script setup lang="ts">
import type { Stage01BusinessConfigSystem } from '../../../shared/schemas/stage01-config'
import { stage01DimensionOptions } from '../../features/stage01-config/stage01-config-editor'

const props = defineProps<{
  system: Stage01BusinessConfigSystem
}>()

function summarize(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} mục`
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key}: ${typeof item === 'string' ? item : '…'}`)
    .join(' · ') || 'Không có chi tiết'
  return 'Không có chi tiết'
}

const dimensionLabels = computed(() => props.system.dimensions.map(dimension =>
  stage01DimensionOptions.find(option => option.value === dimension)?.label ?? dimension,
))
</script>

<template>
  <section class="system-viewer" aria-labelledby="system-viewer-heading">
    <header>
      <div><p class="eyebrow">Hệ thống quản lý</p><h2 id="system-viewer-heading">Cấu hình kỹ thuật</h2></div>
      <UBadge color="neutral" variant="subtle">Chỉ đọc</UBadge>
    </header>
    <p>Phần này giúp nhận biết ranh giới hệ thống; các trường kỹ thuật không thể chỉnh sửa tại đây.</p>
    <dl>
      <div><dt>Nút workflow</dt><dd>{{ props.system.nodes.length }} nút</dd></div>
      <div><dt>Phụ thuộc</dt><dd>{{ props.system.dependencies.length }} liên kết</dd></div>
      <div><dt>Nhóm đánh giá</dt><dd><span v-for="label in dimensionLabels" :key="label" class="system-chip">{{ label }}</span></dd></div>
      <div><dt>Khả năng</dt><dd><span v-for="(value, key) in props.system.capabilities" :key="key" class="system-chip"><code>{{ key }}</code> · {{ value }}</span></dd></div>
      <div><dt>Điều kiện hệ thống</dt><dd>{{ summarize(props.system.gates) }}</dd></div>
    </dl>
    <details>
      <summary>Chi tiết kỹ thuật</summary>
      <div class="technical-details">
        <p><strong>Nút:</strong> {{ summarize(props.system.nodes) }}</p>
        <p><strong>Phụ thuộc:</strong> {{ summarize(props.system.dependencies) }}</p>
        <p><strong>Điều kiện:</strong> {{ summarize(props.system.gates) }}</p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.system-viewer { display: grid; gap: 11px; padding: 16px; border: 1px solid var(--line); background: var(--paper-raised); }.system-viewer > header { display: flex; align-items: start; justify-content: space-between; gap: 12px; }.system-viewer h2 { margin: 3px 0 0; color: var(--forest-deep); font-size: 1.25rem; }.system-viewer > p { margin: 0; color: var(--ink-muted); font-size: .8rem; line-height: 1.45; }.system-viewer dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin: 0; }.system-viewer dl > div { display: grid; gap: 5px; min-width: 0; padding: 10px; border: 1px solid var(--line); background: white; }.system-viewer dt { color: var(--ink-muted); font-size: .64rem; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }.system-viewer dd { display: flex; flex-wrap: wrap; gap: 5px; margin: 0; color: var(--forest-deep); font-size: .78rem; line-height: 1.4; overflow-wrap: anywhere; }.system-chip { padding: 3px 6px; border-radius: 999px; background: color-mix(in srgb, var(--forest) 8%, white); color: var(--forest-deep); font-size: .7rem; }.system-viewer details { border-top: 1px solid var(--line); padding-top: 10px; }.system-viewer summary { cursor: pointer; color: var(--forest); font-size: .78rem; font-weight: 750; }.technical-details { display: grid; gap: 7px; padding-top: 9px; }.technical-details p { margin: 0; color: var(--ink-muted); font-size: .75rem; line-height: 1.45; overflow-wrap: anywhere; }.technical-details strong { color: var(--forest-deep); }
@media (max-width: 620px) { .system-viewer dl { grid-template-columns: 1fr; } }
</style>
