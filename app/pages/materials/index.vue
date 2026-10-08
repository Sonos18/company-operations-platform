<template>
  <div class="cockpit-page">
    <div class="page-header cockpit-card">
      <div class="header-main">
        <div class="header-title-row">
          <h2>Yêu cầu vật tư · Danh sách công trình</h2>
          <span class="cockpit-badge cockpit-badge--neutral">Vật tư chuẩn</span>
        </div>
        <p class="subtitle">
          Quản lý danh mục vật tư chuẩn nội bộ công ty và lập phiếu yêu cầu vật tư theo từng công trình.
        </p>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="cockpit-btn cockpit-btn--secondary"
          @click="showMasterPanel = true"
        >
          <UIcon name="i-lucide-layers" aria-hidden="true" />
          Danh mục vật tư chuẩn
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="errorMessage" class="cockpit-alert cockpit-alert--danger" role="alert">
      {{ errorMessage }}
    </div>

    <!-- Search and Stats Bar -->
    <div class="cockpit-card filter-card">
      <div class="filter-row">
        <input
          v-model="searchQuery"
          type="search"
          class="cockpit-input search-input"
          placeholder="Tìm kiếm công trình theo mã hoặc tên..."
          aria-label="Tìm kiếm công trình"
        >
        <div class="filter-stats">
          <span>Tổng số: <strong>{{ filteredProjects.length }}</strong> công trình</span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="cockpit-card loading-card">
      <p>Đang tải danh sách công trình...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredProjects.length === 0" class="cockpit-card empty-card">
      <p>{{ searchQuery ? 'Không tìm thấy công trình nào khớp với từ khóa tìm kiếm.' : 'Chưa có công trình nào khả dụng cho công ty này.' }}</p>
    </div>

    <!-- Projects Grid -->
    <div v-else class="projects-grid">
      <div
        v-for="p in filteredProjects"
        :key="p.projectId"
        class="cockpit-card project-card"
      >
        <div class="project-card-header">
          <span class="cockpit-badge cockpit-badge--code font-mono">{{ p.code }}</span>
        </div>
        <h3 class="project-name">{{ p.name }}</h3>
        <p class="project-location text-muted">
          <UIcon name="i-lucide-map-pin" class="inline-icon" aria-hidden="true" />
          {{ p.locationText || 'Chưa thiết lập địa chỉ công trình' }}
        </p>
        <div class="project-card-actions">
          <NuxtLink
            :to="`/materials/${p.projectId}/proposals`"
            class="cockpit-btn cockpit-btn--secondary link-full"
          >
            Xem phiếu yêu cầu
            <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
          </NuxtLink>
          <NuxtLink
            v-if="canSubmit"
            :to="`/materials/${p.projectId}/proposals/new`"
            class="cockpit-btn cockpit-btn--primary"
            title="Tạo phiếu yêu cầu vật tư mới"
          >
            <UIcon name="i-lucide-plus" aria-hidden="true" />
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Material Master Modal -->
    <MaterialMasterPanel v-model:open="showMasterPanel" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { MaterialProjectOption } from '../../../shared/schemas/costs/material-procurement'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import MaterialMasterPanel from '../../components/materials/MaterialMasterPanel.vue'

definePageMeta({ requiredPermission: 'material.read' })

const repositories = useRepositories()
const repo = repositories.materialProcurement
const companyAccess = useNuxtApp().$companyAccessStore

const canSubmit = computed(() => Boolean(companyAccess?.hasPermission('material.proposal.submit')))

const projects = ref<MaterialProjectOption[]>([])
const isLoading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')
const showMasterPanel = ref(false)

const tracker = createAsyncRequestTracker<{ companyId: string }>()

const filteredProjects = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return projects.value
  return projects.value.filter(p =>
    p.code.toLowerCase().includes(query) ||
    p.name.toLowerCase().includes(query) ||
    (p.locationText && p.locationText.toLowerCase().includes(query))
  )
})

async function loadProjects() {
  const activeCompanyId = companyAccess?.activeCompanyId
  if (!activeCompanyId) {
    projects.value = []
    isLoading.value = false
    return
  }

  const token = tracker.start({ companyId: activeCompanyId })
  isLoading.value = true
  errorMessage.value = ''

  try {
    const list = await repo.listProjects()
    if (!token.isCurrent()) return
    projects.value = list
  } catch (err: unknown) {
    if (!token.isCurrent()) return
    errorMessage.value = err instanceof Error ? err.message : 'Không thể tải danh sách công trình.'
  } finally {
    if (token.isCurrent()) {
      isLoading.value = false
    }
  }
}

watch(() => companyAccess?.activeCompanyId, () => {
  tracker.invalidate()
  projects.value = []
  void loadProjects()
})

onMounted(() => {
  void loadProjects()
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
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
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
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-card {
  padding: 14px 20px;
}
.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.search-input {
  max-width: 380px;
}
.filter-stats {
  font-size: 0.85rem;
  color: var(--ink-muted, #64748b);
}
.cockpit-alert--danger {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
}
.loading-card,
.empty-card {
  padding: 40px 20px;
  text-align: center;
  color: var(--ink-muted, #64748b);
  font-size: 0.95rem;
}
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.project-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--line, #e2e8f0);
  border-radius: 8px;
  background: #ffffff;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.project-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
.project-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--forest, #0f172a);
  margin: 0;
}
.project-location {
  font-size: 0.82rem;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.inline-icon {
  font-size: 0.95rem;
  color: var(--ink-muted, #64748b);
  flex-shrink: 0;
}
.project-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line, #f1f5f9);
}
.link-full {
  flex: 1;
  justify-content: center;
}
.cockpit-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line, #cbd5e1);
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
  transition: background 0.15s ease;
}
.cockpit-btn--primary {
  background: #0284c7;
  color: #ffffff;
  border: none;
}
.cockpit-btn--primary:hover {
  background: #0369a1;
}
.cockpit-btn--secondary {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}
.cockpit-btn--secondary:hover {
  background: #e2e8f0;
}
.cockpit-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.cockpit-badge--neutral {
  background: #f1f5f9;
  color: #475569;
}
.cockpit-badge--code {
  background: #e0f2fe;
  color: #0369a1;
}
.font-mono {
  font-family: monospace;
}
.text-muted {
  color: var(--ink-muted, #64748b);
}
@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }
  .search-input {
    max-width: 100%;
  }
}
</style>
