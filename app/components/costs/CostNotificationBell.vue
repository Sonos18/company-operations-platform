<template>
  <div v-if="canRead" ref="bellRef" class="cost-notification-bell">
    <button
      type="button"
      class="bell-btn"
      :aria-expanded="isOpen"
      :aria-controls="panelId"
      aria-label="Thông báo phê duyệt khoản chi"
      @click="togglePanel"
    >
      <span class="bell-icon" aria-hidden="true">🔔</span>
      <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </button>

    <div v-if="isOpen" :id="panelId" class="panel" role="region" aria-label="Danh sách thông báo phê duyệt">
      <div class="panel-header">
        <strong>Thông báo phê duyệt chi</strong>
        <button type="button" class="link-btn" :disabled="loading" @click="loadNotifications">Làm mới</button>
      </div>

      <div v-if="loading" class="empty">Đang nạp thông báo...</div>
      <div v-else-if="notifications.length === 0" class="empty">Không có thông báo nào.</div>
      <ul v-else class="list">
        <li
          v-for="n in notifications"
          :key="n.id"
          class="item"
          :class="{ unread: n.deliveryState === 'available' && !n.readAt, undelivered: n.deliveryState === 'undelivered' }"
        >
          <div class="item-content">
            <span class="item-title">Quyết định phê duyệt hồ sơ chi</span>
            <span class="item-date">{{ formatDate(n.createdAt) }}</span>
            <span v-if="n.deliveryState === 'undelivered'" class="pending-tag">Chưa nhận thông báo</span>
          </div>
          <div class="item-actions">
            <NuxtLink :to="`/costs/${n.projectId}/requests`" class="view-link" @click="markRead(n)">Xem dự án</NuxtLink>
            <button
              v-if="n.deliveryState === 'available' && !n.readAt"
              type="button"
              class="ack-btn" :disabled="Boolean(acknowledging)"
              @click="markRead(n)"
            >
              Đã đọc
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { WorkflowNotificationView } from '../../../shared/schemas/costs/cost-workflow'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'


const repo: CostWorkflowRepository = useRepositories().costWorkflow
const store = useNuxtApp().$companyAccessStore
const panelId = useId()
const bellRef = ref<HTMLElement | null>(null)

const isOpen = ref(false)
const loading = ref(false)
const notifications = ref<WorkflowNotificationView[]>([])

const tracker = createAsyncRequestTracker<{ fp: string }>()
const ackTracker = createAsyncRequestTracker<{ id: string; fp: string }>()
const acknowledging=ref<string|null>(null)
const ackKeys = new Map<string, string>()

function getFingerprint(): string {
  const p = store?.permissions ? [...store.permissions].sort().join(',') : ''
  return `${store?.activeCompanyId || ''}::${p}`
}

const canRead = computed(() => {
  if (!store?.activeCompanyId) return false
  const perm = 'cost.notification.read'
  return Boolean(store.hasPermission ? store.hasPermission(perm) : store.permissions?.includes(perm))
})

const unreadCount = computed(() => {
  return notifications.value.filter(n => n.deliveryState === 'available' && !n.readAt).length
})

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  } catch { return d }
}

function clear() {
  tracker.invalidate(); ackTracker.invalidate()
  notifications.value = []; isOpen.value = false; loading.value = false;ackKeys.clear();acknowledging.value=null
}

watch([() => store.activeCompanyId, () => getFingerprint()], () => {clear();if(import.meta.client&&canRead.value)void loadNotifications()}, {flush:'sync'})

async function loadNotifications() {
  if (!canRead.value) return
  const fp = getFingerprint()
  const token = tracker.start({ fp })
  loading.value = true
  try {
    const list = await repo.listNotifications()
    if (!token.isCurrent() || getFingerprint() !== fp) return
    notifications.value = list
  } catch {
    if (token.isCurrent() && getFingerprint()===fp) notifications.value = []
  } finally {
    if (token.isCurrent() && getFingerprint() === fp) loading.value = false
  }
}

function togglePanel() {
  isOpen.value = !isOpen.value
  if (isOpen.value) loadNotifications()
}

async function markRead(n: WorkflowNotificationView) {
  if (!canRead.value || acknowledging.value || !notifications.value.some(value=>value.id===n.id) || n.deliveryState !== 'available' || n.readAt) return
  acknowledging.value=n.id
  if (!ackKeys.has(n.id)) ackKeys.set(n.id, crypto.randomUUID())
  const fp = getFingerprint()
  const token = ackTracker.start({ id: n.id, fp })
  try {
    await repo.markNotificationRead(n.id, { idempotencyKey: ackKeys.get(n.id)! })
    if (!token.isCurrent() || getFingerprint() !== fp) return
    n.readAt = new Date().toISOString()
  } catch { /* Keep the acknowledgement key for an uncertain response. */ }
  finally{if(token.isCurrent()&&getFingerprint()===fp)acknowledging.value=null}
}

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') isOpen.value = false }
function onClickOutside(e: MouseEvent) {
  if (bellRef.value && !bellRef.value.contains(e.target as Node)) isOpen.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onClickOutside)
  if (canRead.value) loadNotifications()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onClickOutside)
  tracker.invalidate()
  ackTracker.invalidate()
})
</script>

<style scoped>
.cost-notification-bell { position: relative; display: inline-block; }
.bell-btn { position: relative; background: none; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.badge { position: absolute; top: -6px; right: -6px; background: #dc2626; color: #fff; font-size: 11px; padding: 1px 5px; border-radius: 999px; }
.panel { position: absolute; right: 0; top: 110%; width: min(320px,calc(100vw - 32px)); background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; max-height: 400px; display: flex; flex-direction: column; }
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
.link-btn { font-size: 12px; background: none; border: none; color: #2563eb; cursor: pointer; }
.list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.item { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
.item.unread { background: #f0f9ff; font-weight: 500; }
.item-content { display: flex; flex-direction: column; gap: 2px; }
.item-date { color: #64748b; font-size: 11px; }
.pending-tag { font-size: 10px; color: #d97706; }
.item-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.view-link { color: #2563eb; text-decoration: none; }
.ack-btn { font-size: 11px; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; cursor: pointer; }
.empty { padding: 16px; text-align: center; color: #64748b; font-size: 13px; }
</style>