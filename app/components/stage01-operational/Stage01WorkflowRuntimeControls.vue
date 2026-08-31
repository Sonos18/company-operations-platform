<script setup lang="ts">
import { activeAssignments, openBlockers, taxonomyLabel } from '../../features/stage01-operational/stage01-operational'
import type { EmployeeSummary } from '../../features/employees/employee.types'
import type { Stage01OperationalDetail } from '../../features/stage01/stage01.types'
import type { WorkflowNodeRuntime } from '../../features/workflow/workflow.types'

const props = defineProps<{
  detail: Stage01OperationalDetail
  runAndReload: <T>(action: () => Promise<T>) => Promise<T>
}>()

const repositories = useRepositories()
const access = useNuxtApp().$companyAccessStore
const error = ref<unknown | null>(null)
const success = ref<string | null>(null)
const employees = ref<EmployeeSummary[]>([])
const employeesLoading = ref(false)
const assignmentNodeId = ref<string | null>(null)
const endingAssignmentId = ref<string | null>(null)
const blockerNodeId = ref<string | null>(null)
const resolvingBlockerId = ref<string | null>(null)
const reopenNodeId = ref<string | null>(null)
const revalidateNodeId = ref<string | null>(null)
const assignment = reactive({ assignmentKind: 'accountable_owner' as 'accountable_owner' | 'contributor', assigneeUserId: '', assignmentReason: '' })
const endAssignment = ref('')
const blocker = reactive({ effect: 'blocking' as 'blocking' | 'non_blocking', categoryCode: '', description: '', responsibleUserId: '' })
const blockerResolution = ref('')
const reopenReason = ref('')
const revalidate = reactive({ reason: '', evidence: '' })

const canAssign = computed(() => access.hasPermission('journey.assignment.manage'))
const canStart = computed(() => access.hasPermission('journey.node.start'))
const canComplete = computed(() => access.hasPermission('journey.node.complete'))
const canReopen = computed(() => access.hasPermission('journey.node.reopen'))
const canRevalidate = computed(() => access.hasPermission('journey.node.revalidate'))
const canRaiseBlocker = computed(() => access.hasPermission('journey.blocker.raise'))
const canResolveBlocker = computed(() => access.hasPermission('journey.blocker.resolve'))
const canReadDirectory = computed(() => access.hasAnyPermission(['employee.read_directory', 'employee.read_all']))
const employeeByUserId = computed(() => new Map(
  employees.value.flatMap(employee => employee.account?.userId ? [[employee.account.userId, employee.fullName] as const] : []),
))
const nodes = computed(() => [
  { label: '01.1 Tiếp nhận', runtime: props.detail.intake.runtime, gates: props.detail.intake.gates },
  { label: '01.2 Đánh giá', runtime: props.detail.evaluation.runtime, gates: props.detail.evaluation.gates },
])

function message(value: unknown): string {
  return value instanceof Error && value.message ? value.message : 'Không thể hoàn tất thao tác Workflow.'
}

function clearNotice(): void { error.value = null; success.value = null }

function openReopen(nodeExecutionId: string): void { reopenNodeId.value = nodeExecutionId }
function openRevalidate(nodeExecutionId: string): void { revalidateNodeId.value = nodeExecutionId }
function openEndAssignment(assignmentId: string): void { endingAssignmentId.value = assignmentId }
function openResolution(blockerId: string): void { resolvingBlockerId.value = blockerId }

function runtimeFor(nodeExecutionId: string): WorkflowNodeRuntime | null {
  return nodes.value.find(node => node.runtime.nodeExecutionId === nodeExecutionId)?.runtime ?? null
}

function employeeName(userId: string): string {
  return employeeByUserId.value.get(userId) ?? userId
}

async function command(label: string, action: () => Promise<unknown>): Promise<boolean> {
  clearNotice()
  try {
    await props.runAndReload(action)
    success.value = label
    return true
  }
  catch (caught) {
    error.value = caught
    return false
  }
}

async function loadEmployees(): Promise<void> {
  if (!canReadDirectory.value || employeesLoading.value || employees.value.length) return
  employeesLoading.value = true
  try {
    employees.value = await repositories.employees.list()
  }
  catch (caught) {
    error.value = caught
  }
  finally {
    employeesLoading.value = false
  }
}

async function start(runtime: WorkflowNodeRuntime): Promise<void> {
  await command('Đã khởi động node.', () => repositories.workflow.startNode(runtime.nodeExecutionId, {
    expectedExecutionVersion: runtime.version,
  }))
}

async function complete(runtime: WorkflowNodeRuntime): Promise<void> {
  const ownership = runtime.nodeKey === '01.1'
    ? { expectedOpportunityVersion: props.detail.opportunity.version }
    : { expectedCycleVersion: props.detail.currentDecisionCycle.version }
  await command('Đã hoàn tất node.', () => repositories.workflow.completeNode(runtime.nodeExecutionId, {
    expectedExecutionVersion: runtime.version,
    ...ownership,
  }))
}

