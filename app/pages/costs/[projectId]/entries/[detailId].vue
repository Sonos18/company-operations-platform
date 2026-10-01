<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type {
  ProjectCostDetailDraft,
  ProjectCostDetailOperationalDraft,
  ProjectCostPublishReadiness,
} from '../../../../../shared/schemas/costs/project-costs'
import { extractErrorMessage } from '../../../../utils/costs/accounting-error-mapper'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import {
  clearInMemorySnapshots,
  clearStashedDraftFinancials,
  evaluateUnresolvedState,
  peekStashedDraftFinancials,
  readUnresolvedMarker,
  type UnresolvedCommandMarker,
  type UnresolvedState,
} from '../../../../utils/costs/cost-command-recovery'
import ProjectCostDetailOperationsForm from '../../../../components/costs/ProjectCostDetailOperationsForm.vue'
import ProjectCostDetailFinancialForm from '../../../../components/costs/ProjectCostDetailFinancialForm.vue'
import ProjectCostDetailEvidencePanel from '../../../../components/costs/ProjectCostDetailEvidencePanel.vue'
import ProjectCostDetailPublishReadinessPanel from '../../../../components/costs/ProjectCostPublishReadinessPanel.vue'
import ProjectCostDetailPublishModal from '../../../../components/costs/ProjectCostDetailPublishModal.vue'

definePageMeta({ requiredAnyPermissions: ['cost.manage', 'cost.prepare'] })

const route = useRoute()
const router = useRouter()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const authStore = useNuxtApp().$authStore

const projectId = computed(() => String(route.params.projectId ?? ''))
const detailId = computed(() => String(route.params.detailId ?? ''))
const currentActorId = computed(() => authStore?.user?.id ?? 'anonymous')

const canManage = computed(() => companyAccess.hasPermission('cost.manage'))
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))
const canPublish = computed(() => companyAccess.hasPermission('cost.publish_import'))
const canRead = computed(() => companyAccess.hasPermission('cost.read'))

type DetailProjectionTier = 'prepare' | 'manage' | 'none'
const projectionTier = computed<DetailProjectionTier>(() => {
  if (canPrepare.value) return 'prepare'
  if (canManage.value) return 'manage'
  return 'none'
})

const loading = ref(true)
const status = ref<'loading' | 'ready' | 'not_found' | 'permission' | 'error'>('loading')
const errorMessage = ref<string | null>(null)

const financialDraft = ref<ProjectCostDetailDraft | null>(null)
const operationalDraft = ref<ProjectCostDetailOperationalDraft | null>(null)
const isPublishModalOpen = ref(false)

// Dirty state tracking for workbench forms
const isOperationsDirty = ref(false)
const isFinancialDirty = ref(false)
const hasUnsavedEdits = computed(() => isOperationsDirty.value || isFinancialDirty.value)

// Unresolved command state for publish_draft
const unresolvedPublishState = ref<UnresolvedState>('none')
const activeUnresolvedPublishMarker = ref<UnresolvedCommandMarker | null>(null)

function checkUnresolvedPublishState() {
  const companyId = companyAccess.activeCompanyId ?? ''
  const actorId = currentActorId.value
  const state = evaluateUnresolvedState(companyId, actorId, 'publish_draft', detailId.value)
  unresolvedPublishState.value = state
  if (state !== 'none') {
    activeUnresolvedPublishMarker.value = readUnresolvedMarker(companyId, actorId, 'publish_draft', detailId.value)
  }
  else {
    activeUnresolvedPublishMarker.value = null
  }
}

const draftTracker = createAsyncRequestTracker<{
  companyId: string | null
  projectId: string
  detailId: string
  tier: DetailProjectionTier
}>()

const activeDraft = computed(() => financialDraft.value ?? operationalDraft.value)

const readiness = computed<ProjectCostPublishReadiness | null>(() => {
  return financialDraft.value?.publishReadiness ?? null
})

