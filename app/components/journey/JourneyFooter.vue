<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectStage } from '../../features/journey/journey.types'

interface FooterEntry {
  title: string
  description: string
}

interface FooterPanel {
  value: 'attention' | 'open' | 'milestone'
  label: string
  icon: string
  entries: FooterEntry[]
  empty: string
}

const props = defineProps<{ stage: ProjectStage }>()

const panels = computed<FooterPanel[]>(() => [
  {
    value: 'attention',
    label: 'Vấn đề cần chú ý',
    icon: 'i-lucide-circle-alert',
    entries: props.stage.missingRecordCount
      ? [{ title: `${props.stage.missingRecordCount} hồ sơ chưa đủ`, description: 'Điều kiện hướng dẫn, không khóa giai đoạn.' }]
      : [],
    empty: 'Không có hồ sơ cần chú ý.',
  },
  {
    value: 'open',
    label: 'Công việc đang mở',
    icon: 'i-lucide-list-checks',
    entries: props.stage.subStages
      .filter(step => step.status !== 'completed' && step.status !== 'not_applicable')
      .map(step => ({ title: step.name, description: step.ownerName })),
    empty: 'Không có bước đang mở.',
  },
  {
    value: 'milestone',
    label: 'Mốc gần nhất',
    icon: 'i-lucide-calendar-clock',
    entries: [{
      title: props.stage.dueAt ? new Intl.DateTimeFormat('vi-VN').format(new Date(props.stage.dueAt)) : 'Chưa đặt hạn',
      description: props.stage.name,
    }],
    empty: 'Chưa có mốc thời gian.',
  },
])
</script>

<template>
  <footer class="journey-footer" data-testid="journey-footer">
    <span class="sr-only">{{ stage.name }}</span>

    <div class="journey-footer__desktop">
      <UCard v-for="panel in panels" :key="panel.value" class="journey-footer__panel">
        <template #header>
          <h3><UIcon :name="panel.icon" aria-hidden="true" />{{ panel.label }}</h3>
        </template>
        <div class="footer-entries">
          <p v-for="entry in panel.entries" :key="entry.title">
            <strong>{{ entry.title }}</strong>
            <small>{{ entry.description }}</small>
          </p>
          <p v-if="!panel.entries.length" class="footer-empty">{{ panel.empty }}</p>
        </div>
      </UCard>
    </div>

    <UAccordion class="journey-footer__mobile" :items="panels" type="multiple">
      <template #body="{ item }">
        <div class="footer-entries">
          <p v-for="entry in item.entries" :key="entry.title">
            <strong>{{ entry.title }}</strong>
            <small>{{ entry.description }}</small>
          </p>
          <p v-if="!item.entries.length" class="footer-empty">{{ item.empty }}</p>
        </div>
      </template>
    </UAccordion>
  </footer>
</template>

<style scoped>
.journey-footer { border-top: 1px solid var(--journey-border); }
.journey-footer__desktop { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.journey-footer__panel { min-width: 0; border-color: var(--journey-border); background: var(--journey-surface); }
.journey-footer__panel h3 { display: flex; align-items: center; gap: 8px; color: var(--journey-foreground); font-size: .8rem; }
.footer-entries { display: grid; gap: 8px; }
.footer-entries p { display: grid; gap: 3px; padding-bottom: 8px; border-bottom: 1px solid var(--journey-border); }
.footer-entries p:last-child { padding-bottom: 0; border-bottom: 0; }
.footer-entries strong { color: var(--journey-foreground); font-size: .72rem; }
.footer-entries small,.footer-empty { color: var(--journey-muted); font-size: .65rem; line-height: 1.4; }
.journey-footer__mobile { display: none; }

@media (max-width: 639px) {
  .journey-footer__desktop { display: none; }
  .journey-footer__mobile { display: block; }
}
</style>
