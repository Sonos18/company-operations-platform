<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type {
  CreateAndPublishProjectCostDetailInput,
  CreateProjectCostDetailDraftInput,
  ProjectCostDraftCategoryOption,
} from '../../../../../shared/schemas/costs/project-costs'
import { extractErrorMessage } from '../../../../utils/costs/accounting-error-mapper'
import { deriveRetentionAmount, deriveUnitPrice, formatFinanceMoney, isDecimalGreaterThan } from '../../../../utils/costs/finance-display'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import {
  clearCommandRecord,
  clearInMemorySnapshots,
  evaluateUnresolvedState,
  isDefinitivelyRejectedError,
  isRecoveryStorageAvailable,
  persistUnresolvedMarker,
  readRetainedPayload,
  readUnresolvedMarker,
  registerMemoryPayloadSnapshot,
  stashDraftFinancials,
  type UnresolvedCommandMarker,
  type UnresolvedState,
} from '../../../../utils/costs/cost-command-recovery'

definePageMeta({ requiredPermission: 'cost.manage' })

const route = useRoute()
const router = useRouter()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const authStore = useNuxtApp().$authStore
const currentActorId = computed(() => authStore?.user?.id ?? 'anonymous')

const projectId = computed(() => String(route.params.projectId ?? ''))
const categoryIdParam = computed(() => (typeof route.query.categoryId === 'string' ? route.query.categoryId : ''))

const projectWritable = ref(false)
const canManage = computed(() => companyAccess.hasPermission('cost.manage'))
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))
const canPublish = computed(() => companyAccess.hasPermission('cost.publish_import'))
const canRead = computed(() => companyAccess.hasPermission('cost.read'))

const canPublishNow = computed(() => canManage.value && canPrepare.value && canPublish.value)

const loading = ref(true)
const categories = ref<ProjectCostDraftCategoryOption[]>([])
const allCategories = ref<ProjectCostDraftCategoryOption[]>([])
const pageError = ref<string | null>(null)
const categoryDeepLinkWarning = ref<string | null>(null)
const isSubcontractSelected = ref(false)

// Unresolved command state
const unresolvedState = ref<UnresolvedState>('none')
const activeUnresolvedMarker = ref<UnresolvedCommandMarker | null>(null)

const submittingAction = ref<'draft' | 'publish' | null>(null)
const formError = ref<string | null>(null)
const storageError = ref<string | null>(null)
const isSaveDraftFinancialConfirmOpen = ref(false)

const form = reactive({
  categoryId: '',
  description: '',
  relevantDate: '',
  reference: '',
  note: '',
  amount: '',
  quantity: '',
  unitCode: '',
  unitPrice: '',
  retentionKind: '' as '' | 'warranty' | 'other',
  retentionRateBps: null as number | null,
  retentionAmount: '',
})

const metadataTracker = createAsyncRequestTracker<{ companyId: string | null; projectId: string }>()

function checkUnresolvedState() {
  const companyId = companyAccess.activeCompanyId ?? ''
  const actorId = currentActorId.value
  const stateDraft = evaluateUnresolvedState(companyId, actorId, 'create_detail_draft', projectId.value)
  const statePublish = evaluateUnresolvedState(companyId, actorId, 'publish_now', projectId.value)

  if (stateDraft !== 'none') {
    unresolvedState.value = stateDraft
    activeUnresolvedMarker.value = readUnresolvedMarker(companyId, actorId, 'create_detail_draft', projectId.value)
  }
  else if (statePublish !== 'none') {
    unresolvedState.value = statePublish
    activeUnresolvedMarker.value = readUnresolvedMarker(companyId, actorId, 'publish_now', projectId.value)
  }
  else {
    unresolvedState.value = 'none'
    activeUnresolvedMarker.value = null
  }
}

function resetForm(keepCategory = false) {
  if (!keepCategory) {
    form.categoryId = ''
  }
  form.description = ''
  form.relevantDate = ''
  form.reference = ''
  form.note = ''
  form.amount = ''
  form.quantity = ''
  form.unitCode = ''
  form.unitPrice = ''
  form.retentionKind = ''
  form.retentionRateBps = null
  form.retentionAmount = ''
  formError.value = null
  storageError.value = null
}

function resetFinancialFields() {
  form.amount = ''
  form.quantity = ''
  form.unitCode = ''
  form.unitPrice = ''
  form.retentionKind = ''
  form.retentionRateBps = null
  form.retentionAmount = ''
}

