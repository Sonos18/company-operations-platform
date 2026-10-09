<template>
  <div v-if="standalone" class="cockpit-card master-panel-card">
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Danh mục vật tư chuẩn</h3>
        <p class="panel-desc">Tên, quy cách và đơn vị tính chuẩn của công ty dùng trong lập phiếu yêu cầu vật tư.</p>
      </div>
      <div v-if="canManage" class="header-actions">
        <button
          type="button"
          class="cockpit-btn cockpit-btn--primary"
          @click="openCreateForm"
        >
          <UIcon name="i-lucide-plus" aria-hidden="true" />
          Thêm vật tư chuẩn
        </button>
      </div>
    </div>

    <!-- Alert / Messages -->
    <div v-if="actionSuccessMessage" class="cockpit-alert cockpit-alert--success" role="status">
      {{ actionSuccessMessage }}
    </div>
    <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
      {{ errorMessage }}
    </div>

    <!-- Create/Edit Inline Form -->
    <div v-if="showForm" class="material-editor-box">
      <h4 class="editor-title">{{ editingId ? 'Chỉnh sửa vật tư chuẩn' : 'Thêm vật tư chuẩn mới' }}</h4>
      <form class="editor-form" @submit.prevent="submitForm">
        <div class="form-grid">
          <div class="form-group">
            <label for="material-code">Mã vật tư <span class="required">*</span></label>
            <input
              id="material-code"
              v-model="formData.code"
              type="text"
              class="cockpit-input"
              placeholder="VD: VT-THEP-01"
              :disabled="isSubmitting"
              required
              maxlength="200"
            >
          </div>
          <div class="form-group">
            <label for="material-name">Tên vật tư chuẩn <span class="required">*</span></label>
            <input
              id="material-name"
              v-model="formData.name"
              type="text"
              class="cockpit-input"
              placeholder="VD: Thép cuộn phi 8"
              :disabled="isSubmitting"
              required
              maxlength="200"
            >
          </div>
          <div class="form-group">
            <label for="material-unit">Đơn vị tính chuẩn <span class="required">*</span></label>
            <input
              id="material-unit"
              v-model="formData.unit"
              type="text"
              class="cockpit-input"
              placeholder="VD: kg, tấn, bao, m3"
              :disabled="isSubmitting"
              required
              maxlength="200"
            >
          </div>
          <div v-if="editingId" class="form-group form-group--checkbox">
            <label class="checkbox-label">
              <input
                v-model="formData.isActive"
                type="checkbox"
                class="cockpit-checkbox"
                :disabled="isSubmitting"
              >
              Đang sử dụng (Khả dụng trên phiếu yêu cầu)
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="material-spec">Quy cách kỹ thuật chuẩn <span class="required">*</span></label>
          <textarea
            id="material-spec"
            v-model="formData.specification"
            class="cockpit-textarea"
            rows="2"
            placeholder="VD: Mác thép CB240-T, TCVN 1651-1:2018"
            :disabled="isSubmitting"
            required
            maxlength="2000"
          />
        </div>

        <div class="editor-actions">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary"
            :disabled="isSubmitting"
            @click="cancelForm"
          >
            Hủy
          </button>
          <button
            type="submit"
            class="cockpit-btn cockpit-btn--primary"
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? 'Đang lưu...' : (editingId ? 'Cập nhật' : 'Lưu vật tư') }}
          </button>
        </div>
      </form>
    </div>

    <!-- Filter Bar -->
    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="search"
        class="cockpit-input search-input"
        placeholder="Tìm kiếm theo mã, tên hoặc quy cách vật tư..."
        aria-label="Tìm kiếm vật tư chuẩn"
      >
      <span class="count-badge">{{ filteredMaterials.length }} vật tư</span>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <p>Đang tải danh mục vật tư...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredMaterials.length === 0" class="empty-state">
      <p>{{ searchQuery ? 'Không tìm thấy vật tư nào khớp với từ khóa tìm kiếm.' : 'Chưa có vật tư nào trong danh mục công ty.' }}</p>
    </div>

    <!-- Materials Table -->
    <div v-else class="table-wrap">
      <table class="cockpit-table">
        <thead>
          <tr>
            <th scope="col">Mã vật tư</th>
            <th scope="col">Tên chuẩn</th>
            <th scope="col">Quy cách</th>
            <th scope="col">Đơn vị</th>
            <th scope="col">Trạng thái</th>
            <th v-if="canManage" scope="col" style="text-align: right;">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredMaterials" :key="item.id">
            <td class="font-mono">{{ item.code }}</td>
            <td class="font-medium">{{ item.name }}</td>
            <td class="text-muted">{{ item.specification }}</td>
            <td><span class="cockpit-badge cockpit-badge--neutral">{{ item.unit }}</span></td>
            <td>
              <span
                class="cockpit-badge"
                :class="item.isActive ? 'cockpit-badge--success' : 'cockpit-badge--muted'"
              >
                {{ item.isActive ? 'Đang dùng' : 'Tạm ngưng' }}
              </span>
            </td>
            <td v-if="canManage" style="text-align: right;">
              <button
                type="button"
                class="link-action"
                @click="openEditForm(item)"
              >
                Sửa
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Modal Presentation -->
  <UModal
    v-else
    v-model:open="isOpen"
    title="Danh mục vật tư chuẩn công ty"
    description="Tra cứu và quản lý tên, quy cách, đơn vị tính chuẩn nội bộ."
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <div class="modal-content-wrap">
        <div class="panel-header">
          <div>
            <p class="panel-desc">Danh mục vật tư chuẩn là quy cách và đơn vị nội bộ công ty, độc lập với danh mục riêng của bất kỳ nhà cung cấp nào.</p>
          </div>
          <div v-if="canManage" class="header-actions">
            <button
              v-if="!showForm"
              type="button"
              class="cockpit-btn cockpit-btn--primary"
              @click="openCreateForm"
            >
              <UIcon name="i-lucide-plus" aria-hidden="true" />
              Thêm vật tư chuẩn
            </button>
          </div>
        </div>

        <div v-if="actionSuccessMessage" class="cockpit-alert cockpit-alert--success" role="status">
          {{ actionSuccessMessage }}
        </div>
        <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
          {{ errorMessage }}
        </div>

        <!-- Inline Editor -->
        <div v-if="showForm" class="material-editor-box">
          <h4 class="editor-title">{{ editingId ? 'Chỉnh sửa vật tư chuẩn' : 'Thêm vật tư chuẩn mới' }}</h4>
          <form class="editor-form" @submit.prevent="submitForm">
            <div class="form-grid">
              <div class="form-group">
                <label for="modal-mat-code">Mã vật tư <span class="required">*</span></label>
                <input
                  id="modal-mat-code"
                  v-model="formData.code"
                  type="text"
                  class="cockpit-input"
                  placeholder="VD: VT-THEP-01"
                  required
                  maxlength="200"
                >
              </div>
              <div class="form-group">
                <label for="modal-mat-name">Tên vật tư chuẩn <span class="required">*</span></label>
                <input
                  id="modal-mat-name"
                  v-model="formData.name"
                  type="text"
                  class="cockpit-input"
                  placeholder="VD: Thép cuộn phi 8"
                  required
                  maxlength="200"
                >
              </div>
              <div class="form-group">
                <label for="modal-mat-unit">Đơn vị tính chuẩn <span class="required">*</span></label>
                <input
                  id="modal-mat-unit"
                  v-model="formData.unit"
                  type="text"
                  class="cockpit-input"
                  placeholder="VD: kg, tấn, bao, m3"
                  required
                  maxlength="200"
                >
              </div>
              <div v-if="editingId" class="form-group form-group--checkbox">
                <label class="checkbox-label">
                  <input
                    v-model="formData.isActive"
                    type="checkbox"
                    class="cockpit-checkbox"
                  >
                  Đang sử dụng
                </label>
              </div>
            </div>

            <div class="form-group">
              <label for="modal-mat-spec">Quy cách kỹ thuật chuẩn <span class="required">*</span></label>
              <textarea
                id="modal-mat-spec"
                v-model="formData.specification"
                class="cockpit-textarea"
                rows="2"
                placeholder="VD: Mác thép CB240-T, TCVN 1651-1:2018"
                required
                maxlength="2000"
              />
            </div>

            <div class="editor-actions">
              <button
                type="button"
                class="cockpit-btn cockpit-btn--secondary"
                :disabled="isSubmitting"
                @click="cancelForm"
              >
                Hủy
              </button>
              <button
                type="submit"
                class="cockpit-btn cockpit-btn--primary"
                :disabled="isSubmitting"
              >
                {{ isSubmitting ? 'Đang lưu...' : (editingId ? 'Cập nhật' : 'Lưu vật tư') }}
              </button>
            </div>
          </form>
        </div>

        <!-- Filter Bar -->
        <div class="search-bar">
          <input
            v-model="searchQuery"
            type="search"
            class="cockpit-input search-input"
            placeholder="Tìm kiếm theo mã, tên hoặc quy cách vật tư..."
            aria-label="Tìm kiếm vật tư chuẩn"
          >
          <span class="count-badge">{{ filteredMaterials.length }} vật tư</span>
        </div>

        <div v-if="isLoading" class="loading-state">
          <p>Đang tải danh mục vật tư...</p>
        </div>

        <div v-else-if="filteredMaterials.length === 0" class="empty-state">
          <p>{{ searchQuery ? 'Không tìm thấy vật tư nào khớp với từ khóa.' : 'Chưa có vật tư nào trong danh mục công ty.' }}</p>
        </div>

        <div v-else class="table-wrap">
          <table class="cockpit-table">
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Tên chuẩn</th>
                <th scope="col">Quy cách</th>
                <th scope="col">Đơn vị</th>
                <th scope="col">Trạng thái</th>
                <th v-if="canManage" scope="col" style="text-align: right;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredMaterials" :key="item.id">
                <td class="font-mono">{{ item.code }}</td>
                <td class="font-medium">{{ item.name }}</td>
                <td class="text-muted">{{ item.specification }}</td>
                <td><span class="cockpit-badge cockpit-badge--neutral">{{ item.unit }}</span></td>
                <td>
                  <span
                    class="cockpit-badge"
                    :class="item.isActive ? 'cockpit-badge--success' : 'cockpit-badge--muted'"
                  >
                    {{ item.isActive ? 'Đang dùng' : 'Tạm ngưng' }}
                  </span>
                </td>
                <td v-if="canManage" style="text-align: right;">
                  <button
                    type="button"
                    class="link-action"
                    @click="openEditForm(item)"
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { MaterialView } from '../../../shared/schemas/costs/material-procurement'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'

