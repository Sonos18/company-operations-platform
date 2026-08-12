<script setup lang="ts">
import type { ProjectTask } from '../../features/tasks/task.types'

defineProps<{
  title: string
  description: string
  tasks: ProjectTask[]
  accent: 'coral' | 'gold' | 'mint' | 'neutral'
  busyTaskId: string | null
}>()

defineEmits<{
  complete: [taskId: string]
}>()

const priorityLabel: Record<ProjectTask['priority'], string> = {
  high: 'Ưu tiên cao',
  medium: 'Ưu tiên vừa',
  low: 'Ưu tiên thấp',
}

function formatDue(value: string | null) {
  if (!value) return 'Chưa có hạn'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <section class="task-group" :class="`accent-${accent}`">
    <header>
      <div><p class="eyebrow">{{ tasks.length }} công việc</p><h2>{{ title }}</h2><p>{{ description }}</p></div>
      <strong>{{ String(tasks.length).padStart(2, '0') }}</strong>
    </header>
    <div v-if="tasks.length" class="task-list">
      <article v-for="task in tasks" :key="task.id" class="task-row">
        <span class="priority-dot" :class="`is-${task.priority}`" :title="priorityLabel[task.priority]" />
        <div class="task-main">
          <div class="task-context"><NuxtLink :to="`/projects/${task.projectId}`">{{ task.projectName }}</NuxtLink><span>/</span><NuxtLink :to="`/projects/${task.projectId}/stages/${task.stageId}`">{{ task.stageName }}</NuxtLink></div>
          <h3>{{ task.title }}</h3>
          <div class="task-meta"><span>{{ task.ownerName }}</span><span>{{ task.assignmentSource === 'director' ? 'Giám đốc giao' : 'Tự đề xuất' }}</span><span v-if="task.relatedRecordLabel"><UIcon name="i-lucide-paperclip" aria-hidden="true" />{{ task.relatedRecordLabel }}</span></div>
        </div>
        <time :datetime="task.dueAt ?? undefined">{{ formatDue(task.dueAt) }}</time>
        <button type="button" :disabled="busyTaskId === task.id" :aria-label="`Hoàn thành ${task.title}`" @click="$emit('complete', task.id)"><UIcon name="i-lucide-check" aria-hidden="true" /></button>
      </article>
    </div>
    <p v-else class="empty-group">Không có công việc trong nhóm này.</p>
  </section>
</template>

<style scoped>
.task-group { --group-accent: var(--line); overflow: hidden; border: 1px solid var(--line); border-top: 4px solid var(--group-accent); background: white; }.accent-coral { --group-accent: var(--coral); }.accent-gold { --group-accent: var(--gold); }.accent-mint { --group-accent: var(--mint); }.accent-neutral { --group-accent: #aeb6b0; }
.task-group > header { display: flex; justify-content: space-between; gap: 20px; padding: 16px 18px; border-bottom: 1px solid var(--line); background: color-mix(in srgb,var(--group-accent) 8%,white); }.task-group header h2 { margin: 2px 0; font-size: 1.25rem; }.task-group header p:last-child { color: var(--ink-muted); font-size: .7rem; }.task-group header > strong { color: color-mix(in srgb,var(--group-accent) 75%,var(--forest)); font-family: 'Space Grotesk Variable',sans-serif; font-size: 2.2rem; line-height: 1; }
.task-list { display: grid; }.task-row { display: grid; grid-template-columns: 9px minmax(0,1fr) auto 34px; align-items: center; gap: 11px; min-height: 92px; padding: 13px 16px; border-bottom: 1px solid var(--line); }.task-row:last-child { border-bottom: 0; }.priority-dot { width: 8px; height: 8px; border-radius: 50%; background: #afb4ae; }.priority-dot.is-high { background: var(--coral); }.priority-dot.is-medium { background: var(--gold); }.task-main { display: grid; min-width: 0; gap: 4px; }.task-context { display: flex; align-items: center; gap: 5px; overflow: hidden; color: var(--forest); font-size: .62rem; font-weight: 750; }.task-context a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.task-context span { color: var(--line); }.task-main h3 { overflow: hidden; font-size: .9rem; text-overflow: ellipsis; white-space: nowrap; }.task-meta { display: flex; flex-wrap: wrap; gap: 5px; }.task-meta span { display: flex; align-items: center; gap: 3px; padding: 3px 5px; background: var(--paper); color: var(--ink-muted); font-size: .58rem; }.task-row time { color: var(--ink-muted); font-family: 'JetBrains Mono Variable',monospace; font-size: .61rem; }.task-row button { display: grid; width: 32px; height: 32px; place-items: center; border: 1px solid var(--line); background: white; color: var(--forest); cursor: pointer; }.task-row button:hover { border-color: var(--forest); background: var(--forest); color: white; }.task-row button:disabled { cursor: wait; opacity: .5; }.empty-group { padding: 22px 18px; color: var(--ink-muted); font-size: .75rem; }
@media (max-width: 620px) { .task-row { grid-template-columns: 9px minmax(0,1fr) 34px; }.task-row time { grid-column: 2; grid-row: 2; }.task-row button { grid-column: 3; grid-row: 1/3; }.task-main h3 { white-space: normal; } }
</style>