async function loadMetadata() {
  const request = metadataTracker.start({
    companyId: companyAccess.activeCompanyId,
    projectId: projectId.value,
  })

  loading.value = true
  projectWritable.value = false
  pageError.value = null
  categoryDeepLinkWarning.value = null
  isSubcontractSelected.value = false

  try {
    const meta = await repositories.projectCosts.draftManagementMetadata()
    if (!request.isCurrent()) return

    const project = meta.projects.find(p => p.id === request.identity.projectId)
    if (!project) { pageError.value = 'Không tìm thấy dự án.'; return }
    if (project.operationalState === 'completed') { pageError.value = 'Dự án đã hoàn thành, chỉ được xem dữ liệu.'; return }
    projectWritable.value = true
    allCategories.value = meta.categories

    // Decision 2.A: Show only active ordinary_detail categories in dropdown
    categories.value = meta.categories.filter(c => c.isActive && c.postingStrategy === 'ordinary_detail')

    // Handle deep link
    if (categoryIdParam.value) {
      const match = meta.categories.find(c => c.categoryId === categoryIdParam.value)
      if (!match || !match.isActive) {
        // Invalid or inactive: leave selection empty, require explicit selection
        form.categoryId = ''
        categoryDeepLinkWarning.value = 'Danh mục từ liên kết không tồn tại hoặc đã ngừng hoạt động. Vui lòng chọn một danh mục chi phí hợp lệ từ danh sách bên dưới.'
      }
      else if (match.postingStrategy === 'subcontract_payment') {
        // Subcontract deep link: explain and block ordinary entry
        form.categoryId = match.categoryId
        isSubcontractSelected.value = true
      }
      else {
        form.categoryId = match.categoryId
      }
    }
    else {
      // No deep link: leave empty placeholder, require explicit selection
      form.categoryId = ''
    }
  }
  catch (err: unknown) {
    if (!request.isCurrent()) return
    pageError.value = extractErrorMessage(err, 'Không thể tải danh mục chi phí dự án.')
  }
  finally {
    if (request.isCurrent()) {
      loading.value = false
      checkUnresolvedState()
    }
  }
}

// Watch company and actor changes: clear sensitive inputs and in-memory snapshots
watch(
  [() => companyAccess.activeCompanyId, currentActorId],
  () => {
    resetForm()
    clearInMemorySnapshots()
    metadataTracker.invalidate()
    loadMetadata()
  },
)

// Watch projectId changes
watch(
  projectId,
  () => {
    resetForm()
    metadataTracker.invalidate()
    loadMetadata()
  },
  { immediate: true },
)

// Watch capability changes: if cost.prepare is revoked, clear sensitive financial inputs
watch(canPrepare, (newCanPrepare) => {
  if (!newCanPrepare) {
    resetFinancialFields()
  }
})

let pageMounted = false
let currentDispatchGeneration = 0

onMounted(() => {
  pageMounted = true
  checkUnresolvedState()
})

onUnmounted(() => {
  pageMounted = false
  currentDispatchGeneration++
  metadataTracker.invalidate()
  // NOTE: in-memory snapshots preserved across ordinary route navigation within same context!
})

const isAmountValid = computed(() => {
  const val = form.amount.trim()
  if (val === '') return false
  return /^-?\d+(?:\.\d+)?$/.test(val)
})

const hasEnteredFinancials = computed(() => {
  return Boolean(
    form.amount.trim()
    || form.quantity.trim()
    || form.unitPrice.trim()
    || form.retentionKind
    || form.retentionAmount.trim(),
  )
})

function onAmountOrQuantityBlur() {
  if (form.amount !== '' && form.quantity !== '') {
    const derived = deriveUnitPrice(form.amount, form.quantity)
    if (derived !== null && !form.unitPrice) form.unitPrice = derived
  }
}

function onRetentionRateChange() {
  if (form.amount !== '' && form.retentionRateBps !== null) {
    const derived = deriveRetentionAmount(form.amount, form.retentionRateBps)
    if (derived !== null) form.retentionAmount = derived
  }
}

function onSaveDraftClick() {
  if (submittingAction.value) return // Rapid click guard
  if (unresolvedState.value !== 'none') {
    formError.value = 'Đang có lệnh chưa được giải quyết trên hệ thống. Vui lòng gửi lại yêu cầu gốc hoặc liên hệ hỗ trợ.'
    return
  }

  // If financial fields were entered, prompt user before proceeding to avoid silent discard
  if (hasEnteredFinancials.value) {
    isSaveDraftFinancialConfirmOpen.value = true
  }
  else {
    submitSaveDraft(false, false)
  }
}

function confirmSaveDraftWithFinancials(retainFinancials: boolean) {
  isSaveDraftFinancialConfirmOpen.value = false
  submitSaveDraft(false, retainFinancials)
}

