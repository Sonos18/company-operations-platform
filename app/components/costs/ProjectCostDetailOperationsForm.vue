<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { UpdateProjectCostDetailDraftInput } from '../../../shared/schemas/costs/project-costs'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'

export interface DetailOperationsModel {
  id: string
  version: number
  description: string
  relevantDate?: string | null
  reference?: string | null
  note?: string | null
}

const props = withDefaults(defineProps<{
  detail: DetailOperationsModel
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'saved': [result: { version: number }]
  'refresh-requested': []
  'dirty-change': [isDirty: boolean]
  'discarded': []
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const canManage = computed(() => companyAccess.hasPermission('cost.manage'))

const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const isVersionConflict = ref(false)

const form = reactive({
  description: props.detail.description,
  relevantDate: props.detail.relevantDate ?? '',
  reference: props.detail.reference ?? '',
  note: props.detail.note ?? '',
})

const hasChanges = computed(() => {
  const initDesc = props.detail.description.trim()
  const currDesc = form.description.trim()
  const initDate = props.detail.relevantDate ?? ''
  const currDate = form.relevantDate
  const initRef = props.detail.reference ?? ''
  const currRef = form.reference.trim()
  const initNote = props.detail.note ?? ''
  const currNote = form.note.trim()

  return currDesc !== initDesc || currDate !== initDate || currRef !== initRef || currNote !== initNote
})

watch(hasChanges, (dirty) => {
  emit('dirty-change', dirty)
}, { immediate: true })

watch(() => props.detail, (newDetail) => {
  if (hasChanges.value) {
    // Preserve dirty edits across background/props refreshes
    return
  }
  form.description = newDetail.description
  form.relevantDate = newDetail.relevantDate ?? ''
  form.reference = newDetail.reference ?? ''
  form.note = newDetail.note ?? ''
  isVersionConflict.value = false
  errorMessage.value = null
}, { deep: true })

function discardChanges() {
  form.description = props.detail.description
  form.relevantDate = props.detail.relevantDate ?? ''
  form.reference = props.detail.reference ?? ''
  form.note = props.detail.note ?? ''
  isVersionConflict.value = false
  errorMessage.value = null
  emit('discarded')
}

async function save() {
  if (props.disabled || !canManage.value) {
    errorMessage.value = 'Bạn không có quyền cost.manage để cập nhật thông tin vận hành.'
    return
  }

  if (!form.description.trim()) {
    errorMessage.value = 'Mô tả chi phí không được để trống.'
    return
  }

  if (!hasChanges.value) {
    errorMessage.value = 'Chưa có thông tin vận hành nào thay đổi.'
    return
  }

  submitting.value = true
  errorMessage.value = null
  successMessage.value = null
  isVersionConflict.value = false

  try {
    const patch: UpdateProjectCostDetailDraftInput = {
      expectedVersion: props.detail.version,
    }

    if (form.description.trim() !== props.detail.description.trim()) {
      patch.description = form.description.trim()
    }
    if (form.relevantDate !== (props.detail.relevantDate ?? '')) {
      patch.relevantDate = form.relevantDate || null
    }
    if (form.reference.trim() !== (props.detail.reference ?? '')) {
      patch.reference = form.reference.trim() || null
    }
    if (form.note.trim() !== (props.detail.note ?? '')) {
      patch.note = form.note.trim() || null
    }

    const result = await repositories.projectCosts.updateDetailDraft(props.detail.id, patch)
    successMessage.value = 'Đã lưu thông tin vận hành thành công.'
    emit('saved', { version: result.version })
  }
  catch (err: unknown) {
    const msg = extractErrorMessage(err)
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'VERSION_CONFLICT') {
      isVersionConflict.value = true
      errorMessage.value = 'Xung đột phiên bản: Dữ liệu đã được cập nhật bởi thao tác khác. Dữ liệu bạn vừa nhập vẫn được giữ nguyên. Vui lòng bấm "Lấy phiên bản mới nhất" để cập nhật phiên bản trước khi lưu lại.'
    }
    else {
      errorMessage.value = msg
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="cockpit-card p-6 rounded-lg space-y-4" data-testid="detail-operations-form">
    <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
      <div>
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
          Thông tin vận hành
        </h3>
        <p class="text-xs text-gray-500">
          Mô tả, ngày phát sinh và chứng từ tham chiếu nội bộ.
        </p>
      </div>
      <span class="text-xs font-mono text-gray-500" data-testid="detail-version-badge">
        v{{ detail.version }}
      </span>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :description="errorMessage"
      data-testid="operations-error-alert"
    />
    <UAlert
      v-if="successMessage"
      color="success"
      variant="subtle"
      :description="successMessage"
      data-testid="operations-success-alert"
    />

    <div v-if="isVersionConflict" class="flex justify-end">
      <UButton
        size="sm"
        color="warning"
        variant="outline"
        icon="i-lucide-refresh-cw"
        data-testid="refresh-version-btn"
        @click="emit('refresh-requested')"
      >
        Lấy phiên bản mới nhất
      </UButton>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-1 md:col-span-2">
        <label for="detail-desc" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          Mô tả chi phí <span class="text-red-500">*</span>
        </label>
        <input
          id="detail-desc"
          v-model="form.description"
          type="text"
          class="cockpit-input w-full"
          :disabled="disabled || submitting || !canManage"
          placeholder="Nhập mô tả chi tiết chi phí..."
          data-testid="detail-desc-input"
        >
      </div>

      <div class="space-y-1">
        <label for="detail-date" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          Ngày phát sinh
        </label>
        <input
          id="detail-date"
          v-model="form.relevantDate"
          type="date"
          class="cockpit-input w-full"
          :disabled="disabled || submitting || !canManage"
          data-testid="detail-date-input"
        >
      </div>

      <div class="space-y-1">
        <label for="detail-ref" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          Mã tham chiếu / Số chứng từ
        </label>
        <input
          id="detail-ref"
          v-model="form.reference"
          type="text"
          class="cockpit-input w-full"
          :disabled="disabled || submitting || !canManage"
          placeholder="Ví dụ: HĐ-01, PK-09..."
          data-testid="detail-ref-input"
        >
      </div>

      <div class="space-y-1 md:col-span-2">
        <label for="detail-note" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
          Ghi chú
        </label>
        <textarea
          id="detail-note"
          v-model="form.note"
          rows="2"
          class="cockpit-input w-full"
          :disabled="disabled || submitting || !canManage"
          placeholder="Ghi chú nội bộ bổ sung..."
          data-testid="detail-note-input"
        />
      </div>
    </div>

    <div v-if="canManage" class="flex items-center justify-end gap-2 pt-2">
      <UButton
        v-if="hasChanges"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="disabled || submitting"
        data-testid="discard-operations-btn"
        @click="discardChanges"
      >
        Hủy thay đổi
      </UButton>
      <UButton
        color="primary"
        size="sm"
        :loading="submitting"
        :disabled="disabled || submitting || !hasChanges"
        data-testid="save-operations-btn"
        @click="save"
      >
        Lưu thông tin vận hành
      </UButton>
    </div>
  </div>
</template>
