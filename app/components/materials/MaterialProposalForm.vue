<template>
  <div class="proposal-form-container">
    <!-- Conflict (409) Notice -->
    <div v-if="conflictNotice" class="cockpit-alert cockpit-alert--warning conflict-box" role="alert">
      <div class="conflict-header">
        <UIcon name="i-lucide-alert-triangle" class="conflict-icon" aria-hidden="true" />
        <strong>Xung đột phiên bản (409)</strong>
      </div>
      <p class="conflict-desc">
        Phiếu yêu cầu đã được thay đổi hoặc cập nhật bởi một phiên làm việc khác trên máy chủ.
        Dữ liệu bạn vừa chỉnh sửa đã được giữ nguyên trong biểu mẫu bên dưới để bạn đối chiếu, không bị ghi đè tự động.
      </p>
      <div v-if="canonicalProposal" class="canonical-summary">
        <p><strong>Thông tin phiên bản mới nhất từ máy chủ (v{{ canonicalProposal.version }}):</strong></p>
        <ul>
          <li>Trạng thái: {{ reviewStateLabel(canonicalProposal.reviewState) }}</li>
          <li>Ngày cần: {{ canonicalProposal.neededOn }}</li>
          <li>Nơi giao: {{ canonicalProposal.deliveryAddress }}</li>
          <li>Số dòng vật tư: {{ canonicalProposal.lines.length }}</li>
        </ul>
      </div>
    </div>

    <!-- Returned Reason Banner -->
    <div v-if="isReturnedState" class="cockpit-alert cockpit-alert--danger returned-box" role="alert">
      <div class="returned-header">
        <UIcon name="i-lucide-corner-down-left" class="returned-icon" aria-hidden="true" />
        <strong>Phiếu yêu cầu bị trả lại cần chỉnh sửa</strong>
      </div>
      <p class="returned-reason">
        <strong>Lý do trả phiếu:</strong> {{ proposal?.returnReason || 'Không có lý do được cung cấp từ máy chủ' }}
      </p>
      <p class="returned-hint">
        Kỹ sư vui lòng điều chỉnh lại thông tin ngày cần, nơi giao hoặc các dòng vật tư và gửi lại yêu cầu mua hàng.
      </p>
    </div>

    <!-- General Error Banner -->
    <div v-if="errorMessage && !conflictNotice" class="cockpit-alert cockpit-alert--danger" role="alert">
      {{ errorMessage }}
    </div>

    <!-- Success Feedback -->
    <div v-if="successMessage" class="cockpit-alert cockpit-alert--success" role="status">
      {{ successMessage }}
    </div>

    <form class="proposal-form" @submit.prevent="handleSaveDraft">
      <!-- General Info Card -->
      <div class="cockpit-card form-section">
        <h3 class="section-title">Thông tin phiếu yêu cầu</h3>

        <div class="form-grid">
          <!-- Project Selector -->
          <div class="form-group">
            <label for="proposal-project">Công trình / Dự án <span class="required">*</span></label>
            <select
              id="proposal-project"
              v-model="formProjectId"
              class="cockpit-select"
              :disabled="readOnly || Boolean(existingProposalId) || isSaving || isSubmitting"
              :aria-invalid="Boolean(validationErrors.projectId)"
              :aria-describedby="validationErrors.projectId ? 'proposal-project-error' : undefined"
              required
              @change="onProjectChange"
            >
              <option value="" disabled>-- Chọn công trình --</option>
              <option
                v-for="p in projectOptions"
                :key="p.projectId"
                :value="p.projectId"
              >
                {{ p.code }} - {{ p.name }}
              </option>
            </select>
            <small v-if="selectedProject?.locationText" class="field-hint">
              Địa chỉ dự án: {{ selectedProject.locationText }}
            </small>
            <span v-if="validationErrors.projectId" id="proposal-project-error" class="field-error">{{ validationErrors.projectId }}</span>
          </div>

          <!-- Needed On Date -->
          <div class="form-group">
            <label for="proposal-needed-on">Ngày cần vật tư <span class="required">*</span></label>
            <input
              id="proposal-needed-on"
              v-model="formNeededOn"
              type="date"
              class="cockpit-input"
              :disabled="readOnly || isSaving || isSubmitting"
              :aria-invalid="Boolean(validationErrors.neededOn)"
              :aria-describedby="validationErrors.neededOn ? 'proposal-needed-on-error' : undefined"
              required
              @input="markDirty"
            >
            <span v-if="validationErrors.neededOn" id="proposal-needed-on-error" class="field-error">{{ validationErrors.neededOn }}</span>
          </div>
        </div>

        <!-- Delivery Address -->
        <div class="form-group">
          <label for="proposal-delivery-address">Nơi giao hàng <span class="required">*</span></label>
          <input
            id="proposal-delivery-address"
            v-model="formDeliveryAddress"
            type="text"
            class="cockpit-input"
            :disabled="readOnly || isSaving || isSubmitting"
            :aria-invalid="Boolean(validationErrors.deliveryAddress)"
            :aria-describedby="validationErrors.deliveryAddress ? 'proposal-delivery-address-error' : undefined"
            placeholder="Nhập địa chỉ giao hàng tại công trường..."
            required
            maxlength="2000"
            @input="markDirty"
          >
          <small class="field-hint">
            Địa chỉ này chỉ áp dụng riêng cho phiếu yêu cầu hiện tại, không thay đổi địa chỉ mặc định của dự án.
          </small>
          <span v-if="validationErrors.deliveryAddress" id="proposal-delivery-address-error" class="field-error">{{ validationErrors.deliveryAddress }}</span>
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label for="proposal-notes">Ghi chú</label>
          <textarea
            id="proposal-notes"
            v-model="formNotes"
            class="cockpit-textarea"
            :disabled="readOnly || isSaving || isSubmitting"
            rows="2"
            placeholder="Ghi chú thêm về yêu cầu vận chuyển, thời gian hạ hàng (nếu có)..."
            maxlength="2000"
            @input="markDirty"
          />
        </div>
      </div>

      <!-- Line Items Section -->
      <div class="cockpit-card form-section">
        <div class="section-header-row">
          <div>
            <h3 class="section-title">Danh sách vật tư yêu cầu</h3>
            <p class="section-desc">Chọn vật tư từ danh mục chuẩn của công ty và nhập số lượng cần.</p>
          </div>
          <button
            v-if="!readOnly"
            type="button"
            class="cockpit-btn cockpit-btn--secondary"
            :disabled="isSaving || isSubmitting"
            @click="addLine"
          >
            <UIcon name="i-lucide-plus" aria-hidden="true" />
            Thêm dòng vật tư
          </button>
        </div>

        <span v-if="validationErrors.lines" class="field-error block mb-2">{{ validationErrors.lines }}</span>

        <div v-if="lines.length === 0" class="empty-lines">
          <p>Chưa có dòng vật tư nào. Bấm "Thêm dòng vật tư" để bắt đầu.</p>
        </div>

        <div v-else class="lines-table-wrap">
          <table class="cockpit-table lines-table">
            <thead>
              <tr>
                <th scope="col" style="width: 40px;">STT</th>
                <th scope="col" style="min-width: 220px;">Vật tư chuẩn <span class="required">*</span></th>
                <th scope="col" style="min-width: 180px;">Tên dự kiến trên HĐ</th>
                <th scope="col" style="min-width: 180px;">Quy cách chuẩn</th>
                <th scope="col" style="width: 100px;">Đơn vị</th>
                <th scope="col" style="min-width: 140px;">Số lượng <span class="required">*</span></th>
                <th scope="col" style="min-width: 200px;">Ghi chú</th>
                <th v-if="hasAllocationHistory" scope="col" style="min-width: 120px;">Đã phân bổ</th>
                <th v-if="hasAllocationHistory" scope="col" style="min-width: 120px;">Đã ký HĐ</th>
                <th v-if="hasAllocationHistory" scope="col" style="min-width: 120px;">Còn lại</th>
                <th v-if="!readOnly" scope="col" style="width: 60px; text-align: center;">Xóa</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, index) in lines" :key="line.lineId" :class="{ 'row-signed': isLineSigned(line) }">
                <td class="text-center font-mono">{{ index + 1 }}</td>
                <td>
                  <div v-if="readOnly || isLineSigned(line) || isPersistedLine(line)">
                    <span class="font-medium">{{ getMaterialName(line.materialId) }}</span>
                    <span v-if="isLineSigned(line)" class="signed-badge">Đã ký HĐ</span>
                    <small v-else-if="isPersistedLine(line) && !readOnly" class="field-hint block text-xs text-muted">
                      (Dòng đã lưu: không đổi vật tư; xóa và thêm dòng mới nếu cần thay thế)
                    </small>
                  </div>
                  <div v-else class="material-select-cell">
                    <select
                      :id="'line-material-' + line.lineId"
                      v-model="line.materialId"
                      class="cockpit-select line-select"
                      :disabled="readOnly || isSaving || isSubmitting"
                      :aria-label="'Vật tư dòng ' + (index + 1)"
                      :aria-invalid="Boolean(getLineError(line.lineId, 'materialId'))"
                      :aria-describedby="getLineError(line.lineId, 'materialId') ? 'line-material-error-' + line.lineId : undefined"
                      required
                      @change="onMaterialChange(line)"
                    >
                      <option value="" disabled>-- Chọn vật tư --</option>
                      <option
                        v-for="mat in activeMaterials"
                        :key="mat.id"
                        :value="mat.id"
                      >
                        {{ mat.code }} - {{ mat.name }}
                      </option>
                    </select>
                  </div>
                  <span
                    v-if="getLineError(line.lineId, 'materialId')"
                    :id="'line-material-error-' + line.lineId"
                    class="field-error"
                  >
                    {{ getLineError(line.lineId, 'materialId') }}
                  </span>
                </td>
                <td>
                  <div v-if="readOnly">
                    <span class="text-xs font-medium text-slate-800">{{ line.proposedInvoiceName || '—' }}</span>
                  </div>
                  <div v-else>
                    <input
                      :id="'line-invoice-name-' + line.lineId"
                      v-model="line.proposedInvoiceName"
                      type="text"
                      class="cockpit-input invoice-name-input text-xs"
                      placeholder="Để trống sẽ dùng tên chuẩn"
                      :disabled="readOnly || isSaving || isSubmitting"
                      :aria-label="'Tên dự kiến trên hóa đơn dòng ' + (index + 1)"
                      :aria-invalid="Boolean(getLineError(line.lineId, 'proposedInvoiceName'))"
                      :aria-describedby="getLineError(line.lineId, 'proposedInvoiceName') ? 'line-invoice-name-error-' + line.lineId : undefined"
                      maxlength="200"
                      @input="markDirty"
                    >
                    <small class="field-hint block text-xs text-muted mt-0.5">
                      Để trống sẽ dùng tên chuẩn
                    </small>
                    <span
                      v-if="getLineError(line.lineId, 'proposedInvoiceName')"
                      :id="'line-invoice-name-error-' + line.lineId"
                      class="field-error text-xs"
                    >
                      {{ getLineError(line.lineId, 'proposedInvoiceName') }}
                    </span>
                  </div>
                </td>
                <td>
                  <span class="text-muted text-sm">{{ getMaterialSpec(line.materialId) }}</span>
                </td>
                <td>
                  <span class="cockpit-badge cockpit-badge--neutral font-mono">
                    {{ getMaterialUnit(line.materialId) || '—' }}
                  </span>
                </td>
                <td>
                  <div v-if="readOnly">
                    <span class="font-mono font-medium">{{ formatMaterialQuantity(line.quantity) }}</span>
                  </div>
                  <div v-else>
                    <input
                      :id="'line-quantity-' + line.lineId"
                      v-model="line.quantity"
                      type="text"
                      inputmode="decimal"
                      class="cockpit-input quantity-input font-mono"
                      placeholder="VD: 20 hoặc 15.5"
                      :disabled="readOnly || isSaving || isSubmitting"
                      :aria-label="'Số lượng dòng ' + (index + 1)"
                      :aria-invalid="Boolean(getLineError(line.lineId, 'quantity'))"
                      :aria-describedby="getLineError(line.lineId, 'quantity') ? 'line-quantity-error-' + line.lineId : undefined"
                      required
                      @input="markDirty"
                    >
                    <small v-if="isLineSigned(line)" class="signed-limit-text">
                      Tối thiểu: {{ formatMaterialQuantity(line.signedQuantity || '') }}
                    </small>
                  </div>
                  <span
                    v-if="getLineError(line.lineId, 'quantity')"
                    :id="'line-quantity-error-' + line.lineId"
                    class="field-error"
                  >
                    {{ getLineError(line.lineId, 'quantity') }}
                  </span>
                </td>
                <td>
                  <div v-if="readOnly">
                    <span class="text-xs text-slate-800 whitespace-pre-wrap break-words">{{ line.notes || '—' }}</span>
                  </div>
                  <div v-else>
                    <textarea
                      :id="'line-notes-' + line.lineId"
                      v-model="line.notes"
                      rows="2"
                      class="cockpit-textarea line-notes-textarea text-xs"
                      placeholder="Ghi chú thêm cho dòng vật tư..."
                      :disabled="readOnly || isSaving || isSubmitting"
                      :aria-label="'Ghi chú dòng ' + (index + 1)"
                      :aria-invalid="Boolean(getLineError(line.lineId, 'notes'))"
                      :aria-describedby="getLineError(line.lineId, 'notes') ? 'line-notes-error-' + line.lineId : undefined"
                      maxlength="2000"
                      @input="markDirty"
                    />
                    <span
                      v-if="getLineError(line.lineId, 'notes')"
                      :id="'line-notes-error-' + line.lineId"
                      class="field-error text-xs"
                    >
                      {{ getLineError(line.lineId, 'notes') }}
                    </span>
                  </div>
                </td>
                <!-- Historical progress quantities -->
                <td v-if="hasAllocationHistory" class="font-mono text-sm">
                  {{ formatMaterialQuantity(line.allocatedQuantity || '0') }}
                </td>
                <td v-if="hasAllocationHistory" class="font-mono text-sm font-medium">
                  {{ formatMaterialQuantity(line.signedQuantity || '0') }}
                </td>
                <td v-if="hasAllocationHistory" class="font-mono text-sm text-forest">
                  {{ formatMaterialQuantity(line.remainingQuantity || line.quantity) }}
                </td>
                <!-- Delete Action -->
                <td v-if="!readOnly" class="text-center">
                  <button
                    v-if="!isLineSigned(line)"
                    type="button"
                    class="btn-icon-danger"
                    title="Xóa dòng này"
                    :aria-label="'Xóa dòng ' + (index + 1)"
                    :disabled="isSaving || isSubmitting"
                    @click="removeLine(index)"
                  >
                    <UIcon name="i-lucide-trash-2" aria-hidden="true" />
                  </button>
                  <span v-else class="text-muted" title="Dòng đã ký hợp đồng không thể xóa">
                    <UIcon name="i-lucide-lock" class="text-amber-600" aria-hidden="true" />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="hasSignedLines" class="signed-warning-banner">
          <UIcon name="i-lucide-info" class="text-amber-600 shrink-0" aria-hidden="true" />
          <span>
            Một số dòng đã có hợp đồng ký kết: hệ thống bảo vệ không cho phép xóa, đổi vật tư chuẩn hoặc giảm số lượng dưới mức đã ký.
          </span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div v-if="!readOnly" class="form-actions-bar">
        <div class="left-actions">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary"
            :disabled="isSaving || isSubmitting"
            @click="handleCancel"
          >
            Hủy
          </button>
        </div>
        <div class="right-actions">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary"
            :disabled="isSaving || isSubmitting"
            @click="handleSaveDraft"
          >
            <UIcon v-if="isSaving" name="i-lucide-loader-2" class="animate-spin" aria-hidden="true" />
            <UIcon v-else name="i-lucide-save" aria-hidden="true" />
            {{ isSaving ? 'Đang lưu...' : 'Lưu nháp' }}
          </button>
          <button
            type="button"
            class="cockpit-btn cockpit-btn--primary"
            :disabled="isSaving || isSubmitting"
            @click="handleSubmit"
          >
            <UIcon v-if="isSubmitting" name="i-lucide-loader-2" class="animate-spin" aria-hidden="true" />
            <UIcon v-else name="i-lucide-send" aria-hidden="true" />
            {{ isSubmitting ? 'Đang gửi...' : 'Gửi mua hàng' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Decimal from 'decimal.js'
import type {
  MaterialProjectOption,
  MaterialView,
  MaterialProposalView,
  MaterialCommandResult,
} from '../../../shared/schemas/costs/material-procurement'
import { workflowMoneySchema } from '../../../shared/schemas/costs/cost-workflow'
import { ClientError } from '../../errors/client-error'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import { formatMaterialQuantity } from '../../utils/materials/quantity-display'

interface FormLine {
  lineId: string
  materialId: string
  quantity: string
  notes: string
  proposedInvoiceName?: string | null
  allocatedQuantity?: string
  signedQuantity?: string
  remainingQuantity?: string
}

const props = withDefaults(defineProps<{
  projectId?: string
  proposal?: MaterialProposalView | null
  initialProject?: MaterialProjectOption | null
  readOnly?: boolean
}>(), {
  projectId: '',
  proposal: null,
  initialProject: null,
  readOnly: false,
})

const emit = defineEmits<{
  'saved': [result: MaterialCommandResult, proposalId: string, projectId: string]
  'submitted': [result: MaterialCommandResult, proposalId: string, projectId: string]
  'cancel': []
  'dirty': [isDirty: boolean]
}>()

const repositories = useRepositories()
const repo = repositories.materialProcurement
const companyAccess = useNuxtApp().$companyAccessStore

const masterDataTracker = createAsyncRequestTracker<{ companyId: string }>()
let commandGeneration = 0
let disposed = false

// Master Data
const projectOptions = ref<MaterialProjectOption[]>([])
const materialsList = ref<MaterialView[]>([])
const lastAutoFilledAddress = ref<string>('')

// Form State
const existingProposalId = ref<string>(props.proposal?.id || '')
const currentVersion = ref<number>(props.proposal?.version ?? 0)
const formProjectId = ref<string>(props.projectId || props.proposal?.projectId || '')
const formNeededOn = ref<string>(props.proposal?.neededOn || '')
const formDeliveryAddress = ref<string>(props.proposal?.deliveryAddress || '')
const formNotes = ref<string>(props.proposal?.notes || '')
const lines = ref<FormLine[]>([])

// Status & UX State
const isSaving = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const conflictNotice = ref(false)
const canonicalProposal = ref<MaterialProposalView | null>(null)
const validationErrors = ref<Record<string, string>>({})
const isDirty = ref(false)
const acknowledgedPayload = ref<string | null>(props.proposal ? proposalPayloadSignature(props.proposal) : null)

// Idempotency tracking
const saveIdempotencyKey = ref<string>(crypto.randomUUID())
const lastSaveSignature = ref<string>('')
const submitIdempotencyKey = ref<string>(crypto.randomUUID())
const lastSubmitSignature = ref<string>('')

const isReturnedState = computed(() => props.proposal?.reviewState === 'returned')

const selectedProject = computed(() => {
  return projectOptions.value.find(p => p.projectId === formProjectId.value) || null
})

const activeMaterials = computed(() => {
  return materialsList.value.filter(m => m.isActive)
})

const hasAllocationHistory = computed(() => {
  return Boolean(props.proposal?.lines?.some(l => {
    try {
      const alloc = l.allocatedQuantity ? new Decimal(l.allocatedQuantity).greaterThan(0) : false
      const signed = l.signedQuantity ? new Decimal(l.signedQuantity).greaterThan(0) : false
      return alloc || signed
    } catch {
      return false
    }
  }))
})

const hasSignedLines = computed(() => {
  return lines.value.some(l => isLineSigned(l))
})

function reviewStateLabel(state: string): string {
  switch (state) {
    case 'draft': return 'Bản nháp'
    case 'submitted': return 'Đã gửi mua hàng'
    case 'approved': return 'Đã duyệt'
    case 'returned': return 'Cần chỉnh sửa'
    default: return state
  }
}

function getMaterial(materialId: string): MaterialView | undefined {
  return materialsList.value.find(m => m.id === materialId)
}

function getMaterialName(materialId: string): string {
  const m = getMaterial(materialId)
  return m ? `${m.code} - ${m.name}` : 'Chưa chọn vật tư'
}

function getMaterialSpec(materialId: string): string {
  return getMaterial(materialId)?.specification || '—'
}

function getMaterialUnit(materialId: string): string {
  return getMaterial(materialId)?.unit || ''
}

function isPersistedLine(line: FormLine): boolean {
  if (!props.proposal) return false
  return props.proposal.lines.some(l => l.lineId === line.lineId)
}

function isLineSigned(line: FormLine): boolean {
  if (!line.signedQuantity) return false
  try {
    return new Decimal(line.signedQuantity).greaterThan(0)
  } catch {
    return false
  }
}

function getLineError(lineId: string, field: string): string | undefined {
  return validationErrors.value[`line_${lineId}_${field}`]
}

function markDirty() {
  if (!isDirty.value) {
    isDirty.value = true
    emit('dirty', true)
  }
}

function addLine() {
  const newLineId = crypto.randomUUID()
  lines.value.push({
    lineId: newLineId,
    materialId: '',
    quantity: '',
    notes: '',
    proposedInvoiceName: '',
  })
  markDirty()
}

function removeLine(index: number) {
  const line = lines.value[index]
  if (line && isLineSigned(line)) {
    errorMessage.value = 'Không thể xóa dòng vật tư đã có hợp đồng ký kết.'
    return
  }
  lines.value.splice(index, 1)
  markDirty()
}

function onMaterialChange(_line: FormLine) {
  markDirty()
}

function onProjectChange() {
  markDirty()
  const p = selectedProject.value
  if (!existingProposalId.value) {
    if (!formDeliveryAddress.value.trim() || formDeliveryAddress.value === lastAutoFilledAddress.value) {
      if (p?.locationText) {
        formDeliveryAddress.value = p.locationText
        lastAutoFilledAddress.value = p.locationText
      } else {
        formDeliveryAddress.value = ''
        lastAutoFilledAddress.value = ''
      }
    }
  }
}

function validateForm(): boolean {
  validationErrors.value = {}
  let valid = true

  if (!formProjectId.value) {
    validationErrors.value.projectId = 'Vui lòng chọn công trình / dự án.'
    valid = false
  }

  if (!formNeededOn.value) {
    validationErrors.value.neededOn = 'Vui lòng chọn ngày cần vật tư.'
    valid = false
  }

  if (!formDeliveryAddress.value.trim()) {
    validationErrors.value.deliveryAddress = 'Vui lòng nhập nơi giao hàng.'
    valid = false
  }

  if (lines.value.length === 0) {
    validationErrors.value.lines = 'Phiếu yêu cầu phải có ít nhất 1 dòng vật tư.'
    valid = false
  }

  const seenLineIds = new Set<string>()
  for (const line of lines.value) {
    if (!line.materialId) {
      validationErrors.value[`line_${line.lineId}_materialId`] = 'Vui lòng chọn vật tư.'
      valid = false
    }

    if (!line.quantity || !workflowMoneySchema.safeParse(line.quantity.trim()).success) {
      validationErrors.value[`line_${line.lineId}_quantity`] = 'Số lượng phải là số thập phân hợp lệ.'
      valid = false
    } else {
      try {
        const qtyDecimal = new Decimal(line.quantity.trim())
        if (!qtyDecimal.greaterThan(0)) {
          validationErrors.value[`line_${line.lineId}_quantity`] = 'Số lượng phải lớn hơn 0.'
          valid = false
        } else if (isLineSigned(line)) {
          const signedDecimal = new Decimal(line.signedQuantity!)
          if (qtyDecimal.lessThan(signedDecimal)) {
            validationErrors.value[`line_${line.lineId}_quantity`] = `Số lượng không được nhỏ hơn số lượng đã ký (${formatMaterialQuantity(line.signedQuantity!)}).`
            valid = false
          }
        }
      } catch {
        validationErrors.value[`line_${line.lineId}_quantity`] = 'Số lượng không hợp lệ.'
        valid = false
      }
    }

    if (line.proposedInvoiceName && line.proposedInvoiceName.trim().length > 200) {
      validationErrors.value[`line_${line.lineId}_proposedInvoiceName`] = 'Tên dự kiến trên hóa đơn không được vượt quá 200 ký tự.'
      valid = false
    }

    if (line.notes && line.notes.trim().length > 2000) {
      validationErrors.value[`line_${line.lineId}_notes`] = 'Ghi chú không được vượt quá 2.000 ký tự.'
      valid = false
    }

    if (seenLineIds.has(line.lineId)) {
      validationErrors.value.lines = 'Phát hiện mã định danh dòng bị trùng lặp.'
      valid = false
    }
    seenLineIds.add(line.lineId)
  }

  return valid
}

function normalizeInvoiceName(name?: string | null): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeLineNotes(notes?: string | null): string | null {
  if (!notes) return null
  const trimmed = notes.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildProposalPayload() {
  return {
    neededOn: formNeededOn.value,
    deliveryAddress: formDeliveryAddress.value.trim(),
    notes: formNotes.value.trim() ? formNotes.value.trim() : undefined,
    lines: lines.value.map(l => ({
      lineId: l.lineId,
      materialId: l.materialId,
      quantity: l.quantity.trim(),
      proposedInvoiceName: normalizeInvoiceName(l.proposedInvoiceName),
      notes: normalizeLineNotes(l.notes),
    })),
  }
}

function proposalPayloadSignature(proposal: MaterialProposalView): string {
  return JSON.stringify({
    neededOn: proposal.neededOn,
    deliveryAddress: proposal.deliveryAddress.trim(),
    notes: proposal.notes?.trim() || undefined,
    lines: proposal.lines.map(line => ({
      lineId: line.lineId,
      materialId: line.materialId,
      quantity: formatMaterialQuantity(line.quantity.trim()),
      proposedInvoiceName: normalizeInvoiceName(line.engineerProposedInvoiceName),
      notes: normalizeLineNotes(line.notes),
    })),
  })
}

function formPayloadSignature(): string {
  return JSON.stringify({
    neededOn: formNeededOn.value,
    deliveryAddress: formDeliveryAddress.value.trim(),
    notes: formNotes.value.trim() ? formNotes.value.trim() : undefined,
    lines: lines.value.map(l => ({
      lineId: l.lineId,
      materialId: l.materialId,
      quantity: formatMaterialQuantity(l.quantity.trim()),
      proposedInvoiceName: normalizeInvoiceName(l.proposedInvoiceName),
      notes: normalizeLineNotes(l.notes),
    })),
  })
}

function commandScope() {
  return {
    generation: commandGeneration,
    companyId: companyAccess?.activeCompanyId,
    pageProjectId: props.projectId,
    formProjectId: formProjectId.value,
  }
}

function isCurrentCommand(scope: ReturnType<typeof commandScope>): boolean {
  return !disposed &&
    scope.generation === commandGeneration &&
    scope.companyId === companyAccess?.activeCompanyId &&
    scope.pageProjectId === props.projectId &&
    scope.formProjectId === formProjectId.value
}

function getSaveCommandSignature(payload: ReturnType<typeof buildProposalPayload>) {
  return JSON.stringify({
    companyId: companyAccess?.activeCompanyId ?? '',
    projectId: formProjectId.value,
    target: existingProposalId.value || null,
    operation: existingProposalId.value ? 'update' : 'create',
    expectedVersion: existingProposalId.value ? currentVersion.value : null,
    payload,
  })
}

function getSubmitCommandSignature() {
  return JSON.stringify({
    companyId: companyAccess?.activeCompanyId ?? '',
    projectId: formProjectId.value,
    target: existingProposalId.value,
    operation: 'submit',
    expectedVersion: currentVersion.value,
  })
}

async function saveProposalDraft(options: { silent?: boolean } = {}): Promise<MaterialCommandResult | null> {
  errorMessage.value = ''
  successMessage.value = ''
  conflictNotice.value = false

  if (!validateForm()) {
    errorMessage.value = 'Vui lòng kiểm tra lại các trường thông tin chưa hợp lệ.'
    return null
  }

  if (existingProposalId.value && !hasFormModifications()) {
    isDirty.value = false
    emit('dirty', false)
    if (!options.silent) successMessage.value = 'Không có thay đổi cần lưu.'
    return null
  }

  isSaving.value = true
  const scope = commandScope()
  const payload = buildProposalPayload()
  const currentSig = getSaveCommandSignature(payload)

  // Idempotency rule: exact command retry keeps key; altered command generates new key
  if (currentSig !== lastSaveSignature.value) {
    saveIdempotencyKey.value = crypto.randomUUID()
    lastSaveSignature.value = currentSig
  }
  const idempotencyKey = saveIdempotencyKey.value

  try {
    let result: MaterialCommandResult
    if (existingProposalId.value) {
      result = await repo.updateProposal(
        formProjectId.value,
        existingProposalId.value,
        {
          ...payload,
          expectedVersion: currentVersion.value,
        },
        { idempotencyKey },
      )
      if (!isCurrentCommand(scope)) return null
      currentVersion.value = result.version
      acknowledgedPayload.value = formPayloadSignature()
      isDirty.value = false
      emit('dirty', false)
      if (!options.silent) {
        successMessage.value = 'Đã lưu nháp phiếu yêu cầu thành công.'
        emit('saved', result, existingProposalId.value, formProjectId.value)
      }
    } else {
      result = await repo.createProposal(
        formProjectId.value,
        payload,
        { idempotencyKey },
      )
      if (!isCurrentCommand(scope)) return null
      existingProposalId.value = result.resourceId
      currentVersion.value = result.version
      acknowledgedPayload.value = formPayloadSignature()
      isDirty.value = false
      emit('dirty', false)
      if (!options.silent) {
        successMessage.value = 'Đã tạo phiếu yêu cầu mới thành công.'
        emit('saved', result, result.resourceId, formProjectId.value)
      }
    }
    return result
  } catch (err: unknown) {
    if (isCurrentCommand(scope)) await handleMutationError(err, scope)
    return null
  } finally {
    if (isCurrentCommand(scope)) isSaving.value = false
  }
}

async function handleSaveDraft(): Promise<void> {
  await saveProposalDraft({ silent: false })
}

function hasFormModifications(): boolean {
  return acknowledgedPayload.value !== formPayloadSignature()
}

async function handleSubmit() {
  errorMessage.value = ''
  successMessage.value = ''
  conflictNotice.value = false

  if (!validateForm()) {
    errorMessage.value = 'Vui lòng kiểm tra lại các trường thông tin trước khi gửi mua hàng.'
    return
  }

  isSubmitting.value = true
  const scope = commandScope()

  try {
    // Save only content that differs from the last acknowledged draft.
    const needsSave = !existingProposalId.value || hasFormModifications()
    if (needsSave) {
      const saveResult = await saveProposalDraft({ silent: true })
      if (!saveResult || !isCurrentCommand(scope)) return
    }

    // Step 2: Submit command
    const currentSubmitSig = getSubmitCommandSignature()
    if (currentSubmitSig !== lastSubmitSignature.value) {
      submitIdempotencyKey.value = crypto.randomUUID()
      lastSubmitSignature.value = currentSubmitSig
    }

    const result = await repo.submitProposal(
      formProjectId.value,
      existingProposalId.value,
      { expectedVersion: currentVersion.value },
      { idempotencyKey: submitIdempotencyKey.value },
    )

    if (!isCurrentCommand(scope)) return
    currentVersion.value = result.version
    successMessage.value = 'Đã gửi phiếu yêu cầu mua hàng thành công.'
    isDirty.value = false
    emit('dirty', false)
    emit('submitted', result, existingProposalId.value, formProjectId.value)
  } catch (err: unknown) {
    if (isCurrentCommand(scope)) await handleMutationError(err, scope)
  } finally {
    if (isCurrentCommand(scope)) isSubmitting.value = false
  }
}

async function handleMutationError(err: unknown, scope: ReturnType<typeof commandScope>) {
  // Check for 409 / Conflict
  const isConflict =
    (err instanceof ClientError && (err.code === 'VERSION_CONFLICT' || err.code === 'IDEMPOTENCY_CONFLICT')) ||
    (typeof err === 'object' && err !== null && (
      ('statusCode' in err && (err as { statusCode?: number }).statusCode === 409) ||
      ('status' in err && (err as { status?: number }).status === 409)
    ))

  if (isConflict && existingProposalId.value) {
    conflictNotice.value = true
    errorMessage.value = 'Xung đột phiên bản: Dữ liệu trên hệ thống đã thay đổi. Dữ liệu bạn vừa nhập đã được giữ nguyên để đối chiếu.'
    try {
      const canonical = await repo.readProposal(scope.formProjectId, existingProposalId.value)
      if (isCurrentCommand(scope)) canonicalProposal.value = canonical
    } catch {
      // ignore secondary fetch error
    }
    return
  }

  if (err instanceof ClientError) {
    if (err.code === 'PERMISSION_DENIED') {
      errorMessage.value = err.message || 'Bạn không có quyền thực hiện thao tác này.'
    } else {
      errorMessage.value = err.message || 'Lỗi xử lý yêu cầu.'
    }
  } else if (err instanceof Error) {
    errorMessage.value = err.message
  } else {
    errorMessage.value = 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.'
  }
}

function handleCancel() {
  emit('cancel')
}

async function loadMasterData() {
  const activeCompanyId = companyAccess?.activeCompanyId
  if (!activeCompanyId) {
    projectOptions.value = []
    materialsList.value = []
    return
  }

  const token = masterDataTracker.start({ companyId: activeCompanyId })
  try {
    const [projects, mats] = await Promise.all([
      repo.listProjects(),
      repo.listMaterials(),
    ])
    if (!token.isCurrent()) return
    projectOptions.value = projects
    materialsList.value = mats

    // If new proposal and no address yet, prefill from current project
    if (!existingProposalId.value && !formDeliveryAddress.value.trim()) {
      const p = projects.find(proj => proj.projectId === formProjectId.value)
      if (p?.locationText) {
        formDeliveryAddress.value = p.locationText
        lastAutoFilledAddress.value = p.locationText
      }
    }
  } catch {
    if (!token.isCurrent()) return
    errorMessage.value = 'Không thể nạp dữ liệu danh mục dự án hoặc vật tư.'
  }
}

function initFromProposal(p: MaterialProposalView) {
  existingProposalId.value = p.id
  currentVersion.value = p.version
  formProjectId.value = p.projectId
  formNeededOn.value = p.neededOn
  formDeliveryAddress.value = p.deliveryAddress
  formNotes.value = p.notes || ''
  lines.value = p.lines.map(l => ({
    lineId: l.lineId,
    materialId: l.materialId,
    quantity: formatMaterialQuantity(l.quantity),
    proposedInvoiceName: l.engineerProposedInvoiceName || '',
    notes: l.notes ?? '',
    allocatedQuantity: l.allocatedQuantity,
    signedQuantity: l.signedQuantity,
    remainingQuantity: l.remainingQuantity,
  }))
  acknowledgedPayload.value = proposalPayloadSignature(p)
  isDirty.value = false
  emit('dirty', false)
}

watch([() => props.proposal, isSaving, isSubmitting], ([newProposal]) => {
  if (!newProposal || conflictNotice.value || isDirty.value || isSaving.value || isSubmitting.value) return
  if (newProposal.version < currentVersion.value) return
  initFromProposal(newProposal)
}, { immediate: true })

watch(() => props.projectId, (newPId) => {
  commandGeneration++
  if (newPId && !existingProposalId.value) {
    formProjectId.value = newPId
    const p = projectOptions.value.find(proj => proj.projectId === newPId)
    if (p?.locationText && (!formDeliveryAddress.value.trim() || formDeliveryAddress.value === lastAutoFilledAddress.value)) {
      formDeliveryAddress.value = p.locationText
      lastAutoFilledAddress.value = p.locationText
    }
  }
}, { flush: 'sync' })

watch(() => companyAccess?.activeCompanyId, () => {
  commandGeneration++
  errorMessage.value = ''
  successMessage.value = ''
  conflictNotice.value = false
  canonicalProposal.value = null
  masterDataTracker.invalidate()
  projectOptions.value = []
  materialsList.value = []
  lastSaveSignature.value = ''
  lastSubmitSignature.value = ''
  saveIdempotencyKey.value = crypto.randomUUID()
  submitIdempotencyKey.value = crypto.randomUUID()
  void loadMasterData()
}, { flush: 'sync' })

onMounted(() => {
  void loadMasterData()
  if (!props.proposal && lines.value.length === 0) {
    addLine()
  }
})

onUnmounted(() => {
  disposed = true
  commandGeneration++
  masterDataTracker.invalidate()
})
</script>

<style scoped>
.proposal-form-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cockpit-alert {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 0.88rem;
  line-height: 1.5;
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
.cockpit-alert--warning {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
}
.conflict-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.conflict-header,
.returned-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
}
.conflict-icon {
  font-size: 1.2rem;
  color: #d97706;
}
.returned-icon {
  font-size: 1.2rem;
  color: #dc2626;
}
.canonical-summary {
  background: #ffffff;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 0.82rem;
  margin-top: 6px;
}
.canonical-summary ul {
  margin: 6px 0 0 16px;
  padding: 0;
}
.returned-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.returned-reason {
  margin: 0;
  font-size: 0.9rem;
}
.returned-hint {
  margin: 0;
  font-size: 0.82rem;
  color: #7f1d1d;
}
.proposal-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-section {
  padding: 20px;
}
.section-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--forest, #0f172a);
  margin: 0 0 4px 0;
}
.section-desc {
  font-size: 0.82rem;
  color: var(--ink-muted, #64748b);
  margin: 0 0 16px 0;
}
.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--forest-deep, #1e293b);
}
.required {
  color: #ef4444;
}
.cockpit-input,
.cockpit-select,
.cockpit-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line, #cbd5e1);
  border-radius: 6px;
  font-size: 0.88rem;
  background: #ffffff;
  color: var(--ink, #0f172a);
  transition: border-color 0.15s ease;
}
.cockpit-input:focus,
.cockpit-select:focus,
.cockpit-textarea:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}
.cockpit-input:disabled,
.cockpit-select:disabled,
.cockpit-textarea:disabled {
  background: #f8fafc;
  color: #64748b;
  cursor: not-allowed;
}
.field-hint {
  font-size: 0.78rem;
  color: var(--ink-muted, #64748b);
}
.field-error {
  font-size: 0.78rem;
  color: #dc2626;
  font-weight: 500;
}
.empty-lines {
  padding: 32px 16px;
  text-align: center;
  color: var(--ink-muted, #64748b);
  font-size: 0.88rem;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
}
.lines-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line, #e2e8f0);
  border-radius: 6px;
}
.lines-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.lines-table th {
  padding: 10px 12px;
  background: #f8fafc;
  border-bottom: 2px solid var(--line, #e2e8f0);
  text-align: left;
  font-weight: 600;
  color: var(--forest, #334155);
}
.lines-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line, #f1f5f9);
  vertical-align: middle;
}
.row-signed {
  background: #fefce8;
}
.signed-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 0.7rem;
  border-radius: 4px;
  background: #fef08a;
  color: #854d0e;
  font-weight: 600;
}
.signed-limit-text {
  display: block;
  font-size: 0.72rem;
  color: #b45309;
  margin-top: 2px;
}
.line-select {
  padding: 6px 10px;
  font-size: 0.82rem;
}
.quantity-input {
  max-width: 140px;
  padding: 6px 10px;
  font-size: 0.85rem;
}
.line-notes-textarea {
  min-height: 48px;
  resize: vertical;
  line-height: 1.4;
}
.invoice-name-input {
  min-width: 160px;
}
.btn-icon-danger {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-icon-danger:hover {
  background: #fee2e2;
}
.signed-warning-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 10px 14px;
  margin-top: 12px;
  font-size: 0.82rem;
  color: #92400e;
}
.form-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #ffffff;
  border: 1px solid var(--line, #e2e8f0);
  border-radius: 8px;
}
.left-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cockpit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 6px;
  font-size: 0.85rem;
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
.font-mono {
  font-family: monospace;
}
.font-medium {
  font-weight: 500;
}
.text-muted {
  color: var(--ink-muted, #64748b);
}
.text-forest {
  color: #0369a1;
}
.text-center {
  text-align: center;
}
@media (max-width: 640px) {
  .section-header-row {
    flex-direction: column;
    align-items: stretch;
  }
  .form-actions-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .right-actions {
    justify-content: stretch;
  }
  .right-actions button {
    flex: 1;
    justify-content: center;
  }
}
</style>