// 1. Save Draft (cost.manage)
async function submitSaveDraft(isReplay = false, retainFinancials = true) {
  if (submittingAction.value) return // Rapid click guard

  if (!canManage.value) {
    formError.value = 'Bạn không có quyền cost.manage để lưu bản nháp.'
    return
  }

  if (!isReplay) {
    if (!projectWritable.value) {
      formError.value = 'Dự án đã hoàn thành hoặc chưa xác minh được trạng thái, không thể tạo lệnh mới.'
      return
    }
    if (isSubcontractSelected.value) {
      formError.value = 'Mô hình chi phí thầu phụ không hỗ trợ lưu bản nháp chi phí thông thường.'
      return
    }

    if (!form.categoryId) {
      formError.value = 'Vui lòng chọn danh mục chi phí hợp lệ.'
      return
    }

    if (!form.description.trim()) {
      formError.value = 'Vui lòng nhập mô tả chi phí.'
      return
    }

    // Block new command dispatch while unresolved command exists
    if (unresolvedState.value !== 'none') {
      formError.value = 'Đang có lệnh chưa được giải quyết trên hệ thống. Vui lòng gửi lại yêu cầu gốc hoặc liên hệ hỗ trợ.'
      return
    }
  }

  // Pre-flight recovery storage check (fail-closed policy)
  if (!isRecoveryStorageAvailable()) {
    storageError.value = 'Không thể lưu trữ trạng thái phục hồi an toàn trên trình duyệt (session storage không khả dụng). Để ngăn ngừa rủi ro tạo trùng lặp chi phí khi mất kết nối mạng, thao tác ghi bị tạm dừng. Vui lòng bật quyền lưu trữ phiên trên trình duyệt.'
    return
  }

  submittingAction.value = 'draft'
  formError.value = null
  storageError.value = null

  const companyId = companyAccess.activeCompanyId ?? ''
  const actorId = currentActorId.value
  const operation = 'create_detail_draft'
  const targetId = projectId.value
  const dispatchContext = {
    companyId,
    actorId,
    projectId: targetId,
  }
  const dispatchGeneration = ++currentDispatchGeneration

  let idempotencyKey: string
  let payload: CreateProjectCostDetailDraftInput

  if (isReplay) {
    const retained = readRetainedPayload(companyId, actorId, operation, targetId)
    if (!retained) {
      formError.value = 'Dữ liệu lệnh trước đó không còn trong bộ nhớ. Không thể tự động gửi lại.'
      submittingAction.value = null
      checkUnresolvedState()
      return
    }
    idempotencyKey = retained.idempotencyKey
    payload = retained.payloadSnapshot as unknown as CreateProjectCostDetailDraftInput
  }
  else {
    idempotencyKey = globalThis.crypto.randomUUID()
    payload = {
      categoryId: form.categoryId,
      description: form.description.trim(),
      ...(form.relevantDate ? { relevantDate: form.relevantDate } : {}),
      ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    }

    try {
      persistUnresolvedMarker({
        companyId,
        actorId,
        operation,
        targetId,
        idempotencyKey,
        timestamp: Date.now(),
      })
      registerMemoryPayloadSnapshot(companyId, actorId, operation, targetId, idempotencyKey, payload as unknown as Record<string, unknown>)
    }
    catch {
      storageError.value = 'Không thể lưu trữ trạng thái phục hồi trên trình duyệt. Lệnh ghi đã bị dừng an toàn.'
      submittingAction.value = null
      return
    }
  }

  try {
    const result = await repositories.projectCosts.createDetailDraft(dispatchContext.projectId, payload, { idempotencyKey })
    // Always clear the command record for the original dispatch identity on confirmed resolution
    clearCommandRecord(dispatchContext.companyId, dispatchContext.actorId, operation, dispatchContext.projectId)

    // Check if context changed or page unmounted while in flight (late acknowledgment guard)
    const isContextStale = !pageMounted
      || dispatchGeneration !== currentDispatchGeneration
      || companyAccess.activeCompanyId !== dispatchContext.companyId
      || currentActorId.value !== dispatchContext.actorId
      || projectId.value !== dispatchContext.projectId

    if (isContextStale) {
      // Late acknowledgment: page unmounted or context switched.
      // Original command identity was safely cleared above, but do not navigate,
      // do not populate stash in another context, and do not mutate unmounted UI.
      if (pageMounted && dispatchGeneration === currentDispatchGeneration) {
        submittingAction.value = null
      }
      return
    }

    unresolvedState.value = 'none'

    // Retain entered financials for subsequent prepare step if requested
    if (retainFinancials && projectWritable.value && hasEnteredFinancials.value) {
      stashDraftFinancials(
        dispatchContext.companyId,
        dispatchContext.projectId,
        result.id,
        dispatchContext.actorId,
        {
          amount: form.amount.trim() || null,
          quantity: form.quantity.trim() || null,
          unitCode: form.unitCode.trim() || null,
          unitPrice: form.unitPrice.trim() || null,
          retentionKind: form.retentionKind || null,
          retentionRateBps: form.retentionRateBps,
          retentionAmount: form.retentionAmount.trim() || null,
        },
      )
    }

    await router.push(`/costs/${dispatchContext.projectId}/entries/${result.id}`)
  }
  catch (err: unknown) {
    if (pageMounted && dispatchGeneration === currentDispatchGeneration) {
      submittingAction.value = null
    }

    const isContextStale = !pageMounted
      || dispatchGeneration !== currentDispatchGeneration
      || companyAccess.activeCompanyId !== dispatchContext.companyId
      || currentActorId.value !== dispatchContext.actorId
      || projectId.value !== dispatchContext.projectId

    if (isDefinitivelyRejectedError(err)) {
      clearCommandRecord(dispatchContext.companyId, dispatchContext.actorId, operation, dispatchContext.projectId)
      if (!isContextStale) {
        unresolvedState.value = 'none'
      }
    }
    else if (!isContextStale) {
      checkUnresolvedState()
    }
    if (!isContextStale) {
      formError.value = extractErrorMessage(err, 'Lỗi khi lưu bản nháp chi tiết chi phí.')
    }
  }
}

