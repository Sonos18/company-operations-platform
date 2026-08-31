<script setup lang="ts">
import { ClientError } from '../../errors/client-error'
import { taxonomyLabel } from '../../features/stage01-operational/stage01-operational'
import type { Stage01OperationalDetail } from '../../features/stage01/stage01.types'

const props = defineProps<{
  detail: Stage01OperationalDetail
  runAndReload: <T>(action: () => Promise<T>) => Promise<T>
  reload: () => Promise<unknown>
}>()

const repositories = useRepositories()
const access = useNuxtApp().$companyAccessStore
const error = ref<unknown | null>(null)
const success = ref<string | null>(null)
const editingOpportunity = ref(false)
const invalidating = ref(false)
const restoring = ref(false)
const addingContact = ref(false)
const editingContactId = ref<string | null>(null)
const editingMethodId = ref<string | null>(null)
const addingScope = ref(false)
const addingReferrer = ref(false)
const addingRecord = ref(false)
const raisingDuplicate = ref(false)
const resolvingConcernId = ref<string | null>(null)
const canonicalOptions = ref<Awaited<ReturnType<typeof repositories.opportunities.list>> | null>(null)

const opportunity = reactive({
  primaryCustomerName: props.detail.opportunity.primaryCustomerName ?? '', needDescription: props.detail.opportunity.needDescription ?? '',
  customerTypeCode: props.detail.opportunity.customerTypeCode ?? '', primaryLeadSourceCode: props.detail.opportunity.primaryLeadSourceCode ?? '',
  engagementStatusCode: props.detail.opportunity.engagementStatusCode ?? '', budgetStatusCode: props.detail.opportunity.budgetStatusCode ?? '',
  timelineStatusCode: props.detail.opportunity.timelineStatusCode ?? '', priorityCode: props.detail.opportunity.priorityCode ?? '',
  locationStatus: props.detail.opportunity.locationStatus, locationText: props.detail.opportunity.locationText ?? '',
  budgetMin: props.detail.opportunity.budgetMin?.toString() ?? '', budgetMax: props.detail.opportunity.budgetMax?.toString() ?? '',
  currencyCode: props.detail.opportunity.currencyCode ?? '', budgetNote: props.detail.opportunity.budgetNote ?? '',
  timelineStartDate: props.detail.opportunity.timelineStartDate ?? '', timelineEndDate: props.detail.opportunity.timelineEndDate ?? '', timelineNote: props.detail.opportunity.timelineNote ?? '',
})
const invalidReasonCode = ref('')
const invalidReason = ref('')
const restoreReason = ref('')
const contact = reactive({ displayName: '', relationshipCode: '', methodType: 'phone', methodValue: '', isPrimary: false })
const contactEdit = reactive({ displayName: '', notes: '', version: 0 })
const methodEdit = reactive({ contactId: '', methodType: 'phone' as 'phone' | 'email' | 'other', value: '', isUsable: true, version: 0 })
const scope = reactive({ scopeCode: '', note: '' })
const referrer = reactive({ referrerTypeCode: '', displayName: '', note: '', isPrimary: false })
const record = reactive({ channelCode: '', summary: '' })
const correction = reactive({ recordId: '', channelCode: '', summary: '', reason: '' })
const duplicate = reactive({ description: '', suspectedDuplicateOpportunityId: '' })
const resolution = reactive({ resolution: 'different_need' as 'same_need' | 'different_need', canonicalOpportunityId: '', note: '' })

const canUpdate = computed(() => access.hasPermission('opportunity.update'))
const canInvalidate = computed(() => access.hasPermission('opportunity.invalidate'))
const canRestore = computed(() => access.hasPermission('opportunity.restore'))
const canContact = computed(() => access.hasPermission('opportunity.contact.manage'))
const canScope = computed(() => access.hasPermission('opportunity.scope.manage'))
const canReferrer = computed(() => access.hasPermission('opportunity.referrer.manage'))
const canRecord = computed(() => access.hasPermission('opportunity.intake_record.create'))
const canRaiseDuplicate = computed(() => access.hasPermission('opportunity.duplicate.raise'))
const canResolveDuplicate = computed(() => access.hasPermission('opportunity.duplicate.resolve'))

