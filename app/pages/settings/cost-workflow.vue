<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ClientError } from '../../errors/client-error'
import { createHttpCostWorkflowCutoverRepository } from '../../repositories/http/http-cost-workflow-cutover-repository'
import type { AuthenticatedHttpClient } from '../../repositories/http/authenticated-http-client'
import ProjectCostManagerAssignmentPanel from '../../components/costs/ProjectCostManagerAssignmentPanel.vue'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import { workflowCompanyConfigurationSchema, workflowCrewClassificationSchema, workflowCompanyActivationSchema, type WorkflowCutoverSnapshot, type WorkflowCutoverCrew } from '../../../shared/schemas/costs/cost-workflow-cutover'
import type { WorkflowProjectContext } from '../../../shared/schemas/costs/cost-workflow'
import type { ProjectRegister } from '../../../shared/schemas/costs/master-data'

definePageMeta({ requiredAnyPermissions: ['cost.config.manage', 'party.manage', 'project.cost_manager.assign'] })

const app = useNuxtApp()
const access = app.$companyAccessStore
const repositories = useRepositories()
const tracker = createAsyncRequestTracker()
const projectTracker = createAsyncRequestTracker()
let scopeGeneration = 0
let mounted = true
const snapshot = ref<WorkflowCutoverSnapshot | null>(null)
const crews = ref<WorkflowCutoverCrew[]>([])
const projects = ref<ProjectRegister[]>([])
const projectId = ref('')
const projectContext = ref<WorkflowProjectContext | null>(null)
const loading = ref(false)
const projectLoading = ref(false)
const writing = ref(false)
const managerBusy = ref(false)
const uncertain = ref(false)
const error = ref('')
const message = ref('')
const recipientId = ref('')
const configurationReason = ref('')
const classification = ref<Record<string, {ownership: 'vqh_internal' | 'external' | ''; reason: string; confirmed: boolean}>>({})
const historyConfirmed = ref(false)
const activationReason = ref('')

const canConfigure = computed(() => access.hasPermission('cost.config.manage'))
const canClassify = computed(() => access.hasPermission('party.manage') && access.hasPermission('cost.party.read'))
const canAssign = computed(() => access.hasPermission('project.cost_manager.assign') && access.hasPermission('project.read') && access.hasPermission('cost.request.read'))
const busy = computed(() => writing.value || managerBusy.value || loading.value || projectLoading.value)
const locked = computed(() => busy.value || uncertain.value)
const ready = computed(() => snapshot.value?.mode === 'legacy' && Boolean(snapshot.value.notificationRecipientId) && snapshot.value.unclassifiedCrewCount === 0 && snapshot.value.pendingLegacyUploads === 0)
const fingerprint = computed(() => [access.activeCompanyId, app.$authStore?.user?.id, app.$authStore?.lifecycle, [...access.permissions].sort().join(',')].join('::'))

function scopedRepository() {
  return createHttpCostWorkflowCutoverRepository(access.activeCompanyId || '', app.$authenticatedHttpClient as AuthenticatedHttpClient)
}
function current(fp: string, generation: number) { return mounted && generation === scopeGeneration && fp === fingerprint.value }
function description(caught: unknown) { return caught instanceof ClientError ? caught.message : 'Không thể hoàn tất thao tác. Hãy kiểm tra trạng thái và quyền truy cập.' }

async function load() {
  if (writing.value || managerBusy.value) return
  const fp = fingerprint.value
  const generation = scopeGeneration
  const token = tracker.start({})
  loading.value = true
  error.value = ''
  snapshot.value = null
  crews.value = []
  projects.value = []
  classification.value = {}
  historyConfirmed.value = false
  if (!access.activeCompanyId) { loading.value = false; return }
  try {
    const repo = scopedRepository()
    const [state, list, projectList] = await Promise.all([
      canConfigure.value ? repo.snapshot() : Promise.resolve(null),
      canClassify.value ? repo.crews() : Promise.resolve([]),
      canAssign.value ? repositories.projectRegister.list() : Promise.resolve([]),
    ])
    if (!token.isCurrent() || !current(fp, generation)) return
    if (state && state.companyId !== access.activeCompanyId) throw new Error('COMPANY_SCOPE_CHANGED')
    snapshot.value = state
    recipientId.value = state?.notificationRecipientId || ''
    crews.value = list
    classification.value = Object.fromEntries(list.map(crew => [crew.id, {ownership: crew.crewOwnership || '', reason: '', confirmed: false}]))
    projects.value = projectList.filter(project => project.operationalState === 'active')
    if (!projects.value.some(project => project.id === projectId.value)) projectId.value = ''
  }
  catch (caught) { if (token.isCurrent() && current(fp, generation)) error.value = description(caught) }
  finally { if (token.isCurrent() && current(fp, generation)) loading.value = false }
}