const props = withDefaults(defineProps<{
  open?: boolean
  standalone?: boolean
  canManage?: boolean
}>(), {
  open: false,
  standalone: false,
  canManage: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [material: MaterialView]
}>()

const repositories = useRepositories()
const repo = repositories.materialProcurement
const companyAccess = useNuxtApp().$companyAccessStore

const isOpen = computed({
  get: () => props.open,
  set: (val: boolean) => emit('update:open', val),
})

const canManage = computed(() => {
  if (props.canManage !== undefined && props.canManage) return true
  return Boolean(companyAccess?.hasPermission('material.manage'))
})

const materials = ref<MaterialView[]>([])
const isLoading = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const actionSuccessMessage = ref('')
const searchQuery = ref('')

const showForm = ref(false)
const editingId = ref<string | null>(null)
const editingVersion = ref<number>(0)
const formData = ref<{
  code: string
  name: string
  specification: string
  unit: string
  isActive: boolean
}>({
  code: '',
  name: '',
  specification: '',
  unit: '',
  isActive: true,
})

const tracker = createAsyncRequestTracker<{ companyId: string }>()

const filteredMaterials = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return materials.value
  return materials.value.filter(item =>
    item.code.toLowerCase().includes(query) ||
    item.name.toLowerCase().includes(query) ||
    item.specification.toLowerCase().includes(query) ||
    item.unit.toLowerCase().includes(query)
  )
})

