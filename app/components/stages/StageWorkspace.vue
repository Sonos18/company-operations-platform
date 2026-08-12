<script setup lang="ts">
import type { ProjectStage } from '../../features/journey/journey.types'
import type { ProjectMedia } from '../../features/media/media.types'
import type { ProjectDetail } from '../../features/projects/project.types'
import SiteVisualComparison from '../media/SiteVisualComparison.vue'

const props = defineProps<{
  project: ProjectDetail
  stage: ProjectStage
}>()

const repositories = useRepositories()
const media = ref<ProjectMedia[]>([])

watch(
  () => props.stage.id,
  async (stageId) => {
    media.value = props.stage.visualKind === 'construction_comparison'
      ? await repositories.media.listByStage(stageId)
      : []
  },
  { immediate: true },
)

const statusLabel: Record<ProjectStage['status'], string> = {
  completed: 'Đã hoàn thành',
  active: 'Đang thực hiện',
  upcoming: 'Sắp thực hiện',
  incomplete: 'Chưa đầy đủ',
  not_applicable: 'Không áp dụng',
}

const recordStatusLabel: Record<ProjectStage['records'][number]['status'], string> = {
  ready: 'Đã có',
  missing: 'Còn thiếu',
  draft: 'Bản nháp',
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function mediaType(mediaItem: ProjectMedia) {
  if (mediaItem.kind === 'evidence') return 'Ảnh hồ sơ — giữ bản gốc'
  if (mediaItem.kind === 'design_target') return 'Mục tiêu thiết kế đã chốt'
  return 'Ảnh tối ưu'
}
</script>

<template>
  <div class="stage-workspace">
    <nav class="breadcrumbs" aria-label="Điều hướng phân cấp">
      <NuxtLink to="/projects">Dự án</NuxtLink>
      <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
      <NuxtLink :to="`/projects/${project.id}`">{{ project.name }}</NuxtLink>
      <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
      <span>Giai đoạn {{ stage.code }}</span>
    </nav>

    <header class="stage-heading">
      <div>
        <p class="eyebrow">Giai đoạn {{ stage.code }} · {{ statusLabel[stage.status] }}</p>
        <h1>{{ stage.name }}</h1>
        <p class="stage-purpose">{{ stage.purpose }}</p>
      </div>
      <div class="stage-owner">
        <span>Phòng ban phụ trách</span>
        <strong>{{ stage.ownerDepartment }}</strong>
        <small>Quy trình v{{ project.workflowSnapshot.version }}</small>
      </div>
    </header>

    <section class="advisory-banner" aria-label="Chế độ quy trình">
      <UIcon name="i-lucide-info" aria-hidden="true" />
      <div>
        <strong>Điều kiện hướng dẫn — không khóa giai đoạn</strong>
        <p>{{ project.workflowSnapshot.applicabilityNote }}</p>
      </div>
    </section>

    <div class="workspace-grid">
      <section class="workspace-panel steps-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">Tiến trình</p><h2>Các bước trong giai đoạn</h2></div>
          <strong>{{ stage.completedCount }}/{{ stage.totalCount }}</strong>
        </div>
        <ol class="step-list">
          <li v-for="step in stage.subStages" :key="step.id" :class="`is-${step.status}`">
            <span class="step-state"><UIcon :name="step.status === 'completed' ? 'i-lucide-check' : 'i-lucide-circle'" aria-hidden="true" /></span>
            <div><small>{{ step.code }}</small><strong>{{ step.name }}</strong><span>{{ step.ownerName }}</span></div>
          </li>
        </ol>
      </section>

      <section class="workspace-panel records-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">Hồ sơ</p><h2>Form và tài liệu cần có</h2></div>
          <span v-if="stage.missingRecordCount" class="missing-badge">{{ stage.missingRecordCount }} còn thiếu</span>
        </div>
        <ul class="record-list">
          <li v-for="record in stage.records" :key="record.id">
            <UIcon :name="record.kind === 'evidence' ? 'i-lucide-image' : 'i-lucide-file-text'" aria-hidden="true" />
            <span><strong>{{ record.label }}</strong><small>{{ record.kind }}</small></span>
            <em :class="`is-${record.status}`">{{ recordStatusLabel[record.status] }}</em>
          </li>
        </ul>
      </section>

      <section class="workspace-panel related-panel">
        <p class="eyebrow">Nội dung liên quan</p>
        <h2>{{ stage.visualKind === 'drawing' ? 'Bản vẽ và phương án' : stage.visualKind === 'construction_comparison' ? 'Hiện trạng và mục tiêu' : 'Hồ sơ giai đoạn' }}</h2>
        <SiteVisualComparison v-if="stage.visualKind === 'construction_comparison'" :media="media" />
        <img v-else :src="stage.imageUrl" :alt="`Minh họa ${stage.name}`">
        <NuxtLink v-if="stage.visualKind === 'drawing'" :to="`/projects/${project.id}/stages/${stage.id}/drawings`" class="primary-link">
          Mở bản vẽ <UIcon name="i-lucide-arrow-up-right" aria-hidden="true" />
        </NuxtLink>
        <a v-else-if="stage.visualKind === 'construction_comparison'" href="#media-history" class="primary-link">
          Xem hiện trạng công trình <UIcon name="i-lucide-arrow-up-right" aria-hidden="true" />
        </a>
        <p v-else class="related-note">Tài liệu của giai đoạn được tập hợp tại đây để truy xuất thống nhất.</p>
      </section>

      <section class="workspace-panel activity-panel">
        <div class="panel-heading"><div><p class="eyebrow">Nhật ký</p><h2>Lịch sử hoạt động</h2></div></div>
        <ol class="activity-list">
          <li v-for="activity in stage.activities" :key="activity.id">
            <span aria-hidden="true" />
            <div><strong>{{ activity.actorName }}</strong><p>{{ activity.description }}</p><time :datetime="activity.at">{{ formatTime(activity.at) }}</time></div>
          </li>
        </ol>
      </section>

      <section v-if="stage.visualKind === 'construction_comparison'" id="media-history" class="workspace-panel media-history-panel">
        <div class="panel-heading"><div><p class="eyebrow">Ảnh theo thời gian</p><h2>Toàn bộ lịch sử hiện trạng</h2></div><span>{{ media.length }} ảnh</span></div>
        <div class="media-grid">
          <article v-for="mediaItem in media" :key="mediaItem.id">
            <img :src="mediaItem.url" :alt="mediaItem.description">
            <div><span>{{ mediaType(mediaItem) }}</span><strong>{{ mediaItem.description }}</strong><p>{{ mediaItem.workArea }}</p><small>{{ mediaItem.photographerName }} · {{ formatTime(mediaItem.capturedAt) }}</small></div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.stage-workspace { display: grid; gap: 18px; max-width: 1480px; margin: 0 auto; }
.breadcrumbs { display: flex; align-items: center; gap: 6px; color: var(--ink-muted); font-size: .72rem; }.breadcrumbs a:hover { color: var(--forest); }
.stage-heading { display: flex; align-items: end; justify-content: space-between; gap: 32px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }.stage-heading h1 { max-width: 820px; margin-top: 6px; font-size: clamp(2rem, 4vw, 4rem); line-height: .98; }.stage-purpose { max-width: 680px; margin-top: 12px; color: var(--ink-muted); line-height: 1.55; }
.stage-owner { display: grid; min-width: 230px; gap: 3px; padding: 13px 15px; border-left: 3px solid var(--mint); background: white; }.stage-owner span,.stage-owner small { color: var(--ink-muted); font-size: .68rem; }.stage-owner strong { color: var(--forest); }
.advisory-banner { display: flex; align-items: flex-start; gap: 12px; padding: 13px 15px; border: 1px solid color-mix(in srgb, var(--gold) 68%, var(--line)); background: color-mix(in srgb, var(--gold) 14%, white); }.advisory-banner > :first-child { margin-top: 2px; color: var(--forest); }.advisory-banner strong { color: var(--forest-deep); }.advisory-banner p { margin-top: 2px; color: var(--ink-muted); font-size: .78rem; }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 16px; }.workspace-panel { min-width: 0; padding: 18px; border: 1px solid var(--line); background: white; }.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }.panel-heading h2,.related-panel h2 { margin-top: 3px; font-size: 1.2rem; }.panel-heading > strong { color: var(--forest); font-family: 'Space Grotesk Variable',sans-serif; font-size: 1.8rem; }
.step-list,.record-list,.activity-list { display: grid; gap: 0; padding: 0; margin: 0; list-style: none; }.step-list li { display: grid; grid-template-columns: 32px 1fr; gap: 10px; padding: 12px 0; border-top: 1px solid var(--line); }.step-state { display: grid; width: 26px; height: 26px; place-items: center; border: 1px solid var(--line); color: var(--ink-muted); }.step-list li.is-completed .step-state { border-color: var(--forest); background: var(--forest); color: white; }.step-list li > div { display: grid; grid-template-columns: 52px 1fr auto; align-items: center; gap: 8px; }.step-list small { color: var(--ink-muted); font-family: 'JetBrains Mono Variable',monospace; }.step-list span:last-child { color: var(--ink-muted); font-size: .72rem; }
.missing-badge { padding: 5px 8px; background: color-mix(in srgb,var(--coral) 18%,white); color: #923a24; font-size: .68rem; font-weight: 750; }.record-list li { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 8px; padding: 11px 0; border-top: 1px solid var(--line); }.record-list li > span { display: grid; }.record-list small { color: var(--ink-muted); font-size: .64rem; text-transform: uppercase; }.record-list em { padding: 4px 7px; color: var(--ink-muted); background: var(--paper); font-size: .65rem; font-style: normal; }.record-list em.is-ready { color: var(--forest); background: color-mix(in srgb,var(--mint) 25%,white); }.record-list em.is-missing { color: #923a24; background: color-mix(in srgb,var(--coral) 18%,white); }
.related-panel { display: grid; align-content: start; gap: 10px; }.related-panel img { width: 100%; aspect-ratio: 16/8; margin-top: 6px; object-fit: cover; }.primary-link { display: flex; align-items: center; justify-content: space-between; min-height: 40px; padding: 0 12px; background: var(--forest); color: white; font-weight: 750; }.related-note { color: var(--ink-muted); font-size: .78rem; line-height: 1.5; }
.activity-list li { display: grid; grid-template-columns: 12px 1fr; gap: 10px; padding: 10px 0; }.activity-list li > span { width: 8px; height: 8px; margin-top: 5px; border: 2px solid white; border-radius: 50%; outline: 1px solid var(--forest); background: var(--mint); }.activity-list div { display: grid; gap: 2px; }.activity-list p { color: var(--ink-muted); font-size: .75rem; }.activity-list time { color: var(--ink-muted); font-family: 'JetBrains Mono Variable',monospace; font-size: .6rem; }
.media-history-panel { grid-column: 1/-1; scroll-margin-top: 86px; }.media-history-panel .panel-heading > span { color: var(--ink-muted); font-size: .7rem; }.media-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }.media-grid article { min-width: 0; border: 1px solid var(--line); background: var(--paper); }.media-grid img { width: 100%; aspect-ratio: 16/9; object-fit: cover; }.media-grid article > div { display: grid; gap: 2px; padding: 10px; }.media-grid span { width: fit-content; margin-bottom: 4px; padding: 3px 5px; background: white; color: var(--forest); font-size: .58rem; font-weight: 800; }.media-grid p,.media-grid small { color: var(--ink-muted); font-size: .65rem; }
@media (max-width: 900px) { .stage-heading { align-items: stretch; flex-direction: column; }.stage-owner { min-width: 0; }.workspace-grid { grid-template-columns: 1fr; }.step-list li > div { grid-template-columns: 45px 1fr; }.step-list li > div > span { grid-column: 2; }.media-grid { grid-template-columns: 1fr; } }
</style>
