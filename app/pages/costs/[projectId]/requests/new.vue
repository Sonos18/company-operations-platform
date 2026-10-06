<template>
  <div class="cockpit-page">
    <div class="page-header">
      <NuxtLink :to="`/costs/${pId}/requests`" class="back-link">← Quay lại danh sách đề nghị</NuxtLink>
      <h2>Tạo đề nghị khoản chi mới</h2>
    </div>

    <div v-if="loading" class="cockpit-alert cockpit-alert--info">Đang nạp dữ liệu ngữ cảnh dự án...</div>
    <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">{{ errorMessage }}</div>
    <div v-if="partyNotice" class="cockpit-alert cockpit-alert--warning" role="alert">{{ partyNotice }}</div>

    <div v-if="context && !isAuthorized" class="cockpit-alert cockpit-alert--warning" role="alert">
      <span v-if="context.mode !== 'document_backed_v1'">Quy trình chứng từ chưa được bật; không hỗ trợ lập đề nghị chi theo hồ sơ chứng từ gốc.</span>
      <span v-else-if="context.operationalState === 'completed'">Dự án đã kết thúc, không thể lập thêm đề nghị khoản chi mới.</span>
      <span v-else-if="!context.canSubmit">Bạn chưa được cấp quyền gửi duyệt đề nghị chi trong dự án này.</span>
      <span v-else>Dự án hiện không ở trạng thái sẵn sàng để tạo đề nghị chi.</span>
    </div>

    <details v-if="isAuthorized && context && !loading" class="cockpit-card">
      <summary>Hợp đồng hoặc báo giá dùng chung hạn mức</summary>
      <CostContractBasisPanel :key="getFingerprint()" :company-id="companyId" :project-id="pId" :context="context" :parties="parties" :contracts="contracts" @changed="loadData"/>
    </details>

    <CostRequestReviewPanel
      v-if="isAuthorized && context && pId && companyId && !loading" :key="getFingerprint()"
      :company-id="companyId"
      :project-id="pId"
      :context="context"
      :parties="parties"
      :categories="categories"
      :contracts="contracts"
      @submitted="onSubmitted"
      @cancel="onCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { workflowUuidSchema, type WorkflowProjectContext, type WorkflowPartyOption, type WorkflowContractView } from '../../../../../shared/schemas/costs/cost-workflow'
import type { CostWorkflowRepository } from '../../../../repositories/cost-workflow.contracts'
import { createAsyncRequestTracker } from '../../../../utils/costs/async-request-tracker'
import CostContractBasisPanel from '../../../../components/costs/CostContractBasisPanel.vue'
import CostRequestReviewPanel from '../../../../components/costs/CostRequestReviewPanel.vue'

definePageMeta({ requiredPermission: 'cost.request.submit' })


const route = useRoute()
const repo: CostWorkflowRepository = useRepositories().costWorkflow
const store = useNuxtApp().$companyAccessStore

const pId = computed(() => {
  const p = route.params.projectId
  const str = Array.isArray(p) ? (p[0] ?? '') : String(p || '')
  return workflowUuidSchema.safeParse(str).success ? str : ''
})

const companyId = computed(() => store?.activeCompanyId || '')

const context = ref<WorkflowProjectContext | null>(null)
const parties = ref<WorkflowPartyOption[]>([])
const categories = ref<Array<{ id: string; name: string }>>([])
const contracts = ref<WorkflowContractView[]>([])
const loading = ref(false)
const errorMessage = ref('')
const partyNotice = ref('')

const tracker = createAsyncRequestTracker<{ companyId: string; projectId: string; fp: string }>()

function getFingerprint(): string {
  const perms = store?.permissions ? [...store.permissions].sort().join(',') : ''
  return `${companyId.value}::${pId.value}::${perms}`
}

const isAuthorized = computed(() => {
  if (!context.value) return false
  return (
    context.value.mode === 'document_backed_v1' &&
    context.value.canSubmit &&
    context.value.operationalState === 'active'
  )
})

function clearData() {
  tracker.invalidate()
  context.value = null
  parties.value = []
  categories.value = []
  contracts.value = []
  errorMessage.value = ''
  partyNotice.value = '';loading.value=false
}

watch([pId, companyId, () => getFingerprint()], () => {
  clearData()
  void loadData()
}, {immediate:true,flush:'sync'})

onUnmounted(() => {
  tracker.invalidate()
})

async function loadData() {
  if (!pId.value || !companyId.value) {
    errorMessage.value = 'Mã dự án hoặc phiên công ty không hợp lệ.'
    return
  }

  const capturedFp = getFingerprint()
  const capturedComp = companyId.value
  const capturedProj = pId.value
  const token = tracker.start({ companyId: capturedComp, projectId: capturedProj, fp: capturedFp })
  loading.value = true

  try {
    const ctx = await repo.readProjectContext(capturedProj)
    if (!token.isCurrent() || getFingerprint() !== capturedFp) return
    context.value = ctx

    if (ctx.mode !== 'document_backed_v1' || !ctx.canSubmit || ctx.operationalState !== 'active') {
      return
    }

    const hasPartyRead = store.hasPermission('cost.party.read')
    const partyPromise = hasPartyRead ? repo.listParties(capturedProj) : Promise.resolve([])

    const [partyList, contractList, cash] = await Promise.all([
      partyPromise,
      repo.listContracts(capturedProj),
      repo.readCash(capturedProj),
    ])

    if (!token.isCurrent() || getFingerprint() !== capturedFp) return

    parties.value = partyList
    if (!hasPartyRead) {
      partyNotice.value = 'Cần quyền xem danh sách đối tác để chọn đơn vị nhận khoản chi.'
    }

    contracts.value = contractList

    if (cash && Array.isArray(cash.categories)) {
      categories.value = cash.categories.flatMap(c => c.categoryId ? [{id:c.categoryId,name:c.name}] : [])
    } else {
      categories.value = []
    }
  } catch {
    if (token.isCurrent() && getFingerprint() === capturedFp) {
      errorMessage.value = 'Không thể tải dữ liệu khởi tạo đề nghị. Kiểm tra quyền truy cập hoặc thử lại.'
    }
  } finally {
    if (token.isCurrent() && getFingerprint() === capturedFp) {
      loading.value = false
    }
  }
}


async function onSubmitted(requestId: string) {
  if (isAuthorized.value && tracker.identity?.fp===getFingerprint() && workflowUuidSchema.safeParse(requestId).success) {
    await navigateTo(`/costs/${pId.value}/requests/${requestId}`)
  }
}

async function onCancel() {
  if (pId.value) {
    await navigateTo(`/costs/${pId.value}/requests`)
  }
}
</script>

<style scoped>
.cockpit-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.page-header { display: flex; flex-direction: column; gap: 4px; }
.back-link { font-size: 13px; color: #2563eb; text-decoration: none; }
.back-link:hover { text-decoration: underline; }
.cockpit-alert { padding: 8px 12px; border-radius: 6px; font-size: 13px; }
.cockpit-alert--info { background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
.cockpit-alert--warning { background-color: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.cockpit-alert--danger { background-color: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
</style>