<script setup lang="ts">
import { ClientError } from '../../errors/client-error'

definePageMeta({ requiredPermission: 'cost.source.read' })

const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const overview = ref<Awaited<ReturnType<typeof repositories.costSourceRead.overview>> | null>(null)
const status = ref<'loading' | 'ready' | 'module' | 'permission' | 'empty' | 'error'>('loading')
let request = 0

async function load() {
  const current = ++request
  status.value = 'loading'
  try {
    const value = await repositories.costSourceRead.overview()
    if (current !== request) return
    overview.value = value
    status.value = value.projects.length || value.unassigned.figureCount ? 'ready' : 'empty'
  }
  catch (error) {
    if (current !== request) return
    status.value = error instanceof ClientError && error.reason === 'MODULE_DISABLED' ? 'module'
      : error instanceof ClientError && error.code === 'PERMISSION_DENIED' ? 'permission' : 'error'
  }
}

watch(() => companyAccess.activeCompanyId, load, { immediate: true })

function statusLabel(value: string) {
  return value === 'pending' ? 'Cần đối chiếu' : value === 'reference_only' ? 'Chỉ tham khảo' : value === 'excluded' ? 'Loại khỏi chuẩn hóa' : 'Đã gắn nguồn'
}
</script>

<template>
  <section class="cost-page" data-testid="costs-overview">
    <header class="cost-heading glass-panel">
      <div>
        <p class="eyebrow">Cost source · Read only</p>
        <h1>Dữ liệu nguồn chi phí</h1>
        <p>Số liệu từ hồ sơ kế toán — chưa xác nhận tài chính</p>
      </div>
      <UIcon name="i-lucide-shield-alert" aria-hidden="true" />
    </header>

    <div v-if="status === 'loading'" class="state-panel" aria-live="polite">Đang tải dữ liệu nguồn…</div>
    <div v-else-if="status === 'module'" class="state-panel"><UIcon name="i-lucide-toggle-left" aria-hidden="true" /><h2>Chưa bật dữ liệu nguồn</h2><p>Module nguồn chi phí chưa được bật cho công ty này.</p></div>
    <div v-else-if="status === 'permission'" class="state-panel"><UIcon name="i-lucide-lock-keyhole" aria-hidden="true" /><h2>Không có quyền truy cập</h2><p>Bạn cần quyền đọc và chuẩn bị nguồn chi phí để xem dữ liệu này.</p></div>
    <div v-else-if="status === 'empty'" class="state-panel"><UIcon name="i-lucide-inbox" aria-hidden="true" /><h2>Chưa có dữ liệu nguồn</h2><p>Dữ liệu sẽ xuất hiện tại đây khi nguồn đã được lưu cho công ty.</p></div>
    <div v-else-if="status === 'error'" class="state-panel"><UIcon name="i-lucide-circle-alert" aria-hidden="true" /><h2>Không thể tải dữ liệu</h2><button type="button" @click="load">Thử lại</button></div>

    <template v-else-if="overview">
      <div class="summary-strip" aria-label="Tổng quan nguồn chi phí">
        <span><strong>{{ overview.sourceCount }}</strong>Nguồn</span><span><strong>{{ overview.figureCount }}</strong>Số liệu</span><span><strong>{{ overview.openIssueCount }}</strong>Vấn đề mở</span>
      </div>
      <div class="project-grid">
        <NuxtLink v-for="project in overview.projects" :key="project.project.id" :to="`/costs/projects/${project.project.id}`" class="project-card">
          <span class="status-chip" :data-state="project.mappingState">{{ statusLabel(project.mappingState) }}</span>
          <h2>{{ project.project.name }}</h2>
          <dl><div><dt>Nguồn</dt><dd>{{ project.sourceCount }}</dd></div><div><dt>Số liệu</dt><dd>{{ project.figureCount }}</dd></div><div><dt>Cần đối chiếu</dt><dd>{{ project.openIssueCount }}</dd></div></dl>
          <small>{{ project.latestObservedAt ? new Date(project.latestObservedAt).toLocaleDateString('vi-VN') : 'Chưa xác định ngày nguồn' }}</small>
        </NuxtLink>
        <article v-if="overview.unassigned.figureCount" class="project-card project-card--unassigned"><span class="status-chip" data-state="pending">Chưa xác định</span><h2>Chưa xác định dự án</h2><p>{{ overview.unassigned.figureCount }} số liệu nguồn chưa được gắn vào dự án.</p></article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.cost-page { max-width: 1260px; margin: 0 auto; padding-bottom: 32px; }.glass-panel { border: 1px solid rgb(255 255 255 / 58%); background: linear-gradient(120deg, rgb(255 255 255 / 78%), rgb(236 238 255 / 58%)); box-shadow: 0 18px 40px rgb(44 54 112 / 13%), inset 0 1px rgb(255 255 255 / 65%); backdrop-filter: blur(14px); }.cost-heading { display: flex; justify-content: space-between; gap: 24px; padding: clamp(22px, 4vw, 42px); border-radius: 22px; }.cost-heading h1 { margin-top: 6px; color: #18234e; font-size: clamp(2rem, 5vw, 3.2rem); }.cost-heading p:not(.eyebrow) { margin-top: 10px; color: #4a5275; }.cost-heading :deep(svg) { width: 46px; height: 46px; color: #5356b8; }.state-panel { display: grid; justify-items: start; gap: 8px; margin-top: 18px; padding: 28px; border: 1px solid #dbe0ed; border-radius: 18px; background: #fff; color: #313954; }.state-panel h2 { font-size: 1.1rem; }.state-panel button { min-height: 44px; padding: 0 14px; border-radius: 10px; background: #343b8e; color: #fff; }.summary-strip { display: flex; flex-wrap: wrap; gap: 1px; margin: 18px 0; overflow: hidden; border: 1px solid #dce1f0; border-radius: 15px; background: #dce1f0; }.summary-strip span { display: grid; flex: 1 1 130px; gap: 2px; padding: 13px 16px; background: rgb(255 255 255 / 88%); color: #66708d; font-size: .75rem; }.summary-strip strong { color: #222953; font-family: 'Space Grotesk Variable', sans-serif; font-size: 1.35rem; }.project-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }.project-card { display: grid; gap: 13px; min-height: 210px; padding: 22px; border: 1px solid rgb(255 255 255 / 55%); border-radius: 18px; background: linear-gradient(145deg, rgb(255 255 255 / 82%), rgb(240 242 255 / 60%)); box-shadow: 0 12px 28px rgb(47 54 110 / 9%); color: #242a51; }.project-card:hover { border-color: #9fa9ed; transform: translateY(-2px); }.project-card h2 { font-size: 1.2rem; }.project-card dl { display: flex; gap: 20px; }.project-card dt { color: #6d7592; font-size: .68rem; text-transform: uppercase; }.project-card dd { margin-top: 3px; font-weight: 750; }.project-card small, .project-card p { color: #69718b; }.project-card--unassigned { cursor: default; }.status-chip { width: max-content; padding: 4px 8px; border-radius: 999px; background: #e5e7eb; color: #334155; font-size: .72rem; font-weight: 750; }.status-chip[data-state='pending'] { background: #fff0c7; color: #805c00; }.status-chip[data-state='reference_only'] { background: #dceafe; color: #285890; }.status-chip[data-state='excluded'] { background: #f2dce7; color: #7d3658; }@media (max-width: 700px) { .project-grid { grid-template-columns: 1fr; }.cost-heading { align-items: start; }.cost-heading :deep(svg) { width: 34px; height: 34px; } }@media (prefers-reduced-motion: reduce) { .project-card:hover { transform: none; } }@supports not (backdrop-filter: blur(1px)) { .glass-panel, .project-card { background: #f8f9ff; } }
</style>
