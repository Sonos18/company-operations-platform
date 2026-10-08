<template>
  <div class="cockpit-page">
    <div class="page-header cockpit-card">
      <div class="header-main">
        <NuxtLink :to="`/materials/${pId}/proposals`" class="back-link">
          ← Quay lại danh sách phiếu yêu cầu
        </NuxtLink>
        <div class="header-title-row">
          <h2>
            Phiếu yêu cầu vật tư · {{ proposal ? `v${proposal.version}` : '' }}
          </h2>
          <span v-if="proposal" class="cockpit-badge" :class="statusBadgeClass(proposal.reviewState)">
            {{ statusText(proposal.reviewState) }}
          </span>
          <span v-if="proposal?.orderProgress" class="cockpit-badge cockpit-badge--neutral">
            {{ proposal.orderProgress.orderCount }} đơn mua / {{ proposal.orderProgress.signedOrderCount }} đã ký HĐ
          </span>
        </div>
        <p class="subtitle">
          Mã định danh phiếu: <span class="font-mono text-sm">{{ propId }}</span>
        </p>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
      {{ errorMessage }}
    </div>

    <!-- Shape Error Alert for Returned state -->
    <div v-if="shapeErrorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
      {{ shapeErrorMessage }}
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="cockpit-card loading-card">
      <p>Đang tải thông tin phiếu yêu cầu...</p>
    </div>

    <!-- Editable Mode for Author -->
    <template v-else-if="proposal && canEdit">
      <MaterialProposalForm
        :project-id="pId"
        :proposal="proposal"
        @saved="onSaved"
        @submitted="onSubmitted"
        @cancel="onCancel"
      />
    </template>

    <!-- Read-Only Mode for Submitted/Approved or Non-Author / Buyer -->
    <template v-else-if="proposal">
      <!-- Read-Only Notice -->
      <div class="cockpit-alert cockpit-alert--info" role="status">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="shrink-0" aria-hidden="true" />
          <span>{{ readOnlyNoticeMessage }}</span>
        </div>
      </div>

      <!-- Returned Reason Banner (if returned but user cannot edit) -->
      <div v-if="proposal.reviewState === 'returned' && proposal.returnReason" class="cockpit-alert cockpit-alert--danger" role="alert">
        <strong>Lý do trả phiếu từ bộ phận mua hàng:</strong> {{ proposal.returnReason }}
      </div>

      <!-- General Info Card -->
      <div class="cockpit-card info-card">
        <h3 class="section-title">Thông tin chung</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Ngày cần vật tư:</span>
            <span class="info-value font-medium">{{ proposal.neededOn }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Nơi giao hàng:</span>
            <span class="info-value">{{ proposal.deliveryAddress }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Trạng thái:</span>
            <span class="info-value">
              <span class="cockpit-badge" :class="statusBadgeClass(proposal.reviewState)">
                {{ statusText(proposal.reviewState) }}
              </span>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Tiến độ mua hàng:</span>
            <span class="info-value font-medium">
              {{ proposal.orderProgress.orderCount }} đơn mua ({{ proposal.orderProgress.signedOrderCount }} hợp đồng đã ký kết)
            </span>
          </div>
          <div class="info-item full-width">
            <span class="info-label">Ghi chú:</span>
            <span class="info-value text-muted">{{ proposal.notes || 'Không có ghi chú' }}</span>
          </div>
        </div>
      </div>

      <!-- Lines Table Card -->
      <div class="cockpit-card table-card">
        <div class="card-header-row">
          <div>
            <h3 class="section-title">Danh sách vật tư yêu cầu</h3>
            <p class="section-desc">Tổng cộng {{ proposal.lines.length }} loại vật tư chuẩn.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="cockpit-table">
            <thead>
              <tr>
                <th scope="col" style="width: 40px;">STT</th>
                <th scope="col">Tên vật tư chuẩn</th>
                <th scope="col">Quy cách chuẩn</th>
                <th scope="col" style="width: 100px;">Đơn vị</th>
                <th scope="col" style="min-width: 120px;">Số lượng yêu cầu</th>
                <th scope="col" style="min-width: 120px;">Đã phân bổ</th>
                <th scope="col" style="min-width: 120px;">Đã ký HĐ</th>
                <th scope="col" style="min-width: 120px;">Còn lại</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, index) in proposal.lines" :key="line.lineId">
                <td class="text-center font-mono">{{ index + 1 }}</td>
                <td>
                  <span class="font-medium">{{ line.materialName }}</span>
                  <span v-if="isLineSigned(line)" class="signed-badge">Đã ký HĐ</span>
                </td>
                <td class="text-muted text-sm">{{ line.specification }}</td>
                <td>
                  <span class="cockpit-badge cockpit-badge--neutral font-mono">{{ line.unit }}</span>
                </td>
                <td class="font-mono font-medium">{{ line.quantity }}</td>
                <td class="font-mono text-sm">{{ line.allocatedQuantity || '0.0000' }}</td>
                <td class="font-mono text-sm font-medium">{{ line.signedQuantity || '0.0000' }}</td>
                <td class="font-mono text-sm text-forest">{{ line.remainingQuantity || line.quantity }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="hasSignedLines" class="signed-warning-banner">
          <UIcon name="i-lucide-info" class="text-amber-600 shrink-0" aria-hidden="true" />
          <span>
            Các dòng có hợp đồng đã ký được bảo vệ trên hệ thống: không được xóa, đổi vật tư hoặc giảm số lượng dưới mức đã ký kết.
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Decimal from 'decimal.js'
import type {
  MaterialProposalView,
  MaterialProposalLineView,
  MaterialReviewState,
  MaterialCommandResult,
} from '../../../../shared/schemas/costs/material-procurement'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { createAsyncRequestTracker } from '../../../utils/costs/async-request-tracker'
import MaterialProposalForm from '../../../components/materials/MaterialProposalForm.vue'

definePageMeta({ requiredPermission: 'material.read' })

const route = useRoute()
const repositories = useRepositories()
const repo = repositories.materialProcurement
const companyAccess = useNuxtApp().$companyAccessStore
const authStore = useNuxtApp().$authStore

const pId = computed(() => {
  const p = route.params.projectId
  const str = Array.isArray(p) ? (p[0] ?? '') : String(p || '')
  return workflowUuidSchema.safeParse(str).success ? str : ''
})

const propId = computed(() => {
  const pr = route.params.proposalId
  const str = Array.isArray(pr) ? (pr[0] ?? '') : String(pr || '')
  return workflowUuidSchema.safeParse(str).success ? str : ''
})

const proposal = ref<MaterialProposalView | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const shapeErrorMessage = ref('')

const tracker = createAsyncRequestTracker<{ companyId: string; proposalId: string }>()

const canSubmitPermission = computed(() => {
  return Boolean(companyAccess?.hasPermission('material.proposal.submit'))
})

const isAuthor = computed(() => {
  if (!proposal.value || !authStore?.user?.id) return false
  return authStore.user.id === proposal.value.createdBy
})

const isEditableState = computed(() => {
  if (!proposal.value) return false
  return proposal.value.reviewState === 'draft' || proposal.value.reviewState === 'returned'
})

// Requirement 6:
// "Chỉ người tạo có material.proposal.submit được sửa trạng thái draft/returned.
// Quyền UI dựa vào permission thực + authenticated user ID so với createdBy, không hardcode role name.
// Submitted/approved chỉ đọc. Buyer không được edit proposal, dù có quyền xem/duyệt."
const canEdit = computed(() => {
  return canSubmitPermission.value && isAuthor.value && isEditableState.value
})

const readOnlyNoticeMessage = computed(() => {
  if (!proposal.value) return ''
  if (proposal.value.reviewState === 'submitted') {
    return 'Chế độ chỉ đọc: Phiếu yêu cầu đã gửi cho bộ phận mua hàng xử lý.'
  }
  if (proposal.value.reviewState === 'approved') {
    return 'Chế độ chỉ đọc: Phiếu yêu cầu đã được duyệt mua hàng.'
  }
  if (!canSubmitPermission.value) {
    return 'Chế độ chỉ đọc: Bạn không có quyền chỉnh sửa phiếu yêu cầu vật tư.'
  }
  if (!isAuthor.value) {
    return 'Chế độ chỉ đọc: Chỉ người lập phiếu mới có quyền chỉnh sửa phiếu ở trạng thái này.'
  }
  return 'Chế độ chỉ đọc.'
})

const hasSignedLines = computed(() => {
  return Boolean(proposal.value?.lines?.some(l => isLineSigned(l)))
})

function isLineSigned(line: MaterialProposalLineView): boolean {
  if (!line.signedQuantity) return false
  try {
    return new Decimal(line.signedQuantity).greaterThan(0)
  } catch {
    return false
  }
}

function statusText(state: MaterialReviewState): string {
  switch (state) {
    case 'draft': return 'Bản nháp'
    case 'submitted': return 'Đã gửi mua hàng'
    case 'approved': return 'Đã duyệt'
    case 'returned': return 'Cần sửa'
    default: return state
  }
}

function statusBadgeClass(state: MaterialReviewState): string {
  switch (state) {
    case 'draft': return 'cockpit-badge--neutral'
    case 'submitted': return 'cockpit-badge--info'
    case 'approved': return 'cockpit-badge--success'
    case 'returned': return 'cockpit-badge--danger'
    default: return 'cockpit-badge--neutral'
  }
}

async function loadProposal() {
  const activeCompanyId = companyAccess?.activeCompanyId
  if (!activeCompanyId || !pId.value || !propId.value) {
    proposal.value = null
    isLoading.value = false
    return
  }

  const token = tracker.start({ companyId: activeCompanyId, proposalId: propId.value })
  isLoading.value = true
  errorMessage.value = ''
  shapeErrorMessage.value = ''

  try {
    const data = await repo.readProposal(pId.value, propId.value)
    if (!token.isCurrent()) return

    // Requirement 7:
    // "Returned: hiển thị returnReason từ API; kỹ sư sửa rồi gửi lại.
    // Contract bắt buộc lý do không rỗng khi returned, và null ở các trạng thái khác.
    // Response sai shape phải hiện lỗi, không tự bịa lý do."
    if (data.reviewState === 'returned' && (!data.returnReason || !data.returnReason.trim())) {
      shapeErrorMessage.value = 'Phản hồi từ máy chủ sai cấu trúc: Phiếu bị trả về bắt buộc phải có lý do trả phiếu.'
    } else if (data.reviewState !== 'returned' && data.returnReason !== null) {
      shapeErrorMessage.value = 'Phản hồi từ máy chủ sai cấu trúc: Phiếu không ở trạng thái bị trả về không được có lý do trả phiếu.'
    }

    proposal.value = data
  } catch (err: unknown) {
    if (!token.isCurrent()) return
    errorMessage.value = err instanceof Error ? err.message : 'Không thể tải thông tin phiếu yêu cầu.'
  } finally {
    if (token.isCurrent()) {
      isLoading.value = false
    }
  }
}

async function onSaved(_result: MaterialCommandResult, _savedId: string) {
  await loadProposal()
}

async function onSubmitted(_result: MaterialCommandResult, _savedId: string) {
  await loadProposal()
}

function onCancel() {
  navigateTo(`/materials/${pId.value}/proposals`)
}

watch([() => companyAccess?.activeCompanyId, pId, propId], () => {
  tracker.invalidate()
  proposal.value = null
  void loadProposal()
})

onMounted(() => {
  void loadProposal()
})

onUnmounted(() => {
  tracker.invalidate()
})
</script>

<style scoped>
.cockpit-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1280px;
  margin: 0 auto;
}
.page-header {
  padding: 20px;
}
.back-link {
  display: inline-block;
  font-size: 0.82rem;
  color: #0284c7;
  text-decoration: none;
  font-weight: 600;
  margin-bottom: 8px;
}
.back-link:hover {
  text-decoration: underline;
}
.header-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.page-header h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink, #0f172a);
  margin: 0;
}
.subtitle {
  font-size: 0.88rem;
  color: var(--ink-muted, #64748b);
  margin: 6px 0 0 0;
}
.cockpit-alert {
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
}
.cockpit-alert--info {
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
}
.cockpit-alert--danger {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.loading-card {
  padding: 40px 20px;
  text-align: center;
  color: var(--ink-muted, #64748b);
  font-size: 0.95rem;
}
.info-card,
.table-card {
  padding: 20px;
}
.section-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--forest, #0f172a);
  margin: 0 0 16px 0;
}
.section-desc {
  font-size: 0.82rem;
  color: var(--ink-muted, #64748b);
  margin: 0 0 12px 0;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.info-item.full-width {
  grid-column: 1 / -1;
}
.info-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--forest-deep, #475569);
}
.info-value {
  font-size: 0.9rem;
  color: var(--ink, #0f172a);
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line, #e2e8f0);
  border-radius: 6px;
}
.cockpit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.cockpit-table th {
  padding: 10px 12px;
  background: #f8fafc;
  border-bottom: 2px solid var(--line, #e2e8f0);
  text-align: left;
  font-weight: 600;
  color: var(--forest, #334155);
}
.cockpit-table td {
  padding: 12px;
  border-bottom: 1px solid var(--line, #f1f5f9);
  vertical-align: middle;
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
.cockpit-badge--info {
  background: #e0f2fe;
  color: #0369a1;
}
.cockpit-badge--success {
  background: #dcfce7;
  color: #166534;
}
.cockpit-badge--danger {
  background: #fee2e2;
  color: #991b1b;
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
</style>