function message(value: unknown, fallback = 'Không thể hoàn tất thao tác.'): string {
  return value instanceof Error && value.message ? value.message : fallback
}

function clearNotice(): void { error.value = null; success.value = null }
function optionalText(value: string): string | undefined { return value.trim() || undefined }
function optionalNumber(value: string): number | undefined { return value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined }

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

async function saveOpportunity(): Promise<void> {
  const didSave = await command('Đã lưu thông tin cơ hội chính tắc.', () => repositories.opportunities.update(props.detail.opportunity.id, {
    primaryCustomerName: opportunity.primaryCustomerName.trim() || undefined, needDescription: opportunity.needDescription.trim() || undefined,
    customerTypeCode: opportunity.customerTypeCode || undefined, primaryLeadSourceCode: opportunity.primaryLeadSourceCode || undefined,
    engagementStatusCode: opportunity.engagementStatusCode || undefined, budgetStatusCode: opportunity.budgetStatusCode || undefined,
    timelineStatusCode: opportunity.timelineStatusCode || undefined, priorityCode: opportunity.priorityCode || undefined,
    locationStatus: opportunity.locationStatus, locationText: optionalText(opportunity.locationText), budgetMin: optionalNumber(opportunity.budgetMin), budgetMax: optionalNumber(opportunity.budgetMax),
    currencyCode: optionalText(opportunity.currencyCode)?.toUpperCase(), budgetNote: optionalText(opportunity.budgetNote), timelineStartDate: optionalText(opportunity.timelineStartDate), timelineEndDate: optionalText(opportunity.timelineEndDate), timelineNote: optionalText(opportunity.timelineNote),
    expectedOpportunityVersion: props.detail.opportunity.version,
  }))
  if (didSave) editingOpportunity.value = false
}

async function invalidate(): Promise<void> {
  if (!invalidReasonCode.value || !invalidReason.value.trim()) return
  const didSave = await command('Cơ hội đã được chuyển sang không hiệu lực.', () => repositories.opportunities.invalidate(props.detail.opportunity.id, {
    invalidReasonCode: invalidReasonCode.value, reason: invalidReason.value.trim(), expectedOpportunityVersion: props.detail.opportunity.version,
  }))
  if (didSave) invalidating.value = false
}

async function restore(): Promise<void> {
  if (!restoreReason.value.trim()) return
  const didSave = await command('Cơ hội đã được khôi phục hiệu lực.', () => repositories.opportunities.restore(props.detail.opportunity.id, {
    reason: restoreReason.value.trim(), evidence: [], expectedOpportunityVersion: props.detail.opportunity.version,
  }))
  if (didSave) restoring.value = false
}

async function addContact(): Promise<void> {
  if (!contact.displayName.trim() || !contact.relationshipCode) return
  clearNotice()
  try {
    await props.runAndReload(async () => {
      const created = await repositories.opportunities.createContact({ displayName: contact.displayName.trim() })
      if (contact.methodValue.trim()) await repositories.opportunities.addContactMethod(created.id, { methodType: contact.methodType as 'phone' | 'email' | 'other', value: contact.methodValue.trim(), isUsable: true, expectedContactVersion: created.version })
      try {
        await repositories.opportunities.linkContact(props.detail.opportunity.id, { contactId: created.id, relationshipCode: contact.relationshipCode, isPrimary: contact.isPrimary, expectedOpportunityVersion: props.detail.opportunity.version })
      }
      catch (caught) {
        throw new Error(`Không thể liên kết liên hệ: ${message(caught)}`, { cause: caught })
      }
    })
    success.value = 'Đã tạo và liên kết liên hệ.'
    addingContact.value = false
  }
  catch (caught) { error.value = caught }
}