// Clean baseline is the actual server financial projection (e.g. amount is null for unpriced draft).
// Stashed financials from create-draft are peeked non-destructively and hydrated as dirty edits in the form.
const stashedFinancials = computed(() => {
  if (!canPrepare.value || !financialDraft.value) return null
  if (financialDraft.value.amount !== null && financialDraft.value.amount !== '') return null
  const companyId = companyAccess.activeCompanyId ?? ''
  const actorId = currentActorId.value
  return peekStashedDraftFinancials(companyId, projectId.value, detailId.value, actorId)
})

async function fetchDraft(isRefetch = false) {
  const request = draftTracker.start({
    companyId: companyAccess.activeCompanyId,
    projectId: projectId.value,
    detailId: detailId.value,
    tier: projectionTier.value,
  })

  // Do not reset drafts or status to loading during same-detail refetch, keeping forms mounted and preserving dirty edits
  const isSameDetail = activeDraft.value?.id === request.identity.detailId && activeDraft.value?.projectId === request.identity.projectId
  if (!isRefetch || !isSameDetail) {
    if (!isSameDetail) {
      financialDraft.value = null
      operationalDraft.value = null
    }
    status.value = 'loading'
    loading.value = true
  }

  isPublishModalOpen.value = false
  errorMessage.value = null

  if (!request.identity.projectId || !request.identity.detailId) {
    status.value = 'not_found'
    loading.value = false
    return
  }

  if (request.identity.tier === 'none') {
    status.value = 'permission'
    loading.value = false
    return
  }

  try {
    if (request.identity.tier === 'prepare') {
      const data = await repositories.projectCosts.detailDraft(request.identity.detailId)
      if (!request.isCurrent()) return
      if (data.projectId !== request.identity.projectId) {
        status.value = 'not_found'
        return
      }
      financialDraft.value = data
      operationalDraft.value = null
      status.value = 'ready'
    }
    else {
      const data = await repositories.projectCosts.operationalDetailDraft(request.identity.detailId)
      if (!request.isCurrent()) return
      if (data.projectId !== request.identity.projectId) {
        status.value = 'not_found'
        return
      }
      operationalDraft.value = data
      financialDraft.value = null
      status.value = 'ready'
    }
    checkUnresolvedPublishState()
  }
  catch (err: unknown) {
    if (!request.isCurrent()) return
    if (activeDraft.value) {
      errorMessage.value = extractErrorMessage(err, 'Không thể cập nhật thông tin chi tiết.')
      return
    }
    const msg = extractErrorMessage(err)
    if (msg.includes('Không tìm thấy') || (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'RESOURCE_NOT_FOUND')) {
      status.value = 'not_found'
    }
    else {
      status.value = 'error'
      errorMessage.value = msg
    }
  }
  finally {
    if (request.isCurrent()) loading.value = false
  }
}

watch(
  [() => companyAccess.activeCompanyId, currentActorId],
  () => {
    // Clear snapshots and state on actor/company switch
    clearInMemorySnapshots()
    isOperationsDirty.value = false
    isFinancialDirty.value = false
    fetchDraft()
  },
)

watch(
  [projectId, detailId, projectionTier],
  () => {
    // Ordinary project / route navigation preserves in-memory snapshots of the same context
    fetchDraft()
  },
  { immediate: true },
)

onUnmounted(() => {
  draftTracker.invalidate()
  // NOTE: In-memory snapshots are preserved across ordinary route navigation within same context
})

function onOperationalSaved(result: { version: number }) {
  if (activeDraft.value) {
    activeDraft.value.version = result.version
  }
  fetchDraft(true)
}

function onFinancialSaved(result: { version: number }) {
  if (activeDraft.value) {
    activeDraft.value.version = result.version
  }
  clearStashedDraftFinancials({
    companyId: companyAccess.activeCompanyId ?? undefined,
    projectId: projectId.value,
    detailId: detailId.value,
    actorId: currentActorId.value,
  })
  fetchDraft(true)
}

