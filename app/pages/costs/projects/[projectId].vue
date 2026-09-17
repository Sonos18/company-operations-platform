<script setup lang="ts">
import { ClientError } from '../../../errors/client-error'

definePageMeta({ requiredPermission: 'cost.source.read' })

const route = useRoute()
const repositories = useRepositories()
const companyAccess = useNuxtApp().$companyAccessStore
const detail = ref<Awaited<ReturnType<typeof repositories.costSourceRead.project>> | null>(null)
const figures = ref<Awaited<ReturnType<typeof repositories.costSourceRead.figures>>['items']>([])
const nextCursor = ref<string | null>(null)
const status = ref<'loading' | 'ready' | 'module' | 'permission' | 'empty' | 'error'>('loading')
const errorCode = ref('')
const search = ref('')
const mappingState = ref('')
const provenance = ref<Awaited<ReturnType<typeof repositories.costSourceRead.provenance>> | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
let request = 0
let opener: HTMLElement | null = null
const projectId = computed(() => String(route.params.projectId ?? ''))

function stateLabel(value: string) { return value === 'pending' ? 'Cần đối chiếu' : value === 'reference_only' ? 'Chỉ tham khảo' : value === 'excluded' ? 'Loại khỏi chuẩn hóa' : 'Đã gắn nguồn' }
function confirmationLabel(value: string) { return value === 'unverified' ? 'Chưa xác nhận' : value === 'disputed' ? 'Cần đối chiếu' : 'Đã xác nhận ngoài hệ thống' }
function amount(value: string | null, currency: string | null) { return value === null ? 'Chưa xác định' : `${value}${currency ? ` ${currency}` : ' · Chưa xác định'}` }
async function load(cursor?: string) {
  const current = ++request
  status.value = 'loading'
  try {
    const [project, page] = await Promise.all([
      repositories.costSourceRead.project(projectId.value),
      repositories.costSourceRead.figures(projectId.value, { limit: 25, cursor, search: search.value || undefined, mappingState: mappingState.value ? mappingState.value as 'confirmed' | 'pending' | 'reference_only' | 'excluded' : undefined }),
    ])
    if (current !== request) return
    detail.value = project; figures.value = page.items; nextCursor.value = page.nextCursor; errorCode.value = ''; status.value = page.items.length ? 'ready' : 'empty'
  }
  catch (error) {
    if (current !== request) return
    errorCode.value = error instanceof ClientError ? error.code : error instanceof Error ? error.name : 'UNKNOWN'
    status.value = error instanceof ClientError && error.reason === 'MODULE_DISABLED' ? 'module' : error instanceof ClientError && error.code === 'PERMISSION_DENIED' ? 'permission' : 'error'
  }
}
async function openProvenance(figureId: string, event: Event) { opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null; provenance.value = await repositories.costSourceRead.provenance(figureId); await nextTick(); dialog.value?.showModal() }
function closeProvenance() { dialog.value?.close() }
function onDialogClose() { opener?.focus(); opener = null }
watch([projectId, () => companyAccess.activeCompanyId], () => load(), { immediate: true })
</script>

