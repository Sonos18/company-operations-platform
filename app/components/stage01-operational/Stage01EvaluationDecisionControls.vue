<script setup lang="ts">
import { ClientError } from '../../errors/client-error'
import { latestCriterionRevision, orderedDecisionCycles } from '../../features/stage01-operational/stage01-operational'
import type { Stage01OperationalDetail } from '../../features/stage01/stage01.types'

type EvaluationDraft = {
  applicability: 'applicable' | 'not_applicable'
  result: '' | 'fit' | 'concern' | 'not_fit' | 'insufficient_information'
  rationale: string
  evidence: string
}

const props = defineProps<{
  detail: Stage01OperationalDetail
  runAndReload: <T>(action: () => Promise<T>) => Promise<T>
}>()

const repositories = useRepositories()
const access = useNuxtApp().$companyAccessStore
const error = ref<unknown | null>(null)
const success = ref<string | null>(null)
const evaluationDrafts = reactive<Record<string, EvaluationDraft>>({})
const recommendation = reactive({ value: 'recommend_proceed' as 'recommend_proceed' | 'recommend_not_proceeding', rationale: '', evidence: '' })
const clarificationReason = ref('')
const decision = reactive({ outcome: 'proceed' as 'proceed' | 'not_proceeding', rationale: '', overrideRationale: '' })
const overrideRationaleRequired = ref(false)
const reactivationOpen = ref(false)
const reactivationReason = ref('')

const criteria = computed(() => [...props.detail.configuration.criteria].sort((left, right) => left.displayOrder - right.displayOrder))
const cycles = computed(() => orderedDecisionCycles(props.detail.decisionCycles))
const currentRecommendation = computed(() => [...props.detail.currentDecisionCycle.recommendations]
  .sort((left, right) => right.version - left.version)[0] ?? null)
const completed = computed(() => props.detail.currentDecisionCycle.finalOutcome !== null)
const canEvaluate = computed(() => access.hasPermission('stage01.evaluation.update') && !completed.value)
const canRecommend = computed(() => access.hasPermission('stage01.recommendation.submit') && !completed.value)
const canClarify = computed(() => access.hasPermission('stage01.clarification.return') && !completed.value && currentRecommendation.value !== null)
const canRecordDecision = computed(() => (
  access.hasPermission('stage01.decision.record')
  && props.detail.actorCapabilities.includes('decision')
  && !completed.value
  && currentRecommendation.value !== null
))
const canReactivate = computed(() => access.hasPermission('stage01.reactivate') && completed.value)

function draftFor(criterionKey: string): EvaluationDraft {
  const existing = evaluationDrafts[criterionKey]
  if (existing) return existing
  const created: EvaluationDraft = { applicability: 'applicable', result: '', rationale: '', evidence: '' }
  evaluationDrafts[criterionKey] = created
  return created
}

function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value
  return value instanceof Error && value.message ? value.message : 'Không thể hoàn tất thao tác Stage 01.'
}

function dimensionLabel(value: string): string {
  return {
    customer_need: 'Nhu cầu khách hàng',
    scope_capability: 'Khả năng đáp ứng phạm vi',
    resources_schedule: 'Nguồn lực và tiến độ',
    commercial_viability: 'Tính khả thi thương mại',
    risk_special_conditions: 'Rủi ro và điều kiện đặc biệt',
  }[value] ?? value
}

function criticalityLabel(value: string): string {
  return {
    required: 'Bắt buộc', optional: 'Tùy chọn', conditional: 'Có điều kiện',
  }[value] ?? value
}

function resultLabel(value: string | null): string {
  return {
    fit: 'Phù hợp', concern: 'Cần lưu ý', not_fit: 'Không phù hợp', insufficient_information: 'Thiếu thông tin',
  }[value ?? ''] ?? 'Không áp dụng'
}

function recommendationLabel(value: 'recommend_proceed' | 'recommend_not_proceeding'): string {
  return value === 'recommend_proceed' ? 'Đề xuất tiếp tục' : 'Đề xuất không tiếp tục'
}

function outcomeLabel(value: 'proceed' | 'not_proceeding'): string {
  return value === 'proceed' ? 'Tiếp tục' : 'Không tiếp tục'
}