function openCreateForm() {
  editingId.value = null
  editingVersion.value = 0
  formData.value = {
    code: '',
    name: '',
    specification: '',
    unit: '',
    isActive: true,
  }
  errorMessage.value = ''
  actionSuccessMessage.value = ''
  showForm.value = true
}

function openEditForm(item: MaterialView) {
  editingId.value = item.id
  editingVersion.value = item.version
  formData.value = {
    code: item.code,
    name: item.name,
    specification: item.specification,
    unit: item.unit,
    isActive: item.isActive,
  }
  errorMessage.value = ''
  actionSuccessMessage.value = ''
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  editingId.value = null
  errorMessage.value = ''
}

async function loadMaterials() {
  const activeCompanyId = companyAccess?.activeCompanyId
  if (!activeCompanyId) {
    materials.value = []
    isLoading.value = false
    return
  }

  const token = tracker.start({ companyId: activeCompanyId })
  isLoading.value = true
  errorMessage.value = ''

  try {
    const list = await repo.listMaterials()
    if (!token.isCurrent()) return
    materials.value = list
  } catch (err: unknown) {
    if (!token.isCurrent()) return
    errorMessage.value = err instanceof Error ? err.message : 'Không thể nạp danh mục vật tư.'
  } finally {
    if (token.isCurrent()) {
      isLoading.value = false
    }
  }
}

const masterIdempotencyKey = ref<string>(crypto.randomUUID())
const lastMasterCommandSignature = ref<string>('')