// 2. Atomic Publish Now (cost.manage + cost.prepare + cost.publish_import)
async function submitPublishNow(isReplay = false) {
  if (submittingAction.value) return // Rapid click guard

  if (!canPublishNow.value) {
    formError.value = 'Bạn không có đủ quyền (cost.manage, cost.prepare, cost.publish_import) để phát hành trực tiếp.'
    return
  }

  if (!isReplay) {
    if (!projectWritable.value) {
      formError.value = 'Dự án đã hoàn thành hoặc chưa xác minh được trạng thái, không thể tạo lệnh mới.'
      return
    }
    if (isSubcontractSelected.value) {
      formError.value = 'Mô hình chi phí thầu phụ không hỗ trợ phát hành qua luồng chi phí thông thường.'
      return
    }

    if (!form.categoryId) {
      formError.value = 'Vui lòng chọn danh mục chi phí hợp lệ.'
      return
    }

    if (!form.description.trim()) {
      formError.value = 'Vui lòng nhập mô tả chi phí.'
      return
    }

    const amtTrimmed = form.amount.trim()
    if (amtTrimmed === '' || !/^-?\d+(?:\.\d+)?$/.test(amtTrimmed)) {
      formError.value = 'Vui lòng nhập số tiền hợp lệ (chấp nhận số tiền bằng 0).'
      return
    }

    if (form.retentionKind) {
      if (!form.retentionAmount || Number.isNaN(Number(form.retentionAmount))) {
        formError.value = 'Vui lòng nhập số tiền tạm giữ bảo hành hợp lệ.'
        return
      }
      if (isDecimalGreaterThan(form.retentionAmount, amtTrimmed)) {
        formError.value = 'Số tiền tạm giữ không được lớn hơn tổng số tiền chi tiết.'
        return
      }
    }

    // Block new command dispatch while unresolved command exists
    if (unresolvedState.value !== 'none') {
      formError.value = 'Đang có lệnh chưa được giải quyết trên hệ thống. Vui lòng gửi lại yêu cầu gốc hoặc liên hệ hỗ trợ.'
      return
    }
  }

  // Pre-flight recovery storage check (fail-closed policy)
  if (!isRecoveryStorageAvailable()) {
    storageError.value = 'Không thể lưu trữ trạng thái phục hồi an toàn trên trình duyệt (session storage không khả dụng). Để ngăn ngừa rủi ro tạo trùng lặp chi phí khi mất kết nối mạng, thao tác ghi bị tạm dừng. Vui lòng bật quyền lưu trữ phiên trên trình duyệt.'
    return
  }

  submittingAction.value = 'publish'
  formError.value = null
  storageError.value = null

  const companyId = companyAccess.activeCompanyId ?? ''
  const actorId = currentActorId.value
  const operation = 'publish_now'
  const targetId = projectId.value
  const dispatchContext = {
    companyId,
    actorId,
    projectId: targetId,
  }
  const dispatchGeneration = ++currentDispatchGeneration

  let idempotencyKey: string
  let payload: CreateAndPublishProjectCostDetailInput

  if (isReplay) {
    const retained = readRetainedPayload(companyId, actorId, operation, targetId)
    if (!retained) {
      formError.value = 'Dữ liệu lệnh trước đó không còn trong bộ nhớ. Không thể tự động gửi lại.'
      submittingAction.value = null
      checkUnresolvedState()
      return
    }
    idempotencyKey = retained.idempotencyKey
    payload = retained.payloadSnapshot as unknown as CreateAndPublishProjectCostDetailInput
  }
  else {
    idempotencyKey = globalThis.crypto.randomUUID()
    payload = {
      categoryId: form.categoryId,
      description: form.description.trim(),
      amount: form.amount.trim(),
      quantity: form.quantity.trim() ? form.quantity.trim() : null,
      unitCode: form.unitCode.trim() ? form.unitCode.trim() : null,
      unitPrice: form.unitPrice.trim() ? form.unitPrice.trim() : null,
      retentionKind: form.retentionKind ? form.retentionKind : null,
      retentionRateBps: form.retentionKind && form.retentionRateBps !== null ? form.retentionRateBps : null,
      retentionAmount: form.retentionKind && form.retentionAmount.trim() ? form.retentionAmount.trim() : null,
      ...(form.relevantDate ? { relevantDate: form.relevantDate } : {}),
      ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    }

    try {
      persistUnresolvedMarker({
        companyId,
        actorId,
        operation,
        targetId,
        idempotencyKey,
        timestamp: Date.now(),
      })
      registerMemoryPayloadSnapshot(companyId, actorId, operation, targetId, idempotencyKey, payload as unknown as Record<string, unknown>)
    }
    catch {
      storageError.value = 'Không thể lưu trữ trạng thái phục hồi trên trình duyệt. Lệnh ghi đã bị dừng an toàn.'
      submittingAction.value = null
      return
    }
  }

  try {
    await repositories.projectCosts.createAndPublishDetail(dispatchContext.projectId, payload, { idempotencyKey })
    clearCommandRecord(dispatchContext.companyId, dispatchContext.actorId, operation, dispatchContext.projectId)

    const isContextStale = !pageMounted
      || dispatchGeneration !== currentDispatchGeneration
      || companyAccess.activeCompanyId !== dispatchContext.companyId
      || currentActorId.value !== dispatchContext.actorId
      || projectId.value !== dispatchContext.projectId

    if (isContextStale) {
      if (pageMounted && dispatchGeneration === currentDispatchGeneration) {
        submittingAction.value = null
      }
      return
    }

    unresolvedState.value = 'none'
    await router.push(canRead.value ? `/costs/${dispatchContext.projectId}` : `/cost-drafts?projectId=${dispatchContext.projectId}`)
  }
  catch (err: unknown) {
    if (pageMounted && dispatchGeneration === currentDispatchGeneration) {
      submittingAction.value = null
    }

    const isContextStale = !pageMounted
      || dispatchGeneration !== currentDispatchGeneration
      || companyAccess.activeCompanyId !== dispatchContext.companyId
      || currentActorId.value !== dispatchContext.actorId
      || projectId.value !== dispatchContext.projectId

    if (isDefinitivelyRejectedError(err)) {
      clearCommandRecord(dispatchContext.companyId, dispatchContext.actorId, operation, dispatchContext.projectId)
      if (!isContextStale) {
        unresolvedState.value = 'none'
      }
    }
    else if (!isContextStale) {
      checkUnresolvedState()
    }
    if (!isContextStale) {
      formError.value = extractErrorMessage(err, 'Lỗi khi phát hành chi tiết chi phí.')
    }
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6 pb-12" data-testid="new-cost-detail-page">
    <div class="page-top-nav">
      <NuxtLink
        :to="canRead ? `/costs/${projectId}` : `/cost-drafts?projectId=${projectId}`"
        class="back-link inline-flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600"
      >
        <UIcon name="i-lucide-arrow-left" aria-hidden="true" />
        <span>{{ canRead ? 'Quay lại chi phí dự án' : 'Quay lại danh sách bản nháp' }}</span>
      </NuxtLink>
    </div>

    <header class="cockpit-card p-6 rounded-lg">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span class="cockpit-badge cockpit-badge--neutral text-xs">Chi tiết chi phí mới</span>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            Ghi nhận chi tiết chi phí thông thường
          </h1>
          <p class="text-xs text-gray-500 mt-1">
            Tạo bản nháp vận hành hoặc phát hành trực tiếp vào tổng chi phí chính thức của dự án.
          </p>
        </div>
      </div>
    </header>

    <!-- Lost Payload Reconciliation Panel -->
    <div
      v-if="unresolvedState === 'unresolved_payload_lost' && activeUnresolvedMarker"
      class="cockpit-card p-6 rounded-lg border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 space-y-4"
      data-testid="lost-payload-reconciliation-panel"
    >
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-xl shrink-0 mt-0.5" />
        <div class="space-y-2 text-sm">
          <h3 class="font-bold text-gray-900 dark:text-gray-100">
            Thao tác trước đó chưa được xác nhận trên hệ thống
          </h3>
          <p class="text-xs text-gray-700 dark:text-gray-300">
            Hệ thống ghi nhận một thao tác ghi nhận chi phí đang được gửi đi trước khi trang bị tải lại. Dữ liệu chi tiết của lệnh này không còn trong bộ nhớ tạm, nên không thể tự động gửi lại một cách an toàn.
          </p>
          <div class="bg-white dark:bg-gray-900 p-3 rounded text-xs font-mono space-y-1">
            <div><strong>Khóa định danh (Idempotency Key):</strong> {{ activeUnresolvedMarker.idempotencyKey }}</div>
            <div><strong>Thao tác:</strong> {{ activeUnresolvedMarker.operation }}</div>
            <div><strong>Thời điểm gửi:</strong> {{ new Date(activeUnresolvedMarker.timestamp).toLocaleString('vi-VN') }}</div>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">
            Hướng xử lý an toàn: Để tránh ghi trùng lặp chi phí, vui lòng cung cấp mã định danh trên cho bộ phận kế toán hoặc quản trị hệ thống để kiểm tra nhật ký giao dịch trước khi tạo bản ghi mới.
          </p>
        </div>
      </div>
    </div>

    <!-- Untrusted Recovery State Alert (corrupted marker or storage unreadable) -->
    <div
      v-else-if="unresolvedState === 'unresolved_marker_corrupted' || unresolvedState === 'unresolved_storage_unreadable'"
      class="cockpit-card p-6 rounded-lg border-l-4 border-red-500 bg-red-50/50 dark:bg-red-950/20 space-y-3"
      data-testid="untrusted-recovery-state-alert"
    >
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-shield-alert" class="text-red-600 text-xl shrink-0 mt-0.5" />
        <div class="space-y-1 text-sm">
          <h3 class="font-bold text-gray-900 dark:text-gray-100">
            Trạng thái phục hồi giao dịch không thể xác minh
          </h3>
          <p class="text-xs text-gray-700 dark:text-gray-300">
            Dữ liệu trạng thái phục hồi trên trình duyệt bị lỗi hoặc không thể đọc được. Để ngăn ngừa rủi ro tạo bản ghi trùng lặp hoặc vi phạm tính toàn vẹn dữ liệu, các thao tác gửi mới bị khóa an toàn. Dữ liệu lưu trữ gốc được bảo vệ và không bị ghi đè.
          </p>
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">
            Vui lòng liên hệ quản trị viên hoặc kiểm tra quyền truy cập lưu trữ của trình duyệt.
          </p>
        </div>
      </div>
    </div>

    <!-- Retained Payload Replay Banner -->
    <div
      v-else-if="unresolvedState === 'unresolved_with_payload' && activeUnresolvedMarker"
      class="cockpit-card p-4 rounded-lg border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 flex flex-col md:flex-row md:items-center justify-between gap-3"
      data-testid="retained-payload-replay-banner"
    >
      <div class="flex items-center gap-3 text-sm">
        <UIcon name="i-lucide-wifi-off" class="text-blue-600 text-xl shrink-0" />
        <div>
          <span class="font-semibold text-gray-900 dark:text-gray-100">Mất kết nối hoặc phản hồi quá hạn.</span>
          <p class="text-xs text-gray-600 dark:text-gray-400">
            Yêu cầu trước đó chưa nhận được xác nhận từ máy chủ. Dữ liệu lệnh gốc vẫn được giữ nguyên an toàn.
          </p>
        </div>
      </div>
      <UButton
        color="primary"
        size="sm"
        icon="i-lucide-refresh-cw"
        :loading="Boolean(submittingAction)"
        data-testid="replay-retained-command-btn"
        @click="activeUnresolvedMarker.operation === 'publish_now' ? submitPublishNow(true) : submitSaveDraft(true)"
      >
        Gửi lại yêu cầu gốc
      </UButton>
    </div>

    <div v-if="loading" class="text-center py-12 text-sm text-gray-500">
      Đang tải thông tin hạng mục…
    </div>

    <div v-else-if="pageError" class="cockpit-card p-6 text-center text-sm text-red-600" data-testid="new-page-error">
      {{ pageError }}
    </div>

    <div v-else class="space-y-6">
      <UAlert
        v-if="categoryDeepLinkWarning"
        color="warning"
        variant="subtle"
        :description="categoryDeepLinkWarning"
        data-testid="category-deep-link-warning"
      />

      <UAlert
        v-if="storageError"
        color="error"
        variant="subtle"
        title="Không thể thực hiện thao tác"
        :description="storageError"
        data-testid="storage-error-alert"
      />

      <UAlert
        v-if="formError"
        color="error"
        variant="subtle"
        title="Lỗi xử lý"
        :description="formError"
        data-testid="new-entry-form-error"
      />

      <!-- Subcontract Category Safety Banner -->
      <div
        v-if="isSubcontractSelected"
        class="cockpit-card p-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20 space-y-3"
        data-testid="subcontract-redirect-banner"
      >
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-shield-alert" class="text-amber-600 text-xl shrink-0 mt-0.5" />
          <div class="space-y-1">
            <h3 class="font-bold text-gray-900 dark:text-gray-100">
              Hạng mục chi phí thầu phụ
            </h3>
            <p class="text-xs text-gray-700 dark:text-gray-300">
              Hạng mục này sử dụng mô hình chi phí thầu phụ (subcontract_payment). Chi phí thực tế được ghi nhận thông qua luồng Quản lý thanh toán thầu phụ chuyên biệt, không hỗ trợ tạo chi tiết chi phí thông thường.
            </p>
          </div>
        </div>
        <div v-if="canRead" class="pt-2">
          <NuxtLink
            :to="`/costs/${projectId}/categories/${form.categoryId}`"
            class="cockpit-btn cockpit-btn--primary btn-sm inline-flex items-center gap-2"
          >
            <span>Đến trang Hạng mục thầu phụ</span>
            <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
          </NuxtLink>
        </div>
        <div v-else class="text-xs text-gray-500 italic">
          Tài khoản của bạn không có quyền xem bảng kê thầu phụ. Vui lòng liên hệ nhân sự có thẩm quyền để ghi nhận thanh toán thầu phụ cho dự án này.
        </div>
      </div>

      <!-- Main Form (Disabled if unresolved payload lost or subcontract category selected) -->
      <fieldset
        :disabled="Boolean(submittingAction) || unresolvedState === 'unresolved_payload_lost' || isSubcontractSelected"
        class="space-y-6"
      >
        <!-- Category & Operational Card -->
        <div class="cockpit-card p-6 rounded-lg space-y-4">
          <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2">
            1. Phân loại &amp; Thông tin vận hành (cost.manage)
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1 md:col-span-2">
              <label for="new-category" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Hạng mục chi phí thông thường <span class="text-red-500">*</span>
              </label>
              <select
                id="new-category"
                v-model="form.categoryId"
                class="cockpit-select w-full"
                data-testid="new-category-select"
              >
                <option value="">Chọn danh mục chi phí...</option>
                <option
                  v-for="cat in categories"
                  :key="cat.categoryId"
                  :value="cat.categoryId"
                >
                  {{ cat.name }} ({{ cat.code }})
                </option>
              </select>
            </div>

            <div class="space-y-1 md:col-span-2">
              <label for="new-desc" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Mô tả chi tiết chi phí <span class="text-red-500">*</span>
              </label>
              <input
                id="new-desc"
                v-model="form.description"
                type="text"
                class="cockpit-input w-full"
                placeholder="Ví dụ: Lắp đặt đường ống dẫn nước tầng 2..."
                data-testid="new-desc-input"
              >
            </div>

            <div class="space-y-1">
              <label for="new-date" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Ngày phát sinh
              </label>
              <input
                id="new-date"
                v-model="form.relevantDate"
                type="date"
                class="cockpit-input w-full"
                data-testid="new-date-input"
              >
            </div>

            <div class="space-y-1">
              <label for="new-ref" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Mã tham chiếu / Số chứng từ
              </label>
              <input
                id="new-ref"
                v-model="form.reference"
                type="text"
                class="cockpit-input w-full"
                placeholder="Số hợp đồng, phiếu kho..."
                data-testid="new-ref-input"
              >
            </div>

            <div class="space-y-1 md:col-span-2">
              <label for="new-note" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Ghi chú nội bộ
              </label>
              <textarea
                id="new-note"
                v-model="form.note"
                rows="2"
                class="cockpit-input w-full"
                placeholder="Ghi chú chi tiết thêm..."
                data-testid="new-note-input"
              />
            </div>
          </div>
        </div>

        <!-- Financial Card (Rendered if cost.prepare) -->
        <div v-if="canPrepare" class="cockpit-card p-6 rounded-lg space-y-4" data-testid="new-financial-card">
          <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2">
            2. Chi tiết tài chính (cost.prepare)
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="space-y-1 md:col-span-3">
              <label for="new-amt" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Số tiền chi tiết (VND) <span v-if="canPublishNow" class="text-red-500">*</span>
              </label>
              <input
                id="new-amt"
                v-model="form.amount"
                type="text"
                class="cockpit-input w-full font-mono text-lg font-bold"
                placeholder="0"
                data-testid="new-amount-input"
                @blur="onAmountOrQuantityBlur"
              >
              <div v-if="isAmountValid" class="text-xs text-gray-500 mt-1 font-mono">
                Hiển thị: {{ formatFinanceMoney(form.amount.trim()) }}
              </div>
            </div>

            <div class="space-y-1">
              <label for="new-qty" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Khối lượng
              </label>
              <input
                id="new-qty"
                v-model="form.quantity"
                type="text"
                class="cockpit-input w-full font-mono"
                placeholder="Ví dụ: 15"
                data-testid="new-quantity-input"
                @blur="onAmountOrQuantityBlur"
              >
            </div>

            <div class="space-y-1">
              <label for="new-unit" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Đơn vị tính
              </label>
              <input
                id="new-unit"
                v-model="form.unitCode"
                type="text"
                class="cockpit-input w-full"
                placeholder="m2, cái, chuyến..."
                data-testid="new-unit-input"
              >
            </div>

            <div class="space-y-1">
              <label for="new-price" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Đơn giá (VND)
              </label>
              <input
                id="new-price"
                v-model="form.unitPrice"
                type="text"
                class="cockpit-input w-full font-mono"
                placeholder="Đơn giá..."
                data-testid="new-unit-price-input"
              >
            </div>

            <!-- Retention Section -->
            <div class="md:col-span-3 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
              <div class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Tạm giữ bảo hành (Tùy chọn)
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="space-y-1">
                  <label for="new-ret-kind" class="block text-xs text-gray-500">Loại tạm giữ</label>
                  <select
                    id="new-ret-kind"
                    v-model="form.retentionKind"
                    class="cockpit-select w-full"
                    data-testid="new-retention-kind-select"
                  >
                    <option value="">Không tạm giữ</option>
                    <option value="warranty">Bảo hành (warranty)</option>
                    <option value="other">Tạm giữ khác (other)</option>
                  </select>
                </div>
                <div v-if="form.retentionKind" class="space-y-1">
                  <label for="new-ret-rate" class="block text-xs text-gray-500">Tỷ lệ (bps, 100 = 1%)</label>
                  <input
                    id="new-ret-rate"
                    v-model.number="form.retentionRateBps"
                    type="number"
                    min="0"
                    max="10000"
                    class="cockpit-input w-full font-mono"
                    placeholder="500 (= 5%)"
                    data-testid="new-retention-rate-input"
                    @input="onRetentionRateChange"
                  >
                </div>
                <div v-if="form.retentionKind" class="space-y-1">
                  <label for="new-ret-amt" class="block text-xs text-gray-500">Số tiền giữ (VND)</label>
                  <input
                    id="new-ret-amt"
                    v-model="form.retentionAmount"
                    type="text"
                    class="cockpit-input w-full font-mono"
                    data-testid="new-retention-amount-input"
                  >
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div class="text-xs text-gray-500 mr-auto">
            Lưu ý: Nút "Lưu bản nháp" chỉ tạo bản nháp vận hành.
          </div>
          <UButton
            v-if="canManage && projectWritable"
            color="neutral"
            variant="outline"
            :loading="submittingAction === 'draft'"
            :disabled="Boolean(submittingAction) || unresolvedState !== 'none' || !form.categoryId || !form.description.trim() || isSubcontractSelected"
            data-testid="save-draft-btn"
            @click="onSaveDraftClick"
          >
            Lưu bản nháp
          </UButton>

          <UButton
            v-if="canPublishNow && projectWritable"
            color="primary"
            :loading="submittingAction === 'publish'"
            :disabled="Boolean(submittingAction) || unresolvedState !== 'none' || !form.categoryId || !form.description.trim() || !isAmountValid || isSubcontractSelected"
            data-testid="publish-now-btn"
            @click="submitPublishNow(false)"
          >
            Phát hành ngay
          </UButton>
        </div>
      </fieldset>
    </div>

    <!-- Save Draft Confirmation Modal when Financial Fields were Entered -->
    <UModal
      v-model:open="isSaveDraftFinancialConfirmOpen"
      title="Xác nhận phạm vi Lưu bản nháp"
      description="Thao tác 'Lưu bản nháp' chỉ lưu thông tin vận hành (Mô tả, ngày phát sinh, chứng từ, ghi chú) và chưa ghi nhận số tiền vào hệ thống."
    >
      <template #body>
        <div class="space-y-3 text-xs" data-testid="save-draft-confirm-modal">
          <p>
            Bạn đã nhập thông tin tài chính với số tiền:
            <strong class="font-mono text-sm text-primary-600">{{ formatFinanceMoney(form.amount.trim() || '0') }}</strong>.
          </p>
          <p class="text-gray-500">
            Dữ liệu tài chính này sẽ được chuyển sang bước chuẩn bị (cost.prepare) sau khi tạo bản nháp thành công để bạn xem xét và lưu chính thức.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            @click="() => { isSaveDraftFinancialConfirmOpen = false }"
          >
            Hủy bỏ
          </UButton>
          <UButton
            color="neutral"
            variant="subtle"
            size="sm"
            data-testid="confirm-save-draft-discard-fin-btn"
            @click="confirmSaveDraftWithFinancials(false)"
          >
            Chỉ lưu vận hành (bỏ tài chính)
          </UButton>
          <UButton
            color="primary"
            size="sm"
            data-testid="confirm-save-draft-retain-fin-btn"
            @click="confirmSaveDraftWithFinancials(true)"
          >
            Lưu nháp &amp; Giữ thông tin tài chính
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
