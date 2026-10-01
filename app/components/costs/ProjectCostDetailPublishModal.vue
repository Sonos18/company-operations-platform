<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { formatFinanceMoney } from '../../utils/costs/finance-display'
import {
  clearCommandRecord,
  evaluateUnresolvedState,
  isDefinitivelyRejectedError,
  isRecoveryStorageAvailable,
  persistUnresolvedMarker,
  readRetainedPayload,
  readUnresolvedMarker,
  registerMemoryPayloadSnapshot,
  type UnresolvedCommandMarker,
  type UnresolvedState,
} from '../../utils/costs/cost-command-recovery'

const props = withDefaults(defineProps<{
  open: boolean
  detailId: string
  version: number
  description: string
  amount?: string | null
  currencyCode?: string
  isFinancialMasked?: boolean
  hasUnsavedEdits?: boolean
}>(), {
  amount: null,
  currencyCode: 'VND',
  isFinancialMasked: false,
  hasUnsavedEdits: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'published': [result?: { id: string; version: number }]
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const authStore = useNuxtApp().$authStore
const canPublish = computed(() => companyAccess.hasPermission('cost.publish_import'))

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val),
})

const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const storageError = ref<string | null>(null)

const unresolvedState = ref<UnresolvedState>('none')
const activeUnresolvedMarker = ref<UnresolvedCommandMarker | null>(null)

function checkUnresolvedState() {
  const companyId = companyAccess.activeCompanyId ?? ''
  const actorId = authStore?.user?.id ?? 'anonymous'
  const state = evaluateUnresolvedState(companyId, actorId, 'publish_draft', props.detailId)
  unresolvedState.value = state
  if (state !== 'none') {
    activeUnresolvedMarker.value = readUnresolvedMarker(companyId, actorId, 'publish_draft', props.detailId)
  }
  else {
    activeUnresolvedMarker.value = null
  }
}

watch(() => props.open, (open) => {
  if (open) {
    errorMessage.value = null
    storageError.value = null
    checkUnresolvedState()
  }
})

