<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  PrepareProjectCostFinancialDetailInput,
  ProjectCostDetailKind,
  ProjectCostItemDetail,
  ProjectCostRetentionKind,
} from '../../../shared/schemas/costs/project-costs'
import { extractErrorMessage } from '../../utils/costs/accounting-error-mapper'
import { formatFinanceMoney } from '../../utils/costs/finance-display'

interface EditableLine {
  id?: string
  lineNo: number
  detailKind: ProjectCostDetailKind
  description: string
  quantity: string
  unitCode: string
  unitPrice: string
  amount: string
  retentionKind: '' | 'warranty' | 'other'
  retentionRateBps: number | null
  retentionAmount: string
  relevantDate: string
  reference: string
  note: string
}

const props = withDefaults(defineProps<{
  projectCostItemId: string
  initialDetails?: ProjectCostItemDetail[]
  currentVersion: number
  currencyCode?: string
  derivedAmount?: string | null
  sourceFigureIds?: string[]
  disabled?: boolean
}>(), {
  initialDetails: () => [],
  currencyCode: 'VND',
  derivedAmount: null,
  sourceFigureIds: () => [],
  disabled: false,
})

const emit = defineEmits<{
  'saved': [result: { version: number; amount: string }]
  'refresh-requested': []
}>()

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const canPrepare = computed(() => companyAccess.hasPermission('cost.prepare'))

const lines = ref<EditableLine[]>([])
const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const isVersionConflict = ref(false)

function normalizeInitialDetails() {
  if (props.initialDetails && props.initialDetails.length > 0) {
    lines.value = props.initialDetails.map(d => ({
      id: d.id,
      lineNo: d.lineNo,
      detailKind: d.detailKind,
      description: d.description,
      quantity: d.quantity ?? '',
      unitCode: d.unitCode ?? '',
      unitPrice: d.unitPrice ?? '',
      amount: d.amount,
      retentionKind: (d.retentionKind ?? '') as '' | 'warranty' | 'other',
      retentionRateBps: d.retentionRateBps ?? null,
      retentionAmount: d.retentionAmount ?? '',
      relevantDate: d.relevantDate ?? '',
      reference: d.reference ?? '',
      note: d.note ?? '',
    }))
  }
  else {
    lines.value = []
  }
  isVersionConflict.value = false
  errorMessage.value = null
}

watch(() => props.initialDetails, () => {
  normalizeInitialDetails()
}, { immediate: true, deep: true })

function renumberLines() {
  lines.value.forEach((l, index) => {
    l.lineNo = index + 1
  })
}

function addLine() {
  lines.value.push({
    lineNo: lines.value.length + 1,
    detailKind: 'line_item',
    description: '',
    quantity: '',
    unitCode: '',
    unitPrice: '',
    amount: '0.0000',
    retentionKind: '',
    retentionRateBps: null,
    retentionAmount: '',
    relevantDate: '',
    reference: '',
    note: '',
  })
}

function removeLine(index: number) {
  lines.value.splice(index, 1)
  renumberLines()
}

function moveLine(index: number, direction: 'up' | 'down') {
  if (direction === 'up' && index > 0) {
    const target = lines.value[index]
    const prev = lines.value[index - 1]
    if (target && prev) {
      lines.value[index] = prev
      lines.value[index - 1] = target
    }
  }
  else if (direction === 'down' && index < lines.value.length - 1) {
    const target = lines.value[index]
    const next = lines.value[index + 1]
    if (target && next) {
      lines.value[index] = next
      lines.value[index + 1] = target
    }
  }
  renumberLines()
}

