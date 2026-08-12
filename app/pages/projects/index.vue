<script setup lang="ts">
import ProjectListCard from '../../components/projects/ProjectListCard.vue'

const repositories = useRepositories()
const { data: projects } = await useAsyncData('project-list', () => repositories.projects.list(), { default: () => [] })
</script>

<template>
  <section class="project-list-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Không gian dự án</p>
        <h1>Dự án</h1>
        <p>Theo dõi toàn bộ hành trình, hồ sơ và công việc đang diễn ra.</p>
      </div>
      <div class="project-count"><strong>{{ projects.length }}</strong><span>dự án mẫu</span></div>
    </header>

    <div class="insight-strip">
      <div><span class="insight-icon insight-icon--mint"><UIcon name="i-lucide-activity" /></span><p><strong>1 dự án</strong><small>đang thi công</small></p></div>
      <div><span class="insight-icon insight-icon--gold"><UIcon name="i-lucide-pencil-ruler" /></span><p><strong>1 dự án</strong><small>đang thiết kế</small></p></div>
      <div><span class="insight-icon insight-icon--coral"><UIcon name="i-lucide-file-warning" /></span><p><strong>2 hồ sơ</strong><small>cần bổ sung</small></p></div>
    </div>

    <div class="project-grid">
      <ProjectListCard v-for="project in projects" :key="project.id" :project="project" />
    </div>
  </section>
</template>

<style scoped>
.project-list-page { max-width: 1260px; margin: 0 auto; }
.page-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.page-heading h1 { margin-top: 5px; font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1; }
.page-heading p:not(.eyebrow) { max-width: 560px; margin-top: 10px; color: var(--ink-muted); font-size: 0.92rem; }
.project-count { display: grid; min-width: 112px; padding: 12px 16px; border-left: 3px solid var(--coral); background: white; }
.project-count strong { color: var(--forest); font-family: 'Space Grotesk Variable', sans-serif; font-size: 1.5rem; }
.project-count span { color: var(--ink-muted); font-size: 0.7rem; }
.insight-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin-bottom: 20px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--line); }
.insight-strip > div { display: flex; align-items: center; gap: 11px; min-height: 66px; padding: 11px 14px; background: white; }
.insight-icon { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 50%; color: var(--forest-deep); }
.insight-icon--mint { background: var(--mint); }.insight-icon--gold { background: var(--gold); }.insight-icon--coral { background: var(--coral); }
.insight-strip p { display: grid; }.insight-strip strong { color: var(--forest-deep); font-size: 0.83rem; }.insight-strip small { color: var(--ink-muted); font-size: 0.7rem; }
.project-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
@media (max-width: 900px) { .project-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .page-heading { align-items: start; }.project-count { display: none; }.insight-strip { grid-template-columns: 1fr; }.project-card { max-width: none; } }
</style>
