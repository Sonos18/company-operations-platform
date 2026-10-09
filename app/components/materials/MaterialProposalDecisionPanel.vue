<template>
  <div
    v-if="shouldRender"
    class="cockpit-card decision-panel"
    role="region"
    aria-label="Quyết định duyệt hoặc trả phiếu yêu cầu vật tư"
  >
    <!-- Header row -->
    <div class="panel-header">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-shield-check" class="panel-header-icon" aria-hidden="true" />
        <h3 class="panel-title">Quyết định tiếp nhận phiếu vật tư</h3>
      </div>
      <div class="status-indicator">
        <span class="text-xs text-slate-500">Phiên bản hiện tại:</span>
        <span class="font-mono text-xs font-semibold text-slate-700">v{{ proposal.version }}</span>
      </div>
    </div>

    <!-- 1. Warning Alert when POST succeeded with ACK but canonical GET failed (postAcknowledged) -->
    <div v-if="postAcknowledged" class="cockpit-alert cockpit-alert--warning mt-3" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-amber-900">Đã ghi nhận, chưa tải lại được phiếu</p>
          <p class="text-sm text-amber-800 mt-0.5">
            Quyết định của bạn đã được ghi nhận trên hệ thống nhưng chưa thể tải lại trạng thái mới nhất từ máy chủ. Vui lòng bấm "Tải lại" để làm mới dữ liệu.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--primary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryCanonicalGet"
            >
              <UIcon v-if="isTransportBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
              Tải lại phiếu
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Danger Alert when POST was rejected but canonical GET refresh failed (isPostRejected) -->
    <div v-else-if="isPostRejected" class="cockpit-alert cockpit-alert--danger mt-3" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-rose-900">{{ actionError }}</p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryCanonicalGet"
            >
              <UIcon v-if="isTransportBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
              Tải lại phiếu
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Danger Alert for unknown POST error (e.g. network/timeout before ACK) -->
    <div v-else-if="pendingCommand" class="cockpit-alert cockpit-alert--danger mt-3" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-rose-900">{{ actionError }}</p>
          <p class="text-sm text-rose-800 mt-0.5">
            Lỗi kết nối máy chủ. Lệnh chưa xác định được kết quả commit. Vui lòng bấm thử lại để tiếp tục với đúng lệnh này.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryPendingCommand"
            >
              <UIcon v-if="isTransportBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-rotate-cw" class="text-sm" aria-hidden="true" />
              Thử lại lệnh vừa gửi
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Regular Error Alert when no command is pending -->
    <div v-else-if="actionError" class="cockpit-alert cockpit-alert--danger mt-3" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <p class="font-semibold text-rose-900 flex-1">{{ actionError }}</p>
      </div>
    </div>

    <!-- Busy progress banner (for active transport) -->
    <div v-if="isTransportBusy" class="busy-banner mt-3" role="status" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-sky-600 shrink-0" aria-hidden="true" />
      <span class="text-sm font-medium text-slate-700">{{ actionStatusMessage || 'Đang xử lý quyết định...' }}</span>
    </div>

    <!-- Interactive Decision Controls: locked whenever pendingCommand exists -->
    <div v-if="!pendingCommand && isEligible" class="decision-content mt-3">
      <!-- Mode: Idle (buttons to choose action) -->
      <div v-if="activeMode === 'idle'" class="flex items-center gap-3 flex-wrap">
        <button
          v-if="canApprove"
          type="button"
          class="cockpit-btn cockpit-btn--primary"
          :disabled="isRegularControlDisabled"
          @click="startApprove"
        >
          <UIcon name="i-lucide-check-circle" aria-hidden="true" />
          Duyệt phiếu
        </button>

        <button
          v-if="canReturn"
          type="button"
          class="cockpit-btn cockpit-btn--danger"
          :disabled="isRegularControlDisabled"
          @click="startReturn"
        >
          <UIcon name="i-lucide-corner-up-left" aria-hidden="true" />
          Trả phiếu
        </button>

        <span v-if="props.disabled" class="text-xs text-slate-500 italic ml-1">
          (Thao tác tạm khóa do hệ thống đang xử lý dữ liệu)
        </span>
      </div>

      <!-- Mode: Confirm Approve -->
      <div v-else-if="activeMode === 'confirm_approve'" class="confirm-box">
        <div class="flex items-center gap-2 mb-1.5">
          <UIcon name="i-lucide-help-circle" class="text-sky-600 text-base shrink-0" aria-hidden="true" />
          <span class="font-medium text-slate-900 text-sm">
            Xác nhận duyệt phiếu yêu cầu vật tư này (v{{ proposal.version }})?
          </span>
        </div>
        <p class="text-xs text-slate-600 mb-3">
          Sau khi duyệt, phiếu sẽ chuyển sang trạng thái "Đã duyệt" và sẵn sàng để bộ phận mua hàng tạo đơn mua.
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--primary btn-sm"
            :disabled="isRegularControlDisabled"
            @click="confirmApprove"
          >
            <UIcon v-if="isTransportBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-check" class="text-sm" aria-hidden="true" />
            Xác nhận duyệt
          </button>
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm"
            :disabled="isRegularControlDisabled"
            @click="cancelAction"
          >
            Hủy
          </button>
        </div>
      </div>

      <!-- Mode: Input Return Reason -->
      <div v-else-if="activeMode === 'input_return'" class="return-box">
        <div class="mb-2">
          <label for="decision-return-reason-input" class="block font-medium text-slate-900 text-sm">
            Lý do trả phiếu <span class="text-rose-600">*</span>
          </label>
          <p class="text-xs text-slate-600 mt-0.5">
            Vui lòng nhập lý do cụ thể (từ 1 đến 2000 ký tự) để kỹ sư lập phiếu có thể điều chỉnh và gửi lại.
          </p>
        </div>

        <textarea
          id="decision-return-reason-input"
          v-model="returnReason"
          rows="3"
          class="return-textarea"
          placeholder="Nhập lý do trả phiếu..."
          :disabled="isRegularControlDisabled"
          maxlength="2000"
        />

        <div class="flex justify-between items-center text-xs text-slate-500 mt-1">
          <span v-if="validationError" class="text-rose-600 font-medium" role="alert">
            {{ validationError }}
          </span>
          <span v-else />
          <span>{{ returnReason.length }}/2000 ký tự</span>
        </div>

        <div class="flex items-center gap-2 mt-3">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--danger btn-sm"
            :disabled="isRegularControlDisabled"
            @click="confirmReturn"
          >
            <UIcon v-if="isTransportBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-corner-up-left" class="text-sm" aria-hidden="true" />
            Xác nhận trả phiếu
          </button>
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm"
            :disabled="isRegularControlDisabled"
            @click="cancelAction"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { MaterialProposalView } from '../../../shared/schemas/costs/material-procurement'
