<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import type { ProjectCostDraftCategoryOption } from '../../../shared/schemas/costs/project-costs'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'

interface DraftModel {
  id: string
  version: number
  description: string
  costCategoryId: string | null
  businessReference: string | null
  partyId: string | null
  engagementId: string | null
  componentId: string | null
  relevantDate: string | null
  workStatus: 'unknown' | 'in_progress' | 'accepted'
  publicationState: 'draft' | 'published'
}

const props = withDefaults(defineProps<{
  draft: DraftModel
  categories?: ProjectCostDraftCategoryOption[]
  disabled?: boolean
}>(), {
  categories: () => [],
  disabled: false,
})

const emit = defineEmits<{
  'saved': [result: { version: number }]
  'refresh-requested': []
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const canManage = computed(() => companyAccess.hasPermission('cost.manage'))

const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const isVersionConflict = ref(false)
let contextGeneration = 0

const form = reactive({
  description: props.draft.description,
  costCategoryId: props.draft.costCategoryId ?? '',
  businessReference: props.draft.businessReference ?? '',
  partyId: props.draft.partyId ?? '',
  engagementId: props.draft.engagementId ?? '',
  componentId: props.draft.componentId ?? '',
  relevantDate: props.draft.relevantDate ?? '',
  workStatus: props.draft.workStatus,
})

// Update local form state when draft prop changes
watch(() => props.draft, (newDraft) => {
  contextGeneration++
  form.description = newDraft.description
  form.costCategoryId = newDraft.costCategoryId ?? ''
  form.businessReference = newDraft.businessReference ?? ''
  form.partyId = newDraft.partyId ?? ''
  form.engagementId = newDraft.engagementId ?? ''
  form.componentId = newDraft.componentId ?? ''
  form.relevantDate = newDraft.relevantDate ?? ''
  form.workStatus = newDraft.workStatus
  isVersionConflict.value = false
  errorMessage.value = null
}, { deep: true, flush: 'sync' })
watch([() => companyAccess.activeCompanyId, canManage], () => {
  contextGeneration++
  submitting.value = false
}, { flush: 'sync' })
onUnmounted(() => { contextGeneration++ })

const eligibleCategories = computed(() => {
  return props.categories.filter(c => c.isActive && (c.draftEligible ?? c.code !== 'subcontract_labor'))
})

const isPublished = computed(() => props.draft.publicationState === 'published')

async function save() {
  if (!canManage.value) {
    errorMessage.value = 'Bạn không có quyền cost.manage để cập nhật thông tin vận hành.'
    return
  }

  if (isPublished.value) {
    errorMessage.value = 'Chi phí đã phát hành chính thức. Không thể chỉnh sửa trực tiếp, vui lòng dùng luồng Điều chỉnh.'
    return
  }

  if (!form.description.trim()) {
    errorMessage.value = 'Mô tả chi phí không được để trống.'
    return
  }

  submitting.value = true
  errorMessage.value = null
  successMessage.value = null
  isVersionConflict.value = false
  const companyId = companyAccess.activeCompanyId
  const generation = contextGeneration
  const draftId = props.draft.id
  const draftVersion = props.draft.version
  const isContextCurrent = () => companyAccess.activeCompanyId === companyId
    && contextGeneration === generation
    && canManage.value
    && props.draft.id === draftId
    && props.draft.version === draftVersion

  try {
    const input = {
      expectedVersion: props.draft.version,
      description: form.description.trim(),
      costCategoryId: form.costCategoryId || undefined,
      businessReference: form.businessReference.trim() || null,
      partyId: form.partyId.trim() || null,
      engagementId: form.engagementId.trim() || null,
      componentId: form.componentId.trim() || null,
      relevantDate: form.relevantDate || null,
      workStatus: form.workStatus,
    }

    const result = await repositories.projectCosts.update(props.draft.id, input)
    if (!isContextCurrent()) return
    successMessage.value = 'Đã lưu thông tin vận hành thành công.'
    emit('saved', { version: result.version })
  }
  catch (err: unknown) {
    if (!isContextCurrent()) return
    const msg = extractErrorMessage(err)
    if (msg.includes('xung đột phiên bản') || (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'VERSION_CONFLICT')) {
      isVersionConflict.value = true
      errorMessage.value = 'Xung đột phiên bản: Dữ liệu trên hệ thống đã được cập nhật bởi thao tác khác. Dữ liệu bạn vừa nhập vẫn được giữ nguyên trên màn hình. Vui lòng bấm "Lấy phiên bản mới nhất" để cập nhật số phiên bản trước khi lưu lại.'
    }
    else {
      errorMessage.value = msg
    }
  }
  finally {
    if (isContextCurrent()) submitting.value = false
  }
}
</script>

<template>
  <div class="draft-operations-form cockpit-card p-4 rounded-lg space-y-4" data-testid="draft-operations-form">
    <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
      <div>
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Thông tin vận hành bản nháp
        </h3>
        <p class="text-xs text-gray-500">
          Cập nhật thông tin nhận diện, phân loại và tiến độ công việc (Quyền: cost.manage).
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-mono text-gray-500">Phiên bản: v{{ props.draft.version }}</span>
        <span
          class="cockpit-badge"
          :class="isPublished ? 'cockpit-badge--success' : 'cockpit-badge--neutral'"
        >
          {{ isPublished ? 'Đã phát hành' : 'Bản nháp' }}
        </span>
      </div>
    </div>

    <!-- Read-only notice for cost.prepare users without cost.manage -->
    <UAlert
      v-if="!canManage"
      role="status"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Chế độ chỉ xem thông tin vận hành"
      description="Bạn có quyền chuẩn bị tài chính (cost.prepare) nhưng không có quyền cập nhật thông tin vận hành (yêu cầu cost.manage)."
      data-testid="draft-operations-readonly-notice"
    />

    <!-- Published warning -->
    <UAlert
      v-if="isPublished"
      role="alert"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Bản ghi đã phát hành"
      description="Chi phí này đã được phát hành chính thức. Mọi thay đổi về thông tin vận hành hoặc tài chính phải thực hiện thông qua luồng Điều chỉnh có ghi nhận lý do kiểm toán."
    />

    <!-- Error Alert -->
    <UAlert
      v-if="errorMessage"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="isVersionConflict ? 'Xung đột phiên bản dữ liệu' : 'Lỗi cập nhật'"
      :description="errorMessage"
      data-testid="draft-operations-error"
    >
      <template v-if="isVersionConflict" #actions>
        <UButton
          size="xs"
          color="error"
          variant="outline"
          icon="i-lucide-refresh-cw"
          data-testid="resolve-conflict-btn"
          @click="emit('refresh-requested')"
        >
          Lấy phiên bản mới nhất
        </UButton>
      </template>
    </UAlert>

    <!-- Success Alert -->
    <UAlert
      v-if="successMessage"
      role="status"
      color="success"
      variant="subtle"
      icon="i-lucide-check-circle"
      title="Thành công"
      :description="successMessage"
      data-testid="draft-operations-success"
    />

    <form class="space-y-4" @submit.prevent="save">
      <div class="space-y-1">
        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="op-description">
          Mô tả chi phí <span class="text-red-500">*</span>
        </label>
        <input
          id="op-description"
          v-model="form.description"
          type="text"
          required
          :disabled="!canManage || isPublished || props.disabled || submitting"
          class="cockpit-input w-full"
          data-testid="draft-op-description"
        >
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="op-category">
            Danh mục chi phí
          </label>
          <select
            id="op-category"
            v-model="form.costCategoryId"
            :disabled="!canManage || isPublished || props.disabled || submitting"
            class="cockpit-select w-full"
            data-testid="draft-op-category"
          >
            <option value="">Chưa chọn danh mục</option>
            <option
              v-if="form.costCategoryId && !eligibleCategories.some(cat => cat.categoryId === form.costCategoryId)"
              :value="form.costCategoryId"
            >
              Mã danh mục: {{ form.costCategoryId }}
            </option>
            <option v-for="cat in eligibleCategories" :key="cat.categoryId" :value="cat.categoryId">
              {{ cat.name }} ({{ cat.code }})
            </option>
          </select>
          <p v-if="eligibleCategories.length === 0" class="text-[11px] text-gray-500 italic mt-0.5" data-testid="no-categories-notice">
            Danh sách tên danh mục không khả dụng (yêu cầu quyền cost.read).
          </p>
        </div>

        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="op-work-status">
            Trạng thái công việc
          </label>
          <select
            id="op-work-status"
            v-model="form.workStatus"
            :disabled="!canManage || isPublished || props.disabled || submitting"
            class="cockpit-select w-full"
            data-testid="draft-op-work-status"
          >
            <option value="unknown">Chưa xác định (unknown)</option>
            <option value="in_progress">Đang triển khai (in_progress)</option>
            <option value="accepted">Đã nghiệm thu (accepted)</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="op-business-ref">
            Số tham chiếu / Hợp đồng
          </label>
          <input
            id="op-business-ref"
            v-model="form.businessReference"
            type="text"
            :disabled="!canManage || isPublished || props.disabled || submitting"
            class="cockpit-input w-full"
            placeholder="REF-..."
            data-testid="draft-op-business-ref"
          >
        </div>

        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="op-relevant-date">
            Ngày phát sinh
          </label>
          <input
            id="op-relevant-date"
            v-model="form.relevantDate"
            type="date"
            :disabled="!canManage || isPublished || props.disabled || submitting"
            class="cockpit-input w-full"
            data-testid="draft-op-relevant-date"
          >
        </div>
      </div>

      <div v-if="!isPublished && canManage" class="flex justify-end gap-2 pt-2">
        <UButton
          type="submit"
          color="primary"
          :loading="submitting"
          :disabled="props.disabled || !form.description.trim()"
          data-testid="draft-op-save-btn"
        >
          Lưu thông tin vận hành
        </UButton>
      </div>
    </form>
  </div>
</template>
