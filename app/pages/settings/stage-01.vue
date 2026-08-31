<script setup lang="ts">
import { ClientError } from '../../errors/client-error'
import {
  stage01BusinessTaxonomiesSchema,
  stage01CriteriaSchema,
} from '../../../shared/schemas/stage01-config'

definePageMeta({ requiredPermission: 'stage01.config.read' })

const repositories = useRepositories()
const companyAccessStore = useNuxtApp().$companyAccessStore
const admin = useStage01ConfigAdmin(repositories.stage01Config)
const unsavedChanges = useUnsavedChangesGuard()
const {
  view,
  editable,
  dirty,
  operation,
  error: lifecycleError,
  load,
  createDraft,
  saveDraft,
  discardDraft,
  publishDraft,
  resetLocal,
  reloadCanonical,
} = admin

const actionError = ref<unknown | null>(null)
const successMessage = ref('')
const confirmation = ref<'discard' | 'publish' | null>(null)
const taxonomyEditorDirty = ref(false)
const criteriaEditorDirty = ref(false)
const { pending: initialLoadPending, error: initialLoadError, refresh } = await useAsyncData(
  'stage-01-config-admin',
  () => load(),
)

const canUpdate = computed(() => companyAccessStore.hasPermission('stage01.config.update'))
const canPublish = computed(() => companyAccessStore.hasPermission('stage01.config.publish'))
const pending = computed(() => operation.value !== null)
const loading = computed(() => initialLoadPending.value || operation.value === 'load')
const currentError = computed(() => actionError.value ?? lifecycleError.value ?? initialLoadError.value)
const hasDraft = computed(() => Boolean(view.value?.draft && editable.value))
const hasLocalEditorChanges = computed(() => taxonomyEditorDirty.value || criteriaEditorDirty.value)
const pageDirty = computed(() => dirty.value || taxonomyEditorDirty.value || criteriaEditorDirty.value)
const isConfigUnavailable = computed(() => !view.value && errorCode(currentError.value) === 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE')

watch(pageDirty, value => unsavedChanges.setDirty(value), { immediate: true })

onBeforeRouteLeave(() => unsavedChanges.confirmLeave())

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!pageDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

if (import.meta.client) {
  watch(pageDirty, (value) => {
    if (value) window.addEventListener('beforeunload', onBeforeUnload)
    else window.removeEventListener('beforeunload', onBeforeUnload)
  }, { immediate: true })
}

onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('beforeunload', onBeforeUnload)
  unsavedChanges.clear()
})

function errorCode(error: unknown): string | null {
  return error instanceof ClientError ? error.code : null
}