async function setPrimaryContact(contactId: string, relationshipCode: string): Promise<void> {
  await command('Đã cập nhật liên hệ chính.', () => repositories.opportunities.setPrimaryContact(props.detail.opportunity.id, { contactId, relationshipCode, expectedOpportunityVersion: props.detail.opportunity.version }))
}
function openContactEditor(contactId: string): void {
  const selected = props.detail.relatedContacts.find(item => item.id === contactId)
  if (!selected) return
  editingContactId.value = contactId
  contactEdit.displayName = selected.displayName
  contactEdit.notes = selected.notes ?? ''
  contactEdit.version = selected.version
}
async function updateContact(): Promise<void> {
  if (!editingContactId.value || !contactEdit.displayName.trim()) return
  const didSave = await command('Đã cập nhật liên hệ.', () => repositories.opportunities.updateContact(editingContactId.value!, { displayName: contactEdit.displayName.trim(), notes: contactEdit.notes.trim() || null, expectedContactVersion: contactEdit.version }))
  if (didSave) editingContactId.value = null
}
function openMethodEditor(contactId: string, method: Stage01OperationalDetail['relatedContacts'][number]['methods'][number], version: number): void {
  editingMethodId.value = method.id
  methodEdit.contactId = contactId
  methodEdit.methodType = method.methodType
  methodEdit.value = method.value
  methodEdit.isUsable = method.isUsable
  methodEdit.version = version
}
async function updateMethod(): Promise<void> {
  if (!editingMethodId.value || !methodEdit.value.trim()) return
  const didSave = await command('Đã cập nhật phương thức liên hệ.', () => repositories.opportunities.updateContactMethod(methodEdit.contactId, editingMethodId.value!, { methodType: methodEdit.methodType, value: methodEdit.value.trim(), isUsable: methodEdit.isUsable, expectedContactVersion: methodEdit.version }))
  if (didSave) editingMethodId.value = null
}
async function endContact(id: string): Promise<void> {
  await command('Đã kết thúc quan hệ liên hệ.', () => repositories.opportunities.endContactRelationship(props.detail.opportunity.id, id, { endReason: 'Không còn áp dụng', expectedOpportunityVersion: props.detail.opportunity.version }))
}
async function addNewScope(): Promise<void> {
  if (!scope.scopeCode) return
  const didSave = await command('Đã thêm phạm vi.', () => repositories.opportunities.addScope(props.detail.opportunity.id, { scopeCode: scope.scopeCode, note: scope.note.trim() || undefined, expectedOpportunityVersion: props.detail.opportunity.version }))
  if (didSave) addingScope.value = false
}
async function retireScope(id: string): Promise<void> { await command('Đã lưu lịch sử ngừng áp dụng phạm vi.', () => repositories.opportunities.retireScope(props.detail.opportunity.id, id, { retireReason: 'Không còn áp dụng', expectedOpportunityVersion: props.detail.opportunity.version })) }
async function addNewReferrer(): Promise<void> {
  if (!referrer.referrerTypeCode || !referrer.displayName.trim()) return
  const didSave = await command('Đã thêm người giới thiệu.', () => repositories.opportunities.addReferrer(props.detail.opportunity.id, { referrerTypeCode: referrer.referrerTypeCode, displayName: referrer.displayName.trim(), note: referrer.note.trim() || undefined, isPrimary: referrer.isPrimary, expectedOpportunityVersion: props.detail.opportunity.version }))
  if (didSave) addingReferrer.value = false
}
async function setPrimaryReferrer(item: Stage01OperationalDetail['opportunity']['referrers'][number]): Promise<void> { await command('Đã cập nhật người giới thiệu chính.', () => repositories.opportunities.setPrimaryReferrer(props.detail.opportunity.id, { referrerTypeCode: item.referrerTypeCode, displayName: item.displayName, contactId: item.contactId, note: item.note ?? undefined, reliabilityState: item.reliabilityState ?? undefined, expectedOpportunityVersion: props.detail.opportunity.version })) }
async function endReferrer(id: string): Promise<void> { await command('Đã kết thúc quan hệ người giới thiệu.', () => repositories.opportunities.endReferrer(props.detail.opportunity.id, id, { endReason: 'Không còn áp dụng', expectedOpportunityVersion: props.detail.opportunity.version })) }
async function appendRecord(): Promise<void> {
  if (!record.channelCode || !record.summary.trim()) return
  const didSave = await command('Đã ghi nhận bản ghi tiếp nhận mới.', () => repositories.opportunities.addIntakeRecord(props.detail.opportunity.id, { channelCode: record.channelCode, summary: record.summary.trim(), expectedOpportunityVersion: props.detail.opportunity.version }))
  if (didSave) addingRecord.value = false
}
async function correctRecord(): Promise<void> {
  if (!correction.recordId || !correction.channelCode || !correction.summary.trim() || !correction.reason.trim()) return
  await command('Đã bổ sung bản ghi hiệu chỉnh, bản gốc vẫn được giữ.', () => repositories.opportunities.correctIntakeRecord(props.detail.opportunity.id, correction.recordId, { channelCode: correction.channelCode, summary: correction.summary.trim(), correctionReason: correction.reason.trim(), expectedOpportunityVersion: props.detail.opportunity.version }))
}
async function raiseConcern(): Promise<void> {
  if (!duplicate.description.trim()) return
  const didSave = await command('Đã ghi nhận nghi vấn trùng lặp.', () => repositories.opportunities.raiseDuplicateConcern(props.detail.opportunity.id, { description: duplicate.description.trim(), suspectedDuplicateOpportunityId: duplicate.suspectedDuplicateOpportunityId || undefined, expectedOpportunityVersion: props.detail.opportunity.version }))
  if (didSave) raisingDuplicate.value = false
}
async function loadCanonicalOptions(): Promise<void> {
  if (canonicalOptions.value) return
  clearNotice()
  try { canonicalOptions.value = await repositories.opportunities.list() }
  catch (caught) { error.value = caught }
}
async function resolveConcern(id: string): Promise<void> {
  if (!resolution.note.trim() || (resolution.resolution === 'same_need' && !resolution.canonicalOpportunityId)) return
  const didSave = await command('Đã giải quyết nghi vấn trùng lặp.', () => repositories.opportunities.resolveDuplicateConcern(props.detail.opportunity.id, id, { resolution: resolution.resolution, canonicalOpportunityId: resolution.resolution === 'same_need' ? resolution.canonicalOpportunityId : undefined, resolutionNote: resolution.note.trim(), expectedOpportunityVersion: props.detail.opportunity.version }))
  if (didSave) resolvingConcernId.value = null
}
async function reloadCanonical(): Promise<void> { await props.reload() }
function toggleOpportunityEditor(): void { editingOpportunity.value = !editingOpportunity.value }
function toggleInvalidation(): void { invalidating.value = !invalidating.value }
function toggleRestore(): void { restoring.value = !restoring.value }
function toggleContactForm(): void { addingContact.value = !addingContact.value }
function toggleScopeForm(): void { addingScope.value = !addingScope.value }
function toggleReferrerForm(): void { addingReferrer.value = !addingReferrer.value }
function toggleRecordForm(): void { addingRecord.value = !addingRecord.value }
function toggleDuplicateForm(): void { raisingDuplicate.value = !raisingDuplicate.value }
function openResolution(id: string): void { resolvingConcernId.value = id }
function onResolutionChange(): void { if (resolution.resolution === 'same_need') void loadCanonicalOptions() }
</script>