async function submitReopen(): Promise<void> {
  const runtime = reopenNodeId.value ? runtimeFor(reopenNodeId.value) : null
  if (!runtime || !reopenReason.value.trim()) return
  const completed = await command('Đã mở lại node.', () => repositories.workflow.reopenNode(runtime.nodeExecutionId, {
    reason: reopenReason.value.trim(), expectedExecutionVersion: runtime.version,
  }))
  if (completed) { reopenNodeId.value = null; reopenReason.value = '' }
}

async function submitRevalidate(): Promise<void> {
  const runtime = revalidateNodeId.value ? runtimeFor(revalidateNodeId.value) : null
  const evidence = revalidate.evidence.trim()
  if (!runtime || !revalidate.reason.trim() || !evidence) return
  const completed = await command('Đã tái xác thực node.', () => repositories.workflow.revalidateNode(runtime.nodeExecutionId, {
    reason: revalidate.reason.trim(), evidence: [evidence], expectedExecutionVersion: runtime.version,
  }))
  if (completed) { revalidateNodeId.value = null; revalidate.reason = ''; revalidate.evidence = '' }
}

async function openAssignment(nodeExecutionId: string): Promise<void> {
  if (!canReadDirectory.value) return
  assignmentNodeId.value = nodeExecutionId
  await loadEmployees()
}

async function submitAssignment(): Promise<void> {
  const runtime = assignmentNodeId.value ? runtimeFor(assignmentNodeId.value) : null
  if (!runtime || !assignment.assigneeUserId) return
  const completed = await command('Đã cập nhật phân công.', () => repositories.workflow.assign(runtime.nodeExecutionId, {
    assignmentKind: assignment.assignmentKind, assigneeUserId: assignment.assigneeUserId,
    assignmentReason: assignment.assignmentReason.trim() || undefined, expectedExecutionVersion: runtime.version,
  }))
  if (completed) {
    assignmentNodeId.value = null
    assignment.assignmentKind = 'accountable_owner'; assignment.assigneeUserId = ''; assignment.assignmentReason = ''
  }
}

async function submitEndAssignment(): Promise<void> {
  const selectedId = endingAssignmentId.value
  const runtime = selectedId ? nodes.value.find(node => activeAssignments(node.runtime.assignments).some(item => item.id === selectedId))?.runtime : null
  if (!selectedId || !runtime || !endAssignment.value.trim()) return
  const completed = await command('Đã kết thúc phân công.', () => repositories.workflow.endAssignment(selectedId, {
    endReason: endAssignment.value.trim(), expectedExecutionVersion: runtime.version,
  }))
  if (completed) { endingAssignmentId.value = null; endAssignment.value = '' }
}

function openBlocker(nodeExecutionId: string): void {
  blockerNodeId.value = nodeExecutionId
  blocker.categoryCode = props.detail.configuration.taxonomies.blocker_category[0]?.code ?? ''
  blocker.effect = 'blocking'; blocker.description = ''; blocker.responsibleUserId = ''
}

async function submitBlocker(): Promise<void> {
  const runtime = blockerNodeId.value ? runtimeFor(blockerNodeId.value) : null
  if (!runtime || !blocker.categoryCode || !blocker.description.trim()) return
  const completed = await command('Đã nêu blocker.', () => repositories.workflow.raiseBlocker(runtime.nodeExecutionId, {
    effect: blocker.effect, categoryCode: blocker.categoryCode, description: blocker.description.trim(),
    responsibleUserId: blocker.responsibleUserId || undefined, expectedExecutionVersion: runtime.version,
  }))
  if (completed) blockerNodeId.value = null
}

async function submitResolution(): Promise<void> {
  const selectedId = resolvingBlockerId.value
  const runtime = selectedId ? nodes.value.find(node => openBlockers(node.runtime.blockers).some(item => item.id === selectedId))?.runtime : null
  if (!selectedId || !runtime || !blockerResolution.value.trim()) return
  const completed = await command('Đã giải quyết blocker.', () => repositories.workflow.resolveBlocker(selectedId, {
    resolution: blockerResolution.value.trim(), expectedExecutionVersion: runtime.version,
  }))
  if (completed) { resolvingBlockerId.value = null; blockerResolution.value = '' }
}
</script>

