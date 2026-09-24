<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ClientError } from '../../errors/client-error'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { formatFinanceMoney } from '../../utils/costs/finance-display'

const props = defineProps<{
  open: boolean
  projectCostItemId: string
  version: number
  description: string
  amount: string | null
  currencyCode?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'published': [result?: { id: string; version: number }]
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const canPublish = computed(() => companyAccess.hasPermission('cost.publish_import'))

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val),
})

const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const pendingCommand = ref<{ fingerprint: string; idempotencyKey: string } | null>(null)

watch(() => props.open, (open) => {
  if (!open) return
  errorMessage.value = null
})
watch([() => props.projectCostItemId, () => props.version], () => { pendingCommand.value = null })
watch(() => companyAccess.activeCompanyId, () => {
  pendingCommand.value = null
  submitting.value = false
  errorMessage.value = null
  isOpen.value = false
}, { flush: 'sync' })

async function handlePublish() {
  if (!canPublish.value) {
    errorMessage.value = 'Bạn không có quyền cost.publish_import để phát hành chi phí.'
    return
  }

  submitting.value = true
  errorMessage.value = null
  const companyId = companyAccess.activeCompanyId
  let command: { fingerprint: string; idempotencyKey: string } | null = null

  try {
    const input = { expectedVersion: props.version }
    const fingerprint = JSON.stringify({ companyId, projectCostItemId: props.projectCostItemId, input })
    if (pendingCommand.value?.fingerprint !== fingerprint) pendingCommand.value = { fingerprint, idempotencyKey: globalThis.crypto.randomUUID() }
    command = pendingCommand.value
    const result = await repositories.projectCosts.publish(props.projectCostItemId, input, { idempotencyKey: command.idempotencyKey })
    if (companyAccess.activeCompanyId !== companyId || pendingCommand.value !== command) return

    submitting.value = false
    pendingCommand.value = null
    isOpen.value = false
    emit('published', { id: result.id, version: result.version })
  }
  catch (err: unknown) {
    if (companyAccess.activeCompanyId !== companyId || !command || pendingCommand.value !== command) return
    if (err instanceof ClientError && err.code === 'COST_ALREADY_PUBLISHED') {
      submitting.value = false
      pendingCommand.value = null
      isOpen.value = false
      emit('published')
      return
    }
    errorMessage.value = extractErrorMessage(err, 'Lỗi trong quá trình phát hành chi phí.')
  }
  finally {
    if (companyAccess.activeCompanyId === companyId && command && pendingCommand.value === command) submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Xác nhận phát hành chi phí chính thức"
    description="Chuyển bản nháp thành số liệu chi phí dự án chính thức (Quyền: cost.publish_import)."
    :dismissible="!submitting"
  >
    <template #body>
      <div v-if="!canPublish" class="p-4 text-center">
        <UAlert
          role="alert"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Không có quyền phát hành"
          description="Bạn cần quyền cost.publish_import để kích hoạt bản nháp thành dữ liệu chính thức."
        />
      </div>

      <div v-else class="space-y-4" data-testid="publish-cost-modal">
        <!-- Warning Banner -->
        <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 rounded-lg flex items-start gap-2.5">
          <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-lg shrink-0 mt-0.5" />
          <div class="text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div class="font-bold">Lưu ý quan trọng trước khi phát hành:</div>
            <ul class="list-disc pl-4 space-y-0.5">
              <li>Chi phí sẽ trở thành số liệu chính thức được ghi nhận vào báo cáo tài chính của dự án.</li>
              <li>Chế độ chỉnh sửa thông thường sẽ đóng lại ngay sau khi phát hành.</li>
              <li>Mọi thay đổi sau này bắt buộc phải thực hiện qua quy trình Điều chỉnh có lý do kiểm toán.</li>
            </ul>
          </div>
        </div>

        <!-- Cost Summary -->
        <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-xs space-y-1.5 border border-gray-200 dark:border-gray-800">
          <div class="flex justify-between">
            <span class="text-gray-500">Nội dung chi phí:</span>
            <span class="font-semibold text-gray-900 dark:text-gray-100">{{ description }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Tổng tiền phát hành:</span>
            <span class="font-mono font-bold text-primary-600 text-sm">
              {{ amount != null ? formatFinanceMoney(amount, currencyCode) : '0 VND' }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Phiên bản hiện tại:</span>
            <span class="font-mono text-gray-700 dark:text-gray-300">v{{ version }}</span>
          </div>
        </div>

        <UAlert
          v-if="errorMessage"
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Không thể phát hành"
          :description="errorMessage"
          data-testid="publish-error-alert"
        />

        <div class="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="submitting"
            @click="() => { isOpen = false }"
          >
            Hủy
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-check-check"
            :loading="submitting"
            data-testid="confirm-publish-btn"
            @click="handlePublish"
          >
            Xác nhận phát hành
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