async function saveFinancials() {
  if (!canPrepare.value) {
    errorMessage.value = 'Bạn không có quyền cost.prepare để lưu chi tiết tài chính.'
    return
  }

  if (lines.value.length === 0) {
    errorMessage.value = 'Cần có ít nhất một dòng chi tiết tài chính.'
    return
  }

  // Validate line items
  for (const l of lines.value) {
    if (!l.description.trim()) {
      errorMessage.value = `Dòng #${l.lineNo}: Mô tả không được để trống.`
      return
    }
    if (!l.amount || !/^\d+(\.\d{1,4})?$/u.test(l.amount)) {
      errorMessage.value = `Dòng #${l.lineNo}: Số tiền phải là định dạng số thập phân không âm hợp lệ (tối đa 4 chữ số thập phân).`
      return
    }
  }

  submitting.value = true
  errorMessage.value = null
  successMessage.value = null
  isVersionConflict.value = false

  try {
    const preparedDetails: PrepareProjectCostFinancialDetailInput[] = lines.value.map(l => ({
      lineNo: l.lineNo,
      detailKind: l.detailKind,
      description: l.description.trim(),
      quantity: l.quantity.trim() ? l.quantity.trim() : null,
      unitCode: l.unitCode.trim() ? l.unitCode.trim() : null,
      unitPrice: l.unitPrice.trim() ? l.unitPrice.trim() : null,
      amount: l.amount.trim(),
      retentionKind: (l.retentionKind || null) as ProjectCostRetentionKind | null,
      retentionRateBps: l.retentionRateBps != null && l.retentionRateBps !== ('' as unknown as number) ? Number(l.retentionRateBps) : null,
      retentionAmount: l.retentionAmount.trim() ? l.retentionAmount.trim() : null,
      relevantDate: l.relevantDate || null,
      reference: l.reference.trim() ? l.reference.trim() : null,
      note: l.note.trim() ? l.note.trim() : null,
    }))

    const input = {
      expectedVersion: props.currentVersion,
      currencyCode: props.currencyCode,
      details: preparedDetails,
      sourceFigureIds: props.sourceFigureIds,
    }

    const result = await repositories.projectCosts.prepareFinancials(props.projectCostItemId, input)
    successMessage.value = 'Đã lưu toàn bộ ảnh chụp chi tiết tài chính thành công.'
    emit('saved', { version: result.version, amount: result.amount })
  }
  catch (err: unknown) {
    const msg = extractErrorMessage(err)
    if (msg.includes('xung đột phiên bản') || (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'VERSION_CONFLICT')) {
      isVersionConflict.value = true
      errorMessage.value = 'Xung đột phiên bản: Dữ liệu bản nháp đã thay đổi trên máy chủ. Các dòng chi tiết bạn đang nhập vẫn được giữ nguyên. Vui lòng bấm "Lấy phiên bản mới nhất" để cập nhật số phiên bản trước khi lưu lại.'
    }
    else {
      errorMessage.value = msg
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="financial-detail-editor cockpit-card p-4 rounded-lg space-y-4" data-testid="financial-detail-editor">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
      <div>
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Chi tiết tài chính bản nháp
        </h3>
        <p class="text-xs text-gray-500">
          Lập danh sách dòng chi tiết tài chính. Tổng tiền chi phí sẽ được máy chủ tính toán tự động từ tổng các dòng (Quyền: cost.prepare).
        </p>
      </div>

      <div class="flex items-center gap-3">
        <div class="text-right">
          <div class="text-[11px] text-gray-400">Tổng tiền đã ghi nhận từ máy chủ</div>
          <div class="text-sm font-bold font-mono text-primary-600" data-testid="derived-total-amount">
            {{ derivedAmount != null ? formatFinanceMoney(derivedAmount, currencyCode) : 'Chưa có' }}
          </div>
        </div>

        <UButton
          v-if="canPrepare && !props.disabled"
          size="xs"
          color="primary"
          icon="i-lucide-plus"
          data-testid="add-line-btn"
          @click="addLine"
        >
          Thêm dòng
        </UButton>
      </div>
    </div>

    <!-- Error Alert -->
    <UAlert
      v-if="errorMessage"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="isVersionConflict ? 'Xung đột phiên bản' : 'Lỗi lưu chi tiết tài chính'"
      :description="errorMessage"
      data-testid="financial-editor-error"
    >
      <template v-if="isVersionConflict" #actions>
        <UButton
          size="xs"
          color="error"
          variant="outline"
          icon="i-lucide-refresh-cw"
          data-testid="financial-resolve-conflict-btn"
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
      data-testid="financial-editor-success"
    />

    <!-- Empty lines state -->
    <div
      v-if="lines.length === 0"
      class="py-8 text-center bg-gray-50 dark:bg-gray-900 rounded-lg"
      data-testid="financial-editor-empty"
    >
      <UIcon name="i-lucide-calculator" class="text-3xl text-gray-400 mx-auto" />
      <h4 class="text-xs font-semibold mt-2">Chưa có dòng chi tiết tài chính</h4>
      <p class="text-[11px] text-gray-500 mt-1 max-w-sm mx-auto">
        Bản nháp cần ít nhất một dòng chi tiết tài chính để có thể sẵn sàng phát hành.
      </p>
      <UButton
        v-if="canPrepare && !props.disabled"
        class="mt-3"
        size="xs"
        color="primary"
        icon="i-lucide-plus"
        @click="addLine"
      >
        Thêm dòng chi tiết đầu tiên
      </UButton>
    </div>

    <!-- Lines Table -->
    <div v-else class="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
      <table class="w-full text-left text-xs" data-testid="detail-lines-table">
        <thead class="bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-800">
          <tr>
            <th class="p-2 w-10 text-center">#</th>
            <th class="p-2 w-32">Loại</th>
            <th class="p-2 min-w-[160px]">Mô tả</th>
            <th class="p-2 w-20">Số lượng</th>
            <th class="p-2 w-20">ĐVT</th>
            <th class="p-2 w-28 text-right">Đơn giá</th>
            <th class="p-2 w-32 text-right">Thành tiền ({{ currencyCode }})</th>
            <th class="p-2 w-28">Giữ lại</th>
            <th class="p-2 w-28">Ngày / Tham chiếu</th>
            <th class="p-2 w-20 text-center">Thao tác</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
          <tr v-for="(line, index) in lines" :key="index" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/30" data-testid="detail-line-row">
            <td class="p-2 text-center font-mono text-gray-400">
              {{ line.lineNo }}
            </td>
            <td class="p-2">
              <select
                v-model="line.detailKind"
                :disabled="props.disabled || submitting"
                class="cockpit-select w-full text-xs"
                data-testid="line-kind-select"
              >
                <option value="line_item">Dòng chi tiết (line_item)</option>
                <option value="opening_balance">Số dư / giá trị mở đầu (opening_balance)</option>
              </select>
            </td>
            <td class="p-2">
              <input
                v-model="line.description"
                type="text"
                placeholder="Mô tả công việc *"
                required
                :disabled="props.disabled || submitting"
                class="cockpit-input w-full text-xs"
                data-testid="line-description-input"
              >
            </td>
            <td class="p-2">
              <input
                v-model="line.quantity"
                type="text"
                placeholder="SL"
                :disabled="props.disabled || submitting"
                class="cockpit-input w-full text-xs font-mono"
                data-testid="line-quantity-input"
              >
            </td>
            <td class="p-2">
              <input
                v-model="line.unitCode"
                type="text"
                placeholder="ĐVT"
                :disabled="props.disabled || submitting"
                class="cockpit-input w-full text-xs"
                data-testid="line-unit-input"
              >
            </td>
            <td class="p-2">
              <input
                v-model="line.unitPrice"
                type="text"
                placeholder="Đơn giá"
                :disabled="props.disabled || submitting"
                class="cockpit-input w-full text-xs font-mono text-right"
                data-testid="line-unit-price-input"
              >
            </td>
            <td class="p-2">
              <input
                v-model="line.amount"
                type="text"
                placeholder="0.0000 *"
                required
                :disabled="props.disabled || submitting"
                class="cockpit-input w-full text-xs font-mono font-semibold text-right"
                data-testid="line-amount-input"
              >
            </td>
            <td class="p-2">
              <div class="space-y-1">
                <select
                  v-model="line.retentionKind"
                  :disabled="props.disabled || submitting"
                  class="cockpit-select w-full text-[11px]"
                  data-testid="line-retention-select"
                >
                  <option value="">Không</option>
                  <option value="warranty">Bảo hành</option>
                  <option value="other">Khác</option>
                </select>
                <input
                  v-if="line.retentionKind"
                  v-model="line.retentionAmount"
                  type="text"
                  placeholder="Tiền giữ"
                  :disabled="props.disabled || submitting"
                  class="cockpit-input w-full text-[11px] font-mono"
                  data-testid="line-retention-amount-input"
                >
              </div>
            </td>
            <td class="p-2">
              <div class="space-y-1">
                <input
                  v-model="line.relevantDate"
                  type="date"
                  :disabled="props.disabled || submitting"
                  class="cockpit-input w-full text-[11px]"
                  data-testid="line-date-input"
                >
                <input
                  v-model="line.reference"
                  type="text"
                  placeholder="Số chứng từ"
                  :disabled="props.disabled || submitting"
                  class="cockpit-input w-full text-[11px]"
                  data-testid="line-reference-input"
                >
              </div>
            </td>
            <td class="p-2 text-center">
              <div class="flex items-center justify-center gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-up"
                  :disabled="index === 0 || props.disabled || submitting"
                  @click="moveLine(index, 'up')"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-down"
                  :disabled="index === lines.length - 1 || props.disabled || submitting"
                  @click="moveLine(index, 'down')"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  :disabled="props.disabled || submitting"
                  data-testid="delete-line-btn"
                  @click="removeLine(index)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Save Button -->
    <div v-if="canPrepare && !props.disabled" class="flex items-center justify-between pt-2">
      <div class="text-xs text-gray-500">
        Lưu ý: Thao tác này sẽ thay thế toàn bộ ảnh chụp chi tiết tài chính của bản nháp.
      </div>
      <UButton
        color="primary"
        icon="i-lucide-save"
        :loading="submitting"
        :disabled="lines.length === 0"
        data-testid="save-financials-btn"
        @click="saveFinancials"
      >
        Lưu chi tiết tài chính
      </UButton>
    </div>
  </div>
</template>
