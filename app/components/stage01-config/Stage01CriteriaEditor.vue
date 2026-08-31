<script setup lang="ts">
import {
  stage01CriteriaSchema,
  type Stage01Criteria,
} from '../../../shared/schemas/stage01-config'
import type { Stage01CriterionDefinition } from '../../../shared/schemas/stage01'
import {
  stage01ApplicabilityModeOptions,
  stage01CriterionCriticalityOptions,
  stage01DimensionOptions,
} from '../../features/stage01-config/stage01-config-editor'

const props = defineProps<{
  modelValue: Stage01Criteria
  published: Stage01Criteria
  readonly: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Stage01Criteria]
}>()

const editorValue = ref<Stage01Criteria>(structuredClone(props.modelValue))
const publishedKeys = computed(() => new Set(props.published.map(criterion => criterion.key)))
const dimensionItems = [...stage01DimensionOptions]
const criticalityItems = [...stage01CriterionCriticalityOptions]
const applicabilityModeItems = [...stage01ApplicabilityModeOptions]

watch(() => props.modelValue, (value) => {
  editorValue.value = structuredClone(value)
}, { deep: true })

function publishIfValid(): void {
  const parsed = stage01CriteriaSchema.safeParse(editorValue.value)
  if (parsed.success) emit('update:modelValue', parsed.data)
}

function updateText(index: number, field: 'key' | 'label' | 'description', value: unknown): void {
  const criterion = editorValue.value[index]
  if (!criterion) return
  if (field === 'key' && publishedKeys.value.has(criterion.key)) return
  const nextValue = typeof value === 'string' ? value : ''
  if (field === 'key' && publishedKeys.value.has(nextValue)) return
  criterion[field] = nextValue
  publishIfValid()
}

function updateDimension(index: number, value: unknown): void {
  const criterion = editorValue.value[index]
  if (!criterion || typeof value !== 'string') return
  if (stage01DimensionOptions.some(option => option.value === value)) {
    criterion.dimensionKey = value as Stage01CriterionDefinition['dimensionKey']
    publishIfValid()
  }
}

function updateCriticality(index: number, value: unknown): void {
  const criterion = editorValue.value[index]
  if (!criterion || typeof value !== 'string') return
  if (stage01CriterionCriticalityOptions.some(option => option.value === value)) {
    criterion.criticality = value as Stage01CriterionDefinition['criticality']
    publishIfValid()
  }
}

function updateApplicabilityMode(index: number, value: unknown): void {
  const criterion = editorValue.value[index]
  if (!criterion || typeof value !== 'string') return
  if (stage01ApplicabilityModeOptions.some(option => option.value === value)) {
    criterion.applicabilityMode = value as Stage01CriterionDefinition['applicabilityMode']
    publishIfValid()
  }
}

function updateAllowsNotApplicable(index: number, value: boolean | 'indeterminate'): void {
  const criterion = editorValue.value[index]
  if (!criterion) return
  criterion.allowsNotApplicable = value === true
  publishIfValid()
}

function updateDisplayOrder(index: number, value: unknown): void {
  const criterion = editorValue.value[index]
  if (!criterion) return
  criterion.displayOrder = typeof value === 'number' ? value : Number(value)
  publishIfValid()
}

function removeCriterion(index: number): void {
  if (editorValue.value.length <= 5) return
  editorValue.value.splice(index, 1)
  publishIfValid()
}

function addCriterion(): void {
  const displayOrder = Math.max(0, ...editorValue.value.map(criterion => criterion.displayOrder)) + 1
  editorValue.value.push({
    key: '',
    dimensionKey: 'customer_need',
    label: '',
    description: '',
    criticality: 'required',
    applicabilityMode: 'always',
    allowsNotApplicable: false,
    displayOrder,
  })
}
</script>

