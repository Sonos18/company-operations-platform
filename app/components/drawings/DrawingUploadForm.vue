<script setup lang="ts">
import type { AddDrawingVersionInput, DrawingFile } from '../../features/drawings/drawing.types'

const props = defineProps<{
  files: DrawingFile[]
  submitting: boolean
}>()

const emit = defineEmits<{
  submit: [input: AddDrawingVersionInput]
}>()

const firstFile = computed(() => props.files.at(-1))
const originalFilename = ref('')
const url = ref('/mock/drawing-livingroom-v2.svg')
const category = ref('Phối cảnh nội thất')
const parentFileId = ref('')

function submit() {
  if (!firstFile.value || !originalFilename.value.trim() || !url.value.trim()) return
  emit('submit', {
    drawingGroupId: firstFile.value.drawingGroupId,
    stageId: firstFile.value.stageId,
    code: firstFile.value.code,
    category: category.value.trim(),
    originalFilename: originalFilename.value.trim(),
    url: url.value.trim(),
    parentFileId: parentFileId.value || null,
    relationship: parentFileId.value ? 'supplement' : 'replacement',
  })
  originalFilename.value = ''
  parentFileId.value = ''
}
</script>

<template>
  <form class="upload-form" @submit.prevent="submit">
    <div><p class="eyebrow">Dữ liệu thử nghiệm</p><h2>Thêm phiên bản bằng URL</h2><p>Prototype chỉ lưu metadata; chưa tải tệp thật lên cloud.</p></div>
    <label>Tên tệp<input v-model="originalFilename" required name="originalFilename" placeholder="phoi-canh-phong-khach-v3.pdf"></label>
    <label>URL tệp<input v-model="url" required name="url"></label>
    <label>Phân loại<input v-model="category" required name="category"></label>
    <label>Bổ sung cho phiên bản<select v-model="parentFileId" name="parentFileId"><option value="">Không — đây là bản thay thế</option><option v-for="file in files" :key="file.id" :value="file.id">{{ file.code }} v{{ file.versionNumber }}</option></select></label>
    <button type="submit" :disabled="submitting || !firstFile">{{ submitting ? 'Đang thêm…' : 'Thêm phiên bản thử nghiệm' }}</button>
  </form>
</template>

<style scoped>
.upload-form { display: grid; align-content: start; gap: 11px; padding: 18px; border: 1px solid var(--line); background: white; }.upload-form h2 { margin: 3px 0 5px; font-size: 1.2rem; }.upload-form > div > p:last-child { color: var(--ink-muted); font-size: .72rem; }.upload-form label { display: grid; gap: 4px; color: var(--ink-muted); font-size: .68rem; font-weight: 700; }.upload-form input,.upload-form select { width: 100%; min-height: 38px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 0; background: var(--paper); color: var(--ink); font: inherit; }.upload-form button { min-height: 42px; border: 0; background: var(--coral); color: var(--forest-deep); cursor: pointer; font: inherit; font-weight: 800; }.upload-form button:disabled { cursor: wait; opacity: .55; }
</style>
