<script setup lang="ts">
import type { ProjectSummary } from '../../features/projects/project.types'

defineProps<{ project: ProjectSummary }>()

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <article class="project-card">
    <div class="project-card__visual">
      <img :src="project.coverUrl" :alt="`Minh họa ${project.name}`">
      <span class="project-code">{{ project.code }}</span>
      <span class="stage-pill"><span /> {{ project.currentStageName }}</span>
    </div>
    <div class="project-card__body">
      <div>
        <p class="eyebrow">{{ project.location }}</p>
        <h2>{{ project.name }}</h2>
        <p class="client">Khách hàng · {{ project.clientName }}</p>
      </div>

      <div class="progress-row">
        <div class="progress-copy"><strong>{{ project.completedStageCount }}/{{ project.totalStageCount }}</strong><span>giai đoạn hoàn thành</span></div>
        <div class="progress-track" aria-hidden="true"><span :style="{ width: `${project.completedStageCount / project.totalStageCount * 100}%` }" /></div>
      </div>

      <div class="project-meta">
        <span><UIcon name="i-lucide-users" aria-hidden="true" />{{ project.ownerDepartments.join(' · ') }}</span>
        <span><UIcon name="i-lucide-clock-3" aria-hidden="true" />{{ dateFormatter.format(new Date(project.lastActivityAt)) }}</span>
      </div>

      <NuxtLink :to="`/projects/${project.id}`" class="open-project" :aria-label="`Mở dự án ${project.name}`">
        Mở hành trình dự án <UIcon name="i-lucide-arrow-up-right" aria-hidden="true" />
      </NuxtLink>
    </div>
  </article>
</template>

<style scoped>
.project-card { overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: white; transition: transform 180ms ease, border-color 180ms ease; }
.project-card:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--forest) 40%, var(--line)); }
.project-card__visual { position: relative; height: 230px; overflow: hidden; background: #d9ddd4; }
.project-card__visual::after { position: absolute; inset: 0; background: linear-gradient(180deg, rgb(0 0 0 / 4%), rgb(8 25 17 / 48%)); content: ''; }
.project-card__visual img { width: 100%; height: 100%; object-fit: cover; transition: transform 500ms ease; }
.project-card:hover img { transform: scale(1.025); }
.project-code,.stage-pill { position: absolute; z-index: 1; top: 14px; padding: 7px 9px; border-radius: 2px; font-family: 'JetBrains Mono Variable', monospace; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; }
.project-code { left: 14px; background: var(--paper); color: var(--forest); }
.stage-pill { right: 14px; display: flex; align-items: center; gap: 6px; background: rgb(16 39 28 / 88%); color: white; }
.stage-pill span { width: 7px; height: 7px; border-radius: 50%; background: var(--mint); }
.project-card__body { display: grid; gap: 18px; padding: 20px; }
h2 { margin-top: 5px; font-size: clamp(1.2rem, 2vw, 1.55rem); }
.client { margin-top: 5px; color: var(--ink-muted); font-size: 0.84rem; }
.progress-row { display: grid; gap: 8px; }
.progress-copy { display: flex; align-items: baseline; gap: 6px; }
.progress-copy strong { color: var(--forest); font-family: 'Space Grotesk Variable', sans-serif; font-size: 1.1rem; }
.progress-copy span { color: var(--ink-muted); font-size: 0.75rem; }
.progress-track { height: 6px; overflow: hidden; background: #e5e6e1; }
.progress-track span { display: block; height: 100%; background: var(--forest); }
.project-meta { display: grid; gap: 7px; color: var(--ink-muted); font-size: 0.73rem; }
.project-meta span { display: flex; align-items: center; gap: 7px; }
.open-project { display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--forest); font-size: 0.84rem; font-weight: 750; }
.open-project :deep(svg) { transition: transform 160ms ease; }
.open-project:hover :deep(svg) { transform: translate(2px, -2px); }
</style>