import { workflowUuidSchema } from '../../../shared/schemas/costs/cost-workflow'
import { ClientError } from '../../errors/client-error'
import { createAsyncRequestTracker, type RequestToken } from '../../utils/costs/async-request-tracker'

interface Props {
  companyId: string
  projectId: string
  proposal: MaterialProposalView
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  (e: 'busy', payload: { companyId: string; projectId: string; proposalId: string; value: boolean }): void
  (e: 'refreshed', payload: { companyId: string; projectId: string; proposalId: string; proposal: MaterialProposalView }): void
}>()

const companyAccess = useNuxtApp().$companyAccessStore
const authStore = useNuxtApp().$authStore
const repositories = useRepositories()
const repo = repositories.materialProcurement

interface DecisionCommand {
  readonly companyId: string
  readonly projectId: string
  readonly proposalId: string
  readonly actorId: string
  readonly expectedVersion: number
  readonly decision: 'approve' | 'return'
  readonly reason?: string
  readonly idempotencyKey: string
}

type TrackerScope = {
  companyId: string
  projectId: string
  proposalId: string
  actorId: string
  tokenKey: string
}

const tracker = createAsyncRequestTracker<TrackerScope>()
let isDisposed = false

const isTransportBusy = ref(false)
const pendingCommand = ref<DecisionCommand | null>(null)
const postAcknowledged = ref(false)
const isPostRejected = ref(false)
const actionError = ref('')
const actionStatusMessage = ref('')