<template>
  <section class="criteria-editor" aria-labelledby="criteria-editor-heading">
    <div class="editor-heading">
      <div>
        <p class="eyebrow">Khung đánh giá</p>
        <h2 id="criteria-editor-heading">Tiêu chí Stage 01</h2>
      </div>
      <UButton v-if="!props.readonly" size="sm" color="neutral" variant="outline" icon="i-lucide-plus" @click="addCriterion">
        Thêm tiêu chí
      </UButton>
    </div>

    <article v-for="(criterion, index) in editorValue" :key="`${criterion.key}-${index}`" class="criterion-card">
      <header>
        <span>Tiêu chí {{ index + 1 }}</span>
        <div class="criterion-card__actions">
          <code>{{ criterion.key || 'Mã mới' }}</code>
          <UButton
            v-if="!props.readonly"
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="editorValue.length <= 5"
            :aria-label="`Xóa tiêu chí: ${criterion.label || criterion.key || 'mới'}`"
            @click="removeCriterion(index)"
          >
            Xóa tiêu chí
          </UButton>
        </div>
      </header>
      <div class="criterion-fields">
        <label>
          <span>Mã kỹ thuật</span>
          <UInput v-if="!props.readonly" :model-value="criterion.key" :disabled="publishedKeys.has(criterion.key)" @update:model-value="updateText(index, 'key', $event)" />
          <strong v-else>{{ criterion.key }}</strong>
        </label>
        <label>
          <span>Nhóm đánh giá</span>
          <USelect v-if="!props.readonly" :model-value="criterion.dimensionKey" :items="dimensionItems" @update:model-value="updateDimension(index, $event)" />
          <strong v-else>{{ stage01DimensionOptions.find(option => option.value === criterion.dimensionKey)?.label }}</strong>
        </label>
        <label>
          <span>Nhãn hiển thị</span>
          <UInput v-if="!props.readonly" :model-value="criterion.label" @update:model-value="updateText(index, 'label', $event)" />
          <strong v-else>{{ criterion.label }}</strong>
        </label>
        <label class="criterion-fields__description">
          <span>Mô tả</span>
          <UTextarea v-if="!props.readonly" :model-value="criterion.description" :rows="3" @update:model-value="updateText(index, 'description', $event)" />
          <p v-else>{{ criterion.description }}</p>
        </label>
        <label>
          <span>Mức độ quan trọng</span>
          <USelect v-if="!props.readonly" :model-value="criterion.criticality" :items="criticalityItems" @update:model-value="updateCriticality(index, $event)" />
          <strong v-else>{{ stage01CriterionCriticalityOptions.find(option => option.value === criterion.criticality)?.label }}</strong>
        </label>
        <label>
          <span>Cách xác định áp dụng</span>
          <USelect v-if="!props.readonly" :model-value="criterion.applicabilityMode" :items="applicabilityModeItems" @update:model-value="updateApplicabilityMode(index, $event)" />
          <strong v-else>{{ stage01ApplicabilityModeOptions.find(option => option.value === criterion.applicabilityMode)?.label }}</strong>
        </label>
        <UCheckbox v-if="!props.readonly" :model-value="criterion.allowsNotApplicable" label="Cho phép không áp dụng" @update:model-value="updateAllowsNotApplicable(index, $event)" />
        <div v-else class="criterion-checkbox"><span>Không áp dụng</span><strong>{{ criterion.allowsNotApplicable ? 'Được phép' : 'Không cho phép' }}</strong></div>
        <label>
          <span>Thứ tự hiển thị</span>
          <UInput v-if="!props.readonly" type="number" :model-value="criterion.displayOrder" min="0" @update:model-value="updateDisplayOrder(index, $event)" />
          <strong v-else>{{ criterion.displayOrder }}</strong>
        </label>
      </div>
    </article>
  </section>
</template>

<style scoped>
.criteria-editor { display: grid; gap: 12px; }.editor-heading { display: flex; align-items: end; justify-content: space-between; gap: 14px; }.editor-heading h2 { margin: 3px 0 0; color: var(--forest-deep); font-size: 1.45rem; }.criterion-card { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--line); background: var(--paper-raised); }.criterion-card > header,.criterion-card__actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.criterion-card > header { color: var(--forest-deep); font-size: .78rem; font-weight: 750; }.criterion-card header code { color: var(--ink-muted); font-size: .72rem; font-weight: 500; }.criterion-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }.criterion-fields > label,.criterion-checkbox { display: grid; gap: 4px; min-width: 0; }.criterion-fields > label > span,.criterion-checkbox > span { color: var(--ink-muted); font-size: .64rem; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }.criterion-fields strong { min-height: 38px; display: flex; align-items: center; color: var(--forest-deep); font-size: .8rem; overflow-wrap: anywhere; }.criterion-fields__description { grid-column: span 3; }.criterion-fields__description p { margin: 0; color: var(--ink); font-size: .8rem; line-height: 1.45; white-space: pre-wrap; }.criterion-checkbox { align-content: end; padding-bottom: 4px; }.criterion-checkbox strong { min-height: auto; }
@media (max-width: 850px) { .criterion-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }.criterion-fields__description { grid-column: span 2; } } @media (max-width: 560px) { .editor-heading { align-items: start; }.criterion-fields { grid-template-columns: 1fr; }.criterion-fields__description { grid-column: auto; } }
</style>