<template>
  <section class="cost-detail" data-testid="cost-project-detail">
    <NuxtLink class="back-link" to="/costs/sources"><UIcon name="i-lucide-arrow-left" aria-hidden="true" /> Dữ liệu nguồn chi phí</NuxtLink>
    <header class="detail-heading glass-panel"><div><p class="eyebrow">Project · source view</p><h1>{{ detail?.project?.name ?? 'Dữ liệu nguồn của dự án' }}</h1><p>Số liệu từ hồ sơ kế toán — chưa xác nhận tài chính</p></div><span v-if="detail" class="issue-count">{{ detail.engagements.length }} liên kết nhà thầu</span></header>
    <div v-if="status === 'loading'" class="state-panel" aria-live="polite">Đang tải dữ liệu nguồn…</div>
    <div v-else-if="status === 'module'" class="state-panel"><h2>Chưa bật dữ liệu nguồn</h2><p>Module nguồn chi phí chưa được bật cho công ty này.</p></div>
    <div v-else-if="status === 'permission'" class="state-panel"><h2>Không có quyền truy cập</h2><p>Bạn cần quyền đọc và chuẩn bị nguồn chi phí để xem dữ liệu này.</p></div>
    <div v-else-if="status === 'error'" class="state-panel" :data-error-code="errorCode"><h2>Không thể tải dữ liệu</h2><button type="button" @click="load()">Thử lại</button></div>
    <template v-else>
      <section v-if="detail?.engagements.length" class="hierarchy glass-panel" aria-label="Liên kết nhà thầu">
        <h2>Nhà thầu / hồ sơ liên kết</h2><div v-for="item in detail.engagements" :key="item.engagement.id" class="engagement"><UIcon name="i-lucide-git-branch" aria-hidden="true" /><div><strong>{{ item.contractor?.displayName ?? 'Nhà thầu chưa xác định' }}</strong><span>{{ item.engagement.name }} · {{ item.figureCount }} số liệu</span></div></div>
      </section>
      <form class="filters" @submit.prevent="load()"><label>Tìm nội dung<input v-model.trim="search" type="search" placeholder="Nội dung hoặc nguồn"></label><label>Trạng thái<select v-model="mappingState"><option value="">Tất cả</option><option value="pending">Cần đối chiếu</option><option value="reference_only">Chỉ tham khảo</option><option value="excluded">Loại khỏi chuẩn hóa</option><option value="confirmed">Đã gắn nguồn</option></select></label><button type="submit">Lọc</button></form>
      <div v-if="status === 'empty'" class="state-panel"><h2>Chưa có dữ liệu nguồn</h2><p>Không có số liệu phù hợp với bộ lọc hiện tại.</p></div>
      <div v-else class="table-wrap" tabindex="0" aria-label="Bảng số liệu nguồn chi phí"><table><thead><tr><th>Nội dung</th><th class="numeric">Giá trị nguồn</th><th>Trạng thái</th><th>Phạm vi</th><th>Nguồn</th><th>Vị trí</th><th>Đối chiếu</th></tr></thead><tbody><tr v-for="item in figures" :key="item.id"><td><button type="button" class="detail-button" @click="openProvenance(item.id, $event)">{{ item.label }}</button></td><td class="numeric amount">{{ amount(item.amountText, item.currencyCode) }}</td><td><span class="badge" :data-state="item.mapping.state">{{ stateLabel(item.mapping.state) }}</span></td><td>{{ item.scopeDescription }}</td><td>{{ item.source.title }}</td><td>{{ item.locator.kind === 'cell_range' ? `${item.locator.sheetName}!${item.locator.range}` : item.locator.kind === 'logical_section' ? item.locator.section : 'Toàn bộ tệp' }}</td><td><span class="badge badge--confirmation">{{ confirmationLabel(item.confirmation) }}</span></td></tr></tbody></table></div>
      <button v-if="nextCursor" class="more" type="button" @click="load(nextCursor)">Tải trang tiếp theo</button>
    </template>
    <dialog ref="dialog" class="provenance-dialog" aria-labelledby="provenance-title" @close="onDialogClose"><div v-if="provenance" class="provenance"><header><h2 id="provenance-title">Nguồn gốc số liệu</h2><button type="button" aria-label="Đóng nguồn gốc số liệu" @click="closeProvenance"><UIcon name="i-lucide-x" /></button></header><dl><div><dt>Nguồn</dt><dd>{{ provenance.figure.source.title }}</dd></div><div><dt>Phiên bản nguồn</dt><dd>{{ provenance.figure.version.versionNo }}</dd></div><div><dt>Tệp gốc</dt><dd>{{ provenance.originalFilename }}</dd></div><div><dt>Vị trí</dt><dd>{{ provenance.figure.locator.kind === 'cell_range' ? `${provenance.figure.locator.sheetName}!${provenance.figure.locator.range}` : provenance.figure.locator.kind === 'logical_section' ? provenance.figure.locator.section : 'Toàn bộ tệp' }}</dd></div><div><dt>Giá trị gốc</dt><dd>{{ provenance.figure.rawValueText }}</dd></div><div><dt>Giá trị nhận diện</dt><dd>{{ amount(provenance.figure.amountText, provenance.figure.currencyCode) }}</dd></div><div><dt>Cơ sở / phạm vi</dt><dd>{{ provenance.figure.basis }} · {{ provenance.figure.scopeDescription }}</dd></div><div><dt>Trạng thái</dt><dd>{{ stateLabel(provenance.figure.mapping.state) }} · {{ confirmationLabel(provenance.figure.confirmation) }}</dd></div></dl><section v-if="provenance.openIssues.length"><h3>Vấn đề cần đối chiếu</h3><ul><li v-for="issue in provenance.openIssues" :key="issue.description">{{ issue.description }}</li></ul></section></div></dialog>
  </section>
</template>