<template>
  <section class="intake-controls" aria-label="Nghiệp vụ tiếp nhận">
    <UAlert v-if="error" role="alert" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Không thể hoàn tất thao tác" :description="message(error)">
      <template v-if="error instanceof ClientError && error.code === 'VERSION_CONFLICT'" #actions><UButton color="error" variant="outline" @click="reloadCanonical">Tải lại chính tắc</UButton></template>
    </UAlert>
    <UAlert v-if="success" color="success" variant="subtle" icon="i-lucide-circle-check" :title="success" />

    <article class="intake-controls__card">
      <header><div><p class="eyebrow">Cơ hội</p><h2>Thông tin và hiệu lực</h2></div><div class="intake-controls__actions"><UButton v-if="canUpdate" size="sm" variant="outline" @click="toggleOpportunityEditor">Chỉnh sửa cơ hội</UButton><UButton v-if="canInvalidate && detail.opportunity.validityState === 'valid'" size="sm" color="error" variant="outline" @click="toggleInvalidation">Làm mất hiệu lực</UButton><UButton v-if="canRestore && detail.opportunity.validityState === 'invalid'" size="sm" color="primary" variant="outline" @click="toggleRestore">Khôi phục hiệu lực</UButton></div></header>
      <form v-if="editingOpportunity" class="intake-controls__form" @submit.prevent="saveOpportunity"><label>Tên khách hàng chính<input v-model="opportunity.primaryCustomerName" required></label><label>Nhu cầu<input v-model="opportunity.needDescription"></label><label>Trạng thái vị trí<select v-model="opportunity.locationStatus"><option value="unknown">Chưa rõ</option><option value="area_known">Đã biết khu vực</option><option value="relative">Tương đối</option><option value="exact">Chính xác</option></select></label><label>Vị trí<input v-model="opportunity.locationText"></label><label>Loại khách hàng<select v-model="opportunity.customerTypeCode"><option value="">Chưa xác định</option><option v-for="entry in detail.configuration.taxonomies.customer_type" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Nguồn khách hàng<select v-model="opportunity.primaryLeadSourceCode"><option value="">Chưa xác định</option><option v-for="entry in detail.configuration.taxonomies.lead_source" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Mức độ tương tác<select v-model="opportunity.engagementStatusCode"><option value="">Chưa xác định</option><option v-for="entry in detail.configuration.taxonomies.engagement_status" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Trạng thái ngân sách<select v-model="opportunity.budgetStatusCode"><option value="">Chưa xác định</option><option v-for="entry in detail.configuration.taxonomies.budget_status" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Ngân sách từ<input v-model="opportunity.budgetMin" type="number" min="0"></label><label>Ngân sách đến<input v-model="opportunity.budgetMax" type="number" min="0"></label><label>Tiền tệ<input v-model="opportunity.currencyCode" maxlength="3"></label><label>Ghi chú ngân sách<input v-model="opportunity.budgetNote"></label><label>Trạng thái tiến độ<select v-model="opportunity.timelineStatusCode"><option value="">Chưa xác định</option><option v-for="entry in detail.configuration.taxonomies.timeline_status" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Ngày bắt đầu<input v-model="opportunity.timelineStartDate" type="date"></label><label>Ngày kết thúc<input v-model="opportunity.timelineEndDate" type="date"></label><label>Ghi chú tiến độ<input v-model="opportunity.timelineNote"></label><label>Ưu tiên<select v-model="opportunity.priorityCode"><option value="">Chưa xác định</option><option v-for="entry in detail.configuration.taxonomies.priority" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><UButton type="submit">Lưu cơ hội</UButton></form>
      <form v-if="invalidating" class="intake-controls__form" @submit.prevent="invalidate"><label>Lý do làm mất hiệu lực<select v-model="invalidReasonCode" required><option disabled value="">Chọn lý do</option><option v-for="entry in detail.configuration.taxonomies.invalid_reason" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Diễn giải<textarea v-model="invalidReason" required /></label><UButton type="submit" color="error">Xác nhận làm mất hiệu lực</UButton></form>
      <form v-if="restoring" class="intake-controls__form" @submit.prevent="restore"><label>Lý do khôi phục<textarea v-model="restoreReason" required /></label><UButton type="submit">Xác nhận khôi phục</UButton></form>
    </article>

    <article class="intake-controls__card"><header><div><p class="eyebrow">Tiếp nhận</p><h2>Liên hệ</h2></div><UButton v-if="canContact" size="sm" @click="toggleContactForm">Thêm liên hệ</UButton></header><ul class="intake-controls__history"><li v-for="relationship in detail.opportunity.contacts" :key="relationship.id"><div><strong>{{ detail.relatedContacts.find(contact => contact.id === relationship.contactId)?.displayName ?? relationship.contactId }}</strong><p>{{ taxonomyLabel(detail.configuration.taxonomies.contact_relationship, relationship.relationshipCode) }} · {{ relationship.endedAt ? 'Đã kết thúc' : 'Đang hiệu lực' }}</p><template v-for="method in detail.relatedContacts.find(contact => contact.id === relationship.contactId)?.methods" :key="method.id"><small>{{ method.methodType }}: {{ method.value }}{{ method.isUsable ? ' · sử dụng được' : '' }}</small><UButton v-if="canContact" size="xs" variant="link" @click="openMethodEditor(relationship.contactId, method, detail.relatedContacts.find(contact => contact.id === relationship.contactId)?.version ?? 0)">Cập nhật phương thức</UButton></template></div><div v-if="canContact && !relationship.endedAt" class="intake-controls__actions"><UButton size="xs" variant="outline" @click="openContactEditor(relationship.contactId)">Cập nhật liên hệ</UButton><UButton v-if="!relationship.isPrimary" size="xs" variant="outline" @click="setPrimaryContact(relationship.contactId, relationship.relationshipCode)">Đặt liên hệ chính</UButton><UButton size="xs" color="neutral" variant="outline" @click="endContact(relationship.id)">Kết thúc liên hệ</UButton></div></li></ul><form v-if="editingContactId" class="intake-controls__form" @submit.prevent="updateContact"><h3>Cập nhật liên hệ</h3><label>Tên liên hệ<input v-model="contactEdit.displayName" required></label><label>Ghi chú<input v-model="contactEdit.notes"></label><UButton type="submit">Lưu liên hệ</UButton></form><form v-if="editingMethodId" class="intake-controls__form" @submit.prevent="updateMethod"><h3>Cập nhật phương thức</h3><label>Loại<select v-model="methodEdit.methodType"><option value="phone">Điện thoại</option><option value="email">Email</option><option value="other">Khác</option></select></label><label>Giá trị<input v-model="methodEdit.value" required></label><label><input v-model="methodEdit.isUsable" type="checkbox"> Có thể sử dụng</label><UButton type="submit">Lưu phương thức</UButton></form><form v-if="addingContact" class="intake-controls__form" @submit.prevent="addContact"><label>Tên liên hệ<input v-model="contact.displayName" required></label><label>Quan hệ<select v-model="contact.relationshipCode" required><option disabled value="">Chọn quan hệ</option><option v-for="entry in detail.configuration.taxonomies.contact_relationship" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Phương thức liên hệ<select v-model="contact.methodType"><option value="phone">Điện thoại</option><option value="email">Email</option><option value="other">Khác</option></select></label><label>Giá trị phương thức (không bắt buộc)<input v-model="contact.methodValue"></label><label><input v-model="contact.isPrimary" type="checkbox"> Liên hệ chính</label><UButton type="submit">Tạo và liên kết liên hệ</UButton></form></article>

    <article class="intake-controls__card"><header><div><p class="eyebrow">Tiếp nhận</p><h2>Phạm vi</h2></div><UButton v-if="canScope" size="sm" @click="toggleScopeForm">Thêm phạm vi</UButton></header><ul class="intake-controls__history"><li v-for="item in detail.opportunity.scopes" :key="item.id"><div><strong>{{ taxonomyLabel(detail.configuration.taxonomies.scope, item.scopeCode) }}</strong><p>{{ item.note ?? 'Không có ghi chú' }} · {{ item.retiredAt ? 'Đã ngừng áp dụng' : 'Đang áp dụng' }}</p></div><UButton v-if="canScope && !item.retiredAt" size="xs" variant="outline" @click="retireScope(item.id)">Ngừng áp dụng</UButton></li></ul><form v-if="addingScope" class="intake-controls__form" @submit.prevent="addNewScope"><label>Phạm vi<select v-model="scope.scopeCode" required><option disabled value="">Chọn phạm vi</option><option v-for="entry in detail.configuration.taxonomies.scope" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Ghi chú<input v-model="scope.note"></label><UButton type="submit">Lưu phạm vi</UButton></form></article>

    <article class="intake-controls__card"><header><div><p class="eyebrow">Tiếp nhận</p><h2>Người giới thiệu</h2></div><UButton v-if="canReferrer" size="sm" @click="toggleReferrerForm">Thêm người giới thiệu</UButton></header><ul class="intake-controls__history"><li v-for="item in detail.opportunity.referrers" :key="item.id"><div><strong>{{ item.displayName }}</strong><p>{{ taxonomyLabel(detail.configuration.taxonomies.referrer_type, item.referrerTypeCode) }} · {{ item.endedAt ? 'Đã kết thúc' : (item.isPrimary ? 'Người giới thiệu chính' : 'Đang hiệu lực') }}</p></div><div v-if="canReferrer && !item.endedAt" class="intake-controls__actions"><UButton v-if="!item.isPrimary" size="xs" variant="outline" @click="setPrimaryReferrer(item)">Đặt chính</UButton><UButton size="xs" variant="outline" @click="endReferrer(item.id)">Kết thúc</UButton></div></li></ul><form v-if="addingReferrer" class="intake-controls__form" @submit.prevent="addNewReferrer"><label>Loại người giới thiệu<select v-model="referrer.referrerTypeCode" required><option disabled value="">Chọn loại</option><option v-for="entry in detail.configuration.taxonomies.referrer_type" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Tên hiển thị<input v-model="referrer.displayName" required></label><label>Ghi chú<input v-model="referrer.note"></label><label><input v-model="referrer.isPrimary" type="checkbox"> Là người giới thiệu chính</label><UButton type="submit">Lưu người giới thiệu</UButton></form></article>

    <article class="intake-controls__card"><header><div><p class="eyebrow">Tiếp nhận</p><h2>Bản ghi tiếp nhận</h2></div><UButton v-if="canRecord" size="sm" @click="toggleRecordForm">Ghi nhận tiếp nhận</UButton></header><ul class="intake-controls__history"><li v-for="item in detail.opportunity.intakeRecords" :key="item.id"><div><strong>{{ taxonomyLabel(detail.configuration.taxonomies.intake_channel, item.channelCode) }}</strong><p>{{ item.summary }}</p><small v-if="item.correctionOfRecordId">Hiệu chỉnh của bản ghi {{ item.correctionOfRecordId }}</small></div></li></ul><form v-if="addingRecord" class="intake-controls__form" @submit.prevent="appendRecord"><label>Kênh tiếp nhận<select v-model="record.channelCode" required><option disabled value="">Chọn kênh</option><option v-for="entry in detail.configuration.taxonomies.intake_channel" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Tóm tắt<textarea v-model="record.summary" required /></label><UButton type="submit">Lưu bản ghi mới</UButton></form><form v-if="canRecord && detail.opportunity.intakeRecords.length" class="intake-controls__form" @submit.prevent="correctRecord"><h3>Hiệu chỉnh bằng bản ghi mới</h3><label>Bản ghi gốc<select v-model="correction.recordId"><option disabled value="">Chọn bản ghi</option><option v-for="item in detail.opportunity.intakeRecords" :key="item.id" :value="item.id">{{ item.summary }}</option></select></label><label>Kênh<select v-model="correction.channelCode"><option disabled value="">Chọn kênh</option><option v-for="entry in detail.configuration.taxonomies.intake_channel" :key="entry.code" :value="entry.code">{{ entry.label }}</option></select></label><label>Tóm tắt mới<textarea v-model="correction.summary" /></label><label>Lý do hiệu chỉnh<textarea v-model="correction.reason" /></label><UButton type="submit" variant="outline">Tạo bản ghi hiệu chỉnh</UButton></form></article>

    <article class="intake-controls__card"><header><div><p class="eyebrow">Tiếp nhận</p><h2>Nghi vấn trùng lặp</h2></div><UButton v-if="canRaiseDuplicate" size="sm" @click="toggleDuplicateForm">Nêu nghi vấn trùng lặp</UButton></header><ul class="intake-controls__history"><li v-for="item in detail.opportunity.duplicateConcerns" :key="item.id"><div><strong>{{ item.description }}</strong><p>{{ item.resolvedAt ? `Đã giải quyết: ${item.resolution}` : 'Đang chờ giải quyết' }}</p></div><UButton v-if="canResolveDuplicate && !item.resolvedAt" size="xs" variant="outline" @click="openResolution(item.id)">Giải quyết nghi vấn</UButton></li></ul><form v-if="raisingDuplicate" class="intake-controls__form" @submit.prevent="raiseConcern"><label>Mô tả<textarea v-model="duplicate.description" required /></label><label>Cơ hội nghi ngờ (không bắt buộc)<input v-model="duplicate.suspectedDuplicateOpportunityId"></label><UButton type="submit">Lưu nghi vấn</UButton></form><form v-if="resolvingConcernId" class="intake-controls__form" @submit.prevent="resolveConcern(resolvingConcernId!)"><label>Kết luận<select v-model="resolution.resolution" @change="onResolutionChange"><option value="different_need">Nhu cầu khác</option><option value="same_need">Cùng nhu cầu</option></select></label><label v-if="resolution.resolution === 'same_need'">Cơ hội chính tắc<select v-model="resolution.canonicalOpportunityId" required><option disabled value="">Chọn cơ hội</option><option v-for="item in canonicalOptions ?? []" :key="item.id" :value="item.id">{{ item.primaryCustomerName ?? item.id }}</option></select></label><label>Ghi chú giải quyết<textarea v-model="resolution.note" required /></label><UButton type="submit">Xác nhận giải quyết</UButton></form></article>
  </section>
