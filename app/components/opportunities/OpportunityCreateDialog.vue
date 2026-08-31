<script setup lang="ts">
import type { CreateOpportunityInput } from '../../features/opportunities/opportunity.types'
import type { Stage01BusinessConfigView } from '../../../shared/schemas/stage01-config'

const props = defineProps<{
  open: boolean
  config: Stage01BusinessConfigView | null
  loading: boolean
  error: unknown | null
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [input: CreateOpportunityInput]
  retry: []
}>()

const primaryCustomerName = ref('')
const customerTypeCode = ref('')
const needDescription = ref('')
const locationStatus = ref('')
const locationText = ref('')
const primaryLeadSourceCode = ref('')
const engagementStatusCode = ref('')
const budgetStatusCode = ref('')
const budgetMin = ref('')
const budgetMax = ref('')
const currencyCode = ref('')
const budgetNote = ref('')
const timelineStatusCode = ref('')
const timelineStartDate = ref('')
const timelineEndDate = ref('')
const timelineNote = ref('')
const priorityCode = ref('')

const dialogOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function optional(value: string): string | undefined {
  return value.trim() || undefined
}

function optionalNumber(value: string): number | undefined {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined
}

function optionalLocationStatus(): CreateOpportunityInput['locationStatus'] {
  return ['unknown', 'area_known', 'relative', 'exact'].includes(locationStatus.value)
    ? locationStatus.value as CreateOpportunityInput['locationStatus']
    : undefined
}

function submit(): void {
  const name = optional(primaryCustomerName.value)
  if (!name || props.submitting || !props.config) return
  emit('submit', {
    primaryCustomerName: name,
    customerTypeCode: optional(customerTypeCode.value),
    needDescription: optional(needDescription.value),
    locationStatus: optionalLocationStatus(),
    locationText: optional(locationText.value),
    primaryLeadSourceCode: optional(primaryLeadSourceCode.value),
    engagementStatusCode: optional(engagementStatusCode.value),
    budgetStatusCode: optional(budgetStatusCode.value),
    budgetMin: optionalNumber(budgetMin.value),
    budgetMax: optionalNumber(budgetMax.value),
    currencyCode: optional(currencyCode.value)?.toUpperCase(),
    budgetNote: optional(budgetNote.value),
    timelineStatusCode: optional(timelineStatusCode.value),
    timelineStartDate: optional(timelineStartDate.value),
    timelineEndDate: optional(timelineEndDate.value),
    timelineNote: optional(timelineNote.value),
    priorityCode: optional(priorityCode.value),
  })
}

function close(): void {
  if (!props.submitting) dialogOpen.value = false
}
</script>

