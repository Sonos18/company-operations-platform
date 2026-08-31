<script setup lang="ts">
import {
  stage01BusinessTaxonomiesSchema,
  stage01BusinessTaxonomyKeySchema,
  type Stage01BusinessTaxonomies,
  type Stage01BusinessTaxonomyEntry,
  type Stage01BusinessTaxonomyKey,
  type Stage01LeadSourceBusinessTaxonomyEntry,
} from '../../../shared/schemas/stage01-config'
import { stage01TaxonomyLabels } from '../../features/stage01-config/stage01-config-editor'

const props = defineProps<{
  modelValue: Stage01BusinessTaxonomies
  published: Stage01BusinessTaxonomies
  readonly: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Stage01BusinessTaxonomies]
  'update:localDirty': [value: boolean]
}>()

const taxonomyKeys = stage01BusinessTaxonomyKeySchema.options
const editorValue = ref<Stage01BusinessTaxonomies>(structuredClone(props.modelValue))

watch(() => props.modelValue, (value) => {
  editorValue.value = structuredClone(value)
  emit('update:localDirty', false)
}, { deep: true })

function publishIfValid(): void {
  const parsed = stage01BusinessTaxonomiesSchema.safeParse(editorValue.value)
  if (parsed.success) {
    emit('update:modelValue', parsed.data)
    emit('update:localDirty', false)
  }
  else {
    emit('update:localDirty', true)
  }
}

function isPublishedCode(taxonomyKey: Stage01BusinessTaxonomyKey, code: string): boolean {
  return props.published[taxonomyKey].some(entry => entry.code === code)
}

function updateLabel(taxonomyKey: Stage01BusinessTaxonomyKey, index: number, value: unknown): void {
  const entry = editorValue.value[taxonomyKey][index]
  if (!entry) return
  entry.label = typeof value === 'string' ? value : ''
  publishIfValid()
}

function updateCode(taxonomyKey: Stage01BusinessTaxonomyKey, index: number, value: unknown): void {
  const entry = editorValue.value[taxonomyKey][index]
  if (!entry || isPublishedCode(taxonomyKey, entry.code)) return
  const nextCode = typeof value === 'string' ? value : ''
  if (isPublishedCode(taxonomyKey, nextCode)) return
  entry.code = nextCode
  publishIfValid()
}

function updateRequiresReferrer(index: number, value: boolean | 'indeterminate'): void {
  const entry = editorValue.value.lead_source[index]
  if (!entry) return
  entry.behavior = { requiresReferrer: value === true }
  publishIfValid()
}

function addEntry(taxonomyKey: Stage01BusinessTaxonomyKey): void {
  const entries = editorValue.value[taxonomyKey]
  if (taxonomyKey === 'lead_source') {
    ;(entries as Stage01LeadSourceBusinessTaxonomyEntry[]).push({ code: '', label: '' })
  }
  else {
    ;(entries as Stage01BusinessTaxonomyEntry[]).push({ code: '', label: '' })
  }
  emit('update:localDirty', true)
}

function removeEntry(taxonomyKey: Stage01BusinessTaxonomyKey, index: number): void {
  const entries = editorValue.value[taxonomyKey]
  if (entries.length <= 1) return
  entries.splice(index, 1)
  publishIfValid()
}

function entryLabel(entry: Stage01BusinessTaxonomyEntry): string {
  return entry.label || entry.code || 'giá trị mới'
}

function requiresReferrer(entry: Stage01LeadSourceBusinessTaxonomyEntry): boolean {
  return entry.behavior?.requiresReferrer === true
}
</script>