const activeMode = ref<'idle' | 'confirm_approve' | 'input_return'>('idle')
const returnReason = ref('')
const validationError = ref('')

function isLiveScopeValid(cmd?: DecisionCommand): boolean {
  if (isDisposed) return false
  const activeCompanyId = companyAccess?.activeCompanyId
  const currentUserId = authStore?.user?.id
  if (!activeCompanyId || !currentUserId) return false
  if (activeCompanyId !== props.companyId) return false
  if (!workflowUuidSchema.safeParse(props.companyId).success) return false
  if (!props.projectId || props.projectId !== props.proposal?.projectId) return false
  if (!workflowUuidSchema.safeParse(props.projectId).success) return false
  if (!props.proposal?.id || !workflowUuidSchema.safeParse(props.proposal.id).success) return false
  if (cmd) {
    if (cmd.companyId !== activeCompanyId) return false
    if (cmd.projectId !== props.projectId) return false
    if (cmd.proposalId !== props.proposal.id) return false
    if (cmd.actorId !== currentUserId) return false
  }
  return true
}

const hasDecidePermission = computed(() => {
  if (!isLiveScopeValid()) return false
  return Boolean(companyAccess?.hasPermission('material.proposal.decide'))
})

const hasReadPermission = computed(() => {
  if (!isLiveScopeValid()) return false
  return Boolean(companyAccess?.hasPermission('material.read'))
})

const canApprove = computed(() => {
  return (
    hasDecidePermission.value &&
    !pendingCommand.value &&
    props.proposal?.reviewState === 'submitted' &&
    Boolean(props.proposal?.currentRevisionId)
  )
})

const canReturn = computed(() => {
  return (
    hasDecidePermission.value &&
    !pendingCommand.value &&
    (props.proposal?.reviewState === 'submitted' || props.proposal?.reviewState === 'approved') &&
    Boolean(props.proposal?.currentRevisionId)
  )
})

const isEligible = computed(() => {
  return canApprove.value || canReturn.value
})

const shouldRender = computed(() => {
  if (!isLiveScopeValid() || !hasDecidePermission.value) return false
  return isEligible.value || Boolean(pendingCommand.value)
})

const isRegularControlDisabled = computed(() => {
  return Boolean(props.disabled || isTransportBusy.value || pendingCommand.value)
})

const isRecoveryControlDisabled = computed(() => {
  return Boolean(isTransportBusy.value || !isLiveScopeValid())
})

function assertCanonicalIdentity(canonical: MaterialProposalView, expectedProjectId: string, expectedProposalId: string): void {
  if (canonical.id !== expectedProposalId || canonical.projectId !== expectedProjectId) {
    throw new Error('Dữ liệu phiếu tải về không khớp định danh hiện tại.')
  }
}

function safeEmitBusy(cmd: DecisionCommand, token: RequestToken<TrackerScope>, value: boolean) {
  if (isDisposed || !token.isCurrent() || !isLiveScopeValid(cmd)) return
  emit('busy', {
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    value,
  })
}

function safeEmitRefreshed(cmd: DecisionCommand, token: RequestToken<TrackerScope>, proposal: MaterialProposalView) {
  if (isDisposed || !token.isCurrent() || !isLiveScopeValid(cmd)) return
  emit('refreshed', {
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    proposal,
  })
}

function startApprove() {
  if (isRegularControlDisabled.value || !canApprove.value) return
  actionError.value = ''
  validationError.value = ''
  activeMode.value = 'confirm_approve'
}

function startReturn() {
  if (isRegularControlDisabled.value || !canReturn.value) return
  actionError.value = ''
  validationError.value = ''
  returnReason.value = ''
  activeMode.value = 'input_return'
}

function cancelAction() {
  if (isTransportBusy.value || pendingCommand.value) return
  activeMode.value = 'idle'
  returnReason.value = ''
  validationError.value = ''
}