async function handlePublish(isReplay = false) {
  if (!canPublish.value) {
    errorMessage.value = 'Bạn không có quyền cost.publish_import để phát hành chi tiết chi phí.'
    return
  }

  if (props.hasUnsavedEdits) {
    errorMessage.value = 'Có chỉnh sửa chưa lưu trong biểu mẫu. Vui lòng lưu hoặc hủy thay đổi trước khi phát hành.'
    return
  }

  const companyId = companyAccess.activeCompanyId ?? ''
  const actorId = authStore?.user?.id ?? 'anonymous'
  const operation = 'publish_draft'
  const targetId = props.detailId
  const dispatchContext = {
    companyId,
    actorId,
    detailId: props.detailId,
  }

  // Block initiating a new publish command if an unresolved command already exists
  if (!isReplay && unresolvedState.value !== 'none') {
    errorMessage.value = 'Đang có lệnh phát hành chưa được giải quyết trên hệ thống. Vui lòng gửi lại yêu cầu gốc hoặc liên hệ hỗ trợ.'
    return
  }

  // Pre-flight recovery storage check (fail-closed policy)
  if (!isRecoveryStorageAvailable()) {
    storageError.value = 'Không thể lưu trữ trạng thái phục hồi an toàn trên trình duyệt (session storage không khả dụng). Để ngăn ngừa rủi ro tạo trùng lặp chi phí khi mất kết nối mạng, thao tác ghi bị tạm dừng. Vui lòng bật quyền lưu trữ phiên trên trình duyệt.'
    return
  }

  submitting.value = true
  errorMessage.value = null
  storageError.value = null

  let idempotencyKey: string
  let payload: { expectedVersion: number }

  if (isReplay) {
    const retained = readRetainedPayload(companyId, actorId, operation, targetId)
    if (!retained) {
      errorMessage.value = 'Dữ liệu lệnh trước đó không còn trong bộ nhớ. Không thể tự động gửi lại.'
      submitting.value = false
      checkUnresolvedState()
      return
    }
    idempotencyKey = retained.idempotencyKey
    payload = retained.payloadSnapshot as { expectedVersion: number }
  }
  else {
    idempotencyKey = globalThis.crypto.randomUUID()
    payload = { expectedVersion: props.version }

    try {
      persistUnresolvedMarker({
        companyId,
        actorId,
        operation,
        targetId,
        idempotencyKey,
        timestamp: Date.now(),
      })
      registerMemoryPayloadSnapshot(companyId, actorId, operation, targetId, idempotencyKey, payload)
    }
    catch {
      storageError.value = 'Không thể lưu trữ trạng thái phục hồi trên trình duyệt. Lệnh phát hành đã bị dừng an toàn.'
      submitting.value = false
      return
    }
  }

  try {
    const result = await repositories.projectCosts.publishDetail(dispatchContext.detailId, payload, { idempotencyKey })
    clearCommandRecord(dispatchContext.companyId, dispatchContext.actorId, operation, dispatchContext.detailId)

    const isContextStale = companyAccess.activeCompanyId !== dispatchContext.companyId
      || (authStore?.user?.id ?? 'anonymous') !== dispatchContext.actorId
      || props.detailId !== dispatchContext.detailId

    if (isContextStale) {
      return
    }

    unresolvedState.value = 'none'
    activeUnresolvedMarker.value = null
    isOpen.value = false
    emit('published', { id: result.id, version: result.version })
  }
  catch (err: unknown) {
    const isContextStale = companyAccess.activeCompanyId !== dispatchContext.companyId
      || (authStore?.user?.id ?? 'anonymous') !== dispatchContext.actorId
      || props.detailId !== dispatchContext.detailId

    if (isDefinitivelyRejectedError(err)) {
      clearCommandRecord(dispatchContext.companyId, dispatchContext.actorId, operation, dispatchContext.detailId)
      if (!isContextStale) {
        unresolvedState.value = 'none'
        activeUnresolvedMarker.value = null
      }
    }
    else if (!isContextStale) {
      // Unknown network outcome or IDEMPOTENCY_CONFLICT: retain marker and update state
      checkUnresolvedState()
    }
    if (!isContextStale) {
      errorMessage.value = extractErrorMessage(err, 'Lỗi trong quá trình phát hành chi tiết chi phí.')
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Xác nhận phát hành chi tiết chi phí"
    description="Sau khi phát hành, chi tiết chi phí này sẽ trở thành dữ liệu chính thức và ảnh hưởng trực tiếp đến tổng chi phí dự án."
  >
    <template #body>
      <div class="space-y-4 text-sm" data-testid="detail-publish-modal">
        <UAlert
          v-if="unresolvedState === 'unresolved_marker_corrupted' || unresolvedState === 'unresolved_storage_unreadable'"
          color="error"
          variant="subtle"
          title="Trạng thái phục hồi không thể xác minh"
          description="Dữ liệu trạng thái phục hồi trên trình duyệt bị lỗi hoặc không thể đọc được. Thao tác phát hành bị khóa an toàn."
          data-testid="publish-untrusted-recovery-state-alert"
        />

        <UAlert
          v-if="storageError"
          color="error"
          variant="subtle"
          title="Không thể gửi yêu cầu"
          :description="storageError"
          data-testid="publish-storage-error-alert"
        />

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          title="Không thể phát hành"
          :description="errorMessage"
          data-testid="publish-error-alert"
        />

        <UAlert
          v-if="hasUnsavedEdits"
          color="warning"
          variant="subtle"
          title="Chỉnh sửa chưa lưu"
          description="Có chỉnh sửa chưa lưu trong biểu mẫu. Vui lòng lưu thông tin vận hành / tài chính hoặc hủy thay đổi trước khi phát hành."
          data-testid="publish-unsaved-warning"
        />

        <!-- Lost Payload Reconciliation Panel -->
        <div
          v-if="unresolvedState === 'unresolved_payload_lost' && activeUnresolvedMarker"
          class="p-4 rounded-lg border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 space-y-2 text-xs"
          data-testid="publish-lost-payload-panel"
        >
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-lg shrink-0 mt-0.5" />
            <div class="space-y-1">
              <h4 class="font-bold text-gray-900 dark:text-gray-100">
                Thao tác phát hành trước đó chưa được xác nhận
              </h4>
              <p class="text-gray-700 dark:text-gray-300">
                Lệnh phát hành đã được gửi trước đó nhưng chưa nhận được xác nhận từ máy chủ. Dữ liệu lệnh không còn trong bộ nhớ tạm.
              </p>
              <div class="font-mono text-[11px] bg-white dark:bg-gray-900 p-2 rounded">
                <div>Idempotency Key: {{ activeUnresolvedMarker.idempotencyKey }}</div>
                <div>Thời điểm: {{ new Date(activeUnresolvedMarker.timestamp).toLocaleString('vi-VN') }}</div>
              </div>
              <p class="text-gray-600 dark:text-gray-400 font-semibold">
                Vui lòng liên hệ quản trị viên hoặc kiểm tra dữ liệu trước khi thử lại.
              </p>
            </div>
          </div>
        </div>

        <!-- Retained Payload Replay Banner -->
        <div
          v-else-if="unresolvedState === 'unresolved_with_payload' && activeUnresolvedMarker"
          class="p-3 rounded-lg border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 flex items-center justify-between gap-3 text-xs"
          data-testid="publish-retained-payload-banner"
        >
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-wifi-off" class="text-blue-600 text-lg shrink-0" />
            <div>
              <span class="font-semibold text-gray-900 dark:text-gray-100">Mất kết nối hoặc phản hồi quá hạn.</span>
              <p class="text-gray-600 dark:text-gray-400">Yêu cầu phát hành gốc vẫn được lưu an toàn.</p>
            </div>
          </div>
          <UButton
            color="primary"
            size="xs"
            icon="i-lucide-refresh-cw"
            :loading="submitting"
            data-testid="replay-publish-command-btn"
            @click="handlePublish(true)"
          >
            Gửi lại lệnh gốc
          </UButton>
        </div>

        <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg space-y-2">
          <div class="flex justify-between text-xs text-gray-500">
            <span>Mô tả chi tiết:</span>
            <span class="font-semibold text-gray-900 dark:text-gray-100">{{ description }}</span>
          </div>

          <div class="flex justify-between text-xs text-gray-500">
            <span>Phiên bản xác nhận:</span>
            <span class="font-mono font-semibold text-gray-900 dark:text-gray-100">v{{ version }}</span>
          </div>

          <div v-if="!isFinancialMasked && amount !== null" class="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
            <span>Số tiền phát hành:</span>
            <span class="font-mono font-bold text-base text-primary-600 dark:text-primary-400">
              {{ formatFinanceMoney(amount, currencyCode) }}
            </span>
          </div>
          <div v-else-if="isFinancialMasked" class="text-xs text-amber-600 dark:text-amber-400 italic pt-1 border-t border-gray-100 dark:border-gray-800">
            Dữ liệu tài chính được bảo mật theo quyền cost.prepare. Thao tác này sẽ phát hành theo số tiền đã được bộ phận tài chính phê duyệt.
          </div>
        </div>

        <p class="text-xs text-gray-500">
          Lưu ý: Bản ghi đã phát hành sẽ không thể chỉnh sửa trực tiếp qua luồng nháp.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="submitting"
          @click="() => { isOpen = false }"
        >
          Hủy bỏ
        </UButton>
        <UButton
          v-if="unresolvedState === 'unresolved_with_payload'"
          color="primary"
          icon="i-lucide-refresh-cw"
          :loading="submitting"
          data-testid="confirm-publish-replay-btn"
          @click="handlePublish(true)"
        >
          Gửi lại lệnh phát hành gốc
        </UButton>
        <UButton
          v-else
          color="primary"
          :loading="submitting"
          :disabled="submitting || Boolean(storageError) || hasUnsavedEdits || unresolvedState !== 'none'"
          data-testid="confirm-publish-detail-btn"
          @click="handlePublish(false)"
        >
          Xác nhận phát hành
        </UButton>
      </div>
    </template>
  </UModal>
</template>
