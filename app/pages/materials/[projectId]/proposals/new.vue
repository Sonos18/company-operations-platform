<template>
  <div class="cockpit-page">
    <div class="page-header cockpit-card">
      <div class="header-main">
        <NuxtLink :to="`/materials/${pId}/proposals`" class="back-link">
          ← Quay lại danh sách phiếu yêu cầu
        </NuxtLink>
        <div class="header-title-row">
          <h2>Lập phiếu yêu cầu vật tư · {{ currentProject?.name || currentProject?.code || 'Công trình' }}</h2>
          <span v-if="currentProject?.code" class="cockpit-badge cockpit-badge--code font-mono">
            {{ currentProject.code }}
          </span>
        </div>
        <p class="subtitle">
          Lập danh mục vật tư chuẩn cần cấp cho công trường, lưu nháp hoặc gửi trực tiếp cho bộ phận mua hàng.
        </p>
      </div>
    </div>

    <!-- Permission Warning -->
    <div v-if="!canSubmit" class="cockpit-alert cockpit-alert--warning" role="alert">
      Bạn không có quyền lập phiếu yêu cầu vật tư (cần quyền <code>material.proposal.submit</code>).
    </div>

    <!-- Error Alert -->
    <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
      {{ errorMessage }}
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="cockpit-card loading-card">
      <p>Đang nạp ngữ cảnh công trình...</p>
    </div>

    <!-- Proposal Form -->
    <MaterialProposalForm
      v-else-if="canSubmit && currentProject"
      :project-id="pId"
      :initial-project="currentProject"
      @saved="onSaved"
      @submitted="onSubmitted"
      @cancel="onCancel"
      @dirty="isFormDirty = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { MaterialProjectOption, MaterialCommandResult } from '../../../../../shared/schemas/costs/material-procurement'
import { workflowUuidSchema } from '../../../../../shared/schemas/costs/cost-workflow'
import MaterialProposalForm from '../../../../components/materials/MaterialProposalForm.vue'

definePageMeta({ requiredPermission: 'material.read' })

const route = useRoute()
const repositories = useRepositories()
const repo = repositories.materialProcurement
const companyAccess = useNuxtApp().$companyAccessStore

const pId = computed(() => {
  const p = route.params.projectId
  const str = Array.isArray(p) ? (p[0] ?? '') : String(p || '')
  return workflowUuidSchema.safeParse(str).success ? str : ''
})

const canSubmit = computed(() => Boolean(companyAccess?.hasPermission('material.proposal.submit')))

const currentProject = ref<MaterialProjectOption | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const isFormDirty = ref(false)
const isSubmittedOrSaved = ref(false)

async function loadProject() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const list = await repo.listProjects()
    currentProject.value = list.find(p => p.projectId === pId.value) || null
    if (!currentProject.value) {
      errorMessage.value = 'Không tìm thấy thông tin công trình được chỉ định.'
    }
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Không thể tải thông tin công trình.'
  } finally {
    isLoading.value = false
  }
}

function onSaved(_result: MaterialCommandResult, proposalId: string) {
  isFormDirty.value = false
  isSubmittedOrSaved.value = true
  navigateTo(`/materials/${pId.value}/proposals/${proposalId}`)
}

function onSubmitted(_result: MaterialCommandResult, proposalId: string) {
  isFormDirty.value = false
  isSubmittedOrSaved.value = true
  navigateTo(`/materials/${pId.value}/proposals/${proposalId}`)
}

function onCancel() {
  navigateTo(`/materials/${pId.value}/proposals`)
}

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isFormDirty.value && !isSubmittedOrSaved.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onBeforeRouteLeave((_to, _from, next) => {
  if (isFormDirty.value && !isSubmittedOrSaved.value) {
    const confirmLeave = window.confirm('Bạn có thay đổi chưa lưu trên phiếu yêu cầu. Bạn có chắc chắn muốn rời đi?')
    if (confirmLeave) {
      next()
    } else {
      next(false)
    }
  } else {
    next()
  }
})

onMounted(() => {
  void loadProject()
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  }
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
.loading-card {
  padding: 40px 20px;
  text-align: center;
  color: var(--ink-muted, #64748b);
  font-size: 0.95rem;
}
.cockpit-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.cockpit-badge--code {
  background: #e0f2fe;
  color: #0369a1;
}
.font-mono {
  font-family: monospace;
}
</style>