async function executeCommand(cmd: DecisionCommand) {
  if (isTransportBusy.value || !isLiveScopeValid(cmd) || !hasDecidePermission.value) return

  const token = tracker.start({
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    actorId: cmd.actorId,
    tokenKey: cmd.idempotencyKey,
  })

  isTransportBusy.value = true
  actionError.value = ''
  validationError.value = ''

  // Lock parent
  safeEmitBusy(cmd, token, true)

  // Phase 1: POST decision command if not yet acknowledged and not already rejected
  if (!postAcknowledged.value && !isPostRejected.value) {
    try {
      actionStatusMessage.value = cmd.decision === 'approve'
        ? 'Đang gửi quyết định duyệt phiếu...'
        : 'Đang gửi quyết định trả phiếu...'

      const input = cmd.decision === 'approve'
        ? { expectedVersion: cmd.expectedVersion, decision: 'approve' as const }
        : { expectedVersion: cmd.expectedVersion, decision: 'return' as const, reason: cmd.reason! }

      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd) || !hasDecidePermission.value) return

      await repo.decideProposal(
        cmd.projectId,
        cmd.proposalId,
        input,
        { idempotencyKey: cmd.idempotencyKey },
      )

      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      postAcknowledged.value = true
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

      const errCode = (err as { code?: string })?.code
      const errStatus = (err as { statusCode?: number; status?: number })?.statusCode
        ?? (err as { status?: number })?.status

      const isConflictOrStateError =
        errCode === 'VERSION_CONFLICT' ||
        errCode === 'IDEMPOTENCY_CONFLICT' ||
        errCode === 'PROPOSAL_NOT_DECIDABLE' ||
        errCode === 'PROPOSAL_NOT_EDITABLE' ||
        errCode === 'HISTORY_IMMUTABLE' ||
        errCode === 'STAGE01_HISTORY_IMMUTABLE' ||
        errStatus === 409

      if (isConflictOrStateError) {
        isPostRejected.value = true
        if (errCode === 'VERSION_CONFLICT' || errStatus === 409) {
          actionError.value = 'Xung đột phiên bản: Phiếu yêu cầu đã bị thay đổi bởi người khác. Vui lòng tải lại dữ liệu mới nhất.'
        } else if (errCode === 'IDEMPOTENCY_CONFLICT') {
          actionError.value = 'Xung đột yêu cầu trùng lặp với nội dung khác nhau. Vui lòng làm mới dữ liệu và thử lại.'
        } else if (errCode === 'PROPOSAL_NOT_DECIDABLE') {
          actionError.value = 'Phiếu không ở trạng thái hợp lệ để duyệt hoặc trả.'
        } else if (errCode === 'PROPOSAL_NOT_EDITABLE') {
          actionError.value = 'Phiếu không thể chỉnh sửa hoặc quyết định ở trạng thái hiện tại.'
        } else if (errCode === 'HISTORY_IMMUTABLE' || errCode === 'STAGE01_HISTORY_IMMUTABLE') {
          actionError.value = 'Lịch sử phiếu đã đóng, không thể thay đổi quyết định.'
        } else {
          actionError.value = err instanceof Error ? err.message : 'Xung đột dữ liệu hoặc trạng thái phiếu.'
        }

        try {
          actionStatusMessage.value = 'Đang tải lại dữ liệu phiếu mới nhất...'
          if (!hasReadPermission.value) throw new Error('PERMISSION_DENIED')

          const canonical = await repo.readProposal(cmd.projectId, cmd.proposalId)
          if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

          assertCanonicalIdentity(canonical, cmd.projectId, cmd.proposalId)

          pendingCommand.value = null
          postAcknowledged.value = false
          isPostRejected.value = false
          activeMode.value = 'idle'
          returnReason.value = ''
          actionStatusMessage.value = ''

          safeEmitRefreshed(cmd, token, canonical)
          safeEmitBusy(cmd, token, false)
        } catch {
          if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
          actionError.value += ' Đồng thời chưa thể tải lại dữ liệu mới nhất từ máy chủ.'
        }
        return
      }

      // Authorization / authentication errors: command rejected before commit
      if (
        errStatus === 401 ||
        errStatus === 403 ||
        errCode === 'PERMISSION_DENIED' ||
        errCode === 'AUTH_REQUIRED' ||
        errCode === 'COMPANY_FORBIDDEN'
      ) {
        actionError.value = err instanceof Error ? err.message : 'Bạn không có quyền thực hiện thao tác này.'
        pendingCommand.value = null
        isPostRejected.value = false
        activeMode.value = 'idle'
        actionStatusMessage.value = ''
        safeEmitBusy(cmd, token, false)
        return
      }

      // Network or unknown errors: retain pendingCommand for exact retry
      actionError.value = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ khi gửi quyết định.'
      return
    } finally {
      if (token.isCurrent() && !isDisposed && isLiveScopeValid(cmd)) {
        isTransportBusy.value = false
        actionStatusMessage.value = ''
      }
    }
  }

  // Phase 2: Canonical GET after command ACK
  if (postAcknowledged.value) {
    try {
      actionStatusMessage.value = 'Đang tải lại dữ liệu phiếu đã cập nhật...'
      if (!hasReadPermission.value) throw new Error('PERMISSION_DENIED')

      const canonical = await repo.readProposal(cmd.projectId, cmd.proposalId)
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

      assertCanonicalIdentity(canonical, cmd.projectId, cmd.proposalId)

      // Completed successfully
      pendingCommand.value = null
      postAcknowledged.value = false
      isPostRejected.value = false
      activeMode.value = 'idle'
      returnReason.value = ''
      actionError.value = ''
      actionStatusMessage.value = ''

      safeEmitRefreshed(cmd, token, canonical)
      safeEmitBusy(cmd, token, false)
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      actionError.value = 'Đã ghi nhận, chưa tải lại được phiếu.'
    } finally {
      if (token.isCurrent() && !isDisposed && isLiveScopeValid(cmd)) {
        isTransportBusy.value = false
        actionStatusMessage.value = ''
      }
    }
  }
}

