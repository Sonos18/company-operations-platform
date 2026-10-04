<script setup lang="ts">
import { employeeInvitationInputSchema } from '../../../shared/schemas/employees'
import type { DepartmentSummary, PositionSummary } from '../../../shared/schemas/employees'
import type { PreparedEmployeeInvitation } from '../../../shared/schemas/employee-invitations'
import { ClientError } from '../../errors/client-error'
const emit = defineEmits<{ close: []; prepared: [] }>()
const app = useNuxtApp()
const repository = app.$employeeInvitations
const employeeCode = ref('')
const fullName = ref('')
const workEmail = ref('')
const departmentId = ref('')
const positionId = ref('')
const hireDate = ref('')
const departments = ref<DepartmentSummary[]>([])
const positions = ref<PositionSummary[]>([])
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const copyMessage = ref('')
const prepared = ref<PreparedEmployeeInvitation | null>(null)
let disposed = false
function close() { prepared.value = null; emit('close') }
onBeforeUnmount(() => { disposed = true; prepared.value = null })
onMounted(async () => {
  const companyId = app.$companyAccessStore.activeCompanyId
  try {
    const options = await repository.options()
    if (disposed || companyId !== app.$companyAccessStore.activeCompanyId) return
    departments.value = options.departments
    positions.value = options.positions
  } catch { if (!disposed) error.value = 'Không thể tải phòng ban và chức danh. Hãy đóng và mở lại lời mời.' }
  finally { if (!disposed) loading.value = false }
})
async function submit() {
  if (submitting.value || loading.value) return
  error.value = ''; copyMessage.value = ''; prepared.value = null
  const input = employeeInvitationInputSchema.safeParse({
    employeeCode: employeeCode.value, fullName: fullName.value, workEmail: workEmail.value, departmentId: departmentId.value,
    ...(positionId.value ? { positionId: positionId.value } : {}),
    ...(hireDate.value ? { hireDate: hireDate.value } : {}),
  })
  if (!input.success) { error.value = 'Vui lòng nhập mã nhân viên, họ tên, email hợp lệ và chọn phòng ban.'; return }
  const companyId = app.$companyAccessStore.activeCompanyId
  submitting.value = true
  try {
    const result = await repository.prepare(input.data)
    if (disposed || companyId !== app.$companyAccessStore.activeCompanyId) return
    prepared.value = result
    emit('prepared')
  } catch (failure) {
    if (!disposed) error.value = failure instanceof ClientError ? failure.message : 'Không thể chuẩn bị lời mời. Vui lòng thử lại.'
  } finally { if (!disposed) submitting.value = false }
}
async function copyInvitation() {
  if (!prepared.value) return
  copyMessage.value = ''
  try {
    await navigator.clipboard.writeText('Đến: ' + prepared.value.recipient + '\nTiêu đề: ' + prepared.value.subject + '\n\n' + prepared.value.body)
    if (!disposed) copyMessage.value = 'Đã sao chép. Hãy dán vào Gmail và gửi riêng đúng người nhận.'
  } catch { if (!disposed) copyMessage.value = 'Trình duyệt không cho sao chép. Bạn có thể chọn và sao chép nội dung email bên dưới.' }
}
</script>
<template>
  <section class="invitation-panel" aria-labelledby="invitation-heading">
    <header class="invitation-heading">
      <div><p class="eyebrow">Lời mời tham gia</p><h2 id="invitation-heading">Mời nhân viên</h2></div>
      <UButton color="neutral" variant="ghost" aria-label="Đóng lời mời" @click="close">Đóng</UButton>
    </header>
    <p class="invitation-help">Chuẩn bị email mời, rồi sao chép và gửi từ Gmail của bạn. Người nhận tự đặt mật khẩu; Taskovia không gửi email tự động.</p>
    <p v-if="error" class="invitation-error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Đang tải phòng ban và chức danh…</p>
    <form v-if="!prepared" class="invitation-fields" @submit.prevent="submit">
      <label>Mã nhân viên<input v-model="employeeCode" required autocomplete="off" :disabled="submitting"></label>
      <label>Họ và tên<input v-model="fullName" required autocomplete="off" :disabled="submitting"></label>
      <label class="invitation-wide">Email nhận lời mời<input v-model="workEmail" required type="email" autocomplete="off" :disabled="submitting"><small>Có thể dùng email cá nhân của người nhận.</small></label>
      <label>Phòng ban nhân viên<select v-model="departmentId" required :disabled="loading || submitting"><option value="">Chọn phòng ban</option><option v-for="department in departments" :key="department.id" :value="department.id">{{ department.name }}</option></select></label>
      <label>Chức danh (không bắt buộc)<select v-model="positionId" :disabled="loading || submitting"><option value="">Chưa chọn chức danh</option><option v-for="position in positions" :key="position.id" :value="position.id">{{ position.name }}</option></select></label>
      <label>Ngày vào làm (không bắt buộc)<input v-model="hireDate" type="date" :disabled="submitting"></label>
      <div class="invitation-wide invitation-actions"><UButton type="submit" color="primary" :loading="submitting" :disabled="loading || !departments.length">Chuẩn bị lời mời</UButton><small>Nhân viên nhận quyền cơ bản. Vai trò nghiệp vụ được cấp riêng.</small></div>
    </form>
    <div v-else class="invitation-result">
      <p class="invitation-status" role="status">Đã chuẩn bị · Chưa xác nhận gửi</p>
      <label>Người nhận<input :value="prepared.recipient" readonly></label>
      <label>Tiêu đề email<input :value="prepared.subject" readonly></label>
      <label>Nội dung email<textarea :value="prepared.body" readonly rows="10" spellcheck="false" /></label>
      <p class="invitation-help">Link trong email chỉ dành cho người nhận và dùng một lần. Không gửi vào nhóm hoặc chuyển tiếp cho người khác. Đóng khung này sẽ xóa lời mời khỏi màn hình.</p>
      <UButton color="primary" @click="copyInvitation">Sao chép lời mời</UButton>
      <p v-if="copyMessage" role="status">{{ copyMessage }}</p>
    </div>
  </section>
</template>
<style scoped>
.invitation-panel { padding: 24px; border: 1px solid var(--line); border-top: 3px solid var(--coral); background: var(--paper-raised); }
.invitation-heading { display: flex; justify-content: space-between; align-items: start; gap: 16px; }
.invitation-heading h2 { margin: 4px 0 12px; font-size: 1.6rem; color: var(--forest); }
.invitation-help, .invitation-fields small { color: var(--ink-muted); font-size: .85rem; line-height: 1.6; }
.invitation-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; }
.invitation-fields label, .invitation-result label { display: grid; gap: 7px; font-size: .85rem; font-weight: 600; }
.invitation-fields input, .invitation-fields select, .invitation-result input, .invitation-result textarea { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; }
.invitation-fields input:focus, .invitation-fields select:focus, .invitation-result textarea:focus { outline: 2px solid var(--forest); outline-offset: 2px; }
.invitation-wide { grid-column: 1 / -1; }
.invitation-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.invitation-error { color: #a33125; }
.invitation-result { display: grid; gap: 14px; margin-top: 16px; }
.invitation-result button { justify-self: start; }
.invitation-status { color: var(--forest); font-weight: 700; }
@media (max-width: 767px) { .invitation-panel { padding: 18px; } .invitation-fields { grid-template-columns: 1fr; } }
</style>