</template>

<style scoped>
.intake-controls { display: grid; gap: 14px; }.intake-controls__card { display: grid; gap: 12px; padding: 15px; border: 1px solid var(--line); background: var(--paper-raised); }.intake-controls__card > header { display: flex; justify-content: space-between; align-items: start; gap: 12px; }.intake-controls__card h2,.intake-controls__card h3 { margin: 3px 0 0; font-size: 1.05rem; }.intake-controls__actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 7px; }.intake-controls__form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 12px; border: 1px solid var(--line); background: var(--paper); }.intake-controls__form h3,.intake-controls__form > button { grid-column: 1 / -1; }.intake-controls__form label { display: grid; gap: 5px; color: var(--forest-deep); font-size: .77rem; font-weight: 700; }.intake-controls__form input,.intake-controls__form select,.intake-controls__form textarea { width: 100%; min-height: 40px; padding: 8px; border: 1px solid var(--line); background: var(--paper-raised); color: var(--ink); font: inherit; }.intake-controls__form textarea { min-height: 70px; resize: vertical; }.intake-controls__history { display: grid; gap: 0; padding: 0; margin: 0; list-style: none; border: 1px solid var(--line); }.intake-controls__history li { display: flex; justify-content: space-between; align-items: start; gap: 12px; padding: 11px; border-bottom: 1px solid var(--line); }.intake-controls__history li:last-child { border-bottom: 0; }.intake-controls__history p,.intake-controls__history small { display: block; margin-top: 3px; color: var(--ink-muted); font-size: .78rem; line-height: 1.4; }
@media (max-width: 620px) { .intake-controls__card > header,.intake-controls__history li { flex-direction: column; }.intake-controls__actions { justify-content: start; }.intake-controls__form { grid-template-columns: 1fr; }.intake-controls__form > button { grid-column: auto; } }
</style>