<template>
  <section class="taxonomy-editor" aria-labelledby="taxonomy-editor-heading">
    <div class="editor-heading">
      <div>
        <p class="eyebrow">Dữ liệu nghiệp vụ</p>
        <h2 id="taxonomy-editor-heading">Danh mục Stage 01</h2>
      </div>
      <p>Các mã đã xuất bản là định danh ổn định. Thêm giá trị mới thay vì sửa mã hiện có.</p>
    </div>

    <article v-for="taxonomyKey in taxonomyKeys" :key="taxonomyKey" class="taxonomy-group">
      <header>
        <h3>{{ stage01TaxonomyLabels[taxonomyKey] }}</h3>
        <UButton
          v-if="!props.readonly"
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          :aria-label="`Thêm giá trị cho ${stage01TaxonomyLabels[taxonomyKey]}`"
          @click="addEntry(taxonomyKey)"
        >
          Thêm giá trị
        </UButton>
      </header>

      <div class="taxonomy-rows">
        <div v-for="(entry, index) in editorValue[taxonomyKey]" :key="`${entry.code}-${index}`" class="taxonomy-row">
          <label>
            <span>Nhãn hiển thị</span>
            <UInput
              v-if="!props.readonly"
              :model-value="entry.label"
              :aria-label="`Nhãn ${stage01TaxonomyLabels[taxonomyKey]}: ${entryLabel(entry)}`"
              @update:model-value="updateLabel(taxonomyKey, index, $event)"
            />
            <strong v-else>{{ entry.label }}</strong>
          </label>
          <label>
            <span>Mã kỹ thuật</span>
            <UInput
              v-if="!props.readonly"
              :model-value="entry.code"
              :disabled="isPublishedCode(taxonomyKey, entry.code)"
              :aria-label="`Mã ${stage01TaxonomyLabels[taxonomyKey]}: ${entryLabel(entry)}`"
              @update:model-value="updateCode(taxonomyKey, index, $event)"
            />
            <code v-else>{{ entry.code }}</code>
          </label>
          <UCheckbox
            v-if="taxonomyKey === 'lead_source'"
            :model-value="requiresReferrer(entry as Stage01LeadSourceBusinessTaxonomyEntry)"
            :disabled="props.readonly"
            label="Yêu cầu người giới thiệu"
            @update:model-value="updateRequiresReferrer(index, $event)"
          />
          <UButton
            v-if="!props.readonly"
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="editorValue[taxonomyKey].length <= 1"
            :aria-label="`Xóa ${stage01TaxonomyLabels[taxonomyKey]}: ${entryLabel(entry)}`"
            @click="removeEntry(taxonomyKey, index)"
          >
            Xóa
          </UButton>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped>
.taxonomy-editor { display: grid; gap: 14px; }.editor-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; }.editor-heading h2 { margin: 3px 0 0; color: var(--forest-deep); font-size: 1.45rem; }.editor-heading p:last-child { max-width: 480px; margin: 0; color: var(--ink-muted); font-size: .8rem; line-height: 1.45; }
.taxonomy-group { display: grid; gap: 9px; padding: 14px; border: 1px solid var(--line); background: var(--paper-raised); }.taxonomy-group > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.taxonomy-group h3 { margin: 0; color: var(--forest-deep); font-size: .95rem; }.taxonomy-rows { display: grid; gap: 8px; }.taxonomy-row { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(160px, .7fr) auto auto; align-items: end; gap: 9px; padding: 10px; border: 1px solid var(--line); background: white; }.taxonomy-row label { display: grid; gap: 4px; min-width: 0; }.taxonomy-row label > span { color: var(--ink-muted); font-size: .64rem; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }.taxonomy-row strong,.taxonomy-row code { min-height: 38px; display: flex; align-items: center; overflow-wrap: anywhere; color: var(--forest-deep); font-size: .8rem; }.taxonomy-row :deep(button[data-slot='base']) { align-self: end; }
@media (max-width: 760px) { .editor-heading { display: grid; align-items: start; }.taxonomy-row { grid-template-columns: 1fr; align-items: stretch; }.taxonomy-row :deep(button[data-slot='base']) { width: fit-content; } }
</style>
