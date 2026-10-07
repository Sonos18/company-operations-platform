<template>
  <div class="cockpit-card manager-assignment">
    <div class="header">
      <h4>Phân công Quản lý chi phí</h4>
      <span class="cockpit-badge">{{ {active:'Đang hoạt động',completed:'Đã hoàn thành',paused:'Tạm dừng',unknown:'Chưa xác định'}[context.operationalState] }}</span>
    </div>
    <div class="current-info">
      <p><strong>Người quản lý hiện tại:</strong> {{ currentManagerLabel }}</p>
      <p v-if="context.manager?.reason"><strong>Ghi chú bàn giao:</strong> {{ context.manager.reason }}</p>
    </div>
    <div v-if="errorMessage" class="alert error">{{ errorMessage }}</div>
    <button v-if="commandPending" type="button" :disabled="isBusy" class="cockpit-btn" @click="emit('changed')">Tải lại hồ sơ để kiểm tra kết quả</button>
    <form v-if="canAssignManager" @submit.prevent="handleAssign">
      <div class="form-group">
        <label>Chọn quản lý mới *</label>
        <select v-model="selectedUserId" :disabled="isBusy || commandPending" required>
          <option value="" disabled>-- Chọn nhân sự đủ điều kiện --</option>
          <option v-for="m in context.eligibleManagers" :key="m.userId" :value="m.userId">{{ m.label }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>Lý do phân công / bàn giao *</label>
        <input v-model="reason" type="text" placeholder="Nhập lý do phân công" :disabled="isBusy || commandPending" required >
      </div>
      <div class="actions">
        <button type="submit" class="cockpit-btn cockpit-btn--primary" :disabled="isBusy || (stopOnUncertain && commandPending) || !selectedUserId || !reason.trim()">
          {{ isBusy ? 'Đang phân công...' : 'Xác nhận phân công' }}
        </button>
      </div>
    </form>
    <p v-else-if="!hasAssignPerm" class="notice">Bạn không có quyền phân công quản lý chi phí </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { createFrozenWorkflowCommand } from '../../utils/costs/frozen-workflow-command'
import { workflowManagerAssignmentSchema, type WorkflowProjectContext, type WorkflowManagerAssignmentInput } from '../../../shared/schemas/costs/cost-workflow'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'

const props = defineProps<{ companyId: string; projectId: string; context: WorkflowProjectContext; blocked?: boolean; stopOnUncertain?: boolean }>()
const emit = defineEmits<{ (e: 'changed' | 'uncertain'): void; (e:'busy',value:boolean):void }>()
const repo: CostWorkflowRepository = useRepositories().costWorkflow
const $companyAccessStore = useNuxtApp().$companyAccessStore

const selectedUserId = ref('')
const reason = ref('')
const isBusy = ref(false)
const errorMessage = ref('')
const commandPending=ref(false)

const tracker = createAsyncRequestTracker<{ companyId: string; projectId: string; fp: string }>()

function getFingerprint() {
  const perms = $companyAccessStore?.permissions ? [...$companyAccessStore.permissions].sort().join(',') : ''
  const auth=useNuxtApp().$authStore
  return `${$companyAccessStore?.activeCompanyId || ''}::${auth?.user?.id || ''}::${auth?.lifecycle || ''}::${perms}`
}

const hasAssignPerm = computed(() => $companyAccessStore?.activeCompanyId === props.companyId && Boolean($companyAccessStore?.permissions?.includes('project.cost_manager.assign')))
const canAssignManager = computed(() => props.context.canAssign && hasAssignPerm.value && !props.blocked)
watch(isBusy,value=>emit('busy',value),{flush:'sync'})
const currentManagerLabel = computed(() => {
  if (!props.context.manager) return 'Chưa phân công quản lý chi phí'
  const match = props.context.eligibleManagers.find(m => m.userId === props.context.manager?.userId)
  return match?.label ?? 'Quản lý được phân công'
})

function makeCommand(){
 const companyId=props.companyId,projectId=props.projectId,fp=getFingerprint()
 return createFrozenWorkflowCommand<WorkflowManagerAssignmentInput,unknown>({isScopeCurrent:()=>canAssignManager.value&&props.companyId===companyId&&props.projectId===projectId&&getFingerprint()===fp,send:(_id,input,key)=>repo.assignManager(projectId,input,{idempotencyKey:key})})
}
let command=makeCommand()

function resetState() {
  tracker.invalidate()
  errorMessage.value = ''
  isBusy.value = false
  selectedUserId.value = ''
  reason.value = '';commandPending.value=false;command=makeCommand()
}

watch([() => props.companyId, () => props.projectId, () => props.context.manager?.version, () => $companyAccessStore?.activeCompanyId, () => getFingerprint()], resetState, { flush: 'sync' })
onUnmounted(() => {tracker.invalidate();emit('busy',false)})

async function handleAssign() {
  if (!canAssignManager.value || isBusy.value || (props.stopOnUncertain && commandPending.value)) return
  const token = tracker.start({ companyId: props.companyId, projectId: props.projectId, fp: getFingerprint() })
  isBusy.value = true
  errorMessage.value = ''
  const input: WorkflowManagerAssignmentInput = {
    managerUserId: selectedUserId.value,
    expectedAssignmentVersion: props.context.manager?.version ?? 0,
    reason: reason.value.trim(),
  }
  const parsed = workflowManagerAssignmentSchema.safeParse(input)
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.'
    isBusy.value = false
    return
  }
  commandPending.value=true
  try {
    if ($companyAccessStore?.activeCompanyId !== props.companyId || !hasAssignPerm.value) throw new Error('Ngữ cảnh hoặc quyền hạn đã thay đổi.')
    await command.attempt(props.projectId,parsed.data)
    if (!token.isCurrent() || $companyAccessStore.activeCompanyId !== token.identity.companyId || props.companyId !== token.identity.companyId || props.projectId !== token.identity.projectId || getFingerprint() !== token.identity.fp) return
    emit('changed')
    resetState()
  } catch {
    if (!token.isCurrent() || getFingerprint() !== token.identity.fp || props.companyId !== token.identity.companyId || props.projectId !== token.identity.projectId) return
    errorMessage.value = 'Chưa xác định kết quả phân công. Thử lại cùng dữ liệu hoặc tải lại hồ sơ để kiểm tra.'
    if(props.stopOnUncertain){errorMessage.value='Chưa xác định kết quả phân công. Dừng thao tác và tải lại hồ sơ để kiểm tra.';emit('uncertain')}
  } finally {
    if (token.isCurrent() && getFingerprint() === token.identity.fp) isBusy.value = false
  }
}
</script>

<style scoped>
.manager-assignment { padding: 12px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.form-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.alert.error { background: #fee2e2; color: #991b1b; padding: 6px 10px; border-radius: 4px; font-size: 13px; }
.notice { font-size: 13px; color: #64748b; font-style: italic; }
.actions { display: flex; justify-content: flex-end; margin-top: 8px; }
</style>