async function loadProject() {
  const fp = fingerprint.value
  const generation = scopeGeneration
  const selected = projectId.value
  const token = projectTracker.start({})
  projectContext.value = null
  projectLoading.value = false
  if (!selected || !canAssign.value) return
  projectLoading.value = true
  try {
    const context = await repositories.costWorkflow.readProjectContext(selected)
    if (!token.isCurrent() || !current(fp, generation) || selected !== projectId.value) return
    projectContext.value = context
  }
  catch (caught) { if (token.isCurrent() && current(fp, generation)) error.value = description(caught) }
  finally { if (token.isCurrent() && current(fp, generation)) projectLoading.value = false }
}

async function runWrite(send: () => Promise<unknown>, success: string) {
  if (locked.value) return
  const fp = fingerprint.value
  const generation = scopeGeneration
  writing.value = true
  error.value = ''
  message.value = ''
  historyConfirmed.value = false
  uncertain.value = true
  try {
    await send()
    if (!current(fp, generation)) return
    uncertain.value = false
    message.value = success
  }
  catch (caught) {
    if (!current(fp, generation)) return
    uncertain.value = true
    error.value = description(caught) + ' Dừng các thay đổi và kiểm tra kết quả đã lưu trước khi tiếp tục.'
  }
  finally { if (current(fp, generation)) writing.value = false }
  if (current(fp, generation)) await load()
}

async function configure() {
  if (!canConfigure.value || !snapshot.value || locked.value) return
  const parsed = workflowCompanyConfigurationSchema.safeParse({expectedVersion: snapshot.value.configurationVersion, notificationRecipientId: recipientId.value, reason: configurationReason.value})
  if (!parsed.success) { error.value = 'Chọn đúng tài khoản Giám đốc và nhập lý do cấu hình.'; return }
  const repo = scopedRepository()
  await runWrite(() => repo.configure(parsed.data, crypto.randomUUID()), 'Đã lưu người nhận thông báo cố định.')
}

async function classify(crew: WorkflowCutoverCrew) {
  const draft = classification.value[crew.id]
  if (!canClassify.value || locked.value || !draft?.confirmed) return
  const parsed = workflowCrewClassificationSchema.safeParse({expectedPartyVersion: crew.partyVersion, expectedClassificationVersion: crew.classificationVersion, crewOwnership: draft.ownership, reason: draft.reason})
  if (!parsed.success) { error.value = 'Chọn loại đội và ghi rõ căn cứ xác nhận.'; return }
  const repo = scopedRepository()
  await runWrite(() => repo.classify(crew.id, parsed.data, crypto.randomUUID()), 'Đã ghi nhận phân loại đội ' + crew.code + '.')
}

async function activate() {
  if (!canConfigure.value || !ready.value || !snapshot.value || locked.value || !historyConfirmed.value) return
  const displayed = snapshot.value
  const parsed = workflowCompanyActivationSchema.safeParse({expectedVersion: displayed.configurationVersion, expectedSnapshotHash: displayed.snapshotHash, historyPolicy: 'preserve_readonly_unknown', reason: activationReason.value})
  if (!parsed.success) { error.value = 'Nhập lý do kích hoạt.'; return }
  const repo = scopedRepository()
  const fp = fingerprint.value
  const generation = scopeGeneration
  // A fresh read is required before submitting the exact state the operator reviewed.
  writing.value = true
  try {
    const fresh = await repo.snapshot()
    if (!current(fp, generation)) return
    if (fresh.companyId !== displayed.companyId || fresh.snapshotHash !== displayed.snapshotHash || fresh.configurationVersion !== displayed.configurationVersion) {
      error.value = 'Trạng thái chuẩn bị đã thay đổi. Tải lại và kiểm tra trước khi kích hoạt.'
      historyConfirmed.value = false
      return
    }
  }
  catch (caught) { if (current(fp, generation)) error.value = description(caught); return }
  finally { if (current(fp, generation)) writing.value = false }
  if (current(fp, generation)) await runWrite(() => repo.activate(parsed.data, crypto.randomUUID()), 'Đã kích hoạt quy trình chi phí có chứng từ.')
}