function errorTitle(error: unknown): string {
  if (errorCode(error) === 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE') return 'Cấu hình Stage 01 chưa sẵn sàng'
  if (errorCode(error) === 'VERSION_CONFLICT') return 'Cấu hình đã thay đổi'
  if (errorCode(error) === 'PERMISSION_DENIED' || errorCode(error) === 'COMPANY_FORBIDDEN') return 'Bạn không còn quyền thực hiện thao tác này'
  return 'Không thể cập nhật cấu hình Stage 01'
}

function errorDescription(error: unknown): string {
  if (errorCode(error) === 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE') {
    return 'Cấu hình định nghĩa Stage 01 chưa sẵn sàng. Vui lòng liên hệ quản trị viên hệ thống.'
  }
  if (errorCode(error) === 'VERSION_CONFLICT') {
    return 'Cấu hình đã thay đổi ở nơi khác. Hãy tải lại phiên bản mới nhất trước khi tiếp tục.'
  }
  if (errorCode(error) === 'PERMISSION_DENIED' || errorCode(error) === 'COMPANY_FORBIDDEN') {
    return 'Quyền truy cập của bạn đã thay đổi. Vui lòng làm mới quyền hoặc liên hệ quản trị viên.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'Vui lòng thử lại. Các thay đổi cục bộ chưa được lưu vẫn được giữ nguyên.'
}

function clearFeedback(): void {
  actionError.value = null
  successMessage.value = ''
}

function clearLocalEditorChanges(): void {
  taxonomyEditorDirty.value = false
  criteriaEditorDirty.value = false
}

async function runAction(action: () => Promise<void>, success?: string): Promise<void> {
  clearFeedback()
  try {
    await action()
    if (success) successMessage.value = success
  }
  catch (caught) {
    actionError.value = caught
  }
}

async function retryLoad(): Promise<void> {
  clearFeedback()
  await refresh()
}

async function handleCreateDraft(): Promise<void> {
  if (!canUpdate.value || pending.value) return
  await runAction(createDraft, 'Đã tạo bản nháp từ cấu hình đang xuất bản.')
}

function editableStateIsValid(): boolean {
  if (!editable.value) return false
  if (hasLocalEditorChanges.value) {
    actionError.value = new ClientError({
      kind: 'validation',
      code: 'VALIDATION_FAILED',
      message: 'Dữ liệu bản nháp chưa hợp lệ. Vui lòng kiểm tra các trường vừa chỉnh sửa.',
      retryable: false,
    })
    return false
  }
  const taxonomies = stage01BusinessTaxonomiesSchema.safeParse(editable.value.taxonomies)
  const criteria = stage01CriteriaSchema.safeParse(editable.value.criteria)
  if (taxonomies.success && criteria.success) return true

  actionError.value = new ClientError({
    kind: 'validation',
    code: 'VALIDATION_FAILED',
    message: 'Dữ liệu bản nháp chưa hợp lệ. Vui lòng kiểm tra các trường vừa chỉnh sửa.',
    retryable: false,
  })
  return false
}

async function handleSaveDraft(): Promise<void> {
  if (!canUpdate.value || pending.value) return
  clearFeedback()
  if (!editableStateIsValid()) return
  await runAction(saveDraft, 'Đã lưu bản nháp.')
}

function handleResetLocal(): void {
  if (!canUpdate.value || pending.value) return
  clearFeedback()
  resetLocal()
  clearLocalEditorChanges()
}

function requestDiscard(): void {
  if (canUpdate.value && !pending.value) confirmation.value = 'discard'
}

function requestPublish(): void {
  if (canPublish.value && !pending.value && !pageDirty.value) confirmation.value = 'publish'
}

async function confirmAction(): Promise<void> {
  if (confirmation.value === 'discard') {
    await runAction(discardDraft, 'Đã hủy bản nháp.')
    if (!actionError.value) clearLocalEditorChanges()
    confirmation.value = null
    return
  }

  if (confirmation.value === 'publish') {
    clearFeedback()
    try {
      const result = await publishDraft()
      if (result) successMessage.value = `Đã xuất bản mẫu cấu hình v${result.templateVersion}.`
      clearLocalEditorChanges()
      confirmation.value = null
    }
    catch (caught) {
      actionError.value = caught
      confirmation.value = null
    }
  }
}

async function reloadConfiguration(): Promise<void> {
  if (pending.value || !unsavedChanges.confirmLeave()) return
  await runAction(reloadCanonical, 'Đã tải lại cấu hình mới nhất.')
  if (!actionError.value) clearLocalEditorChanges()
}
</script>

<template>
  <section class="stage01-config-page" :aria-busy="loading || pending">
    <div v-if="loading" class="stage01-config-page__loading" aria-label="Đang tải cấu hình Stage 01">
      <USkeleton class="h-32 w-full" />
      <USkeleton class="h-64 w-full" />
      <USkeleton class="h-80 w-full" />
    </div>

    <UAlert
      v-else-if="isConfigUnavailable"
      role="alert"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="errorTitle(currentError)"
      :description="errorDescription(currentError)"
    >
      <template #actions>
        <UButton color="warning" variant="outline" :loading="pending" @click="retryLoad">Thử lại</UButton>
      </template>
    </UAlert>

    <UAlert
      v-else-if="!view"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorTitle(currentError)"
      :description="errorDescription(currentError)"
    >
      <template #actions>
        <UButton color="error" variant="outline" :loading="pending" @click="retryLoad">Thử lại</UButton>
      </template>
    </UAlert>

    <template v-else>
      <Stage01ConfigStatus
        description="Thay đổi chỉ áp dụng cho workflow Stage 01 tạo mới sau khi xuất bản; các workflow hiện có vẫn giữ phiên bản đã gắn."
        :published="view.published"
        :draft="view.draft"
      />

      <div v-if="currentError" class="stage01-config-page__feedback">
        <UAlert
          role="alert"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="errorTitle(currentError)"
          :description="errorDescription(currentError)"
        >
          <template v-if="errorCode(currentError) === 'VERSION_CONFLICT'" #actions>
            <UButton color="error" variant="outline" :loading="pending" @click="reloadConfiguration">Tải lại cấu hình</UButton>
          </template>
        </UAlert>
      </div>
      <p v-if="successMessage" class="stage01-config-page__success" role="status">{{ successMessage }}</p>

      <div v-if="!hasDraft" class="stage01-config-page__empty-draft">
        <div>
          <h2>Chưa có bản nháp</h2>
          <p>Cấu hình đang xuất bản chỉ có thể xem. Tạo bản nháp để thay đổi dữ liệu nghiệp vụ.</p>
        </div>
        <UButton v-if="canUpdate" :disabled="pending" :loading="operation === 'create'" icon="i-lucide-file-plus-2" @click="handleCreateDraft">
          Bắt đầu chỉnh sửa
        </UButton>
      </div>

      <template v-if="view.draft && editable">
        <Stage01ConfigStage01TaxonomyEditor
          :model-value="editable.taxonomies"
          :published="view.published.taxonomies"
          :readonly="!canUpdate"
          @update:model-value="editable.taxonomies = $event"
          @update:local-dirty="taxonomyEditorDirty = $event"
        />
        <Stage01ConfigStage01CriteriaEditor
          :model-value="editable.criteria"
          :published="view.published.criteria"
          :readonly="!canUpdate"
          @update:model-value="editable.criteria = $event"
          @update:local-dirty="criteriaEditorDirty = $event"
        />
      </template>

      <template v-else>
        <Stage01ConfigStage01TaxonomyEditor
          :model-value="view.published.taxonomies"
          :published="view.published.taxonomies"
          :readonly="true"
        />
        <Stage01ConfigStage01CriteriaEditor
          :model-value="view.published.criteria"
          :published="view.published.criteria"
          :readonly="true"
        />
      </template>

      <Stage01ConfigStage01SystemConfigViewer :system="view.published.system" />

      <Stage01ConfigActionBar
        :has-draft="hasDraft"
        :dirty="pageDirty"
        :pending="pending"
        :can-update="canUpdate"
        :can-publish="canPublish"
        @save="handleSaveDraft"
        @reset="handleResetLocal"
        @discard="requestDiscard"
        @publish="requestPublish"
      />
    </template>

    <Stage01ConfigConfirmDialog
      :open="confirmation !== null"
      :title="confirmation === 'discard' ? 'Hủy bản nháp?' : 'Xuất bản cấu hình?'"
      :body="confirmation === 'discard'
        ? 'Bản nháp đã lưu sẽ bị xóa. Cấu hình đang xuất bản không thay đổi.'
        : 'Hệ thống sẽ tạo phiên bản cấu hình bất biến tiếp theo cho các workflow Stage 01 tạo mới.'"
      cancel-text="Quay lại"
      :confirm-text="confirmation === 'discard' ? 'Hủy bản nháp' : 'Xuất bản'"
      :pending="pending"
      @update:open="value => { if (!value && !pending) confirmation = null }"
      @confirm="confirmAction"
    />
  </section>
</template>

<style scoped>
.stage01-config-page { display: grid; gap: 20px; max-width: 1260px; margin: 0 auto; }.stage01-config-page__loading { display: grid; gap: 14px; }.stage01-config-page__feedback { position: sticky; top: calc(var(--shell-header-height) + 12px); z-index: 5; }.stage01-config-page__success { margin: 0; padding: 11px 13px; border: 1px solid color-mix(in srgb, var(--forest) 30%, var(--line)); background: color-mix(in srgb, var(--mint) 40%, white); color: var(--forest-deep); font-size: .82rem; font-weight: 750; }.stage01-config-page__empty-draft { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 18px; border: 1px solid var(--line); background: var(--paper-raised); }.stage01-config-page__empty-draft h2 { margin: 0; color: var(--forest-deep); font-size: 1.1rem; }.stage01-config-page__empty-draft p { max-width: 650px; margin: 6px 0 0; color: var(--ink-muted); font-size: .85rem; line-height: 1.5; }.stage01-config-page__empty-draft :deep(button) { min-height: 44px; flex: none; }
@media (max-width: 700px) { .stage01-config-page { gap: 15px; }.stage01-config-page__empty-draft { align-items: start; flex-direction: column; }.stage01-config-page__feedback { position: static; } }
</style>