<template>
  <section class="workflow-runtime" aria-labelledby="workflow-runtime-heading">
    <div>
      <p class="eyebrow">Workflow runtime</p>
      <h2 id="workflow-runtime-heading">Điều hành node, phân công và blocker</h2>
      <p>Gate do máy chủ trả về quyết định khả năng hoàn tất; mọi thao tác thành công đều tải lại aggregate chính tắc.</p>
    </div>
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" title="Không thể hoàn tất thao tác" :description="message(error)" />
    <UAlert v-if="success" color="success" icon="i-lucide-circle-check" title="Đã cập nhật" :description="success" />

    <article v-for="node in nodes" :key="node.runtime.nodeExecutionId" class="workflow-runtime__node">
      <header><div><h3>{{ node.label }}</h3><p>Trạng thái: <strong>{{ node.runtime.state }}</strong> · Lần thực thi #{{ node.runtime.executionNo }}</p></div><span>{{ node.runtime.needsRevalidation ? 'Cần tái xác thực' : 'Đã xác thực' }}</span></header>
      <div class="workflow-runtime__actions">
        <UButton v-if="canStart && node.runtime.state === 'ready'" size="sm" @click="start(node.runtime)">Khởi động node</UButton>
        <UButton v-if="canComplete && node.runtime.state === 'active'" size="sm" :disabled="!node.gates.satisfied" :title="node.gates.satisfied ? undefined : 'Cần xử lý các gate trước khi hoàn tất'" @click="complete(node.runtime)">Hoàn tất node</UButton>
        <UButton v-if="canReopen && node.runtime.state === 'completed'" size="sm" variant="outline" @click="openReopen(node.runtime.nodeExecutionId)">Mở lại node</UButton>
        <UButton v-if="canRevalidate && node.runtime.needsRevalidation" size="sm" variant="outline" @click="openRevalidate(node.runtime.nodeExecutionId)">Tái xác thực node</UButton>
      </div>

      <form v-if="reopenNodeId === node.runtime.nodeExecutionId" class="workflow-runtime__form" @submit.prevent="submitReopen"><label>Lý do mở lại<textarea v-model="reopenReason" required /></label><UButton type="submit">Xác nhận mở lại</UButton></form>
      <form v-if="revalidateNodeId === node.runtime.nodeExecutionId" class="workflow-runtime__form" @submit.prevent="submitRevalidate"><label>Lý do tái xác thực<textarea v-model="revalidate.reason" required /></label><label>Bằng chứng<textarea v-model="revalidate.evidence" required /></label><UButton type="submit">Xác nhận tái xác thực</UButton></form>

      <section class="workflow-runtime__section" :aria-label="`Gate của ${node.label}`"><h4>Gate từ máy chủ</h4><p>{{ node.gates.satisfied ? 'Các điều kiện đã đạt.' : 'Còn điều kiện cần xử lý trước khi hoàn tất.' }}</p><ul><li v-for="check in node.gates.checks" :key="check.code"><strong>{{ check.status }}</strong><span>{{ check.message }}</span></li></ul></section>

      <section class="workflow-runtime__section" :aria-label="`Phân công của ${node.label}`"><header><h4>Phân công</h4><UButton v-if="canAssign && canReadDirectory" size="xs" @click="openAssignment(node.runtime.nodeExecutionId)">Phân công</UButton></header><p v-if="canAssign && !canReadDirectory">Bạn không có quyền đọc danh bạ nên chỉ có thể xem lịch sử phân công; không thể chọn một mã người dùng tự do.</p><ul><li v-for="item in node.runtime.assignments" :key="item.id"><div><strong>{{ employeeName(item.assigneeUserId) }}</strong><span>{{ item.assignmentKind }} · {{ item.endedAt ? `Đã kết thúc: ${item.endReason}` : 'Đang hiệu lực' }}</span></div><UButton v-if="canAssign && !item.endedAt" size="xs" variant="outline" @click="openEndAssignment(item.id)">Kết thúc phân công</UButton></li><li v-if="!node.runtime.assignments.length">Chưa có phân công.</li></ul></section>
      <form v-if="assignmentNodeId === node.runtime.nodeExecutionId" class="workflow-runtime__form" @submit.prevent="submitAssignment"><label>Loại phân công<select v-model="assignment.assignmentKind"><option value="accountable_owner">Chủ trách nhiệm</option><option value="contributor">Thành viên hỗ trợ</option></select></label><label>Người được phân công<select v-model="assignment.assigneeUserId" :disabled="employeesLoading" required><option disabled value="">Chọn nhân viên</option><option v-for="employee in employees.filter(item => item.account?.userId)" :key="employee.id" :value="employee.account!.userId">{{ employee.fullName }}</option></select></label><label>Lý do phân công<textarea v-model="assignment.assignmentReason" /></label><UButton type="submit" :loading="employeesLoading">Lưu phân công</UButton></form>
      <form v-if="endingAssignmentId && activeAssignments(node.runtime.assignments).some(item => item.id === endingAssignmentId)" class="workflow-runtime__form" @submit.prevent="submitEndAssignment"><label>Lý do kết thúc phân công<textarea v-model="endAssignment" required /></label><UButton type="submit">Xác nhận kết thúc phân công</UButton></form>

      <section class="workflow-runtime__section" :aria-label="`Blocker của ${node.label}`"><header><h4>Blocker</h4><UButton v-if="canRaiseBlocker" size="xs" @click="openBlocker(node.runtime.nodeExecutionId)">Nêu blocker</UButton></header><ul><li v-for="item in node.runtime.blockers" :key="item.id"><div><strong>{{ taxonomyLabel(detail.configuration.taxonomies.blocker_category, item.categoryCode) }}</strong><span>{{ item.description }} · {{ item.resolvedAt ? `Đã giải quyết: ${item.resolution}` : 'Đang mở' }}</span></div><UButton v-if="canResolveBlocker && !item.resolvedAt" size="xs" variant="outline" @click="openResolution(item.id)">Giải quyết blocker</UButton></li><li v-if="!node.runtime.blockers.length">Chưa có blocker.</li></ul></section>
      <form v-if="blockerNodeId === node.runtime.nodeExecutionId" class="workflow-runtime__form" @submit.prevent="submitBlocker"><label>Ảnh hưởng<select v-model="blocker.effect"><option value="blocking">Chặn tiến độ</option><option value="non_blocking">Không chặn tiến độ</option></select></label><label>Danh mục blocker<select v-model="blocker.categoryCode" required><option v-for="entry in detail.configuration.taxonomies.blocker_category" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Mô tả blocker<textarea v-model="blocker.description" required /></label><label v-if="canReadDirectory">Người phụ trách<select v-model="blocker.responsibleUserId"><option value="">Chưa phân công</option><option v-for="employee in employees.filter(item => item.account?.userId)" :key="employee.id" :value="employee.account!.userId">{{ employee.fullName }}</option></select></label><UButton type="submit">Lưu blocker</UButton></form>
      <form v-if="resolvingBlockerId && openBlockers(node.runtime.blockers).some(item => item.id === resolvingBlockerId)" class="workflow-runtime__form" @submit.prevent="submitResolution"><label>Kết luận giải quyết blocker<textarea v-model="blockerResolution" required /></label><UButton type="submit">Xác nhận giải quyết blocker</UButton></form>
    </article>
  </section>