function managerUncertain() { uncertain.value = true; error.value = 'Chưa xác định kết quả phân công. Dừng các thay đổi và kiểm tra hồ sơ đã lưu.' }
async function managerChanged() { managerBusy.value = false; await loadProject(); await load() }

watch(fingerprint, () => {
  scopeGeneration += 1
  if (writing.value || managerBusy.value) uncertain.value = true
  tracker.invalidate(); projectTracker.invalidate()
  snapshot.value = null; crews.value = []; projects.value = []; projectContext.value = null
  projectId.value = ''; recipientId.value = ''; configurationReason.value = ''; activationReason.value = ''
  classification.value = {}; historyConfirmed.value = false; message.value = ''; error.value = ''
  writing.value = false; managerBusy.value = false; projectLoading.value = false
  // An unresolved write remains blocked even if the operator changes company or account.
  void load()
}, {immediate: true, flush: 'sync'})
watch(projectId, () => { historyConfirmed.value = false; void loadProject() }, {flush: 'sync'})
watch([recipientId, configurationReason, activationReason, classification], () => { historyConfirmed.value = false }, {deep: true})
onBeforeUnmount(() => { mounted = false; scopeGeneration += 1; tracker.invalidate(); projectTracker.invalidate() })
</script>

<template>
  <section class="preparation-page" :aria-busy="busy">
    <header class="page-heading">
      <div><h1>Chuẩn bị quy trình chi phí có chứng từ</h1><p>Cấu hình người nhận thông báo, xác nhận đội thi công và phân công quản lý trước khi kích hoạt.</p></div>
      <button type="button" class="cockpit-btn" :disabled="busy" @click="load">Tải lại trạng thái</button>
    </header>
    <p v-if="error" role="alert" class="feedback error">{{ error }}</p>
    <p v-if="message" role="status" class="feedback success">{{ message }}</p>
    <p v-if="uncertain" role="alert" class="feedback error">Kết quả thao tác chưa được xác định. Chỉ xem và kiểm tra trạng thái; chưa thực hiện thay đổi tiếp theo.</p>
    <p v-if="loading" role="status">Đang tải trạng thái chuẩn bị…</p>

    <section v-if="canConfigure && snapshot" class="cockpit-card preparation-section">
      <h2>1. Người nhận thông báo cố định</h2>
      <p>Trạng thái: <strong>{{ snapshot.mode === 'legacy' ? 'Chưa kích hoạt' : 'Đã kích hoạt' }}</strong> · Phiên bản {{ snapshot.configurationVersion }}</p>
      <form @submit.prevent="configure">
        <fieldset :disabled="locked">
          <label>Tài khoản Giám đốc nhận thông báo (mã tài khoản)<input v-model="recipientId" required autocomplete="off" ></label>
          <label>Lý do cấu hình<textarea v-model="configurationReason" required maxlength="2000" /></label>
          <button type="submit" class="cockpit-btn cockpit-btn--primary">Lưu người nhận thông báo</button>
        </fieldset>
      </form>
    </section>

    <section v-if="canClassify" class="cockpit-card preparation-section">
      <h2>2. Xác nhận đội thi công</h2>
      <p>Kiểm tra từng đội và ghi căn cứ xác nhận. Mỗi thao tác lưu một bản phân loại đã rà soát.</p>
      <p v-if="!loading && !crews.length">Chưa có đội thi công đang hoạt động để hiển thị.</p>
      <form v-for="crew in crews" :key="crew.id" class="crew-row" @submit.prevent="classify(crew)">
        <template v-if="classification[crew.id]">
          <h3>{{ crew.code }} — {{ crew.name }}</h3>
          <p>Đã rà soát: {{ crew.crewOwnership === 'external' ? 'Đội ngoài' : crew.crewOwnership === 'vqh_internal' ? 'Đội nội bộ VQH' : 'Chưa xác nhận' }}<span v-if="crew.classificationReviewedAt"> · {{ new Date(crew.classificationReviewedAt).toLocaleString('vi-VN') }}</span></p>
          <fieldset :disabled="locked">
            <label>Loại đội<select v-model="classification[crew.id]!.ownership" required><option value="" disabled>Chọn loại đội</option><option value="external">Đội ngoài</option><option value="vqh_internal">Đội nội bộ VQH</option></select></label>
            <label>Căn cứ xác nhận<textarea v-model="classification[crew.id]!.reason" required maxlength="2000" /></label>
            <label class="check"><input v-model="classification[crew.id]!.confirmed" type="checkbox" required >Tôi đã kiểm tra căn cứ phân loại đội này.</label>
            <button type="submit" class="cockpit-btn" :disabled="!classification[crew.id]!.confirmed">Lưu phân loại {{ crew.code }}</button>
          </fieldset>
        </template>
      </form>
    </section>

    <section v-if="canAssign" class="cockpit-card preparation-section">
      <h2>3. Phân công quản lý chi phí</h2>
      <label>Dự án đang hoạt động<select v-model="projectId" :disabled="locked"><option value="">Chọn dự án</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.code }} — {{ project.name }}</option></select></label>
      <p v-if="projectLoading">Đang tải hồ sơ phân công…</p>
      <ProjectCostManagerAssignmentPanel v-if="projectContext && projectId" :key="fingerprint + projectId" :company-id="access.activeCompanyId || ''" :project-id="projectId" :context="projectContext" :blocked="writing || loading || uncertain" :stop-on-uncertain="true" @busy="managerBusy = $event" @uncertain="managerUncertain" @changed="managerChanged" />
    </section>

    <section v-if="canConfigure && snapshot" class="cockpit-card preparation-section">
      <h2>4. Kiểm tra và kích hoạt</h2>
      <dl class="readiness"><div><dt>Dự án</dt><dd>{{ snapshot.projectCount }}</dd></div><div><dt>Đội đang hoạt động</dt><dd>{{ snapshot.activeCrewCount }}</dd></div><div><dt>Đội chưa xác nhận</dt><dd>{{ snapshot.unclassifiedCrewCount }}</dd></div><div><dt>Tệp cũ đang xử lý</dt><dd>{{ snapshot.pendingLegacyUploads }}</dd></div></dl>
      <p v-if="snapshot.mode === 'document_backed_v1'">Quy trình chi phí có chứng từ đã được kích hoạt.</p>
      <p v-else-if="!ready">Cần lưu người nhận thông báo, xác nhận đầy đủ các đội và xử lý xong tệp cũ trước khi kích hoạt.</p>
      <form v-if="snapshot.mode === 'legacy'" @submit.prevent="activate">
        <fieldset :disabled="locked || !ready">
          <label>Lý do kích hoạt<textarea v-model="activationReason" required maxlength="2000" /></label>
          <label class="check"><input v-model="historyConfirmed" type="checkbox" required >Tôi đã kiểm tra trạng thái trên và đồng ý giữ lịch sử chưa xác định ở chế độ chỉ đọc.</label>
          <button type="submit" class="cockpit-btn cockpit-btn--primary" :disabled="!historyConfirmed">Kích hoạt quy trình chi phí có chứng từ</button>
        </fieldset>
      </form>
    </section>
  </section>
