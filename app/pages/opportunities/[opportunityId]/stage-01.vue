<script setup lang="ts">
import { z } from 'zod'
import { ClientError } from '../../../errors/client-error'
import {
  activeAssignments,
  openBlockers,
  taxonomyLabel,
} from '../../../features/stage01-operational/stage01-operational'

definePageMeta({
  requiredPermission: 'opportunity.read',
  requiredAnyPermissions: ['journey.read'],
})

const route = useRoute()
const repositories = useRepositories()
const parsedOpportunityId = z.string().uuid().safeParse(route.params.opportunityId)
const opportunityId = parsedOpportunityId.success ? parsedOpportunityId.data : null
const operational = opportunityId
  ? useStage01Operational(repositories.stage01, opportunityId)
  : null

if (operational) await operational.load().catch(() => undefined)

const detail = computed(() => operational?.detail.value ?? null)
const pending = computed(() => operational?.pending.value ?? false)
const error = computed(() => operational?.error.value ?? null)
const isNotFound = computed(() => error.value instanceof ClientError && error.value.code === 'OPPORTUNITY_NOT_FOUND')
const hasBlockingWarning = computed(() => {
  if (!detail.value) return false
  return [detail.value.intake.runtime, detail.value.evaluation.runtime].some(runtime => (
    runtime.needsRevalidation || openBlockers(runtime.blockers).some(blocker => blocker.effect === 'blocking')
  ))
})

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback
}

function gateSummary(gates: { satisfied: boolean, checks: { status: string }[] }): string {
  if (gates.satisfied) return 'Các điều kiện đã đạt'
  const outstanding = gates.checks.filter(check => check.status !== 'satisfied').length
  return `${outstanding} điều kiện cần xử lý`
}

function currentProgress(): string {
  if (!detail.value) return ''
  return `01.1 ${detail.value.intake.runtime.state} · 01.2 ${detail.value.evaluation.runtime.state}`
}

function ownerFor(runtime: NonNullable<typeof detail.value>['intake']['runtime']): string {
  const owner = activeAssignments(runtime.assignments).find(assignment => assignment.assignmentKind === 'accountable_owner')
  return owner?.assigneeUserId ?? 'Chưa phân công'
}

async function retry(): Promise<void> {
  if (operational) await operational.load().catch(() => undefined)
}

async function returnToOpportunities(): Promise<void> {
  await navigateTo('/opportunities')
}
</script>