function confirmApprove() {
  if (isRegularControlDisabled.value || !canApprove.value || pendingCommand.value) return

  const liveActorId = authStore?.user?.id
  if (!liveActorId || !isLiveScopeValid()) return

  const cmd: DecisionCommand = Object.freeze({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    actorId: liveActorId,
    expectedVersion: props.proposal.version,
    decision: 'approve' as const,
    idempotencyKey: crypto.randomUUID(),
  })

  pendingCommand.value = cmd
  postAcknowledged.value = false
  isPostRejected.value = false
  void executeCommand(cmd)
}

function confirmReturn() {
  if (isRegularControlDisabled.value || !canReturn.value || pendingCommand.value) return

  const trimmed = returnReason.value.trim()
  if (!trimmed) {
    validationError.value = 'Vui lòng nhập lý do trả phiếu.'
    return
  }
  if (trimmed.length > 2000) {
    validationError.value = 'Lý do trả phiếu không được vượt quá 2000 ký tự.'
    return
  }
  validationError.value = ''

  const liveActorId = authStore?.user?.id
  if (!liveActorId || !isLiveScopeValid()) return

  const cmd: DecisionCommand = Object.freeze({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    actorId: liveActorId,
    expectedVersion: props.proposal.version,
    decision: 'return' as const,
    reason: trimmed,
    idempotencyKey: crypto.randomUUID(),
  })

  pendingCommand.value = cmd
  postAcknowledged.value = false
  isPostRejected.value = false
  void executeCommand(cmd)
}

function retryPendingCommand() {
  if (isRecoveryControlDisabled.value || !pendingCommand.value || postAcknowledged.value || isPostRejected.value) return
  void executeCommand(pendingCommand.value)
}

