<script setup lang="ts">
import type { ProjectStage } from '../../features/journey/journey.types'
defineProps<{ stage: ProjectStage }>()
</script>

<template>
  <footer class="journey-footer" data-testid="journey-footer">
    <section>
      <h3><span class="footer-dot footer-dot--coral" />Vấn đề cần chú ý</h3>
      <div class="footer-scroll">
        <p v-if="stage.missingRecordCount"><strong>{{ stage.missingRecordCount }} hồ sơ chưa đủ</strong><small>Điều kiện hướng dẫn, không khóa giai đoạn.</small></p>
        <p><strong>Kiểm tra trước khi chuyển bước</strong><small>{{ stage.purpose }}</small></p>
      </div>
    </section>
    <section>
      <h3><span class="footer-dot footer-dot--mint" />Công việc đang mở</h3>
      <div class="footer-scroll">
        <p v-for="step in stage.subStages.filter(item => item.status !== 'completed')" :key="step.id"><strong>{{ step.name }}</strong><small>{{ step.ownerName }}</small></p>
      </div>
    </section>
    <section>
      <h3><span class="footer-dot footer-dot--gold" />Mốc gần nhất</h3>
      <div class="footer-scroll">
        <p><strong>{{ stage.dueAt ? '25.08.2026' : 'Chưa đặt hạn' }}</strong><small>{{ stage.name }}</small></p>
        <p><strong>{{ stage.lastActivityAt.slice(0, 10).split('-').reverse().join('.') }}</strong><small>Cập nhật hoạt động gần nhất</small></p>
      </div>
    </section>
  </footer>
</template>

<style scoped>
.journey-footer { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); height: 220px; gap: 16px; padding: 16px; border-top: 1px solid var(--line); background: #eff0eb; }
section { display: grid; grid-template-rows: auto 1fr; min-height: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: white; }
h3 { display: flex; align-items: center; gap: 8px; padding: 12px 14px 9px; border-bottom: 1px solid var(--line); font-size: 0.78rem; }
.footer-dot { width: 8px; height: 8px; border-radius: 50%; }.footer-dot--coral { background: var(--coral); }.footer-dot--mint { background: #42be72; }.footer-dot--gold { background: var(--gold); }
.footer-scroll { min-height: 0; padding: 5px 12px 11px; overflow: auto; }.footer-scroll p { display: grid; gap: 2px; padding: 8px 2px; border-bottom: 1px solid #ecece8; }.footer-scroll strong { color: var(--forest-deep); font-size: 0.72rem; }.footer-scroll small { color: var(--ink-muted); font-size: 0.64rem; line-height: 1.35; }
</style>