</template>

<style scoped>
.workflow-runtime { display: grid; gap: 14px; }.workflow-runtime > div > p:not(.eyebrow) { margin-top: 5px; color: var(--ink-muted); line-height: 1.45; }.workflow-runtime h2 { margin-top: 4px; font-size: 1.3rem; }.workflow-runtime__node { display: grid; gap: 12px; padding: 15px; border: 1px solid var(--line); background: var(--paper-raised); }.workflow-runtime__node > header,.workflow-runtime__section > header { display: flex; justify-content: space-between; align-items: start; gap: 12px; }.workflow-runtime__node h3,.workflow-runtime__section h4 { margin: 0; color: var(--forest-deep); }.workflow-runtime__node header p,.workflow-runtime__section > p { margin-top: 4px; color: var(--ink-muted); font-size: .8rem; }.workflow-runtime__node > header > span { padding: 4px 8px; border-radius: 999px; background: var(--mint); color: var(--forest-deep); font-family: var(--font-journey-mono); font-size: .68rem; }.workflow-runtime__actions { display: flex; flex-wrap: wrap; gap: 8px; }.workflow-runtime__section { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid var(--line); }.workflow-runtime__section ul { display: grid; padding: 0; margin: 0; list-style: none; border: 1px solid var(--line); }.workflow-runtime__section li { display: flex; justify-content: space-between; align-items: start; gap: 12px; padding: 10px; border-bottom: 1px solid var(--line); }.workflow-runtime__section li:last-child { border-bottom: 0; }.workflow-runtime__section li div { display: grid; gap: 3px; }.workflow-runtime__section li strong { font-size: .8rem; text-transform: capitalize; }.workflow-runtime__section li span { color: var(--ink-muted); font-size: .78rem; }.workflow-runtime__form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 12px; border: 1px solid var(--line); background: var(--paper); }.workflow-runtime__form label { display: grid; gap: 5px; color: var(--forest-deep); font-size: .77rem; font-weight: 700; }.workflow-runtime__form textarea,.workflow-runtime__form select { width: 100%; min-height: 40px; padding: 8px; border: 1px solid var(--line); background: var(--paper-raised); color: var(--ink); font: inherit; }.workflow-runtime__form textarea { min-height: 70px; resize: vertical; }.workflow-runtime__form > button { grid-column: 1 / -1; }
@media (max-width: 620px) { .workflow-runtime__node > header,.workflow-runtime__section > header,.workflow-runtime__section li { flex-direction: column; }.workflow-runtime__form { grid-template-columns: 1fr; }.workflow-runtime__form > button { grid-column: auto; } }
</style>