async function retryCanonicalGet() {
  if (isRecoveryControlDisabled.value || !pendingCommand.value || (!postAcknowledged.value && !isPostRejected.value)) return
  const cmd = pendingCommand.value

  const token = tracker.start({
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    actorId: cmd.actorId,
    tokenKey: 'retry-canonical-get',
  })

  isTransportBusy.value = true
  actionError.value = ''
  actionStatusMessage.value = 'Đang tải lại dữ liệu phiếu...'

  safeEmitBusy(cmd, token, true)

  try {
    if (!hasReadPermission.value) throw new Error('PERMISSION_DENIED')

    const canonical = await repo.readProposal(cmd.projectId, cmd.proposalId)
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

    assertCanonicalIdentity(canonical, cmd.projectId, cmd.proposalId)

    pendingCommand.value = null
    postAcknowledged.value = false
    isPostRejected.value = false
    activeMode.value = 'idle'
    returnReason.value = ''
    actionError.value = ''
    actionStatusMessage.value = ''

    safeEmitRefreshed(cmd, token, canonical)
    safeEmitBusy(cmd, token, false)
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
    if (postAcknowledged.value) {
      actionError.value = 'Đã ghi nhận, chưa tải lại được phiếu. Vui lòng thử lại.'
    } else {
      actionError.value = 'Chưa tải lại được dữ liệu mới nhất từ máy chủ. Vui lòng thử lại.'
    }
  } finally {
    if (token.isCurrent() && !isDisposed && isLiveScopeValid(cmd)) {
      isTransportBusy.value = false
      actionStatusMessage.value = ''
    }
  }
}

watch(
  [
    () => companyAccess?.activeCompanyId,
    () => authStore?.user?.id,
    () => companyAccess?.hasPermission('material.proposal.decide'),
    () => props.companyId,
    () => props.projectId,
    () => props.proposal?.id,
  ],
  ([newCompany, newActor, newDecide, newPropCompany, newPropProject, newPropProposal],
   [oldCompany, oldActor, oldDecide, oldPropCompany, oldPropProject, oldPropProposal]) => {
    const changed =
      newCompany !== oldCompany ||
      newActor !== oldActor ||
      newDecide !== oldDecide ||
      newPropCompany !== oldPropCompany ||
      newPropProject !== oldPropProject ||
      newPropProposal !== oldPropProposal

    if (changed) {
      tracker.invalidate()
      isTransportBusy.value = false
      pendingCommand.value = null
      postAcknowledged.value = false
      isPostRejected.value = false
      activeMode.value = 'idle'
      returnReason.value = ''
      validationError.value = ''
      actionError.value = ''
      actionStatusMessage.value = ''
      // Never emit busy=false into another context
    }
  },
  { flush: 'sync' },
)

onUnmounted(() => {
  isDisposed = true
  tracker.invalidate()
  // Never emit busy=false on unmount
})
</script>

<style scoped>
.decision-panel {
  padding: 16px 20px;
  border-left: 4px solid var(--accent, #0284c7);
  background: #ffffff;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-header-icon {
  color: #0284c7;
  font-size: 1.15rem;
  flex-shrink: 0;
}

.panel-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink, #0f172a);
  margin: 0;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.confirm-box {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.return-box {
  padding: 12px 14px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 6px;
}

.return-textarea {
  width: 100%;
  padding: 8px 12px;
  font-size: 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: var(--ink, #0f172a);
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.return-textarea:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
}

.return-textarea:disabled {
  background: #f1f5f9;
  cursor: not-allowed;
  opacity: 0.7;
}

.cockpit-alert--warning {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
}

.cockpit-alert--danger {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
}

.cockpit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.cockpit-btn--primary {
  background: #0284c7;
  color: #ffffff;
  border: none;
}

.cockpit-btn--primary:hover:not(:disabled) {
  background: #0369a1;
}

.cockpit-btn--secondary {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.cockpit-btn--secondary:hover:not(:disabled) {
  background: #e2e8f0;
}

.cockpit-btn--danger {
  background: #dc2626;
  color: #ffffff;
  border: none;
}

.cockpit-btn--danger:hover:not(:disabled) {
  background: #b91c1c;
}

.cockpit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 0.8rem;
}

.busy-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
}
</style>