<template>
  <section class="stage01-workspace" aria-labelledby="stage01-workspace-heading">
    <UAlert
      v-if="!opportunityId"
      color="error"
      icon="i-lucide-circle-alert"
      title="Liên kết cơ hội không hợp lệ"
      description="Mã cơ hội trong đường dẫn không đúng định dạng."
    >
      <template #actions><UButton color="error" variant="outline" @click="returnToOpportunities">Quay lại danh sách cơ hội</UButton></template>
    </UAlert>

    <div v-else-if="pending && !detail" class="stage01-workspace__loading" aria-label="Đang tải không gian làm việc Stage 01">
      <USkeleton class="h-12 w-2/3" />
      <USkeleton class="h-28 w-full" />
      <USkeleton class="h-44 w-full" />
    </div>

    <UAlert
      v-else-if="isNotFound"
      color="neutral"
      icon="i-lucide-search-x"
      title="Không tìm thấy cơ hội"
      description="Cơ hội có thể không còn thuộc phạm vi công ty hiện tại."
    >
      <template #actions><UButton variant="outline" @click="returnToOpportunities">Quay lại danh sách cơ hội</UButton></template>
    </UAlert>

    <UAlert
      v-else-if="error && !detail"
      role="alert"
      color="error"
      icon="i-lucide-circle-alert"
      title="Không thể tải Stage 01"
      :description="errorMessage(error, 'Vui lòng thử lại sau.')"
    >
      <template #actions><UButton color="error" variant="outline" :loading="pending" @click="retry">Thử lại</UButton></template>
    </UAlert>

    <template v-else-if="detail">
      <header class="stage01-workspace__header">
        <div>
          <p class="eyebrow">Cơ hội · Stage 01</p>
          <h1 id="stage01-workspace-heading">{{ detail.opportunity.primaryCustomerName ?? 'Khách hàng chưa xác định' }}</h1>
          <p>{{ detail.opportunity.needDescription ?? 'Chưa ghi nhận nhu cầu.' }}</p>
        </div>
        <dl class="stage01-workspace__facts">
          <div><dt>Hiệu lực</dt><dd>{{ detail.opportunity.validityState === 'valid' ? 'Đang hiệu lực' : 'Không còn hiệu lực' }}</dd></div>
          <div><dt>Tiến độ</dt><dd>{{ currentProgress() }}</dd></div>
          <div><dt>Chu kỳ hiện tại</dt><dd>#{{ detail.currentDecisionCycle.cycleNo }}</dd></div>
          <div><dt>Nguồn lead</dt><dd>{{ taxonomyLabel(detail.configuration.taxonomies.lead_source, detail.opportunity.primaryLeadSourceCode) }}</dd></div>
        </dl>
      </header>

      <UAlert
        v-if="hasBlockingWarning"
        color="warning"
        icon="i-lucide-triangle-alert"
        title="Cần kiểm tra trước khi tiếp tục"
        description="Stage 01 có điều kiện cần tái xác thực hoặc blocker đang mở. Trạng thái phía máy chủ là nguồn quyết định."
      />
      <UAlert
        v-if="error"
        role="alert"
        color="error"
        icon="i-lucide-circle-alert"
        title="Lần tải gần nhất không thành công"
        :description="errorMessage(error, 'Dữ liệu đang hiển thị là aggregate đã tải trước đó.')"
      >
        <template #actions><UButton color="error" variant="outline" :loading="pending" @click="retry">Tải lại</UButton></template>
      </UAlert>

      <section class="stage01-workspace__section" aria-labelledby="stage01-progression-heading">
        <div><p class="eyebrow">Tiến trình chính tắc</p><h2 id="stage01-progression-heading">01.1 Tiếp nhận · 01.2 Đánh giá</h2></div>
        <div class="stage01-workspace__nodes">
          <article
            v-for="node in [
            { label: '01.1 Tiếp nhận', detail: detail.intake },
            { label: '01.2 Đánh giá', detail: detail.evaluation },
            ]"
            :key="node.detail.runtime.nodeExecutionId"
            class="stage01-workspace__node"
          >
            <header><h3>{{ node.label }}</h3><span>{{ node.detail.runtime.state }}</span></header>
            <dl>
              <div><dt>Lần thực thi</dt><dd>#{{ node.detail.runtime.executionNo }}</dd></div>
              <div><dt>Tái xác thực</dt><dd>{{ node.detail.runtime.needsRevalidation ? 'Cần thực hiện' : 'Không yêu cầu' }}</dd></div>
              <div><dt>Chủ trách nhiệm</dt><dd>{{ ownerFor(node.detail.runtime) }}</dd></div>
              <div><dt>Blocker đang mở</dt><dd>{{ openBlockers(node.detail.runtime.blockers).length }}</dd></div>
              <div><dt>Gate</dt><dd>{{ gateSummary(node.detail.gates) }}</dd></div>
            </dl>
          </article>
        </div>
      </section>

      <Stage01OperationalStage01IntakeControls
        :detail="detail"
        :run-and-reload="operational!.runAndReload"
        :reload="retry"
      />

      <Stage01OperationalStage01WorkflowRuntimeControls
        :detail="detail"
        :run-and-reload="operational!.runAndReload"
      />

      <Stage01OperationalStage01EvaluationDecisionControls
        :detail="detail"
        :run-and-reload="operational!.runAndReload"
      />

    </template>
  </section>
</template>

<style scoped>
.stage01-workspace { display: grid; max-width: 1260px; margin: 0 auto; gap: 18px; }.stage01-workspace__loading { display: grid; gap: 12px; }.stage01-workspace__header { display: grid; gap: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--line); }.stage01-workspace__header h1 { margin: 4px 0 7px; font-size: clamp(2.1rem, 5vw, 3.8rem); line-height: .98; }.stage01-workspace__header > div > p:not(.eyebrow) { color: var(--ink-muted); line-height: 1.5; }.stage01-workspace__facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; }.stage01-workspace__facts div,.stage01-workspace__node { border: 1px solid var(--line); background: var(--paper-raised); }.stage01-workspace__facts div { padding: 12px; }.stage01-workspace dt { color: var(--ink-muted); font-size: .7rem; text-transform: uppercase; letter-spacing: .04em; }.stage01-workspace dd { margin: 5px 0 0; color: var(--forest-deep); font-weight: 650; font-size: .84rem; }.stage01-workspace__section { display: grid; gap: 12px; }.stage01-workspace__section h2 { margin-top: 4px; font-size: 1.3rem; }.stage01-workspace__nodes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.stage01-workspace__node { padding: 15px; }.stage01-workspace__node header { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }.stage01-workspace__node h3 { font-size: 1rem; }.stage01-workspace__node header span { padding: 4px 8px; border-radius: 999px; background: var(--mint); color: var(--forest-deep); font-family: var(--font-journey-mono); font-size: .68rem; }.stage01-workspace__node dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }
@media (max-width: 767px) { .stage01-workspace { gap: 15px; }.stage01-workspace__facts,.stage01-workspace__nodes { grid-template-columns: 1fr; }.stage01-workspace__node dl { grid-template-columns: 1fr; } }
</style>
