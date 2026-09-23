<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FinanceCategoryRow } from '../../../shared/schemas/costs/project-finance'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'

const props = withDefaults(defineProps<{
  open: boolean
  projectId: string
  categories: FinanceCategoryRow[]
}>(), {
  categories: () => [],
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [result: { id: string; version: number }]
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore

const canManage = computed(() => companyAccess.hasPermission('cost.manage'))

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val),
})

const form = reactive({
  description: '',
  costCategoryId: '',
  businessReference: '',
  partyId: '',
  engagementId: '',
  componentId: '',
  relevantDate: '',
  workStatus: 'unknown' as 'unknown' | 'in_progress' | 'accepted',
})

const submitting = ref(false)
const errorMessage = ref<string | null>(null)

// Filter out subcontract_labor category or warn if selected
const eligibleCategories = computed(() => {
  return props.categories.filter(c => c.code !== 'subcontract_labor')
})

const isSubcontractSelected = computed(() => {
  const cat = props.categories.find(c => c.categoryId === form.costCategoryId)
  return cat?.code === 'subcontract_labor'
})

watch(() => props.open, (open) => {
  if (open) {
    form.description = ''
    form.costCategoryId = eligibleCategories.value[0]?.categoryId ?? ''
    form.businessReference = ''
    form.partyId = ''
    form.engagementId = ''
    form.componentId = ''
    form.relevantDate = ''
    form.workStatus = 'unknown'
    errorMessage.value = null
  }
})

async function submit() {
  if (!canManage.value) {
    errorMessage.value = 'Bạn không có quyền cost.manage để tạo bản nháp chi phí.'
    return
  }

  if (isSubcontractSelected.value) {
    errorMessage.value = 'Mô hình chi phí nhân công thầu phụ không hỗ trợ tạo bản nháp độc lập. Vui lòng sử dụng tính năng quản lý thanh toán thầu phụ.'
    return
  }

  if (!form.description.trim()) {
    errorMessage.value = 'Vui lòng nhập mô tả chi phí.'
    return
  }

  if (!form.costCategoryId) {
    errorMessage.value = 'Vui lòng chọn danh mục chi phí.'
    return
  }

  submitting.value = true
  errorMessage.value = null

  try {
    const input = {
      description: form.description.trim(),
      costCategoryId: form.costCategoryId,
      businessReference: form.businessReference.trim() || undefined,
      partyId: form.partyId.trim() || undefined,
      engagementId: form.engagementId.trim() || undefined,
      componentId: form.componentId.trim() || undefined,
      relevantDate: form.relevantDate || undefined,
      workStatus: form.workStatus,
    }

    const result = await repositories.projectCosts.create(props.projectId, input)
    isOpen.value = false
    emit('created', { id: result.id, version: result.version })
  }
  catch (err: unknown) {
    errorMessage.value = extractErrorMessage(err)
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Tạo bản nháp chi phí mới"
    description="Ghi nhận bản nháp chi phí dự án ở trạng thái vận hành ban đầu."
    :dismissible="!submitting"
  >
    <template #body>
      <div v-if="!canManage" class="p-4 text-center">
        <UAlert
          role="alert"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Không có quyền"
          description="Bạn cần quyền cost.manage để tạo bản nháp chi phí mới."
        />
      </div>

      <form v-else class="space-y-4" data-testid="draft-create-form" @submit.prevent="submit">
        <UAlert
          v-if="errorMessage"
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Không thể tạo bản nháp"
          :description="errorMessage"
          data-testid="draft-create-error"
        />

        <UAlert
          v-if="isSubcontractSelected"
          role="alert"
          color="warning"
          variant="subtle"
          icon="i-lucide-alert-triangle"
          title="Danh mục không hỗ trợ"
          description="Chi phí nhân công thầu phụ không hỗ trợ tạo bản nháp chi phí thông thường. Vui lòng quản lý qua thanh toán thầu phụ."
        />

        <div class="space-y-1">
          <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="draft-description">
            Mô tả chi phí <span class="text-red-500">*</span>
          </label>
          <input
            id="draft-description"
            v-model="form.description"
            type="text"
            required
            class="cockpit-input w-full"
            placeholder="Ví dụ: Cung cấp vật liệu bê tông móng"
            data-testid="draft-create-description"
          >
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="draft-category">
              Danh mục chi phí <span class="text-red-500">*</span>
            </label>
            <select
              id="draft-category"
              v-model="form.costCategoryId"
              required
              class="cockpit-select w-full"
              data-testid="draft-create-category"
            >
              <option disabled value="">Chọn danh mục</option>
              <option v-for="cat in eligibleCategories" :key="cat.categoryId" :value="cat.categoryId">
                {{ cat.name }} ({{ cat.code }})
              </option>
            </select>
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="draft-work-status">
              Trạng thái công việc
            </label>
            <select
              id="draft-work-status"
              v-model="form.workStatus"
              class="cockpit-select w-full"
              data-testid="draft-create-work-status"
            >
              <option value="unknown">Chưa xác định (unknown)</option>
              <option value="in_progress">Đang triển khai (in_progress)</option>
              <option value="accepted">Đã nghiệm thu (accepted)</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="draft-business-ref">
              Số tham chiếu / Hợp đồng
            </label>
            <input
              id="draft-business-ref"
              v-model="form.businessReference"
              type="text"
              class="cockpit-input w-full"
              placeholder="Ví dụ: HD-2026-09/BT"
              data-testid="draft-create-business-ref"
            >
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300" for="draft-relevant-date">
              Ngày phát sinh
            </label>
            <input
              id="draft-relevant-date"
              v-model="form.relevantDate"
              type="date"
              class="cockpit-input w-full"
              data-testid="draft-create-relevant-date"
            >
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
          <UButton
            color="neutral"
            variant="outline"
            type="button"
            :disabled="submitting"
            @click="() => { isOpen = false }"
          >
            Hủy
          </UButton>
          <UButton
            type="submit"
            color="primary"
            :loading="submitting"
            :disabled="isSubcontractSelected || !form.description.trim() || !form.costCategoryId"
            data-testid="draft-create-submit"
          >
            Tạo bản nháp
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