<template>
  <UModal v-model:open="dialogOpen" title="Tạo cơ hội mới" description="Ghi nhận cơ hội và khởi tạo Stage 01 theo cấu hình mới nhất." :dismissible="!submitting">
    <template #body>
      <div v-if="loading" class="opportunity-create__loading" aria-label="Đang tải cấu hình tạo cơ hội"><USkeleton class="h-12 w-full" /><USkeleton class="h-40 w-full" /></div>
      <UAlert v-else-if="error" role="alert" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Không thể tải cấu hình tạo cơ hội" description="Vui lòng thử lại trước khi tạo cơ hội.">
        <template #actions><UButton color="error" variant="outline" @click="emit('retry')">Thử lại</UButton></template>
      </UAlert>
      <form v-else-if="config" class="opportunity-create" @submit.prevent="submit">
        <div class="opportunity-create__intro"><p class="eyebrow">Cơ hội mới</p><p>Danh mục bên dưới được lấy từ cấu hình Stage 01 đang xuất bản.</p></div>
        <label>Tên khách hàng chính<input v-model="primaryCustomerName" name="primaryCustomerName" required autocomplete="organization"></label>
        <label>Loại khách hàng<select v-model="customerTypeCode" name="customerTypeCode"><option value="">Chưa xác định</option><option v-for="item in config.published.taxonomies.customer_type" :key="item.code" :value="item.code">{{ item.label }}</option></select></label>
        <label>Nhu cầu<input v-model="needDescription" name="needDescription"></label>
        <div class="opportunity-create__two"><label>Trạng thái vị trí<select v-model="locationStatus" name="locationStatus"><option value="">Chưa xác định</option><option value="unknown">Chưa rõ</option><option value="area_known">Đã biết khu vực</option><option value="relative">Tương đối</option><option value="exact">Chính xác</option></select></label><label>Vị trí<input v-model="locationText" name="locationText"></label></div>
        <div class="opportunity-create__two"><label>Nguồn khách hàng<select v-model="primaryLeadSourceCode" name="primaryLeadSourceCode"><option value="">Chưa xác định</option><option v-for="item in config.published.taxonomies.lead_source" :key="item.code" :value="item.code">{{ item.label }}</option></select></label><label>Mức độ tương tác<select v-model="engagementStatusCode" name="engagementStatusCode"><option value="">Chưa xác định</option><option v-for="item in config.published.taxonomies.engagement_status" :key="item.code" :value="item.code">{{ item.label }}</option></select></label></div>
        <fieldset><legend>Ngân sách</legend><div class="opportunity-create__two"><label>Trạng thái ngân sách<select v-model="budgetStatusCode" name="budgetStatusCode"><option value="">Chưa xác định</option><option v-for="item in config.published.taxonomies.budget_status" :key="item.code" :value="item.code">{{ item.label }}</option></select></label><label>Đơn vị tiền tệ<input v-model="currencyCode" name="currencyCode" maxlength="3" placeholder="VND"></label><label>Ngân sách từ<input v-model="budgetMin" name="budgetMin" type="number" min="0"></label><label>Ngân sách đến<input v-model="budgetMax" name="budgetMax" type="number" min="0"></label></div><label>Ghi chú ngân sách<input v-model="budgetNote" name="budgetNote"></label></fieldset>
        <fieldset><legend>Tiến độ</legend><div class="opportunity-create__two"><label>Trạng thái tiến độ<select v-model="timelineStatusCode" name="timelineStatusCode"><option value="">Chưa xác định</option><option v-for="item in config.published.taxonomies.timeline_status" :key="item.code" :value="item.code">{{ item.label }}</option></select></label><label>Mức độ ưu tiên<select v-model="priorityCode" name="priorityCode"><option value="">Chưa xác định</option><option v-for="item in config.published.taxonomies.priority" :key="item.code" :value="item.code">{{ item.label }}</option></select></label><label>Ngày bắt đầu<input v-model="timelineStartDate" name="timelineStartDate" type="date"></label><label>Ngày kết thúc<input v-model="timelineEndDate" name="timelineEndDate" type="date"></label></div><label>Ghi chú tiến độ<input v-model="timelineNote" name="timelineNote"></label></fieldset>
        <div class="opportunity-create__actions"><UButton color="neutral" variant="outline" type="button" :disabled="submitting" @click="close">Hủy</UButton><UButton type="submit" :loading="submitting">Tạo cơ hội</UButton></div>
      </form>
    </template>
  </UModal>
</template>

<style scoped>
.opportunity-create,.opportunity-create__loading { display: grid; gap: 14px; }.opportunity-create__intro { display: grid; gap: 4px; }.opportunity-create__intro p:last-child { color: var(--ink-muted); font-size: .82rem; line-height: 1.45; }.opportunity-create label { display: grid; gap: 5px; color: var(--forest-deep); font-size: .76rem; font-weight: 700; }.opportunity-create input,.opportunity-create select { width: 100%; min-height: 42px; padding: 8px 10px; border: 1px solid var(--line); background: var(--paper-raised); color: var(--ink); font: inherit; }.opportunity-create fieldset { display: grid; gap: 10px; margin: 0; padding: 13px; border: 1px solid var(--line); }.opportunity-create legend { padding: 0 5px; color: var(--forest); font-size: .78rem; font-weight: 800; }.opportunity-create__two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.opportunity-create__actions { display: flex; justify-content: end; gap: 8px; padding-top: 4px; }
@media (max-width: 560px) { .opportunity-create__two { grid-template-columns: 1fr; }.opportunity-create__actions { flex-direction: column-reverse; }.opportunity-create__actions :deep(button) { width: 100%; justify-content: center; } }
</style>