</template>

<style scoped>
.preparation-page{display:grid;gap:20px;max-width:1000px;margin:auto}.page-heading{display:flex;justify-content:space-between;gap:16px;align-items:start}.page-heading h1{font-size:1.4rem;margin:0}.page-heading p,.preparation-section p{color:var(--ink-muted);line-height:1.5}.preparation-section{padding:20px}.preparation-section h2{font-size:1.1rem;margin-top:0}fieldset{border:0;padding:0;display:grid;gap:12px}label{display:grid;gap:6px;font-size:.9rem}input,textarea,select{border:1px solid var(--line);border-radius:4px;padding:10px;background:var(--paper-raised);color:var(--ink);width:100%}textarea{min-height:70px}.check{display:flex;align-items:start;gap:8px}.check input{width:auto;margin-top:4px}.crew-row{border-top:1px solid var(--line);padding:16px 0}.crew-row h3{font-size:1rem;margin:0}.feedback{padding:12px;border-radius:4px}.error{background:#fee2e2;color:#991b1b}.success{background:#dcfce7;color:#166534}.readiness{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.readiness dd{margin:6px 0;font-size:1.2rem;font-weight:700}button{justify-self:start;min-height:42px}@media(max-width:650px){.page-heading{flex-direction:column}.readiness{grid-template-columns:repeat(2,1fr)}}
</style>
