<script setup lang="ts">
import TaskGroup from '../components/tasks/TaskGroup.vue'
import type { ProjectTask } from '../features/tasks/task.types'

definePageMeta({ requiredPermission: 'task.read_assigned' })

const repositories = useRepositories()
const busyTaskId = ref<string | null>(null)
const announcement = ref('')
const prototypeToday = '2026-08-12'
const { data: taskData, refresh } = await useAsyncData('my-active-tasks', () => repositories.tasks.listMine())

const priorityOrder: Record<ProjectTask['priority'], number> = { high: 0, medium: 1, low: 2 }
const sortTasks = (tasks: ProjectTask[]) => [...tasks].sort((left, right) => {
  const priority = priorityOrder[left.priority] - priorityOrder[right.priority]
  if (priority) return priority
  return (left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER) - (right.dueAt ? Date.parse(right.dueAt) : Number.MAX_SAFE_INTEGER)
})

const groups = computed(() => {
  const tasks = taskData.value ?? []
  const waiting = tasks.filter(task => task.status === 'waiting')
  const dated = tasks.filter(task => task.status !== 'waiting')
  return [
    { title: 'Quá hạn', description: 'Cần xử lý trước để không kéo dài tiến độ.', accent: 'coral' as const, tasks: sortTasks(dated.filter(task => task.dueAt && task.dueAt.slice(0, 10) < prototypeToday)) },
    { title: 'Hôm nay', description: 'Tập trung hoàn tất trong ngày làm việc.', accent: 'gold' as const, tasks: sortTasks(dated.filter(task => task.dueAt?.slice(0, 10) === prototypeToday)) },
    { title: 'Sắp tới', description: 'Chuẩn bị đầu vào cho các mốc tiếp theo.', accent: 'mint' as const, tasks: sortTasks(dated.filter(task => !task.dueAt || task.dueAt.slice(0, 10) > prototypeToday)) },
    { title: 'Đang chờ', description: 'Đang phụ thuộc phản hồi hoặc đầu vào khác.', accent: 'neutral' as const, tasks: sortTasks(waiting) },
  ]
})

async function complete(taskId: string) {
  busyTaskId.value = taskId
  announcement.value = ''
  try {
    await repositories.tasks.setStatus(taskId, 'done')
    await refresh()
    announcement.value = 'Đã hoàn thành công việc và cập nhật danh sách.'
  } catch (error) {
    announcement.value = error instanceof Error ? error.message : 'Không thể cập nhật công việc.'
  } finally {
    busyTaskId.value = null
  }
}
</script>

<template>
  <div class="my-work-page">
    <header class="page-heading">
      <div><p class="eyebrow">Xuyên suốt các dự án</p><h1>Công việc của tôi</h1><p>Tập trung việc đang mở theo mức độ cần xử lý, vẫn giữ nguyên ngữ cảnh dự án và giai đoạn.</p></div>
      <div class="work-date"><span>Ngày làm việc mẫu</span><strong>12.08.2026</strong><small>{{ taskData?.length ?? 0 }} việc đang mở</small></div>
    </header>
    <div class="work-summary"><span><i class="is-director" />Giám đốc giao</span><span><i class="is-self" />Tự đề xuất</span><p>Dữ liệu dùng để góp ý quy trình, chưa gửi thông báo thật.</p></div>
    <div class="task-groups">
      <TaskGroup v-for="group in groups" :key="group.title" v-bind="group" :busy-task-id="busyTaskId" @complete="complete" />
    </div>
    <p class="announcement" aria-live="polite">{{ announcement }}</p>
  </div>
</template>

<style scoped>
.my-work-page { display: grid; gap: 18px; max-width: 1480px; margin: 0 auto; }.page-heading { display: flex; align-items: end; justify-content: space-between; gap: 28px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }.page-heading h1 { margin: 4px 0 7px; font-size: clamp(2.5rem,5vw,5rem); line-height: .9; }.page-heading > div:first-child > p:last-child { max-width: 680px; color: var(--ink-muted); }.work-date { display: grid; min-width: 205px; gap: 2px; padding: 13px 15px; border-left: 3px solid var(--coral); background: white; }.work-date span,.work-date small { color: var(--ink-muted); font-size: .65rem; }.work-date strong { color: var(--forest); font-family: 'Space Grotesk Variable',sans-serif; font-size: 1.4rem; }
.work-summary { display: flex; align-items: center; gap: 13px; padding: 9px 12px; border: 1px solid var(--line); background: white; }.work-summary span { display: flex; align-items: center; gap: 5px; font-size: .65rem; font-weight: 750; }.work-summary i { width: 8px; height: 8px; border-radius: 50%; background: var(--forest); }.work-summary i.is-self { background: var(--gold); }.work-summary p { margin-left: auto; color: var(--ink-muted); font-size: .65rem; }.task-groups { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); align-items: start; gap: 16px; }.announcement { min-height: 20px; color: var(--forest); font-size: .75rem; font-weight: 750; }
@media (max-width: 980px) { .task-groups { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .page-heading { align-items: stretch; flex-direction: column; }.work-date { min-width: 0; }.work-summary { align-items: flex-start; flex-wrap: wrap; }.work-summary p { width: 100%; margin-left: 0; } }
</style>