<style scoped>
.cost-detail { max-width: 1320px; margin: 0 auto; }.back-link { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; color: #3c468e; font-weight: 700; }.detail-heading, .hierarchy { border: 1px solid rgb(255 255 255 / 58%); background: linear-gradient(120deg, rgb(255 255 255 / 79%), rgb(235 239 255 / 62%)); box-shadow: 0 18px 40px rgb(44 54 112 / 12%), inset 0 1px rgb(255 255 255 / 65%); backdrop-filter: blur(14px); }.detail-heading { display: flex; justify-content: space-between; gap: 20px; padding: clamp(20px, 4vw, 36px); border-radius: 22px; }.detail-heading h1 { margin-top: 6px; color: #1c2551; font-size: clamp(1.8rem, 4vw, 2.8rem); }.detail-heading p:not(.eyebrow) { margin-top: 10px; color: #59617c; }.issue-count { align-self: start; padding: 7px 10px; border-radius: 999px; background: #e2e7ff; color: #323b88; font-size: .76rem; font-weight: 750; }.state-panel { display: grid; gap: 8px; margin-top: 18px; padding: 26px; border: 1px solid #dce1ef; border-radius: 18px; background: #fff; color: #343b58; }.state-panel h2 { font-size: 1.1rem; }.state-panel button, .filters button, .more { min-height: 44px; width: max-content; padding: 0 14px; border-radius: 10px; background: #353d90; color: #fff; font-weight: 700; }.hierarchy { display: grid; gap: 10px; margin-top: 16px; padding: 18px; border-radius: 18px; }.hierarchy h2 { color: #2e3765; font-size: 1rem; }.engagement { display: flex; align-items: start; gap: 10px; padding: 10px; border-left: 2px solid #7276cf; background: rgb(255 255 255 / 48%); }.engagement div { display: grid; gap: 2px; }.engagement span { color: #66708d; font-size: .82rem; }.filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 18px 0 12px; }.filters label { display: grid; gap: 5px; color: #4e5879; font-size: .76rem; font-weight: 700; }.filters input, .filters select { min-height: 42px; min-width: 180px; padding: 0 10px; border: 1px solid #cbd2e4; border-radius: 9px; background: #fff; color: #20284a; }.table-wrap { overflow-x: auto; border: 1px solid #d7ddeb; border-radius: 15px; background: #fff; outline-offset: 3px; }table { width: 100%; min-width: 920px; border-collapse: collapse; color: #283050; }th, td { padding: 13px 14px; border-bottom: 1px solid #e4e7f0; text-align: left; vertical-align: top; font-size: .83rem; }th { background: #f3f5fb; color: #59627e; font-size: .72rem; text-transform: uppercase; }tbody tr:hover { background: #f8f9ff; }.numeric { text-align: right; }.amount { font-family: 'JetBrains Mono Variable', monospace; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }.detail-button { color: #303a90; text-align: left; text-decoration: underline; text-underline-offset: 3px; font-weight: 750; }.badge { display: inline-block; padding: 4px 7px; border-radius: 999px; background: #e8ebef; color: #34404f; font-size: .7rem; font-weight: 700; white-space: nowrap; }.badge[data-state='pending'] { background: #fff0c7; color: #805c00; }.badge[data-state='reference_only'] { background: #dceafe; color: #285890; }.badge[data-state='excluded'] { background: #f2dce7; color: #7d3658; }.badge--confirmation { background: #e7e4ff; color: #514a98; }.more { margin-top: 12px; }.provenance-dialog { width: min(540px, calc(100vw - 24px)); max-height: min(760px, calc(100vh - 24px)); padding: 0; border: 0; border-radius: 18px; color: #262e50; box-shadow: 0 20px 70px rgb(15 23 60 / 35%); }.provenance-dialog::backdrop { background: rgb(18 27 62 / 42%); backdrop-filter: blur(3px); }.provenance { padding: 22px; background: #fff; }.provenance header { display: flex; justify-content: space-between; gap: 12px; }.provenance header button { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 8px; }.provenance dl { display: grid; gap: 10px; margin-top: 16px; }.provenance dl div { display: grid; gap: 2px; padding-bottom: 9px; border-bottom: 1px solid #e4e7f0; }.provenance dt { color: #69728e; font-size: .72rem; font-weight: 700; text-transform: uppercase; }.provenance dd { margin: 0; overflow-wrap: anywhere; }.provenance h3 { margin-top: 16px; font-size: .9rem; }.provenance ul { margin: 8px 0 0; padding-left: 18px; }@media (max-width: 700px) { .detail-heading { display: block; }.issue-count { display: inline-block; margin-top: 12px; }.filters label, .filters input, .filters select { width: 100%; }.filters { display: grid; }.filters button { width: 100%; }.provenance-dialog { width: 100vw; max-height: 100vh; height: 100vh; border-radius: 0; } }@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }@supports not (backdrop-filter: blur(1px)) { .detail-heading, .hierarchy { background: #f8f9ff; } }
</style>
