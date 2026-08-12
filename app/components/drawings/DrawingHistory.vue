<script setup lang="ts">
import type { DrawingFile } from '../../features/drawings/drawing.types'

defineProps<{
  files: DrawingFile[]
  busyFileId: string | null
}>()

defineEmits<{
  setCurrent: [fileId: string]
  setApproved: [fileId: string, approved: boolean]
}>()

function formatDate(value: string | null) {
  if (!value) return 'nay'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function relationshipCopy(file: DrawingFile, files: DrawingFile[]) {
  if (!file.parentFileId) return null
  const parent = files.find(item => item.id === file.parentFileId)
  if (!parent) return null
  const action = file.relationship === 'supplement' ? 'Bổ sung cho' : file.relationship === 'replacement' ? 'Thay thế' : 'Liên quan'
  return `${action} ${parent.code} v${parent.versionNumber}`
}
</script>

<template>
  <section class="drawing-history">
    <div class="history-heading">
      <div><p class="eyebrow">Toàn bộ phiên bản</p><h2>Lịch sử bản vẽ</h2></div>
      <span>{{ files.length }} tệp đã lưu</span>
    </div>

    <div class="history-table" role="table" aria-label="Lịch sử phiên bản bản vẽ">
      <div class="table-head" role="row">
        <span>Phiên bản</span><span>Hiệu lực</span><span>Phân loại</span><span>Trạng thái</span><span class="sr-only">Thao tác</span>
      </div>
      <article v-for="file in files" :id="file.id" :key="file.id" class="history-row" role="row">
        <div class="version-cell">
          <img :src="file.url" :alt="`Xem trước ${file.originalFilename}`">
          <span><strong>{{ file.code }} · v{{ file.versionNumber }}</strong><small>{{ file.originalFilename }}</small><a v-if="relationshipCopy(file, files)" :href="`#${file.parentFileId}`">{{ relationshipCopy(file, files) }}</a></span>
        </div>
        <div><strong>{{ formatDate(file.effectiveFrom) }}</strong><small>đến {{ formatDate(file.effectiveTo) }}</small></div>
        <div><strong>{{ file.category }}</strong><small>{{ file.uploadedByName }} · {{ formatDate(file.uploadedAt) }}</small></div>
        <div class="badges">
          <span v-if="file.versionNumber === Math.max(...files.map(item => item.versionNumber))">Mới tải lên</span>
          <span v-if="file.isCurrent" class="is-current">Đang lưu hành</span>
          <span v-if="file.customerApproved" class="is-approved">Khách đã chốt</span>
          <span v-if="file.relationship === 'supplement'">Bản bổ sung</span>
        </div>
        <div class="row-actions">
          <button v-if="!file.isCurrent && file.relationship !== 'supplement'" type="button" :disabled="busyFileId === file.id" @click="$emit('setCurrent', file.id)">
            Đặt v{{ file.versionNumber }} làm bản lưu hành
          </button>
          <button type="button" class="secondary-action" :disabled="busyFileId === file.id" @click="$emit('setApproved', file.id, !file.customerApproved)">
            {{ file.customerApproved ? 'Bỏ mốc khách đã chốt' : `Đánh dấu v${file.versionNumber} khách đã chốt` }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.drawing-history { min-width: 0; padding: 18px; border: 1px solid var(--line); background: white; }.history-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 15px; }.history-heading h2 { margin-top: 3px; }.history-heading > span { color: var(--ink-muted); font-size: .72rem; }
.history-table { display: grid; max-width: 100%; overflow-x: auto; }.table-head,.history-row { display: grid; grid-template-columns: minmax(210px,1.25fr) minmax(120px,.65fr) minmax(170px,1fr) minmax(150px,.9fr) minmax(180px,.9fr); gap: 12px; align-items: center; min-width: 900px; }.table-head { padding: 8px 10px; background: var(--paper); color: var(--ink-muted); font-family: 'JetBrains Mono Variable',monospace; font-size: .61rem; letter-spacing: .05em; text-transform: uppercase; }.history-row { padding: 12px 10px; border-bottom: 1px solid var(--line); scroll-margin-top: 90px; }.history-row > div:not(.version-cell):not(.badges):not(.row-actions),.version-cell > span { display: grid; gap: 2px; }.history-row small { color: var(--ink-muted); font-size: .64rem; }.version-cell { display: grid; grid-template-columns: 58px 1fr; align-items: center; gap: 9px; min-width: 0; }.version-cell img { width: 58px; height: 42px; object-fit: cover; }.version-cell strong,.version-cell small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.version-cell a { width: fit-content; color: var(--forest); font-size: .65rem; text-decoration: underline; text-underline-offset: 2px; }
.badges { display: flex; flex-wrap: wrap; gap: 4px; }.badges span { padding: 4px 6px; background: var(--paper); color: var(--ink-muted); font-size: .6rem; font-weight: 750; }.badges .is-current { background: var(--forest); color: white; }.badges .is-approved { background: var(--mint); color: var(--forest-deep); }
.row-actions { display: grid; gap: 5px; }.row-actions button { min-height: 32px; padding: 5px 8px; border: 1px solid var(--forest); background: var(--forest); color: white; cursor: pointer; font: inherit; font-size: .65rem; font-weight: 750; }.row-actions button.secondary-action { background: white; color: var(--forest); }.row-actions button:disabled { cursor: wait; opacity: .55; }
</style>