function clearNotice(): void {
  error.value = null
  success.value = null
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

async function submitEvaluation(criterionKey: string): Promise<void> {
  const draft = draftFor(criterionKey)
  const rationale = draft.rationale.trim()
  const evidenceText = draft.evidence.trim()
  const result = draft.applicability === 'not_applicable' ? null : draft.result
  if (result === '') {
    error.value = 'Chọn kết quả đánh giá cho tiêu chí áp dụng.'
    return
  }
  if (!rationale && !evidenceText) {
    error.value = 'Cần nhập lý do hoặc bằng chứng.'
    return
  }
  await command('Đã lưu bản đánh giá mới.', () => repositories.stage01.evaluateCriterion(props.detail.opportunity.id, criterionKey, {
    expectedCycleVersion: props.detail.currentDecisionCycle.version,
    applicability: draft.applicability,
    result,
    rationale,
    evidence: evidenceText ? [evidenceText] : [],
  }))
}

async function submitRecommendation(): Promise<void> {
  const rationale = recommendation.rationale.trim()
  const evidenceText = recommendation.evidence.trim()
  if (!rationale) {
    error.value = 'Cần nhập lý do đề xuất.'
    return
  }
  await command('Đã gửi đề xuất.', () => repositories.stage01.submitRecommendation(props.detail.opportunity.id, {
    expectedCycleVersion: props.detail.currentDecisionCycle.version,
    recommendation: recommendation.value,
    rationale,
    evidence: evidenceText ? [evidenceText] : [],
  }))
}

async function submitClarification(): Promise<void> {
  const reason = clarificationReason.value.trim()
  const current = currentRecommendation.value
  if (!current || !reason) {
    error.value = 'Cần nhập lý do yêu cầu làm rõ.'
    return
  }
  await command('Đã gửi yêu cầu làm rõ.', () => repositories.stage01.returnForClarification(props.detail.opportunity.id, {
    expectedCycleVersion: props.detail.currentDecisionCycle.version,
    recommendationId: current.id,
    reason,
  }))
}

async function submitDecision(): Promise<void> {
  const rationale = decision.rationale.trim()
  const overrideRationale = decision.overrideRationale.trim()
  if (!rationale) {
    error.value = 'Cần nhập lý do quyết định.'
    return
  }
  if (overrideRationaleRequired.value && !overrideRationale) {
    error.value = 'Cần nhập lý do ghi đè quyết định.'
    return
  }
  clearNotice()
  try {
    await props.runAndReload(() => repositories.stage01.recordFinalDecision(props.detail.opportunity.id, {
      expectedCycleVersion: props.detail.currentDecisionCycle.version,
      outcome: decision.outcome,
      rationale,
      ...(overrideRationale ? { overrideRationale } : {}),
    }))
    success.value = 'Đã ghi nhận quyết định cuối cùng.'
  }
  catch (caught) {
    if (caught instanceof ClientError && caught.code === 'STAGE01_OVERRIDE_RATIONALE_REQUIRED') {
      overrideRationaleRequired.value = true
    }
    error.value = caught
  }
}

async function submitReactivation(): Promise<void> {
  const reason = reactivationReason.value.trim()
  if (!reason) {
    error.value = 'Cần nhập lý do kích hoạt lại.'
    return
  }
  const completed = await command('Đã kích hoạt lại Stage 01.', () => repositories.stage01.reactivate(props.detail.opportunity.id, {
    expectedOpportunityVersion: props.detail.opportunity.version,
    expectedExecutionVersion: props.detail.evaluation.runtime.version,
    expectedCycleVersion: props.detail.currentDecisionCycle.version,
    reason,
  }))
  if (completed) {
    reactivationOpen.value = false
    reactivationReason.value = ''
  }
}

function openReactivation(): void {
  reactivationOpen.value = true
}
</script>

<template>
  <section class="evaluation-decision" aria-labelledby="evaluation-decision-heading">
    <div>
      <p class="eyebrow">01.2 · Snapshot đã gắn</p>
      <h2 id="evaluation-decision-heading">Đánh giá, đề xuất và quyết định</h2>
      <p>Mọi bản sửa và chu kỳ trước được giữ nguyên; thao tác thành công luôn tải lại dữ liệu chính thức.</p>
    </div>

    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" title="Không thể hoàn tất thao tác" :description="errorMessage(error)" />
    <UAlert v-if="success" color="success" icon="i-lucide-circle-check" title="Đã cập nhật" :description="success" />

    <article v-for="criterion in criteria" :key="criterion.key" class="evaluation-decision__criterion">
      <header>
        <div>
          <p class="eyebrow">{{ dimensionLabel(criterion.dimensionKey) }} · {{ criticalityLabel(criterion.criticality) }}</p>
          <h3>{{ criterion.label }}</h3>
          <p>{{ criterion.description }}</p>
        </div>
        <span v-if="latestCriterionRevision(detail.currentDecisionCycle.evaluations, criterion.key)">Bản mới nhất #{{ latestCriterionRevision(detail.currentDecisionCycle.evaluations, criterion.key)?.revision }}</span>
        <span v-else>Chưa đánh giá</span>
      </header>

      <ol v-if="detail.currentDecisionCycle.evaluations.filter(item => item.criterionKey === criterion.key).length" class="evaluation-decision__history" :aria-label="`Lịch sử ${criterion.label}`">
        <li v-for="item in detail.currentDecisionCycle.evaluations.filter(item => item.criterionKey === criterion.key).sort((left, right) => right.revision - left.revision)" :key="item.id">
          <strong>Bản sửa #{{ item.revision }}</strong>
          <span>{{ item.applicability === 'not_applicable' ? 'Không áp dụng' : resultLabel(item.result) }} · {{ item.rationale ?? 'Không có lý do' }}</span>
        </li>
      </ol>

      <form v-if="canEvaluate" class="evaluation-decision__form" @submit.prevent="submitEvaluation(criterion.key)">
        <label>Khả năng áp dụng: {{ criterion.label }}
          <select v-model="draftFor(criterion.key).applicability">
            <option value="applicable">Áp dụng</option>
            <option v-if="criterion.allowsNotApplicable" value="not_applicable">Không áp dụng</option>
          </select>
        </label>
        <label>Kết quả đánh giá: {{ criterion.label }}
          <select v-model="draftFor(criterion.key).result" :disabled="draftFor(criterion.key).applicability === 'not_applicable'">
            <option disabled value="">Chọn kết quả</option>
            <option value="fit">Phù hợp</option>
            <option value="concern">Cần lưu ý</option>
            <option value="not_fit">Không phù hợp</option>
            <option value="insufficient_information">Thiếu thông tin</option>
          </select>
        </label>
        <label>Lý do: {{ criterion.label }}<textarea v-model="draftFor(criterion.key).rationale" /></label>
        <label>Bằng chứng: {{ criterion.label }}<textarea v-model="draftFor(criterion.key).evidence" /></label>
        <UButton type="submit">Lưu đánh giá: {{ criterion.label }}</UButton>
      </form>
    </article>

    <section class="evaluation-decision__section" aria-labelledby="recommendation-heading">
      <div><p class="eyebrow">Đề xuất</p><h3 id="recommendation-heading">Lịch sử đề xuất</h3></div>
      <ol class="evaluation-decision__history">
        <li v-for="item in [...detail.currentDecisionCycle.recommendations].sort((left, right) => left.version - right.version)" :key="item.id">
          <strong>Phiên bản đề xuất #{{ item.version }}</strong><span>{{ recommendationLabel(item.recommendation) }} · {{ item.rationale }}</span>
        </li>
        <li v-if="!detail.currentDecisionCycle.recommendations.length">Chưa có đề xuất.</li>
      </ol>
      <form v-if="canRecommend" class="evaluation-decision__form" @submit.prevent="submitRecommendation">
        <label>Loại đề xuất<select v-model="recommendation.value"><option value="recommend_proceed">Đề xuất tiếp tục</option><option value="recommend_not_proceeding">Đề xuất không tiếp tục</option></select></label>
        <label>Lý do đề xuất<textarea v-model="recommendation.rationale" /></label>
        <label>Bằng chứng đề xuất<textarea v-model="recommendation.evidence" /></label>
        <UButton type="submit">Gửi đề xuất</UButton>
      </form>
    </section>

    <section class="evaluation-decision__section" aria-labelledby="clarification-heading">
      <div><p class="eyebrow">Làm rõ</p><h3 id="clarification-heading">Lịch sử yêu cầu làm rõ</h3></div>
      <ol class="evaluation-decision__history">
        <li v-for="item in detail.currentDecisionCycle.clarificationReturns" :key="item.id"><strong>Yêu cầu làm rõ</strong><span>{{ item.reason }}</span></li>
        <li v-if="!detail.currentDecisionCycle.clarificationReturns.length">Chưa có yêu cầu làm rõ.</li>
      </ol>
      <form v-if="canClarify" class="evaluation-decision__form" @submit.prevent="submitClarification">
        <label>Lý do yêu cầu làm rõ<textarea v-model="clarificationReason" /></label>
        <UButton type="submit">Yêu cầu làm rõ</UButton>
      </form>
    </section>

    <section class="evaluation-decision__section" aria-labelledby="decision-heading">
      <div><p class="eyebrow">Quyết định cuối cùng</p><h3 id="decision-heading">Quyết định và kích hoạt lại</h3></div>
      <p v-if="completed" class="evaluation-decision__final"><strong>Quyết định đã ghi nhận: {{ outcomeLabel(detail.currentDecisionCycle.finalOutcome!) }}</strong><span> · {{ detail.currentDecisionCycle.finalRationale }}</span></p>
      <form v-if="canRecordDecision" class="evaluation-decision__form" @submit.prevent="submitDecision">
        <label>Kết quả quyết định<select v-model="decision.outcome"><option value="proceed">Tiếp tục</option><option value="not_proceeding">Không tiếp tục</option></select></label>
        <label>Lý do quyết định<textarea v-model="decision.rationale" /></label>
        <label v-if="overrideRationaleRequired">Lý do ghi đè quyết định<textarea v-model="decision.overrideRationale" required /></label>
        <UButton type="submit">Ghi nhận quyết định</UButton>
      </form>
      <UButton v-if="canReactivate && !reactivationOpen" variant="outline" @click="openReactivation">Kích hoạt lại Stage 01</UButton>
      <form v-if="reactivationOpen" class="evaluation-decision__form" @submit.prevent="submitReactivation">
        <label>Lý do kích hoạt lại<textarea v-model="reactivationReason" required /></label>
        <UButton type="submit">Xác nhận kích hoạt lại</UButton>
      </form>
    </section>

    <section class="evaluation-decision__section" aria-labelledby="cycle-history-heading">
      <div><p class="eyebrow">Lịch sử bất biến</p><h3 id="cycle-history-heading">Chu kỳ quyết định</h3></div>
      <ol class="evaluation-decision__history">
        <li v-for="cycle in cycles" :key="cycle.id">
          <strong>Chu kỳ #{{ cycle.cycleNo }} · {{ cycle.finalOutcome ? 'Đã hoàn tất' : 'Đang xử lý' }}</strong>
          <span v-if="cycle.reactivationReason">Kích hoạt lại: {{ cycle.reactivationReason }}</span>
          <span v-else-if="cycle.finalOutcome">{{ outcomeLabel(cycle.finalOutcome) }} · {{ cycle.finalRationale }}</span>
          <span v-else>Chưa có quyết định cuối cùng.</span>
        </li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.evaluation-decision { display: grid; gap: 14px; }.evaluation-decision > div > p:not(.eyebrow),.evaluation-decision__criterion header > div > p:not(.eyebrow) { margin-top: 5px; color: var(--ink-muted); line-height: 1.45; }.evaluation-decision h2 { margin-top: 4px; font-size: 1.3rem; }.evaluation-decision h3 { margin: 4px 0 0; color: var(--forest-deep); font-size: 1rem; }.evaluation-decision__criterion,.evaluation-decision__section { display: grid; gap: 10px; padding: 15px; border: 1px solid var(--line); background: var(--paper-raised); }.evaluation-decision__criterion > header { display: flex; justify-content: space-between; align-items: start; gap: 12px; }.evaluation-decision__criterion > header > span { color: var(--ink-muted); font-size: .75rem; white-space: nowrap; }.evaluation-decision__history { display: grid; padding: 0; margin: 0; list-style: none; border: 1px solid var(--line); }.evaluation-decision__history li { display: grid; gap: 3px; padding: 9px 10px; border-bottom: 1px solid var(--line); }.evaluation-decision__history li:last-child { border-bottom: 0; }.evaluation-decision__history strong { color: var(--forest-deep); font-size: .8rem; }.evaluation-decision__history span,.evaluation-decision__final { color: var(--ink-muted); font-size: .79rem; line-height: 1.45; }.evaluation-decision__form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding-top: 10px; }.evaluation-decision__form label { display: grid; gap: 5px; color: var(--forest-deep); font-size: .77rem; font-weight: 700; }.evaluation-decision__form textarea,.evaluation-decision__form select { width: 100%; min-height: 40px; padding: 8px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); font: inherit; }.evaluation-decision__form textarea { min-height: 70px; resize: vertical; }.evaluation-decision__form > button { grid-column: 1 / -1; }
@media (max-width: 620px) { .evaluation-decision__criterion > header { flex-direction: column; }.evaluation-decision__form { grid-template-columns: 1fr; }.evaluation-decision__form > button { grid-column: auto; } }
</style>