function onFinancialDiscarded() {
  clearStashedDraftFinancials({
    companyId: companyAccess.activeCompanyId ?? undefined,
    projectId: projectId.value,
    detailId: detailId.value,
    actorId: currentActorId.value,
  })
}

function onEvidenceLinked() {
  // Evidence linking does not bump detail.version; refetch to update publish readiness while keeping forms mounted
  fetchDraft(true)
}

function onPublished() {
  router.push(canRead.value ? `/costs/${projectId.value}` : `/cost-drafts?projectId=${projectId.value}`)
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6 pb-12" data-testid="detail-draft-page">
    <div class="page-top-nav">
      <NuxtLink
        :to="canRead ? `/costs/${projectId}` : `/cost-drafts?projectId=${projectId}`"
        class="back-link inline-flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600"
      >
        <UIcon name="i-lucide-arrow-left" aria-hidden="true" />
        <span>{{ canRead ? 'Quay lại chi phí dự án' : 'Quay lại danh sách bản nháp' }}</span>
      </NuxtLink>
    </div>

    <!-- Loading State -->
    <div v-if="status === 'loading'" class="cockpit-card p-12 text-center text-sm text-gray-500" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="spin text-2xl mb-2 text-primary-600" aria-hidden="true" />
      <p>Đang tải chi tiết chi phí…</p>
    </div>

    <!-- Error State -->
    <div v-else-if="status === 'error'" class="cockpit-card p-8 text-center space-y-4" role="alert" data-testid="detail-page-error">
      <UIcon name="i-lucide-circle-alert" class="text-3xl text-red-500" aria-hidden="true" />
      <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">Không thể tải bản nháp chi tiết</h2>
      <p class="text-xs text-gray-500 max-w-md mx-auto">{{ errorMessage }}</p>
      <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-refresh-cw" @click="() => fetchDraft()">
        Thử lại
      </UButton>
    </div>

    <!-- Not Found State -->
    <div v-else-if="status === 'not_found'" class="cockpit-card p-8 text-center space-y-4" data-testid="detail-page-not-found">
      <UIcon name="i-lucide-file-question" class="text-3xl text-gray-400" aria-hidden="true" />
      <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">Không tìm thấy bản nháp chi tiết</h2>
      <p class="text-xs text-gray-500">Chi tiết này không tồn tại hoặc đã được phát hành chính thức.</p>
      <NuxtLink :to="canRead ? `/costs/${projectId}` : `/cost-drafts?projectId=${projectId}`" class="cockpit-btn cockpit-btn--secondary btn-sm">
        Quay lại
      </NuxtLink>
    </div>

    <!-- Permission State -->
    <div v-else-if="status === 'permission'" class="cockpit-card p-8 text-center space-y-4">
      <UIcon name="i-lucide-shield-alert" class="text-3xl text-amber-500" aria-hidden="true" />
      <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">Không có quyền truy cập</h2>
      <p class="text-xs text-gray-500">Bạn cần quyền cost.manage hoặc cost.prepare để xem chi tiết này.</p>
    </div>

    <!-- Ready State -->
    <div v-else-if="activeDraft && status === 'ready'" class="space-y-6">
      <header class="cockpit-card p-6 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="cockpit-badge cockpit-badge--warning text-xs">Bản nháp chi tiết</span>
            <span class="text-xs font-mono text-gray-400">v{{ activeDraft.version }}</span>
          </div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {{ activeDraft.description }}
          </h1>
          <p class="text-xs text-gray-500 mt-1">
            Dòng chi tiết chi phí thông thường đang được chuẩn bị.
          </p>
        </div>

        <!-- Publish Draft Action Button -->
        <div v-if="canPublish" class="flex items-center gap-3">
          <UButton
            color="primary"
            icon="i-lucide-check-check"
            :disabled="(canPrepare && !readiness?.ready) || hasUnsavedEdits || unresolvedPublishState !== 'none'"
            data-testid="open-publish-modal-btn"
            @click="() => { isPublishModalOpen = true }"
          >
            Phát hành bản nháp
          </UButton>
        </div>
      </header>

      <UAlert
        v-if="hasUnsavedEdits"
        color="warning"
        variant="subtle"
        title="Chỉnh sửa chưa lưu"
        description="Bạn có thay đổi chưa được lưu trong biểu mẫu vận hành hoặc tài chính. Vui lòng lưu các thay đổi hoặc hủy bỏ trước khi phát hành bản nháp."
        data-testid="unsaved-edits-page-alert"
      />

      <UAlert
        v-if="stashedFinancials"
        color="info"
        variant="subtle"
        title="Đã nạp thông tin tài chính"
        description="Dữ liệu tài chính bạn nhập khi lưu bản nháp đã được nạp tự động vào biểu mẫu dưới dạng thay đổi chưa lưu. Vui lòng kiểm tra và bấm 'Lưu dữ liệu tài chính' để hoàn tất hoặc 'Hủy thay đổi' để hủy bỏ."
        data-testid="stashed-financials-loaded-alert"
      />

      <!-- Untrusted Recovery State Alert for publish_draft -->
      <div
        v-if="unresolvedPublishState === 'unresolved_marker_corrupted' || unresolvedPublishState === 'unresolved_storage_unreadable'"
        class="cockpit-card p-6 rounded-lg border-l-4 border-red-500 bg-red-50/50 dark:bg-red-950/20 space-y-3"
        data-testid="detail-publish-untrusted-recovery-alert"
      >
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-shield-alert" class="text-red-600 text-xl shrink-0 mt-0.5" />
          <div class="space-y-1 text-sm">
            <h3 class="font-bold text-gray-900 dark:text-gray-100">
              Trạng thái phục hồi phát hành không thể xác minh
            </h3>
            <p class="text-xs text-gray-700 dark:text-gray-300">
              Dữ liệu trạng thái phục hồi trên trình duyệt bị lỗi hoặc không thể đọc được. Để tránh rủi ro phát hành trùng lặp, thao tác phát hành bị khóa an toàn.
            </p>
          </div>
        </div>
      </div>

      <!-- Lost Payload Reconciliation Panel for publish_draft -->
      <div
        v-if="unresolvedPublishState === 'unresolved_payload_lost' && activeUnresolvedPublishMarker"
        class="cockpit-card p-6 rounded-lg border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 space-y-4"
        data-testid="detail-publish-lost-payload-panel"
      >
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-xl shrink-0 mt-0.5" />
          <div class="space-y-2 text-sm">
            <h3 class="font-bold text-gray-900 dark:text-gray-100">
              Lệnh phát hành bản nháp trước đó chưa được xác nhận
            </h3>
            <p class="text-xs text-gray-700 dark:text-gray-300">
              Hệ thống ghi nhận một lệnh phát hành bản nháp đang được gửi đi nhưng chưa hoàn tất phản hồi. Để tránh rủi ro phát hành trùng lặp, thao tác phát hành bị khóa.
            </p>
            <div class="bg-white dark:bg-gray-900 p-3 rounded text-xs font-mono space-y-1">
              <div><strong>Idempotency Key:</strong> {{ activeUnresolvedPublishMarker.idempotencyKey }}</div>
              <div><strong>Thời điểm gửi:</strong> {{ new Date(activeUnresolvedPublishMarker.timestamp).toLocaleString('vi-VN') }}</div>
            </div>
            <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">
              Vui lòng liên hệ quản trị viên hoặc kế toán kiểm tra nhật ký giao dịch trước khi thử lại.
            </p>
          </div>
        </div>
      </div>

      <!-- Retained Payload Replay Banner for publish_draft -->
      <div
        v-else-if="unresolvedPublishState === 'unresolved_with_payload' && activeUnresolvedPublishMarker"
        class="cockpit-card p-4 rounded-lg border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 flex flex-col md:flex-row md:items-center justify-between gap-3"
        data-testid="detail-publish-retained-payload-banner"
      >
        <div class="flex items-center gap-3 text-sm">
          <UIcon name="i-lucide-wifi-off" class="text-blue-600 text-xl shrink-0" />
          <div>
            <span class="font-semibold text-gray-900 dark:text-gray-100">Mất kết nối hoặc phản hồi quá hạn khi phát hành.</span>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Yêu cầu phát hành bản nháp trước đó chưa nhận được xác nhận từ máy chủ. Dữ liệu lệnh gốc vẫn được giữ nguyên an toàn.
            </p>
          </div>
        </div>
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-refresh-cw"
          data-testid="open-publish-modal-replay-btn"
          @click="() => { isPublishModalOpen = true }"
        >
          Mở hộp thoại gửi lại lệnh gốc
        </UButton>
      </div>

      <!-- Publish Readiness Panel (cost.prepare only) -->
      <ProjectCostDetailPublishReadinessPanel
        v-if="canPrepare && readiness"
        :readiness="readiness"
        :can-publish="canPublish"
        @open-publish="() => { isPublishModalOpen = true }"
      />

      <!-- Operational Form Component -->
      <ProjectCostDetailOperationsForm
        :detail="{
          id: activeDraft.id,
          version: activeDraft.version,
          description: activeDraft.description,
          relevantDate: activeDraft.relevantDate,
          reference: activeDraft.reference,
          note: activeDraft.note,
        }"
        :disabled="!canManage"
        @saved="onOperationalSaved"
        @refresh-requested="() => fetchDraft(true)"
        @dirty-change="(d) => { isOperationsDirty = d }"
      />

      <!-- Financial Form Component (cost.prepare only) -->
      <ProjectCostDetailFinancialForm
        v-if="canPrepare && financialDraft"
        :detail-id="financialDraft.id"
        :version="financialDraft.version"
        :financials="{
          amount: financialDraft.amount,
          quantity: financialDraft.quantity,
          unitCode: financialDraft.unitCode,
          unitPrice: financialDraft.unitPrice,
          retentionKind: financialDraft.retentionKind,
          retentionRateBps: financialDraft.retentionRateBps,
          retentionAmount: financialDraft.retentionAmount,
          sourceFigureIds: financialDraft.sourceFigureIds,
        }"
        :stashed-financials="stashedFinancials"
        @saved="onFinancialSaved"
        @discarded="onFinancialDiscarded"
        @refresh-requested="() => fetchDraft(true)"
        @dirty-change="(d) => { isFinancialDirty = d }"
      />
      <!-- Financial masked placeholder for manage+publish users without cost.prepare -->
      <div v-else class="cockpit-card p-6 rounded-lg text-xs text-gray-500 italic bg-gray-50 dark:bg-gray-900/30">
        Dữ liệu tài chính được bảo mật và quản lý bởi nhân sự có quyền <code>cost.prepare</code>.
      </div>

      <!-- Evidence Panel Component -->
      <ProjectCostDetailEvidencePanel
        :project-id="projectId"
        :detail-id="activeDraft.id"
        @evidence-linked="onEvidenceLinked"
      />

      <!-- Publish Modal -->
      <ProjectCostDetailPublishModal
        v-model:open="isPublishModalOpen"
        :detail-id="activeDraft.id"
        :version="activeDraft.version"
        :description="activeDraft.description"
        :amount="financialDraft?.amount ?? null"
        :is-financial-masked="!canPrepare"
        :has-unsaved-edits="hasUnsavedEdits"
        @published="onPublished"
      />
    </div>
  </div>
</template>