function getMasterCommandSignature() {
  return JSON.stringify({
    companyId: companyAccess?.activeCompanyId ?? '',
    editingId: editingId.value,
    expectedVersion: editingId.value ? editingVersion.value : null,
    code: formData.value.code.trim(),
    name: formData.value.name.trim(),
    specification: formData.value.specification.trim(),
    unit: formData.value.unit.trim(),
    isActive: editingId.value ? formData.value.isActive : true,
  })
}

async function submitForm() {
  errorMessage.value = ''
  actionSuccessMessage.value = ''
  isSubmitting.value = true

  const currentSignature = getMasterCommandSignature()
  if (currentSignature !== lastMasterCommandSignature.value) {
    masterIdempotencyKey.value = crypto.randomUUID()
    lastMasterCommandSignature.value = currentSignature
  }
  const idempotencyKey = masterIdempotencyKey.value

  try {
    if (editingId.value) {
      await repo.updateMaterial(
        editingId.value,
        {
          expectedVersion: editingVersion.value,
          code: formData.value.code.trim(),
          name: formData.value.name.trim(),
          specification: formData.value.specification.trim(),
          unit: formData.value.unit.trim(),
          isActive: formData.value.isActive,
        },
        { idempotencyKey },
      )
      actionSuccessMessage.value = 'Cập nhật vật tư chuẩn thành công.'
    } else {
      await repo.createMaterial(
        {
          code: formData.value.code.trim(),
          name: formData.value.name.trim(),
          specification: formData.value.specification.trim(),
          unit: formData.value.unit.trim(),
        },
        { idempotencyKey },
      )
      actionSuccessMessage.value = 'Thêm vật tư chuẩn mới thành công.'
    }
    lastMasterCommandSignature.value = ''
    showForm.value = false
    editingId.value = null
    await loadMaterials()
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Không thể lưu vật tư.'
  } finally {
    isSubmitting.value = false
  }
}

watch(() => companyAccess?.activeCompanyId, () => {
  tracker.invalidate()
  materials.value = []
  showForm.value = false
  editingId.value = null
  lastMasterCommandSignature.value = ''
  masterIdempotencyKey.value = crypto.randomUUID()
  void loadMaterials()
})

onMounted(() => {
  void loadMaterials()
})

onUnmounted(() => {
  tracker.invalidate()
})
</script>

<style scoped>
.master-panel-card {
  padding: 20px;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.panel-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
}
.panel-desc {
  font-size: 0.85rem;
  color: var(--ink-muted);
  margin-top: 4px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cockpit-alert {
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 14px;
}
.cockpit-alert--success {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.cockpit-alert--danger {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.material-editor-box {
  background: var(--paper-raised, #f8fafc);
  border: 1px solid var(--line, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.editor-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0 0 12px 0;
  color: var(--forest, #0f172a);
}
.editor-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--forest-deep, #1e293b);
}
.required {
  color: #ef4444;
}
.cockpit-input,
.cockpit-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--line, #cbd5e1);
  border-radius: 6px;
  font-size: 0.85rem;
  background: #ffffff;
  color: var(--ink, #0f172a);
}
.form-group--checkbox {
  justify-content: flex-end;
  padding-bottom: 6px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
}
.cockpit-checkbox {
  width: 16px;
  height: 16px;
}
.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
.search-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.search-input {
  max-width: 400px;
}
.count-badge {
  font-size: 0.8rem;
  color: var(--ink-muted, #64748b);
  white-space: nowrap;
}
.loading-state,
.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--ink-muted, #64748b);
  font-size: 0.9rem;
}
.table-wrap {
  overflow-x: auto;
}
.cockpit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.cockpit-table th {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 2px solid var(--line, #e2e8f0);
  color: var(--forest, #334155);
  font-weight: 600;
}
.cockpit-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line, #f1f5f9);
  vertical-align: middle;
}
.cockpit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s ease;
}
.cockpit-btn--primary {
  background: #0284c7;
  color: #ffffff;
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
.cockpit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.cockpit-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.cockpit-badge--neutral {
  background: #f1f5f9;
  color: #475569;
}
.cockpit-badge--success {
  background: #dcfce7;
  color: #166534;
}
.cockpit-badge--muted {
  background: #f3f4f6;
  color: #9ca3af;
}
.link-action {
  background: none;
  border: none;
  color: #0284c7;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.82rem;
  padding: 4px 6px;
}
.link-action:hover {
  text-decoration: underline;
}
.font-mono {
  font-family: monospace;
}
.font-medium {
  font-weight: 500;
}
.text-muted {
  color: var(--ink-muted, #64748b);
}
.modal-content-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@media (max-width: 640px) {
  .panel-header {
    flex-direction: column;
    align-items: stretch;
  }
  .search-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .search-input {
    max-width: 100%;
  }
}
</style>
